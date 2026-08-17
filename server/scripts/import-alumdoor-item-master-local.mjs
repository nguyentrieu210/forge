#!/usr/bin/env node
import process from 'node:process';
import { assertLocalMutationChildContext } from '../../scripts/local-runner/assert-local-mutation-child-context.mjs';

const validateOnly = process.argv.slice(2).includes('--validate-only');
if (!validateOnly) assertLocalMutationChildContext(['item-master', 'real-purchase']);
await import('./import-alumdoor-item-master-local-impl.mjs');
