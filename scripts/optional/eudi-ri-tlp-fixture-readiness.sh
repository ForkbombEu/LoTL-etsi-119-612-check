#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repository_dir="$(cd "$script_dir/../.." && pwd)"
output_dir="artifacts/reference-smoke/eudi-ri-tlp"

cd "$repository_dir"
npm run build
node dist/cli.js --reference-source eudi-ri-tlp --out-dir "$output_dir" "$@"
