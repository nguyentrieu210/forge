import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ServiceVerificationError,
  parseRequiredServices,
  verifyRequiredServices,
} from './service-verification.mjs';

function managedObservation(servicePid, listenerPid = servicePid + 100) {
  return {
    serviceExists: true,
    serviceState: 'Running',
    servicePid,
    listeners: [{ pid: listenerPid, ancestry: [listenerPid, servicePid, 4] }],
  };
}

function response(status) {
  return { status };
}

test('workflow without frontend requirement passes while port 5173 is closed', async () => {
  const observed = [];
  const fetched = [];
  const evidence = await verifyRequiredServices(parseRequiredServices('backend'), {
    observe: async (service) => {
      observed.push(service);
      assert.equal(service, 'backend');
      return managedObservation(1000, 1100);
    },
    fetchImpl: async (url) => {
      fetched.push(url);
      assert.match(url, /:8799\//);
      return response(401);
    },
  });

  assert.deepEqual(observed, ['backend']);
  assert.equal(fetched.length, 1);
  assert.deepEqual(evidence.map((row) => row.service), ['backend']);
});

test('workflow without frontend requirement does not inspect or mutate a foreign 5173 listener', async () => {
  let frontendObserved = false;
  let mutationCalls = 0;
  const foreignFrontend = {
    serviceExists: true,
    serviceState: 'Running',
    servicePid: 2000,
    listeners: [{ pid: 9999, ancestry: [9999, 4] }],
  };

  await verifyRequiredServices(['backend'], {
    observe: async (service) => {
      if (service === 'frontend') {
        frontendObserved = true;
        mutationCalls += 1;
        return foreignFrontend;
      }
      return managedObservation(1000, 1100);
    },
    fetchImpl: async () => response(403),
  });

  assert.equal(frontendObserved, false);
  assert.equal(mutationCalls, 0);
});

test('workflow requiring frontend passes with healthy managed Vite listener', async () => {
  const observations = {
    backend: managedObservation(1000, 1100),
    frontend: managedObservation(2000, 2100),
  };
  const statuses = [200, 200];
  const evidence = await verifyRequiredServices(['backend', 'frontend'], {
    observe: async (service) => observations[service],
    fetchImpl: async () => response(statuses.shift()),
  });

  assert.deepEqual(evidence.map((row) => row.service), ['backend', 'frontend']);
  assert.equal(evidence[1].listenerPids[0], 2100);
});

test('workflow requiring frontend fails closed when listener is missing', async () => {
  const observations = {
    backend: managedObservation(1000, 1100),
    frontend: {
      serviceExists: true,
      serviceState: 'Running',
      servicePid: 2000,
      listeners: [],
    },
  };

  await assert.rejects(
    verifyRequiredServices(['backend', 'frontend'], {
      observe: async (service) => observations[service],
      fetchImpl: async () => response(200),
    }),
    (error) =>
      error instanceof ServiceVerificationError &&
      error.failureClass === 'VERIFY' &&
      error.code === 'REQUIRED_SERVICE_LISTENER_MISSING' &&
      error.service === 'frontend',
  );
});

test('workflow requiring frontend fails closed on foreign listener and never kills it', async () => {
  let mutationCalls = 0;
  const observations = {
    backend: managedObservation(1000, 1100),
    frontend: {
      serviceExists: true,
      serviceState: 'Running',
      servicePid: 2000,
      listeners: [{ pid: 9999, ancestry: [9999, 4] }],
    },
  };

  await assert.rejects(
    verifyRequiredServices(['backend', 'frontend'], {
      observe: async (service) => observations[service],
      fetchImpl: async () => response(200),
      mutate: () => { mutationCalls += 1; },
    }),
    (error) =>
      error instanceof ServiceVerificationError &&
      error.failureClass === 'VERIFY' &&
      error.code === 'REQUIRED_SERVICE_FOREIGN_LISTENER' &&
      error.service === 'frontend',
  );
  assert.equal(mutationCalls, 0);
});

test('required-service parser defaults to backend and rejects unknown capabilities', () => {
  assert.deepEqual(parseRequiredServices(undefined), ['backend']);
  assert.deepEqual(parseRequiredServices('backend,frontend,backend'), ['backend', 'frontend']);
  assert.throws(
    () => parseRequiredServices('backend,redis'),
    (error) =>
      error instanceof ServiceVerificationError &&
      error.code === 'UNKNOWN_REQUIRED_SERVICE',
  );
});
