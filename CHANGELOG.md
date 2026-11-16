# Changelog

## Unreleased

- Internal: replace `slimr-curl` with `cpp-httplib` and upgrade `slimr-mcp` / `slimr-bugsink`.
- Internal: switch macOS builds to llvm@23 with static libc++ and symbol hiding.

## v3.0.0 - 2026-11-16

- Require `GOOGLE_PLACES_API_KEY` at startup (bypass with `--skip-checks`) and stop reading API keys from `config.json` or the `GOOGLE_PLACE_API_KEY` alias
- Report Bugsink errors with `google-places-mcp@<version>` release tag and read `--version` from `VERSION`
- Bind HTTP server to `0.0.0.0` by default (pass `--host 127.0.0.1` for loopback-only)
- Read default config from `$(brew --prefix)/etc/google-places-mcp/config.json` instead of `~/.config/google-places`
- Add `--log-file <path>` redirection with 10 MiB log rotation (single `.1` backup)
- HTTP server no longer rejects non-loopback hosts, port 0, or foreign Host/Origin headers (slimr-mcp upgrade)
- Internal: align build, CI, Homebrew formula, and documentation with cpp-templates
- Internal: resolve slimr registries from the `slimr-down-now` org
