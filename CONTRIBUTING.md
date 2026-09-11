# Contributing

Open an issue for a substantial change. Keep patches focused, use Conventional
Commits and update CHANGELOG for user-visible behavior. Never include deployment
secrets, real user data or generated build output.

Install Node.js 22 and pnpm 8.6.7, then `pnpm install --frozen-lockfile`.
Validation and releases run locally; GitHub Actions are disabled.
Run `pnpm typecheck`, `pnpm lint`, `pnpm test` and `pnpm build` before submitting.
The linter checks correctness rules; formatting is not enforced for imported source.

For isolated integration testing, generate `.env`, choose unused host ports and a
unique `COMPOSE_PROJECT_NAME`, build the image, then start Compose and run:

```sh
SMOKE_WEB_URL=http://localhost:3000 SMOKE_MCP_URL=http://localhost:3001/mcp \
  SMOKE_ROUTER_URL=http://127.0.0.1:3002 node scripts/smoke.mjs
```

This creates disposable test accounts/sites. Run it only on a test installation,
never a populated public instance. The script reads credentials in memory and does
not print them. Use a fresh volume set to verify migrations.

For Deno changes, run `deno task check` and `deno lint` in `apps/functions`, and test
the `functions` profile separately. Add a regression test for behavior you change.
Document API changes and architectural decisions in `docs/`. Public compatibility
starts with actual released consumers; do not add speculative legacy adapters.

By contributing you agree to license your contribution under this repository's MIT
license. Be respectful, specific and constructive in issues and pull requests.
