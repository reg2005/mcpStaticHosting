#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
exec docker compose --env-file .env.production -f compose.prod.yaml "$@"
