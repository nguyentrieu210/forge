#!/usr/bin/env node
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const SERVICE_SPECS = Object.freeze({
  backend: Object.freeze({
    key: 'backend',
    serviceName: 'ForgeAlumdoorBackend',
    port: 8799,
    url: 'http://127.0.0.1:8799/api/method/metaforge.api.get_boot',
    acceptedStatuses: Object.freeze([200, 401, 403]),
  }),
  frontend: Object.freeze({
    key: 'frontend',
    serviceName: 'ForgeAlumdoorDesk',
    port: 5173,
    url: 'http://127.0.0.1:5173',
    acceptedStatuses: Object.freeze([200]),
  }),
});

export class ServiceVerificationError extends Error {
  constructor(code, service, message, options = {}) {
    super(message, options);
    this.name = 'ServiceVerificationError';
    this.failureClass = 'VERIFY';
    this.code = code;
    this.service = service;
  }
}

function serviceError(code, service, message, cause) {
  return new ServiceVerificationError(code, service, message, cause ? { cause } : {});
}

export function parseRequiredServices(value, { defaultServices = ['backend'] } = {}) {
  const raw = value == null || String(value).trim() === ''
    ? defaultServices
    : String(value).split(',');
  const services = [];
  for (const entry of raw) {
    const key = String(entry).trim().toLowerCase();
    if (!key) continue;
    if (!SERVICE_SPECS[key]) {
      throw serviceError(
        'UNKNOWN_REQUIRED_SERVICE',
        key,
        `Unknown required local service: ${key}; expected one of ${Object.keys(SERVICE_SPECS).join(', ')}`,
      );
    }
    if (!services.includes(key)) services.push(key);
  }
  if (!services.length) {
    throw serviceError('EMPTY_REQUIRED_SERVICES', '', 'At least one required local service must be declared');
  }
  return services;
}

export function classifyServiceObservation(service, observation) {
  const spec = SERVICE_SPECS[service];
  if (!spec) {
    throw serviceError('UNKNOWN_REQUIRED_SERVICE', service, `Unknown required local service: ${service}`);
  }
  if (!observation?.serviceExists) {
    throw serviceError(
      'REQUIRED_SERVICE_MISSING',
      service,
      `Required managed service is not installed: ${spec.serviceName}`,
    );
  }
  if (String(observation.serviceState).toLowerCase() !== 'running') {
    throw serviceError(
      'REQUIRED_SERVICE_NOT_RUNNING',
      service,
      `Required managed service is not running: ${spec.serviceName} state=${observation.serviceState || '<unknown>'}`,
    );
  }
  const servicePid = Number(observation.servicePid);
  if (!Number.isInteger(servicePid) || servicePid <= 0) {
    throw serviceError(
      'REQUIRED_SERVICE_OWNER_UNPROVEN',
      service,
      `Required managed service has no trustworthy process owner: ${spec.serviceName} pid=${observation.servicePid}`,
    );
  }

  const listeners = Array.isArray(observation.listeners) ? observation.listeners : [];
  if (!listeners.length) {
    throw serviceError(
      'REQUIRED_SERVICE_LISTENER_MISSING',
      service,
      `Required managed service has no listener on port ${spec.port}: ${spec.serviceName}`,
    );
  }

  for (const listener of listeners) {
    const listenerPid = Number(listener?.pid);
    const ancestry = Array.isArray(listener?.ancestry)
      ? listener.ancestry.map((pid) => Number(pid)).filter(Number.isInteger)
      : [];
    if (!Number.isInteger(listenerPid) || listenerPid <= 0 || !ancestry.includes(servicePid)) {
      throw serviceError(
        'REQUIRED_SERVICE_FOREIGN_LISTENER',
        service,
        `Port ${spec.port} listener ownership is foreign or unproven: service_pid=${servicePid} listener_pid=${listener?.pid ?? '<unknown>'}`,
      );
    }
  }

  return {
    service,
    serviceName: spec.serviceName,
    servicePid,
    listenerPids: listeners.map((listener) => Number(listener.pid)),
  };
}

function parseObservationOutput(raw, service) {
  const text = String(raw || '').trim();
  if (!text) {
    throw serviceError('SERVICE_OBSERVATION_FAILED', service, `No process/listener evidence returned for ${service}`);
  }
  try {
    return JSON.parse(text);
  } catch (error) {
    throw serviceError(
      'SERVICE_OBSERVATION_FAILED',
      service,
      `Invalid process/listener evidence for ${service}: ${text.slice(0, 300)}`,
      error,
    );
  }
}

export function collectWindowsServiceObservation(service, { spawn = spawnSync } = {}) {
  const spec = SERVICE_SPECS[service];
  if (!spec) {
    throw serviceError('UNKNOWN_REQUIRED_SERVICE', service, `Unknown required local service: ${service}`);
  }
  const script = `
$ErrorActionPreference='Stop'
$service=Get-CimInstance Win32_Service -Filter "Name='${spec.serviceName}'" -ErrorAction SilentlyContinue
$all=@(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue)
$byId=@{}
foreach($proc in $all){$byId[[int]$proc.ProcessId]=$proc}
function Get-Ancestry([int]$PidValue){
  $ids=@(); $seen=@{}; $current=$PidValue
  while($current -gt 0 -and -not $seen.ContainsKey($current)){
    $seen[$current]=$true; $ids += $current
    $proc=$byId[$current]
    if(-not $proc){break}
    $current=[int]$proc.ParentProcessId
  }
  return @($ids)
}
$listeners=@(Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Where-Object { $_.LocalPort -eq ${spec.port} })
$result=[ordered]@{
  serviceExists=[bool]$service
  serviceState=if($service){[string]$service.State}else{''}
  servicePid=if($service){[int]$service.ProcessId}else{0}
  listeners=@($listeners | ForEach-Object { [ordered]@{ pid=[int]$_.OwningProcess; ancestry=@(Get-Ancestry ([int]$_.OwningProcess)) } })
}
$result | ConvertTo-Json -Depth 8 -Compress
`;
  const result = spawn(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
    { encoding: 'utf8', windowsHide: true },
  );
  if (result.error) {
    throw serviceError(
      'SERVICE_OBSERVATION_FAILED',
      service,
      `Cannot inspect managed service ${spec.serviceName}: ${result.error.message}`,
      result.error,
    );
  }
  if (result.status !== 0) {
    throw serviceError(
      'SERVICE_OBSERVATION_FAILED',
      service,
      `Managed service inspection failed for ${spec.serviceName}: exit=${result.status} stderr=${String(result.stderr || '').trim().slice(0, 300)}`,
    );
  }
  return parseObservationOutput(result.stdout, service);
}

async function fetchHealth(spec, fetchImpl) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    return await fetchImpl(spec.url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export async function verifyRequiredServices(
  requiredServices,
  {
    observe = collectWindowsServiceObservation,
    fetchImpl = globalThis.fetch,
  } = {},
) {
  const services = Array.isArray(requiredServices)
    ? parseRequiredServices(requiredServices.join(','))
    : parseRequiredServices(requiredServices);
  const evidence = [];

  for (const service of services) {
    const spec = SERVICE_SPECS[service];
    const ownership = classifyServiceObservation(service, await observe(service));
    let response;
    try {
      response = await fetchHealth(spec, fetchImpl);
    } catch (error) {
      throw serviceError(
        'REQUIRED_SERVICE_UNAVAILABLE',
        service,
        `Required managed service is unavailable: ${spec.url} ${error.message}`,
        error,
      );
    }
    if (!spec.acceptedStatuses.includes(response.status)) {
      throw serviceError(
        'REQUIRED_SERVICE_UNHEALTHY',
        service,
        `Required managed service is unhealthy: ${spec.url} HTTP ${response.status}`,
      );
    }
    evidence.push({ ...ownership, port: spec.port, url: spec.url, httpStatus: response.status });
  }

  return evidence;
}

export async function runCli(argv = process.argv.slice(2)) {
  const servicesArg = argv.find((arg) => arg.startsWith('--services='));
  if (!servicesArg || argv.some((arg) => !arg.startsWith('--services='))) {
    throw serviceError(
      'INVALID_SERVICE_VERIFY_ARGS',
      '',
      'Usage: node scripts/local-runner/service-verification.mjs --services=backend[,frontend]',
    );
  }
  if (process.platform !== 'win32' && process.env.FORGE_LOCAL_RUNNER_ALLOW_NON_WINDOWS !== '1') {
    throw serviceError('SERVICE_OBSERVATION_FAILED', '', `Windows self-hosted runner required; got ${process.platform}`);
  }
  const services = parseRequiredServices(servicesArg.slice('--services='.length));
  const evidence = await verifyRequiredServices(services);
  for (const row of evidence) {
    console.log(
      `REQUIRED_SERVICE_VERIFY=PASS service=${row.service} service_name=${row.serviceName} service_pid=${row.servicePid} listener_pids=${row.listenerPids.join(',')} port=${row.port} http_status=${row.httpStatus}`,
    );
  }
  console.log(`REQUIRED_SERVICES_VERIFY=PASS services=${services.join(',')}`);
}

const isDirect = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isDirect) {
  runCli().catch((error) => {
    const code = error?.code || 'SERVICE_VERIFY_FAILED';
    const service = error?.service || '';
    console.error(`REQUIRED_SERVICE_VERIFY=FAIL code=${code} service=${service} message=${JSON.stringify(error?.message ?? String(error))}`);
    process.exit(1);
  });
}
