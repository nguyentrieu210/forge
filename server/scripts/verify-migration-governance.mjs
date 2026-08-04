#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const DEFAULT_FILENAME_RE = /^\d{4}_[a-z0-9][a-z0-9_-]*\.sql$/;

function sha256File(file) {
  return createHash('sha256').update(readFileSync(file)).digest('hex');
}

function walkSqlFiles(root) {
  const out = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir).sort()) {
      const full = path.join(dir, name);
      const stat = statSync(full);
      if (stat.isDirectory()) walk(full);
      else if (stat.isFile() && name.endsWith('.sql')) out.push(full);
    }
  };
  if (existsSync(root)) walk(root);
  return out;
}

export function scanMigrationTree(serverRoot, config) {
  const migrationsRoot = path.join(serverRoot, 'migrations');
  const records = walkSqlFiles(migrationsRoot).map((full) => {
    const relative = path.relative(migrationsRoot, full).split(path.sep).join('/');
    const parts = relative.split('/');
    const name = parts.at(-1);
    const migrationDir = parts.slice(0, -1).join('/');
    const match = /^(\d{4})_/.exec(name);
    return {
      full,
      relative,
      migrationDir,
      name,
      prefix: match?.[1] ?? null,
      sha256: sha256File(full),
    };
  });
  return validateSnapshot(records, config);
}

export function validateSnapshot(records, config) {
  const errors = [];
  const legacy = config?.legacyPrefixCollisions ?? {};
  const filenameRe = config?.filenamePattern ? new RegExp(config.filenamePattern) : DEFAULT_FILENAME_RE;
  const byDirAndPrefix = new Map();
  const caseKeys = new Map();

  for (const record of records) {
    if (!filenameRe.test(record.name)) {
      errors.push(`invalid migration filename: ${record.relative}`);
      continue;
    }
    const lowerKey = `${record.migrationDir}/${record.name.toLowerCase()}`;
    if (caseKeys.has(lowerKey)) errors.push(`case-insensitive duplicate migration filename: ${record.relative}`);
    else caseKeys.set(lowerKey, record.relative);

    const key = `${record.migrationDir}/${record.prefix}`;
    const members = byDirAndPrefix.get(key) ?? [];
    members.push(record.name);
    byDirAndPrefix.set(key, members);
  }

  for (const [key, names] of [...byDirAndPrefix.entries()].sort()) {
    if (names.length <= 1) continue;
    const expected = [...(legacy[key] ?? [])].sort();
    const actual = [...names].sort();
    if (expected.length === 0) {
      errors.push(`duplicate migration prefix ${key}: ${actual.join(', ')}`);
      continue;
    }
    if (JSON.stringify(expected) !== JSON.stringify(actual)) {
      errors.push(`legacy collision ${key} changed; expected [${expected.join(', ')}], got [${actual.join(', ')}]`);
    }
  }

  for (const [key, expectedNames] of Object.entries(legacy).sort()) {
    const actual = [...(byDirAndPrefix.get(key) ?? [])].sort();
    const expected = [...expectedNames].sort();
    if (JSON.stringify(expected) !== JSON.stringify(actual)) {
      errors.push(`legacy collision allowlist ${key} is stale; expected repository members [${expected.join(', ')}], got [${actual.join(', ')}]`);
    }
  }

  if (errors.length) throw new Error(errors.join('\n'));
  return records;
}

export function validateAppliedState(serverRoot, appliedState, records = null) {
  const migrationRecords = records ?? scanMigrationTree(serverRoot, { legacyPrefixCollisions: {} });
  const byKey = new Map(migrationRecords.map((record) => [`${record.migrationDir}/${record.name}`, record]));
  const errors = [];

  if (appliedState?.version !== 1 || !Array.isArray(appliedState.databases)) {
    throw new Error('applied-state file must be version 1 with a databases array');
  }

  for (const database of appliedState.databases) {
    const migrationDir = String(database.migrationDir ?? '');
    const applied = Array.isArray(database.applied) ? database.applied : [];
    const seen = new Set();
    for (const entry of applied) {
      const name = String(entry.name ?? '');
      const hash = String(entry.sha256 ?? '').toLowerCase();
      if (!DEFAULT_FILENAME_RE.test(name)) {
        errors.push(`${migrationDir}: unsafe/invalid applied migration name ${JSON.stringify(name)}`);
        continue;
      }
      if (!/^[0-9a-f]{64}$/.test(hash)) {
        errors.push(`${migrationDir}/${name}: applied state requires a 64-char sha256`);
        continue;
      }
      if (seen.has(name)) {
        errors.push(`${migrationDir}/${name}: duplicate applied-state identity`);
        continue;
      }
      seen.add(name);
      const record = byKey.get(`${migrationDir}/${name}`);
      if (!record) {
        errors.push(`${migrationDir}/${name}: applied migration file is missing from repository`);
        continue;
      }
      if (record.sha256 !== hash) {
        errors.push(`${migrationDir}/${name}: checksum mismatch; repository=${record.sha256} applied=${hash}`);
      }
    }
  }

  if (errors.length) throw new Error(errors.join('\n'));
  return true;
}

function parseGitNameStatusZ(raw) {
  if (!raw) return [];
  const parts = raw.split('\0').filter(Boolean);
  const entries = [];
  for (let i = 0; i < parts.length;) {
    const status = parts[i++];
    if (/^[RC]/.test(status)) entries.push({ status, oldPath: parts[i++], path: parts[i++] });
    else entries.push({ status, path: parts[i++] });
  }
  return entries;
}

function migrationInfo(repoPath) {
  const normalized = repoPath.split(path.sep).join('/');
  const match = /^server\/migrations\/(.+)\/([^/]+\.sql)$/.exec(normalized);
  if (!match) return null;
  const prefix = /^(\d{4})_/.exec(match[2])?.[1] ?? null;
  return { migrationDir: match[1], name: match[2], prefix };
}

export function validateChangeSet(baseMigrationPaths, changes) {
  const errors = [];
  const baseMax = new Map();
  for (const repoPath of baseMigrationPaths) {
    const info = migrationInfo(repoPath);
    if (!info?.prefix) continue;
    const current = baseMax.get(info.migrationDir) ?? -1;
    baseMax.set(info.migrationDir, Math.max(current, Number(info.prefix)));
  }

  for (const change of changes) {
    const statusCode = change.status[0];
    const info = migrationInfo(change.path ?? '');
    const oldInfo = migrationInfo(change.oldPath ?? '');
    if (!info && !oldInfo) continue;

    if (statusCode !== 'A') {
      const target = oldInfo ?? info;
      errors.push(`append-only violation (${change.status}): ${target.migrationDir}/${target.name}`);
      continue;
    }

    if (!info?.prefix) {
      errors.push(`new migration has invalid numeric prefix: ${change.path}`);
      continue;
    }
    const max = baseMax.get(info.migrationDir);
    if (max !== undefined && Number(info.prefix) <= max) {
      errors.push(`new migration ${info.migrationDir}/${info.name} uses prefix ${info.prefix} <= base max ${String(max).padStart(4, '0')}`);
    }
  }

  if (errors.length) throw new Error(errors.join('\n'));
  return true;
}

export function validateGitDelta(repoRoot, baseRef) {
  const baseFiles = execFileSync('git', ['ls-tree', '-r', '--name-only', baseRef, '--', 'server/migrations'], {
    cwd: repoRoot,
    encoding: 'utf8',
  }).trim().split('\n').filter(Boolean);
  const raw = execFileSync('git', ['diff', '--name-status', '-z', '--find-renames', `${baseRef}...HEAD`, '--', 'server/migrations'], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
  return validateChangeSet(baseFiles, parseGitNameStatusZ(raw));
}

function parseArgs(argv) {
  const out = { baseRef: null, appliedStatePath: null };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--base-ref') out.baseRef = argv[++i];
    else if (argv[i] === '--applied-state') out.appliedStatePath = argv[++i];
    else if (argv[i] === '--help') out.help = true;
    else throw new Error(`unknown argument: ${argv[i]}`);
  }
  return out;
}

export function main(argv = process.argv.slice(2), scriptUrl = import.meta.url) {
  const args = parseArgs(argv);
  if (args.help) {
    console.log('Usage: node scripts/verify-migration-governance.mjs [--base-ref <git-ref>] [--applied-state <json>]');
    return;
  }

  const scriptDir = path.dirname(fileURLToPath(scriptUrl));
  const serverRoot = path.resolve(scriptDir, '..');
  const repoRoot = path.resolve(serverRoot, '..');
  const configPath = path.join(serverRoot, 'migrations', 'migration-governance.json');
  const config = JSON.parse(readFileSync(configPath, 'utf8'));
  const records = scanMigrationTree(serverRoot, config);

  if (args.appliedStatePath) {
    const appliedPath = path.resolve(process.cwd(), args.appliedStatePath);
    validateAppliedState(serverRoot, JSON.parse(readFileSync(appliedPath, 'utf8')), records);
  }
  if (args.baseRef) validateGitDelta(repoRoot, args.baseRef);

  const dirs = new Set(records.map((record) => record.migrationDir));
  console.log(`migration governance PASS: ${records.length} SQL files across ${dirs.size} migration dir(s)`);
  if (args.baseRef) console.log(`append-only delta PASS against ${args.baseRef}`);
  if (args.appliedStatePath) console.log(`applied-state checksum PASS: ${args.appliedStatePath}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    console.error(`migration governance FAIL\n${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}
