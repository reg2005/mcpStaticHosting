# Changelog

Notable changes use [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and Semantic Versioning.

## [Unreleased]

## [0.1.0] - 2026-09-11

### Added
- Independent Docker Compose distribution for MCP-driven static hosting.
- Shared Node image, optional Deno image and automatic database migrations.
- English and Russian setup documentation, operations and security guidance.
- Runtime domain configuration and unique-secret setup script.
- CI checks and release publishing workflow.

### Fixed
- Correct hostname registration when site URLs include a custom port.

### Security
- Updated runtime dependencies to versions passing the current production dependency audit.
- Excluded source deployment history, environment files and user data.
- Bind application ports to localhost by default; databases stay internal.
- Disable backend function execution by default.
- Do not log email verification or password reset links.
- Block static access to dotfiles and unsafe site-gate redirect destinations.
- Remove development authentication bypass and serve editor assets locally.
