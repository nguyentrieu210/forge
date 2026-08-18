import process from 'node:process';
import { mainBom as baseMainBom } from './bom-adapter.mjs';

export async function mainBom() {
  const previous = process.env.NODE_OPTIONS ?? '';
  const shimUrl = new URL('./bom-put-modified-shim.mjs', import.meta.url).href;
  process.env.NODE_OPTIONS = [previous, `--import=${shimUrl}`].filter(Boolean).join(' ');
  try {
    return await baseMainBom();
  } finally {
    if (previous) process.env.NODE_OPTIONS = previous;
    else delete process.env.NODE_OPTIONS;
  }
}
