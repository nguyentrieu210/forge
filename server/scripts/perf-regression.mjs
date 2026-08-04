#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { evaluatePerfRegression } from './lib/perf-regression.mjs';

const args = process.argv.slice(2);
const argOf = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const currentPath = argOf('current');
const policyPath = argOf('policy');
const baselinePath = argOf('baseline');
const output = argOf('output');
if (!currentPath || !policyPath) throw new Error('usage: perf-regression --current <evidence.json> --policy <policy.json> [--baseline <evidence.json>] [--output <result.json>]');
const readJson = (p) => JSON.parse(readFileSync(path.resolve(p), 'utf8'));
const result = evaluatePerfRegression({
  currentEvidence: readJson(currentPath),
  baselineEvidence: baselinePath ? readJson(baselinePath) : null,
  policy: readJson(policyPath),
});
console.log(JSON.stringify(result, null, 2));
if (output) writeFileSync(path.resolve(output), `${JSON.stringify(result, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
if (!result.pass) process.exitCode = 1;
