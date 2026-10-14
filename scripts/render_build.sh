#!/usr/bin/env bash
# Render "Build Command":   bash scripts/render_build.sh
# Installs the backend, fetches the PRIVATE index data, rebuilds the search index natively on this
# machine, and downloads the (public) ONNX embedding model, so the first visitor does not wait for it.
# Secrets come only from environment variables set in the Render dashboard. Nothing is printed.
set -euo pipefail

: "${DATA_REPO:?Set DATA_REPO to the private data repository, e.g. your-name/scripture-data}"
: "${DATA_REPO_TOKEN:?Set DATA_REPO_TOKEN to the read-only token for that repository}"
export EMBEDDING_BACKEND=onnx ANONYMIZED_TELEMETRY=False

pip install -r requirements-api.txt

rm -rf .data_tmp
# the token travels in a request header (not in the address), so it is never stored in .git/config or an error message
# (DATA_REPO_URL exists only for local tests: never set it on Render, because the token is sent to that address)
auth="$(printf 'x-access-token:%s' "$DATA_REPO_TOKEN" | base64 | tr -d '\n')"
git -c "http.extraheader=Authorization: Basic ${auth}" clone --quiet --depth 1 \
  "${DATA_REPO_URL:-https://github.com/${DATA_REPO}.git}" .data_tmp

python index_data.py check .data_tmp
python index_data.py build .data_tmp
rm -rf .data_tmp

python -c "import rag; rag.get_embedding_model(); print('embedding model ready')"
python -c "import rag; assert rag.is_ready(); print('index ready')"
