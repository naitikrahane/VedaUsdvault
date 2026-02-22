#!/usr/bin/env bash
set -euo pipefail

START_WEB_DEMO=false

for arg in "$@"; do
  case "$arg" in
    --start-web-demo) START_WEB_DEMO=true ;;
    *)
      echo "Unknown option: $arg"
      echo "Valid option: --start-web-demo"
      exit 1
      ;;
  esac
done

step() {
  printf "\n== %s ==\n" "$1"
}

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

require_node20_or_higher() {
  local version major
  version="$(node -v)"
  major="${version#v}"
  major="${major%%.*}"
  if [ "$major" -lt 20 ]; then
    echo "Node.js 20+ required. Found $version" >&2
    exit 1
  fi
}

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

step "Checking system requirements"
require_cmd node
require_cmd npm
require_cmd git
require_node20_or_higher

step "Installing project dependencies"
npm install

step "Running environment diagnostics"
npm run doctor

step "Compiling contracts"
npm run compile

step "Running all tests"
npm run test:all

step "Running full demo script"
npm run demo

if [ "$START_WEB_DEMO" = true ]; then
  step "Starting interactive website demo"
  npm run web:demo
else
  echo
  echo "Install kit completed successfully."
  echo "Run 'npm run web:demo' to launch interactive website actions."
fi
