# google-places-mcp: Developer Reference

User installation and configuration are in [README.md](../README.md).

## Development Loop

```bash
just doctor
just test
just lint
just test-mcp
```

Iterate on a single doctest case with `just test "<case>"` (Debug build with ASan + UBSan, `BUGSINK_DSN=""`, no network calls). `just build` compiles the Release binary into `build/bin/google-places-mcp`.

Run the direct binary on a separate dev port:

```bash
./build/bin/google-places-mcp http --port 20004
```

## Toolchain & Platforms

- Set `VCPKG_ROOT` to a bootstrapped vcpkg checkout; dependencies install into `build/deps/` from the `slimr-*` vcpkg registries.
- `LLVM_BIN` overrides `$(brew --prefix llvm@23)/bin` for `clang-format` and `clang-tidy`.
- macOS builds use Homebrew `llvm@23` (`clang`/`clang++`) with static `libc++` and symbol hiding at a `15.0` deployment target (`otool -L` must show only system libraries).
- Linux (`ubuntu-24.04`) builds use Homebrew `llvm@23` clang++ with libc++ (static libc++ in Release) and `systemd --user` via `brew services` (`loginctl enable-linger "$USER"`).

## Develop against an unreleased lib

vcpkg reads extra port dirs from `VCPKG_OVERLAY_PORTS`, and an overlay wins over the registry. Point it at a dir of symlinks, one per unreleased lib; manifests never change:

```sh
mkdir -p ~/.vcpkg/overlays/dev
ln -s ~/dev/slimr/<name>/ports/slimr-<name> ~/.vcpkg/overlays/dev/slimr-<name>
export VCPKG_OVERLAY_PORTS=~/.vcpkg/overlays/dev
just test
```

Remove the symlink (or `unset VCPKG_OVERLAY_PORTS`) to build against the released lib again. Keep the export out of shell startup files. `just release` refuses to run while `VCPKG_OVERLAY_PORTS` is set.

## Release

Push changes to `main`, add an entry under `## Unreleased` in `CHANGELOG.md`, then run:

```bash
just release patch   # or minor / major
```

## Dropped Tooling

Do not re-add foreground runners, local tap/overlay symlinking, GitHub-branch/local-publish/dry-run helpers, standalone formula checks, or JS formula helpers.
