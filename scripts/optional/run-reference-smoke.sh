#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: npm run reference-smoke-run -- <eudi-ri-tlp|we-build-lotl-json|we-build-lotl-xml> [CLI options]" >&2
  exit 2
fi

source_name="$1"
shift

case "$source_name" in
  eudi-ri-tlp|we-build-lotl-json|we-build-lotl-xml) ;;
  *)
    echo "Unknown reference source: $source_name. Expected eudi-ri-tlp, we-build-lotl-json, or we-build-lotl-xml." >&2
    exit 2
    ;;
esac

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repository_dir="$(cd "$script_dir/../.." && pwd)"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
output_dir="artifacts/reference-smoke/$source_name/$timestamp"

cd "$repository_dir"
mkdir -p "$output_dir"
echo "Running optional live smoke for $source_name. Output: $output_dir"
npm run build
node dist/cli.js --reference-source "$source_name" --out-dir "$output_dir" "$@"
echo "Smoke output: $output_dir"
echo "Package for review: npm run package-reference-smoke -- $source_name $timestamp"
