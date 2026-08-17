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
    throw "sc.exe sdshow failed for ${Name}: $($lines -join ' ')"
  }
  $sddl = ($lines | ForEach-Object { $_.ToString().Trim() } | Where-Object { $_ -match '^D:' } | Select-Object -First 1)
  if (-not $sddl) { throw "No DACL SDDL returned for $Name" }
  return $sddl
}

function Convert-HexAccessMask([string]$Mask) {
  if ($Mask -notmatch '^0x[0-9A-Fa-f]{1,8}$') {
    throw "Invalid hexadecimal service access mask: $Mask"
  }
  return [Convert]::ToInt32($Mask.Substring(2), 16)
}

function Test-ServiceAceMask([string]$Sddl, [string]$Sid, [int]$RequiredMask) {
  $descriptor = [Security.AccessControl.RawSecurityDescriptor]::new($Sddl)
  $targetSid = [Security.Principal.SecurityIdentifier]::new($Sid)
  $dacl = $descriptor.DiscretionaryAcl
  if (-not $dacl) { return $false }

  foreach ($ace in $dacl) {
    if ($ace -isnot [Security.AccessControl.QualifiedAce]) { continue }
    if ($ace.AceQualifier -ne [Security.AccessControl.AceQualifier]::AccessAllowed) { continue }
    if ($ace.SecurityIdentifier.Value -ne $targetSid.Value) { continue }
    if (($ace.AccessMask -band $RequiredMask) -eq $RequiredMask) { return $true }
  }
  return $false
}

function Add-ServiceAce([string]$Sddl, [string]$Sid, [string]$Mask, [int]$RequiredMask) {
  if (Test-ServiceAceMask -Sddl $Sddl -Sid $Sid -RequiredMask $RequiredMask) { return $Sddl }

  $ace = "(A;;$Mask;;;$Sid)"
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
$requiredControlMask = Convert-HexAccessMask $controlMask
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
    $after = Add-ServiceAce -Sddl $after -Sid $sid -Mask $controlMask -RequiredMask $requiredControlMask
  }

  if ($after -ne $before) {
    $output = @(& sc.exe sdset $name $after 2>&1)
    if ($LASTEXITCODE -ne 0) {
      throw "sc.exe sdset failed for ${name}: $($output -join ' ')"
    }
  }

  $verified = Read-ServiceSddl $name
  foreach ($sid in $uniqueSids) {
    if (-not (Test-ServiceAceMask -Sddl $verified -Sid $sid -RequiredMask $requiredControlMask)) {
      throw "Service ACL verification failed for $name sid=$sid required_mask=$controlMask sddl=$verified"
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
