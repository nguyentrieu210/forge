#!/usr/bin/env node
import process from 'node:process';
import {
  ExecutionError,
  main as coreMain,
  parseArgs as coreParseArgs,
} from './run-local-import-core.mjs';
import { mainPricing } from './pricing-adapter.mjs';
import { mainBom } from './bom-adapter.mjs';
import { mainCustomer } from './customer-adapter.mjs';

export { ExecutionError };
export {
  assertLocalWranglerArgs,
  assertPathInside,
  classifyExistingLock,
  classifyOutcome,
  normalizeSpawnInvocation,
  normalizeWinPath,
} from './run-local-import-core.mjs';

export function parseArgs(argv) {
  if (['pricing', 'bom', 'customer'].includes(argv?.[0])) {
    if (argv.length !== 1) {
      throw new ExecutionError('OTHER', `Usage: node scripts/local-runner/run-local-import.mjs ${argv[0]}`);
    }
    return { adapter: argv[0], options: {} };
  }
  return coreParseArgs(argv);
}

export async function main(argv = process.argv.slice(2)) {
  const parsed = parseArgs(argv);
  if (parsed.adapter === 'pricing') return mainPricing();
  if (parsed.adapter === 'bom') return mainBom();
  if (parsed.adapter === 'customer') return mainCustomer();
  return coreMain(argv);
}

if (process.argv[1]?.endsWith('run-local-import.mjs')) {
  main().catch((error) => {
    console.error(error?.stack ?? error);
    process.exit(1);
  });
}
