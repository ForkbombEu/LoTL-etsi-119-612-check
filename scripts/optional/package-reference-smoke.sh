#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 2 ]]; then
  echo "Usage: npm run package-reference-smoke -- <eudi-ri-tlp|we-build-lotl-json|we-build-lotl-xml> <timestamp>" >&2
  echo "The timestamp must name one smoke directory, for example 20260717T120000Z." >&2
  exit 2
fi

source_name="$1"
timestamp="$2"

case "$source_name" in
  eudi-ri-tlp|we-build-lotl-json|we-build-lotl-xml) ;;
  *)
    echo "Unknown reference source: $source_name. Expected eudi-ri-tlp, we-build-lotl-json, or we-build-lotl-xml." >&2
    exit 2
    ;;
esac

if [[ ! "$timestamp" =~ ^[0-9]{8}T[0-9]{6}Z$ ]]; then
  echo "Invalid timestamp: $timestamp. Expected UTC form YYYYMMDDTHHMMSSZ." >&2
  exit 2
fi

if ! command -v zip >/dev/null 2>&1; then
  echo "Cannot package smoke output: the 'zip' command is required." >&2
  exit 1
fi

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repository_dir="$(cd "$script_dir/../.." && pwd)"
source_root="$repository_dir/artifacts/reference-smoke/$source_name"
smoke_dir="$source_root/$timestamp"
archive_path="$source_root/${timestamp}-review.zip"

if [[ ! -d "$smoke_dir" ]]; then
  echo "Smoke output directory does not exist: $smoke_dir. Run reference-smoke-run first." >&2
  exit 1
fi
if [[ -e "$archive_path" ]]; then
  echo "Review archive already exists: $archive_path. Refusing to overwrite it." >&2
  exit 1
fi

cd "$source_root"
zip -rq "$archive_path" "$timestamp"
echo "Review archive: artifacts/reference-smoke/$source_name/${timestamp}-review.zip"
echo "Archive contains only: artifacts/reference-smoke/$source_name/$timestamp/"
