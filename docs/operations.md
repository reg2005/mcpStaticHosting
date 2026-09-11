# Operations

## Status and logs

```sh
docker compose ps -a
docker compose logs --tail=100 web mcp router
```

`migrate` should exit with code 0; it is not a long-running service. Web/MCP/router
health endpoints are `/healthz`. These are liveness checks, not a guarantee that every
backend operation is available. Verify the dashboard and an actual published site
after updates. Do not publish logs without reviewing them for site/user content.

## Backups

Back up PostgreSQL, the `sites` volume, Redis if you use function KV, and `.env`.
Keep the same Compose project name so volume references remain stable. A database
backup alone does not contain site files. Store archives securely; `.env` contains
credentials and the key needed to decrypt per-project secrets.

For a consistent single-host backup, stop all writers while keeping databases up:

```sh
umask 077
mkdir -p backups
docker compose stop web mcp router functions
docker compose exec -T postgres pg_dump -U mcphosting -d mcphosting -Fc > backups/database.dump
docker compose run --rm --no-deps --entrypoint tar web -czf - -C /data . > backups/sites.tar.gz
docker compose exec -T redis redis-cli SAVE
docker compose cp redis:/data/dump.rdb backups/redis.rdb
cp .env backups/environment.env
docker compose up -d --wait
```

If you enabled functions, use `--profile functions` for the final `up` command.
Redis AOF is enabled. The RDB file above is a logical Redis snapshot; to restore it,
initialize a fresh Redis volume with the RDB before enabling AOF again. Do not replace
files in a running Redis instance. Test restore on a separate stack before relying
on backups. Encrypt and copy backups off the host according to your retention policy.

## Restore

Use a new empty deployment with the same release and saved environment. Start only
PostgreSQL and Redis, restore the database with `pg_restore`, and unpack `sites.tar.gz`
into the new sites volume as the image's UID 1000. Restore the Redis snapshot if needed.
Then start applications, check health, log in and verify published and preview pages.
Keep the original deployment until the restored copy has been verified. Never restore
a partial database into a live application.

## Upgrade

1. Read CHANGELOG and release notes; back up data and `.env`.
2. Update the checkout and set `IMAGE_TAG` to the release being installed.
3. Pull images, stop application writers and apply migrations explicitly.
4. Start the stack and verify real requests.

```sh
docker compose pull
docker compose stop web mcp router functions
docker compose run --rm migrate
docker compose up -d --wait
```

Migrations are versioned and run at startup too. A release may change the schema.
For application rollback, set the previous image tag only when its schema remains
compatible. Otherwise restore the complete matching backup into a separate stack;
there is no automatic database downgrade. Site-content rollback is independent and
available through the dashboard/MCP release tools.

## Troubleshooting

- **Missing secret:** run `sh scripts/setup.sh` in a fresh checkout; existing `.env`
  files are never overwritten. Fill missing values yourself in an existing file.
- **Permission denied under /data:** use the named volumes from Compose; custom bind
  mounts must be writable by UID/GID 1000.
- **Wrong MCP URL:** change `MCP_PUBLIC_URL` and run `docker compose up -d`.
- **Auth origin error:** `AUTH_BASE_URL` must exactly match the browser origin.
- **Sites do not resolve:** check wildcard DNS, including the preview level, and
  preserve the `Host` header through the proxy.
- **Functions disabled / 503:** enable both the environment flag and Compose profile.
- **Database password changed:** restore the original environment or explicitly
  change the database role password; environment edits do not update stored roles.
- **Port collision:** change the three host port variables and public URLs together.
