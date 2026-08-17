#!/usr/bin/env node
import process from 'node:process';
import { assertLocalMutationChildContext } from '../../scripts/local-runner/assert-local-mutation-child-context.mjs';

const apply = process.argv.slice(2).includes('--apply');
if (apply) assertLocalMutationChildContext(['pricing']);
await import('./import-alumdoor-pricing-local-impl.mjs');
