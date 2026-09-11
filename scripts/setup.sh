#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
case "${1:-}" in
  '') template=.env.example; destination=.env ;;
  --production) template=.env.production.example; destination=.env.production ;;
  *) echo 'Usage: sh scripts/setup.sh [--production]'; exit 1 ;;
esac
if [ -e "$destination" ]; then
  echo "$destination already exists; no values were changed."
  exit 0
fi
command -v openssl >/dev/null 2>&1 || { echo 'Install OpenSSL first.'; exit 1; }
umask 077
# noclobber also protects against another setup process creating the file.
(set -C; sed \
  -e "s/^APP_SECRET=$/APP_SECRET=$(openssl rand -hex 32)/" \
  -e "s/^POSTGRES_PASSWORD=$/POSTGRES_PASSWORD=$(openssl rand -hex 32)/" \
  "$template" > "$destination")
echo "Created $destination with unique secrets. Configure your domains before public deployment."
