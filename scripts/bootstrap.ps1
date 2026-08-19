param()

$ErrorActionPreference = "Stop"
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Set-Location $repoRoot

if ($env:OS -eq "Windows_NT") {
    $env:UV_PROJECT_ENVIRONMENT = Join-Path $repoRoot ".venv-ml100"
}

function Require-Command([string]$Name) {
    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        throw "Required command is unavailable: $Name"
    }
}

Require-Command "node"
Require-Command "pnpm"
Require-Command "python"
Require-Command "uv"
Require-Command "git"

$nodeVersion = node --version
$pnpmVersion = pnpm --version
$pythonVersion = python --version
$uvVersion = uv --version

if ($nodeVersion -ne "v24.14.0") {
    throw "Expected Node.js v24.14.0, found $nodeVersion"
}
if ($pnpmVersion -ne "9.15.4") {
    throw "Expected pnpm 9.15.4, found $pnpmVersion"
}
if ($pythonVersion -ne "Python 3.12.6") {
    throw "Expected Python 3.12.6, found $pythonVersion"
}
if ($uvVersion -notmatch "^uv 0\.10\.1(?:\s|$)") {
    throw "Expected uv 0.10.1, found $uvVersion"
}

Write-Output "TOOLCHAIN=PASS node=$nodeVersion pnpm=$pnpmVersion python=$pythonVersion uv=$uvVersion"

python scripts/verify_authority_hashes.py
if ($LASTEXITCODE -ne 0) {
    throw "canonical authority blob hash verification failed"
}

pnpm install --frozen-lockfile --ignore-scripts
if ($LASTEXITCODE -ne 0) {
    throw "pnpm locked dependency installation failed"
}

uv sync --all-packages --locked
if ($LASTEXITCODE -ne 0) {
    throw "uv locked dependency installation failed"
}

$pythonEnvironment = Join-Path $env:UV_PROJECT_ENVIRONMENT "Scripts"
if (Test-Path -LiteralPath $pythonEnvironment) {
    $env:Path = "$pythonEnvironment;$env:Path"
}

pnpm ci:validate
if ($LASTEXITCODE -ne 0) {
    throw "root validation failed"
}

uv run --package mef-scientific-kernel python -m mef_scientific_kernel
if ($LASTEXITCODE -ne 0) {
    throw "scientific package smoke test failed"
}

$manifest = Join-Path $repoRoot "fixtures\evidence\replay-manifest.json"
uv run --package mef-evidence-replay python -m mef_evidence_replay --manifest $manifest --repository-root $repoRoot
if ($LASTEXITCODE -ne 0) {
    throw "evidence replay smoke test failed"
}

Write-Output "WINDOWS_NATIVE_BOOTSTRAP=PASS"
