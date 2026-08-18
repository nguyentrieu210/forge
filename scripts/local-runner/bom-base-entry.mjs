#!/usr/bin/env node
import { mainBom } from './bom-adapter.mjs';

mainBom().catch((error) => {
  console.error(error?.stack ?? error);
  process.exit(1);
});
