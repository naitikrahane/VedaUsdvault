param(
  [switch]$StartWebDemo
)

$ErrorActionPreference = "Stop"

function Step($message) {
  Write-Host ""
  Write-Host "== $message ==" -ForegroundColor Cyan
}

function Require-Command($name) {
  if (-not (Get-Command $name -ErrorAction SilentlyContinue)) {
    throw "Missing required command: $name"
  }
}

function Require-Node20OrHigher() {
  $raw = node -v
  $major = [int]($raw.TrimStart("v").Split(".")[0])
  if ($major -lt 20) {
    throw "Node.js 20+ required. Found $raw"
  }
}

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $repoRoot

Step "Checking system requirements"
Require-Command node
Require-Command npm
Require-Command git
Require-Node20OrHigher

Step "Installing project dependencies"
npm install

Step "Running environment diagnostics"
npm run doctor

Step "Compiling contracts"
npm run compile

Step "Running all tests"
npm run test:all

Step "Running full demo script"
npm run demo

if ($StartWebDemo) {
  Step "Starting interactive website demo"
  npm run web:demo
} else {
  Write-Host ""
  Write-Host "Install kit completed successfully."
  Write-Host "Run 'npm run web:demo' to launch interactive website actions."
}
