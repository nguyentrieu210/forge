import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('./alumdoor-runtime-maintenance.mjs', import.meta.url));

function run(root, ...args) {
  const result = spawnSync(process.execPath, [script, ...args], {
    encoding: 'utf8',
    env: {
      ...process.env,
      ALUMDOOR_SERVICE_HOME: root,
      ALUMDOOR_SERVICE_MAINTENANCE: path.join(root, 'maintenance.flag'),
      ALUMDOOR_DESK_MAINTENANCE: path.join(root, 'desk-maintenance.flag'),
    },
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  return result.stdout;
}

test('backend maintenance does not mutate desk maintenance state', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'alumdoor-maintenance-'));
  try {
    const backend = path.join(root, 'maintenance.flag');
    const desk = path.join(root, 'desk-maintenance.flag');
    run(root, 'on', 'backend');
    assert.equal(existsSync(backend), true);
    assert.equal(existsSync(desk), false);
    run(root, 'off', 'backend');
    assert.equal(existsSync(backend), false);
    assert.equal(existsSync(desk), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('all maintenance retains existing fail-closed quiesce behavior for frontend-required callers', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'alumdoor-maintenance-'));
  try {
    const backend = path.join(root, 'maintenance.flag');
    const desk = path.join(root, 'desk-maintenance.flag');
    run(root, 'on', 'all');
    assert.equal(existsSync(backend), true);
    assert.equal(existsSync(desk), true);
    run(root, 'off', 'all');
    assert.equal(existsSync(backend), false);
    assert.equal(existsSync(desk), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
