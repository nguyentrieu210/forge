#!/usr/bin/env node
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const here = dirname(fileURLToPath(import.meta.url));
const sourcePath = join(here, 'alumdoor-routing-local.mjs');
const tempPath = join(here, `.alumdoor-routing-local-windows-${process.pid}.mjs`);

if (process.argv.some((arg) => arg === '--remote' || arg.startsWith('--remote='))) {
  throw new Error('REMOTE_MUTATION_GUARD: --remote is forbidden; this runner is local-only');
}

const original = `function queryRows(sql) {
  const output = runWrangler(['d1', 'execute', database, '--local', '--config', configPath, '--json', '--command', sql], true);
  const parsed = JSON.parse(output);
  const groups = Array.isArray(parsed) ? parsed : [parsed];
  return groups.flatMap((group) => Array.isArray(group?.results) ? group.results : []);
}`;

const replacement = `function queryRows(sql) {
  const queryPath = join(serverRoot, \`.alumdoor-routing-query-\${process.pid}.sql\`);
  writeFileSync(queryPath, \`\${sql.trim()}\\n\`, 'utf8');
  try {
    const output = runWrangler(['d1', 'execute', database, '--local', '--config', configPath, '--json', '--file', queryPath], true);
    const parsed = JSON.parse(output);
    const groups = Array.isArray(parsed) ? parsed : [parsed];
    return groups.flatMap((group) => Array.isArray(group?.results) ? group.results : []);
  } finally {
    try { unlinkSync(queryPath); } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
  }
}`;

const source = readFileSync(sourcePath, 'utf8');
if (!source.includes(original)) {
  throw new Error('WINDOWS_PATCH_TARGET_NOT_FOUND: canonical queryRows implementation changed');
}

writeFileSync(tempPath, source.replace(original, replacement), 'utf8');
try {
  const result = spawnSync(process.execPath, [tempPath, ...process.argv.slice(2)], {
    cwd: process.cwd(),
    stdio: 'inherit',
    env: process.env,
  });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} finally {
  try { unlinkSync(tempPath); } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
}
