# ADR 0001: Independent single-host Docker Compose distribution

Date: 2026-09-11. Status: accepted.

## Context

The owner requested an independent public repository and Docker Hub distribution,
without existing secrets, data, deployment domains or compatibility obligations.
The existing implementation already contains functioning Next.js, MCP, Hono,
Drizzle/PostgreSQL, Redis and Git storage components.

## Decision

Extract source into a fresh repository. Keep these components instead of rewriting
into the global default framework. Publish one reusable Node image plus an optional
Deno image. Configure domains at runtime and distribute a pull-only Docker Compose
file with named volumes and one-shot migrations. GitHub Actions implements checks
and opt-in publication, as this project is explicitly hosted on GitHub.

## Trade-offs

A shared filesystem and existing write behavior require one host and one replica per
service. No high-availability or concurrent multi-writer guarantee is claimed. Deno
workers are experimental and disabled by default. A public deployment needs an
operator-managed TLS proxy and DNS. No automatic migration from the source product
is provided. Preserve backups before updating a populated installation.

## Revisit when

Multiple independent hosts, untrusted function authors, transactional JSON storage,
large workloads or compatibility for real external consumers become requirements.
