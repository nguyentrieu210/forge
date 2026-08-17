#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import process from 'node:process';

const portsArg = process.argv.find((arg) => arg.startsWith('--ports='));
const ports = String(portsArg?.slice('--ports='.length) || '8799,5173')
  .split(',')
  .map((value) => Number(value.trim()))
  .filter((value) => Number.isInteger(value) && value > 0 && value < 65536);

if (process.platform !== 'win32') {
  console.log(`PORTS_QUIET_CHECK=SKIP platform=${process.platform}`);
  process.exit(0);
}
if (ports.length === 0) {
  console.error('PORTS_QUIET_CHECK=BLOCKED reason=no_valid_ports');
  process.exit(1);
}

const list = ports.join(',');
const script = [
  `$ports=@(${list})`,
  "$listeners=@(Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Where-Object { $ports -contains $_.LocalPort })",
  "if($listeners.Count -eq 0){ Write-Output 'PORTS_QUIET_CHECK=PASS'; exit 0 }",
  "$all=@(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue)",
  "$byId=@{}; foreach($p in $all){$byId[[int]$p.ProcessId]=$p}",
  "foreach($l in $listeners){$p=$byId[[int]$l.OwningProcess]; Write-Output ('BLOCKING_LISTENER port='+$l.LocalPort+' pid='+$l.OwningProcess+' name='+$p.Name+' parent='+$p.ParentProcessId+' exe='+$p.ExecutablePath+' command='+$p.CommandLine)}",
  "exit 9",
].join('; ');

const result = spawnSync(
  'powershell.exe',
  ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
  { encoding: 'utf8', windowsHide: true },
);
if (result.stdout) process.stdout.write(result.stdout);
if (result.stderr) process.stderr.write(result.stderr);
if (result.status !== 0) {
  console.error(`PORTS_QUIET_CHECK=BLOCKED ports=${ports.join(',')} exit=${result.status}`);
  process.exit(1);
}
