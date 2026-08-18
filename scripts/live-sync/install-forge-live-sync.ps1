param(
  [string]$Root = 'C:\alumdoor',
  [string]$Branch = 'agent-live',
  [int]$IntervalMs = 2000,
  [string]$ServiceHome = 'C:\ForgeServices\Alumdoor'
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Invoke-Git {
  param([Parameter(ValueFromRemainingArguments = $true)][string[]]$Args)
  & git -C $Root @Args
  if ($LASTEXITCODE -ne 0) {
    throw "git $($Args -join ' ') failed with exit code $LASTEXITCODE"
  }
}

if (-not (Get-Command git -ErrorAction SilentlyContinue)) { throw 'git is required' }
$nodeCommand = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodeCommand) { throw 'Node.js >=22 is required' }
$nodeVersion = (& $nodeCommand.Source -p "Number(process.versions.node.split('.')[0])").Trim()
if ([int]$nodeVersion -lt 22) { throw "Node.js >=22 is required; found major=$nodeVersion" }

if (-not (Test-Path -LiteralPath (Join-Path $Root '.git'))) {
  throw "$Root is not a Git repository"
}

$origin = (& git -C $Root remote get-url origin).Trim()
if ($LASTEXITCODE -ne 0 -or $origin -notmatch 'github\.com[:/]nguyentrieu210/forge(?:\.git)?$') {
  throw "Unexpected origin for ${Root}: $origin"
}

New-Item -ItemType Directory -Force -Path $ServiceHome | Out-Null
$dirty = @(& git -C $Root status --porcelain=v1)
if ($dirty.Count -gt 0) {
  $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
  $message = "forge-live-install-$stamp"
  & git -C $Root stash push --include-untracked -m $message
  if ($LASTEXITCODE -ne 0) { throw 'Could not preserve local changes before enabling live sync' }
  Write-Host "FORGE_LIVE_LOCAL_CHANGES=STASHED message=$message"
}

Invoke-Git fetch origin $Branch --prune
& git -C $Root switch -C $Branch "origin/$Branch"
if ($LASTEXITCODE -ne 0) { throw "Could not switch $Root to origin/$Branch" }
Invoke-Git branch "--set-upstream-to=origin/$Branch" $Branch
Invoke-Git reset --hard "origin/$Branch"

$syncScript = Join-Path $Root 'scripts\live-sync\forge-live-sync.mjs'
if (-not (Test-Path -LiteralPath $syncScript -PathType Leaf)) {
  throw "Live sync script missing after branch switch: $syncScript"
}

$taskName = 'ForgeAlumdoorLiveSync'
$nodeExe = $nodeCommand.Source
$taskArgs = @(
  ('"{0}"' -f $syncScript),
  ('--root="{0}"' -f $Root),
  ("--branch=$Branch"),
  ("--interval=$IntervalMs"),
  ('--service-home="{0}"' -f $ServiceHome)
) -join ' '

$installedTask = $false
try {
  $identity = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
  $action = New-ScheduledTaskAction -Execute $nodeExe -Argument $taskArgs
  $trigger = New-ScheduledTaskTrigger -AtLogOn -User $identity
  $principal = New-ScheduledTaskPrincipal -UserId $identity -LogonType Interactive -RunLevel Limited
  $settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -ExecutionTimeLimit ([TimeSpan]::Zero) `
    -MultipleInstances IgnoreNew
  Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Force | Out-Null
  Start-ScheduledTask -TaskName $taskName
  $installedTask = $true
  Write-Host "FORGE_LIVE_TASK=INSTALLED name=$taskName user=$identity"
} catch {
  Write-Warning "Scheduled task install failed; falling back to Startup folder: $($_.Exception.Message)"
}

if (-not $installedTask) {
  $startup = [Environment]::GetFolderPath('Startup')
  if (-not $startup) { throw 'Could not resolve current-user Startup folder' }
  $launcher = Join-Path $startup 'ForgeAlumdoorLiveSync.cmd'
  $cmd = "@echo off`r`nstart `"`" /min `"$nodeExe`" $taskArgs`r`n"
  [System.IO.File]::WriteAllText($launcher, $cmd, [System.Text.Encoding]::ASCII)
  Start-Process -FilePath $nodeExe -ArgumentList $taskArgs -WindowStyle Hidden
  Write-Host "FORGE_LIVE_STARTUP=INSTALLED path=$launcher"
}

Start-Sleep -Seconds 2
$statusPath = Join-Path $ServiceHome 'live-sync.status.json'
if (Test-Path -LiteralPath $statusPath) {
  Write-Host 'FORGE_LIVE_STATUS:'
  Get-Content -Raw -LiteralPath $statusPath | Write-Host
} else {
  Write-Host 'FORGE_LIVE_STATUS=PENDING daemon_started=1'
}

$sha = (& git -C $Root rev-parse HEAD).Trim()
Write-Host "FORGE_LIVE_SYNC_INSTALLED root=$Root branch=$Branch sha=$sha interval_ms=$IntervalMs"
Write-Host 'Code sync is now GitHub -> C:\alumdoor only. No bootstrap, D1 mutation, service stop, build, test, or CI gate is run by live sync.'
