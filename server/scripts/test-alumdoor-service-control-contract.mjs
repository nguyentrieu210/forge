import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const grant = await readFile(new URL('./grant-alumdoor-runner-service-control.ps1', import.meta.url), 'utf8');
const installer = await readFile(new URL('./install-alumdoor-runtime-services.ps1', import.meta.url), 'utf8');
const runLocal = await readFile(new URL('../../run-local.bat', import.meta.url), 'utf8');

assert.match(grant, /0x000200BD/);
assert.match(grant, /SERVICE_QUERY_CONFIG/);
assert.match(grant, /SERVICE_QUERY_STATUS/);
assert.match(grant, /SERVICE_ENUMERATE_DEPENDENTS/);
assert.match(grant, /SERVICE_START/);
assert.match(grant, /SERVICE_STOP/);
assert.match(grant, /SERVICE_INTERROGATE/);
assert.match(grant, /READ_CONTROL/);
assert.doesNotMatch(grant, /SERVICE_ALL_ACCESS\s*\(/);
assert.doesNotMatch(grant, /CHANGE_CONFIG[^\n]*grant/i);
assert.doesNotMatch(grant, /WRITE_DAC[^\n]*grant/i);
assert.match(grant, /Get-CimInstance Win32_ComputerSystem/);
assert.match(grant, /actions\.runner\.nguyentrieu210-forge\.\*/);
assert.match(grant, /ALUMDOOR_RUNNER_SERVICE_CONTROL_PASS/);
assert.doesNotMatch(grant, /\$(?:Name|name):/);
assert.match(grant, /\$\{Name\}:/);
assert.match(grant, /\$\{name\}:/);
assert.match(grant, /RawSecurityDescriptor/);
assert.match(grant, /QualifiedAce/);
assert.match(grant, /AceQualifier\]::AccessAllowed/);
assert.match(grant, /\.AccessMask\s+-band\s+\$RequiredMask/);
assert.match(grant, /Test-ServiceAceMask/);
assert.doesNotMatch(grant, /verified\.Contains\(\$expectedAce\)/);
assert.match(installer, /grant-alumdoor-runner-service-control\.ps1/);
assert.match(installer, /service-control-grant\.json/);
assert.doesNotMatch(runLocal, /timeout\.exe\s+\/t\s+2\s+\/nobreak/i);
assert.match(runLocal, /setTimeout\(\(\)=>process\.exit\(0\),2000\)/);

console.log('ALUMDOOR_SERVICE_CONTROL_CONTRACT_TEST_PASS');
