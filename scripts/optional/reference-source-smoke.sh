#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: npm run reference-smoke -- <eudi-ri-tlp|we-build-lotl-json|we-build-lotl-xml> [CLI options]" >&2
  exit 2
fi

source_name="$1"
shift

case "$source_name" in
  eudi-ri-tlp|we-build-lotl-json|we-build-lotl-xml) ;;
  *)
    echo "Unknown reference source: $source_name" >&2
    exit 2
    ;;
esac

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repository_dir="$(cd "$script_dir/../.." && pwd)"
output_dir="artifacts/reference-smoke/$source_name"

cd "$repository_dir"
npm run build
node dist/cli.js --reference-source "$source_name" --out-dir "$output_dir" "$@"
