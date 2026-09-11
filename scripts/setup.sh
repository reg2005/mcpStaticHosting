#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
if [ -e .env ]; then
  echo '.env already exists; no values were changed.'
  exit 0
fi
command -v openssl >/dev/null 2>&1 || { echo 'Install OpenSSL first.'; exit 1; }
umask 077
# noclobber also protects against another setup process creating .env.
(set -C; sed \
  -e "s/^APP_SECRET=$/APP_SECRET=$(openssl rand -hex 32)/" \
  -e "s/^POSTGRES_PASSWORD=$/POSTGRES_PASSWORD=$(openssl rand -hex 32)/" \
  .env.example > .env)
echo 'Created .env with unique secrets and local-only ports. Edit domains before deployment.'
