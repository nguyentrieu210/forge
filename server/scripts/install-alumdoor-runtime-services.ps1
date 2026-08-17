[CmdletBinding()]
param(
  [string]$Root = 'C:\alumdoor',
  [string]$ServiceHome = 'C:\ForgeServices\Alumdoor'
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Assert-Administrator {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = [Security.Principal.WindowsPrincipal]::new($identity)
  if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw 'Run this script from PowerShell started with Run as administrator.'
  }
}

function Escape-Xml([string]$Value) {
  return [Security.SecurityElement]::Escape($Value)
}

function Wait-Port {
  param(
    [int]$Port,
    [int]$TimeoutSeconds = 120
  )

  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    $client = [Net.Sockets.TcpClient]::new()
    try {
      $async = $client.BeginConnect('127.0.0.1', $Port, $null, $null)
      if ($async.AsyncWaitHandle.WaitOne(1000) -and $client.Connected) {
        $client.EndConnect($async)
        return
      }
    } catch {
      # Retry until the deadline.
    } finally {
      $client.Dispose()
    }
    Start-Sleep -Seconds 1
  }
  throw "Port $Port did not become ready within $TimeoutSeconds seconds."
}

function Write-ServiceConfig {
  param(
    [string]$Id,
    [string]$Name,
    [string]$Role,
    [string]$NodePath,
    [string]$PnpmPath,
    [string]$HostScript,
    [string]$ConfigPath,
    [string]$LogsPath,
    [string]$MaintenancePath
  )

  $nodeXml = Escape-Xml $NodePath
  $pnpmXml = Escape-Xml $PnpmPath
  $hostXml = Escape-Xml $HostScript
  $logsXml = Escape-Xml $LogsPath
  $maintenanceXml = Escape-Xml $MaintenancePath
  $rootXml = Escape-Xml $Root

  @"
<service>
  <id>$Id</id>
  <name>$Name</name>
  <description>Alumdoor local $Role runtime managed by WinSW. No console window is required.</description>
  <executable>$nodeXml</executable>
  <arguments>&quot;$hostXml&quot; --role $Role</arguments>
  <workingdirectory>$rootXml</workingdirectory>
  <env name="ALUMDOOR_ROOT" value="$rootXml" />
  <env name="ALUMDOOR_PNPM" value="$pnpmXml" />
  <env name="ALUMDOOR_SERVICE_HOME" value="$(Escape-Xml $ServiceHome)" />
  <env name="ALUMDOOR_SERVICE_MAINTENANCE" value="$maintenanceXml" />
  <serviceaccount>
    <username>NT AUTHORITY\NetworkService</username>
  </serviceaccount>
  <startmode>Automatic</startmode>
  <delayedAutoStart>true</delayedAutoStart>
  <hidewindow>true</hidewindow>
  <stoptimeout>30 sec</stoptimeout>
  <onfailure action="restart" delay="5 sec" />
  <resetfailure>1 hour</resetfailure>
  <logpath>$logsXml</logpath>
  <log mode="roll"></log>
</service>
"@ | Set-Content -LiteralPath $ConfigPath -Encoding UTF8
}

Assert-Administrator

if (-not (Test-Path (Join-Path $Root '.git'))) {
  throw "$Root is not the Alumdoor Git workspace."
}

$hostScript = Join-Path $Root 'server\scripts\alumdoor-runtime-service-host.mjs'
$maintenanceScript = Join-Path $Root 'server\scripts\alumdoor-runtime-maintenance.mjs'
if (-not (Test-Path $hostScript) -or -not (Test-Path $maintenanceScript)) {
  throw 'Runtime service scripts are missing. Sync C:\alumdoor to the main commit containing the Windows service support first.'
}

$node = (Get-Command node.exe -ErrorAction Stop).Source
$pnpmCommand = Get-Command pnpm.cmd -ErrorAction SilentlyContinue
if (-not $pnpmCommand) {
  $pnpmCommand = Get-Command pnpm -ErrorAction Stop
}
$pnpm = $pnpmCommand.Source

$logs = Join-Path $ServiceHome 'logs'
$maintenance = Join-Path $ServiceHome 'maintenance.flag'
New-Item -ItemType Directory -Force -Path $ServiceHome, $logs | Out-Null

# The GitHub runner and the two runtime services intentionally share the
# NetworkService identity. Grant it Modify on the local dev checkout so git,
# Wrangler state, Vite caches and generated assets all have one consistent
# owner instead of creating cross-account process/file permission failures.
Write-Host 'Granting NetworkService Modify on C:\alumdoor and service state...'
& icacls.exe $Root /grant '*S-1-5-20:(OI)(CI)M' /T /C | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Failed to grant NetworkService access to C:\alumdoor.' }
& icacls.exe $ServiceHome /grant '*S-1-5-20:(OI)(CI)M' /T /C | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Failed to grant NetworkService access to the service home.' }

# Keep Git happy when the checkout is owned by the interactive administrator
# while Actions runs as NetworkService.
$safeDirectories = @(git config --system --get-all safe.directory 2>$null)
if ($safeDirectories -notcontains 'C:/alumdoor') {
  git config --system --add safe.directory C:/alumdoor
  if ($LASTEXITCODE -ne 0) { throw 'Failed to register C:/alumdoor as a system safe.directory.' }
}

# Put the runtime into fail-safe maintenance before touching old processes.
Set-Content -LiteralPath $maintenance -Value "install maintenance $(Get-Date -Format o)" -Encoding UTF8

Write-Host 'Stopping legacy local processes on 8799/5173...'
& $node (Join-Path $Root 'server\scripts\stop-local-dev.mjs') --ports=8799,5173
if ($LASTEXITCODE -ne 0) {
  throw 'Could not stop the old local Worker/Desk processes. Run this installer as Administrator after closing legacy console windows.'
}

$winswVersion = '2.12.0'
$winswBase = Join-Path $ServiceHome 'WinSW-x64.exe'
$winswUrl = "https://github.com/winsw/winsw/releases/download/v$winswVersion/WinSW-x64.exe"
if (-not (Test-Path $winswBase)) {
  Write-Host "Downloading WinSW $winswVersion from the official GitHub release..."
  Invoke-WebRequest -Uri $winswUrl -OutFile $winswBase
}

$services = @(
  @{ Id = 'ForgeAlumdoorBackend'; Name = 'Forge Alumdoor Backend'; Role = 'backend' },
  @{ Id = 'ForgeAlumdoorDesk'; Name = 'Forge Alumdoor Desk'; Role = 'desk' }
)

foreach ($definition in $services) {
  $id = $definition.Id
  $exe = Join-Path $ServiceHome "$id.exe"
  $xml = Join-Path $ServiceHome "$id.xml"
  $serviceLogPath = Join-Path $logs $id
  New-Item -ItemType Directory -Force -Path $serviceLogPath | Out-Null

  $existing = Get-Service -Name $id -ErrorAction SilentlyContinue
  if ($existing -and $existing.Status -ne 'Stopped') {
    Write-Host "Stopping existing service $id..."
    Stop-Service -Name $id -Force
    $existing.WaitForStatus('Stopped', [TimeSpan]::FromSeconds(30))
  }

  Copy-Item -LiteralPath $winswBase -Destination $exe -Force
  Write-ServiceConfig `
    -Id $id `
    -Name $definition.Name `
    -Role $definition.Role `
    -NodePath $node `
    -PnpmPath $pnpm `
    -HostScript $hostScript `
    -ConfigPath $xml `
    -LogsPath $serviceLogPath `
    -MaintenancePath $maintenance

  if ($existing) {
    & $exe refresh
    if ($LASTEXITCODE -ne 0) { throw "WinSW refresh failed for $id." }
  } else {
    & $exe install
    if ($LASTEXITCODE -ne 0) { throw "WinSW install failed for $id." }
  }
  Set-Service -Name $id -StartupType Automatic
}

Remove-Item -LiteralPath $maintenance -Force -ErrorAction SilentlyContinue

foreach ($definition in $services) {
  $svc = Get-Service -Name $definition.Id
  if ($svc.Status -ne 'Running') {
    Start-Service -Name $definition.Id
  }
}

Write-Host 'Waiting for hidden runtime services...'
Wait-Port -Port 8799 -TimeoutSeconds 180
Wait-Port -Port 5173 -TimeoutSeconds 180

# Return the forge GitHub runner to normal Windows-service mode. This does not
# touch the separate forge-core runner.
$runner = Get-Service | Where-Object { $_.Name -like 'actions.runner.nguyentrieu210-forge.*' } | Select-Object -First 1
if ($runner) {
  Set-Service -Name $runner.Name -StartupType Automatic
  if ($runner.Status -ne 'Running') {
    try {
      Start-Service -Name $runner.Name
    } catch {
      Write-Warning "Could not start $($runner.Name). Close any interactive C:\actions-runner\forge\run.cmd session, then run: Start-Service '$($runner.Name)'"
    }
  }
} else {
  Write-Warning 'The nguyentrieu210/forge GitHub runner service was not found.'
}

Write-Host ''
Write-Host '=== ALUMDOOR WINDOWS SERVICES READY ==='
Get-Service ForgeAlumdoorBackend, ForgeAlumdoorDesk | Select-Object Status, Name, DisplayName | Format-Table -AutoSize
if ($runner) {
  Get-Service -Name $runner.Name | Select-Object Status, Name, DisplayName | Format-Table -AutoSize
}
Write-Host 'Backend : http://localhost:8799'
Write-Host 'Desk    : http://localhost:5173'
Write-Host "Logs    : $logs"
Write-Host 'ALUMDOOR_WINDOWS_SERVICES_PASS'
