import process from 'node:process';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

function rootCause(text) {
  const lines = String(text ?? '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const preferred = [...lines].reverse().find((line) =>
    /TimestampMismatchError|ValidationError|ReferenceError|ALUMDOOR_BOM_LOCAL_|failed \(\d+\)|Error: /i.test(line),
  );
  return preferred ?? lines.at(-1) ?? 'unknown BOM importer failure';
}

export async function mainBom() {
  const previous = process.env.NODE_OPTIONS ?? '';
  const shimUrl = new URL('./bom-put-modified-shim.mjs', import.meta.url).href;
  const env = {
    ...process.env,
    NODE_OPTIONS: [previous, `--import=${shimUrl}`].filter(Boolean).join(' '),
  };
  const entry = path.join(here, 'bom-base-entry.mjs');
  const result = spawnSync(process.execPath, [entry], {
    cwd: process.cwd(),
    env,
    encoding: 'utf8',
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const combined = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
    console.error(`BOM_ROOT_CAUSE=${JSON.stringify(rootCause(combined))}`);
    throw new Error(`BOM source-complete adapter failed exit=${result.status}`);
  }
}
