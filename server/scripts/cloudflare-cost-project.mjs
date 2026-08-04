#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { estimateCloudflareMonthlyCost } from './lib/cloudflare-cost.mjs';

const args = process.argv.slice(2);
const argOf = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const input = argOf('input');
const ratesPath = argOf('rates') ?? 'config/cloudflare-cost-rates-20260804.json';
const output = argOf('output');
if (!input) throw new Error('usage: cloudflare-cost-project --input <scenario.json> [--rates <rates.json>] [--output <projection.json>]');
const readJson = (p) => JSON.parse(readFileSync(path.resolve(p), 'utf8'));
const source = readJson(input);
const scenarios = Array.isArray(source.scenarios) ? source.scenarios : [source];
if (scenarios.length === 0) throw new Error('input must contain at least one scenario');
const rates = readJson(ratesPath);
const projections = scenarios.map((scenario, index) => {
  if (!scenario?.usage || typeof scenario.usage !== 'object') throw new Error(`scenario[${index}].usage is required`);
  return {
    scenario: scenario.scenario ?? `${path.basename(input)}#${index + 1}`,
    notes: scenario.notes ?? [],
    ...estimateCloudflareMonthlyCost({ usage: scenario.usage, rates }),
  };
});
const result = projections.length === 1 ? projections[0] : {
  format: 'forge-cloudflare-cost-projection-set/v1',
  checked_at: rates.checked_at,
  projections,
};
console.log(JSON.stringify(result, null, 2));
if (output) writeFileSync(path.resolve(output), `${JSON.stringify(result, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
