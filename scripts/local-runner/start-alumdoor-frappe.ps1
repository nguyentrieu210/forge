param(
    [string]$Backend = 'http://127.0.0.1:8000',
    [string]$Site = 'alumdoor.localhost',
    [int]$Port = 5173
)

$ErrorActionPreference = 'Stop'
$repoRoot = Resolve-Path (Join-Path $PSScriptRoot '..\..')
$runtimeDir = Join-Path $repoRoot 'client\apps\runtime'

$env:VITE_FORGE_BACKEND = $Backend
$env:VITE_FRAPPE_SITE = $Site

Set-Location -LiteralPath $runtimeDir
corepack pnpm@9.15.0 exec vite --host 127.0.0.1 --port $Port --strictPort
