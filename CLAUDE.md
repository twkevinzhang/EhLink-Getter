# CLAUDE.md

This file provides guidance to coding agents working in this repository.

## Project Overview

EhLink-Getter is an Electron desktop application for fetching E-Hentai gallery links, downloading galleries, scheduling recurring scans, and searching local metadata.

The application is in a one-release backend transition:

- **Renderer**: Vue 3 + TypeScript + PrimeVue
- **Main process**: Electron + TypeScript services
- **Default scraper**: TypeScript service running directly in Electron main
- **Temporary fallback**: Go sidecar selected with `EH_SCRAPER_BACKEND=go`

The Go sidecar remains packaged for rollback during this release only. New scraping behavior and fixes belong in the TypeScript backend unless the task explicitly concerns fallback parity.

## Architecture

### Default flow

```text
Vue Renderer
    ↕ IPC
Electron Main
    ├── TypeScript E-Hentai scraper
    ├── Download queue
    ├── Schedule runner
    ├── Workspace repository (SQLite)
    └── Metadata search (Node.js streams)
```

The renderer never talks directly to E-Hentai. IPC handlers delegate to services in the main process. Scraping no longer requires a localhost HTTP hop when the default backend is active.

### Temporary fallback flow

```text
Vue Renderer
    ↕ IPC
Electron Main
    ↕ localhost HTTP + JSON stdout
Go Sidecar
```

Set `EH_SCRAPER_BACKEND=go` before starting the app to select this path. Unset it, or set it to `ts`, for the default TypeScript path.

## Directory Structure

```text
src/
├── main/
│   ├── index.ts                 # App lifecycle and IPC registration
│   └── services/
│       ├── ehentai/             # TypeScript scraping gateway and parsers
│       ├── download_service.ts  # Gallery image download orchestration
│       ├── job_manager.ts       # Download queue state and concurrency
│       ├── schedule_runner_service.ts
│       ├── workspace_repository.ts
│       └── metadata_service.ts  # Streaming NDJSON search
├── preload/                     # Safe IPC bridge
├── renderer/                    # Vue renderer
└── shared/                      # Cross-process types and contracts

sidecar/                         # Temporary Go fallback; remove after transition
electron-builder.json5           # Packaging, including fallback binary for now
.github/workflows/release.yml    # macOS/Windows release pipeline
```

If the TypeScript scraper directory is renamed during implementation, update this document with the final path rather than creating a second scraper abstraction.

## Backend Selection

| Setting                 | Behavior                                |
| ----------------------- | --------------------------------------- |
| unset                   | Use TypeScript scraper in Electron main |
| `EH_SCRAPER_BACKEND=ts` | Use TypeScript scraper in Electron main |
| `EH_SCRAPER_BACKEND=go` | Spawn and use the temporary Go sidecar  |

Backend selection is process-wide and should be resolved once during application startup. Do not expose backend selection as normal user-facing configuration.

All scraper consumers should depend on one TypeScript interface rather than branching between implementations themselves. This includes list fetching, gallery metadata, image-link resolution, and image fetching.

## Critical Architectural Decisions

1. **TypeScript is the source of truth**
   - New scraping behavior is implemented and tested in TypeScript.
   - The Go implementation is a fallback, not a second long-term platform.

2. **No TypeScript sidecar or localhost API**
   - The default scraper runs as an Electron main-process service.
   - Pass `AbortSignal` through request and parsing workflows so pause, stop, and schedule cancellation can interrupt network activity.

3. **One queue item per gallery**
   - `DownloadQueueItem` represents exactly one gallery identified by `gid`.
   - Do not restore the legacy job-with-many-galleries hierarchy.

4. **Streaming metadata search stays in Node.js**
   - `MetadataService` reads newline-delimited JSON with streams and `readline`.
   - Do not load large metadata files into memory as one JSON array.

5. **Fallback packaging is temporary**
   - Release CI still builds the Go binary for macOS and Windows.
   - `electron-builder.json5` still includes it in `extraResources`.
   - Do not remove these until the transition release has been validated.

## Development Commands

### Setup

```bash
pnpm install
```

The default TypeScript development path does not require building Go. To exercise the fallback:

```bash
cd sidecar
make install
make build
```

### Development

```bash
pnpm run dev
EH_SCRAPER_BACKEND=go pnpm run dev  # temporary fallback
```

### Verification

```bash
pnpm test
pnpm run typecheck
pnpm run lint
pnpm run format
```

`pnpm run lint` and `pnpm run format` can modify files. Inspect the resulting diff and do not include unrelated formatting changes.

### Production Build

The transition release still requires both application assets and the fallback binary:

```bash
pnpm test
pnpm run typecheck
pnpm exec electron-vite build
cd sidecar && make build && cd ..
pnpm exec electron-builder --mac --publish never
```

For Windows, release CI sets `node-linker=hoisted`, rebuilds `better-sqlite3`, builds `sidecar.exe`, and creates a portable `.exe`. The Windows artifact is not an NSIS installer.

## Key Workflows

### Adding or changing scraper behavior

1. Change the TypeScript scraper implementation.
2. Add fixture-based tests for parsing and normalized output.
3. Verify timeout and abort behavior for network operations.
4. If the Go fallback differs, document the difference; only patch Go when fallback operation during the transition release requires it.
5. Run `pnpm test` and `pnpm run typecheck`.

### Adding an IPC handler

1. Register the handler in the Electron main process.
2. Update preload and shared types.
3. Call it through the preload bridge from the renderer.
4. Keep scraping and persistence logic out of the renderer.

### Working with metadata files

`metadata.json` is newline-delimited JSON (NDJSON), not a JSON array:

```json
{"gid":123,"token":"abc","title":"Example"}
{"gid":456,"token":"def","title":"Another"}
```

Process it line-by-line to keep memory usage bounded.

## Testing and Release CI

The release workflow must pass these gates before packaging:

1. Install dependencies and rebuild `better-sqlite3` for Electron.
2. Run `pnpm test`.
3. Build the temporary Go fallback for the matrix OS.
4. Type-check and build Electron assets.
5. Package macOS DMG/ZIP or Windows portable EXE.
6. Create a draft GitHub release.

For scraper migration work, prefer fixture contract tests covering list display modes, pagination, metadata fallback, image-page resolution, cookie forwarding, proxy selection, timeout, and abort behavior. Perform packaged smoke tests on both macOS and Windows before removing Go.

## Transition Cleanup Checklist

After one stable TypeScript-default release:

1. Remove the `go` backend option and sidecar lifecycle code.
2. Delete `sidecar/` and the `build:sidecar` package script.
3. Remove `actions/setup-go`, the Go cache, and sidecar build from release CI.
4. Remove sidecar entries from `asarUnpack` and `extraResources` in `electron-builder.json5`.
5. Remove sidecar port, health-check, config-retry, and stdout-log compatibility code.
6. Remove Go prerequisites and fallback instructions from documentation.
7. Verify TypeScript-only development and packaged builds on macOS and Windows.

## Known Constraints

- Removing Go will not remove all native build requirements: `better-sqlite3` still requires an Electron-compatible native rebuild.
- Restrict image fetching to expected protocols and hosts; do not recreate the sidecar's arbitrary-URL fetch surface.
- Proxy support for this migration is HTTP/HTTPS. Do not imply SOCKS support without implementation and tests.
- E-Hentai has multiple list display modes. Preserve fallback selectors and fixture coverage when changing parsers.

## Codebase Navigation

Use `codemap --diff --ref master`, `git diff`, and `git status` to inspect work that differs from the default branch. Prefer semantic symbol tools when available; use `rg` for direct text and file searches.

## Tooling Guidance

- Use Context7 for current official documentation when implementation depends on Vue, TypeScript, Axios, Vite, Pinia, or another evolving library API.
- Prefer Serena symbol search and reference lookup for structured code navigation when available.
- Use Codemap for repository structure and dependency flow; diff mode against `master` is required when reviewing branch changes.
