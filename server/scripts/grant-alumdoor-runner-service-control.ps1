[CmdletBinding()]
param(
  [string[]]$ServiceNames = @('ForgeAlumdoorBackend', 'ForgeAlumdoorDesk'),
  [string]$RunnerServicePattern = 'actions.runner.nguyentrieu210-forge.*',
  [string]$EvidencePath = 'C:\ForgeServices\Alumdoor\service-control-grant.json'
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Assert-Administrator {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = [Security.Principal.WindowsPrincipal]::new($identity)
  if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw 'Administrator token required. Run this script from an elevated PowerShell.'
  }
}

function Resolve-Sid([string]$Account) {
  if ([string]::IsNullOrWhiteSpace($Account)) { return $null }
  try {
    return ([Security.Principal.NTAccount]::new($Account)).Translate([Security.Principal.SecurityIdentifier]).Value
  } catch {
    Write-Warning "Cannot resolve SID for account '$Account': $($_.Exception.Message)"
    return $null
  }
}

function Read-ServiceSddl([string]$Name) {
  $lines = @(& sc.exe sdshow $Name 2>&1)
  if ($LASTEXITCODE -ne 0) {
    throw "sc.exe sdshow failed for $Name: $($lines -join ' ')"
  }
  $sddl = ($lines | ForEach-Object { $_.ToString().Trim() } | Where-Object { $_ -match '^D:' } | Select-Object -First 1)
  if (-not $sddl) { throw "No DACL SDDL returned for $Name" }
  return $sddl
}

function Add-ServiceAce([string]$Sddl, [string]$Sid, [string]$Mask) {
  $ace = "(A;;$Mask;;;$Sid)"
  if ($Sddl.Contains($ace)) { return $Sddl }
  $saclIndex = $Sddl.IndexOf('S:')
  if ($saclIndex -ge 0) {
    return $Sddl.Insert($saclIndex, $ace)
  }
  return "$Sddl$ace"
}

Assert-Administrator

# 0x000200BD intentionally grants only:
# READ_CONTROL (0x20000), SERVICE_QUERY_CONFIG (0x1), SERVICE_QUERY_STATUS (0x4),
# SERVICE_ENUMERATE_DEPENDENTS (0x8), SERVICE_START (0x10), SERVICE_STOP (0x20),
# SERVICE_INTERROGATE (0x80). It does NOT grant CHANGE_CONFIG, WRITE_DAC,
# WRITE_OWNER, DELETE or SERVICE_ALL_ACCESS.
$controlMask = '0x000200BD'
$principals = [ordered]@{}

$invokingIdentity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principals['elevated_invoker'] = $invokingIdentity.User.Value

$consoleAccount = (Get-CimInstance Win32_ComputerSystem -ErrorAction SilentlyContinue).UserName
$consoleSid = Resolve-Sid $consoleAccount
if ($consoleSid) { $principals['interactive_console'] = $consoleSid }

$runnerServices = @(
  Get-CimInstance Win32_Service -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -like $RunnerServicePattern }
)
foreach ($runner in $runnerServices) {
  $sid = Resolve-Sid $runner.StartName
  if ($sid) { $principals["runner_service:$($runner.Name)"] = $sid }
}

$uniqueSids = @($principals.Values | Where-Object { $_ } | Sort-Object -Unique)
if ($uniqueSids.Count -eq 0) { throw 'No runner/console principal SID could be resolved.' }

$serviceEvidence = @()
foreach ($name in $ServiceNames) {
  $service = Get-Service -Name $name -ErrorAction SilentlyContinue
  if (-not $service) { throw "Required Alumdoor service is not installed: $name" }

  $before = Read-ServiceSddl $name
  $after = $before
  foreach ($sid in $uniqueSids) {
    $after = Add-ServiceAce -Sddl $after -Sid $sid -Mask $controlMask
  }

  if ($after -ne $before) {
    $output = @(& sc.exe sdset $name $after 2>&1)
    if ($LASTEXITCODE -ne 0) {
      throw "sc.exe sdset failed for $name: $($output -join ' ')"
    }
  }

  $verified = Read-ServiceSddl $name
  foreach ($sid in $uniqueSids) {
    $expectedAce = "(A;;$controlMask;;;$sid)"
    if (-not $verified.Contains($expectedAce)) {
      throw "Service ACL verification failed for $name sid=$sid"
    }
  }

  Write-Host "SERVICE_CONTROL_ACL=PASS service=$name principals=$($uniqueSids -join ',') mask=$controlMask"
  $serviceEvidence += [ordered]@{
    service = $name
    mask = $controlMask
    sddl_before = $before
    sddl_after = $verified
  }
}

$evidenceDir = Split-Path $EvidencePath -Parent
if ($evidenceDir) { New-Item -ItemType Directory -Force -Path $evidenceDir | Out-Null }
$evidence = [ordered]@{
  format = 'forge-alumdoor-service-control-grant/v1'
  granted_at = (Get-Date).ToUniversalTime().ToString('o')
  machine = $env:COMPUTERNAME
  principals = $principals
  unique_sids = $uniqueSids
  access_mask = $controlMask
  services = $serviceEvidence
}
$evidence | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $EvidencePath -Encoding UTF8
Write-Host "ALUMDOOR_RUNNER_SERVICE_CONTROL_PASS evidence=$EvidencePath"
