#!/bin/sh
# Construit le .whl du plugin dans dist/
set -eu
cd "$(dirname "$0")"

mkdir -p releases
if command -v uv >/dev/null 2>&1; then
    uv build --wheel --out-dir releases
else
    python3 -m build --wheel --outdir releases
fi

chmod 644 releases/*.whl
