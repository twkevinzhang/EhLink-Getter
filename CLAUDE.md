# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

EhLink-Getter is an Electron desktop application for fetching E-Hentai gallery links and searching metadata. The architecture follows a **hybrid model** with:

- **Frontend (Renderer)**: Vue 3 + TypeScript + Element Plus UI
- **Main Process**: Electron IPC handlers + Node.js native services
- **Go Sidecar**: Gin-based HTTP service for web scraping

The sidecar runs as a separate process spawned by Electron and communicates via HTTP (localhost:8000) and structured JSON logs over stdout.

## Architecture Overview

### Process Communication Flow

```
Vue Renderer (Port: dev HMR)
    ↕ (IPC)
Electron Main Process
    ↕ (HTTP + JSON stdout)
Go Sidecar (Port: 8000)
```

**Key Points**:

- Main process spawns Go sidecar on app start (`src/main/index.ts`)
- Go sidecar outputs structured JSON events via stdout for logs/progress
- IPC handlers in main process proxy requests to sidecar HTTP API
- Metadata search runs **natively in Node.js** using streams (not Go) for performance

### Directory Structure

```
src/
├── main/           # Electron main process
│   ├── index.ts    # App lifecycle, sidecar spawn, IPC handlers
│   └── services/
│       └── metadata_service.ts  # Node.js native metadata search (streams + readline)
├── preload/        # Preload script exposing safe IPC APIs
│   └── index.ts
└── renderer/       # Vue 3 frontend
    └── src/
        ├── App.vue              # Main app container with state management
        ├── components/          # Feature-specific Vue components
        │   ├── Configuration.vue    # Cookie/proxy settings
        │   ├── MappingMetadata.vue  # Batch title-to-link mapping
        │   ├── SearchMetadata.vue   # Single metadata search
        │   ├── SystemLogs.vue       # Sidecar log viewer (JSON parsing)
        │   └── TaskConsole.vue      # Generic list scraper UI
        └── stores/              # Pinia state stores

sidecar/
├── cmd/
│   └── sidecar/
│       └── main.go         # Go entry point (Gin)
├── internal/
│   ├── api/                # API handlers
│   ├── models/             # Data models
│   ├── scraper/            # EhScraperService & ProxyManager
│   └── pkg/
│       └── logger/         # JSON structured logger
└── go.mod                  # Go module definition
```

### Critical Architectural Decisions

1. **Why Node.js for Metadata Search?**
   - `MetadataService` (`src/main/services/metadata_service.ts`) uses Node.js `fs.createReadStream()` and `readline` to process large `metadata.json` files line-by-line
   - This avoids loading gigabytes of JSON into memory and is faster than Python
   - Go sidecar handles **scraping only**, not metadata search

2. **Sidecar Lifecycle**
   - Development: Uses `sidecar/sidecar` binary (built via `make build`)
   - Production: Uses static binary bundled in `resources/sidecar/`
   - Sidecar is killed on app quit (`src/main/index.ts`)

3. **IPC Pattern**
   - All IPC handlers are in `src/main/index.ts:118-265`
   - Frontend calls via `window.electron.ipcRenderer.invoke(channel, ...args)`
   - Main process handlers either proxy to sidecar HTTP API or run native Node services

4. **Python Sidecar State**
   - Global `config` object stores cookies, proxy, paths
   - Cancellation is handled via `context.Context` in Go service
   - Frontend must call `/config` endpoint to update settings before scraping

## Development Commands

### Setup

```bash
# Install Node dependencies
pnpm install

# Setup Go sidecar
cd sidecar && make install && make build
```

### Development

```bash
# Start Electron in dev mode (auto-spawns Go sidecar)
pnpm run dev

# Type checking only (no build)
pnpm run typecheck           # Check both node + web
pnpm run typecheck:node      # Main/preload only
pnpm run typecheck:web       # Renderer only

# Linting
pnpm run lint                # Auto-fix with ESLint
pnpm run format              # Format with Prettier
```

### Building

**IMPORTANT**: Production builds require a two-step process:

```bash
# Step 1: Type check and build Electron assets
pnpm run typecheck && pnpm exec electron-vite build

# Step 2: Build Go sidecar
cd sidecar && make build

# Step 3: Package Electron app (includes sidecar binary from sidecar/sidecar)
pnpm exec electron-builder --mac --publish never     # macOS
pnpm exec electron-builder --win --publish never     # Windows
```

**Note**: On Windows, you MUST add `.npmrc` with `node-linker=hoisted` before `pnpm install` to avoid electron-builder issues (see `.github/workflows/release.yml:99-101`).

## Key Files to Understand

### Electron Main Process

- **`src/main/index.ts`**: Core app lifecycle
  - `startSidecar()`: Spawns Go binary, handles stdout JSON parsing
  - IPC handlers (line 118+): All renderer↔main communication
  - `MetadataService` usage (line 143, 230): Native Node.js metadata search

### Go Sidecar

- **`sidecar/cmd/sidecar/main.go`**: Gin HTTP server
- **`sidecar/internal/scraper/eh_scraper.go`**: Goquery scraper with fallback selectors
- **`sidecar/internal/scraper/image_service.go`**: Image fetching with Smart Resolver

### Vue Frontend

- **`src/renderer/src/App.vue`**: State management and component orchestration
  - Contains shared state like `config`, `metadataPath`, `results`
  - Split into child components (`Configuration`, `TaskConsole`, `MappingMetadata`, etc.)

- **`src/renderer/src/components/TaskConsole.vue`**: Generic list scraper UI
  - Handles pagination by calling `fetch-page` IPC with `next` token
  - Displays results in real-time, supports stop/save

## Common Workflows

### Adding a New IPC Handler

1. Add handler in `src/main/index.ts`:

   ```typescript
   ipcMain.handle("your-channel", async (_, payload) => {
     // Implementation
     return result;
   });
   ```

2. Add type in `src/preload/index.d.ts` (if exists, currently types are in `env.d.ts`)

3. Call from renderer:
   ```typescript
   const result = await window.electron.ipcRenderer.invoke(
     "your-channel",
     payload,
   );
   ```

### Modifying Scraper Logic

1. Edit `sidecar/internal/scraper/eh_scraper.go`
2. Test with `cd sidecar && go run ./cmd/sidecar/main.go`
3. Restart Electron dev server to pick up changes (binary re-run)

### Working with Metadata Files

The `metadata.json` file is a **newline-delimited JSON** (NDJSON) format:

```json
{"gid": 123, "token": "abc", "title": "Example", ...}
{"gid": 456, "token": "def", "title": "Another", ...}
```

- Each line is a separate JSON object (NOT a JSON array)
- `MetadataService` reads line-by-line to avoid memory issues
- See `metadata.json.exmaple` for structure

## Testing & CI/CD

- No automated test suite currently
- GitHub Actions workflow (`.github/workflows/release.yml`) handles:
  1. Version bumping (`pnpm version patch|minor|major`)
  2. Multi-OS builds (macOS + Windows in parallel)
  3. Compiled Go binary bundling
  4. Draft release creation with artifacts

To trigger a release:

```bash
# Manual workflow dispatch from GitHub UI, OR:
git tag v1.0.0
git push origin v1.0.0
```

## Gotchas & Known Issues

1. **Static Binary Architecture**: Ensure Go is cross-compiled if building for different OS from same host

2. **Electron Builder + pnpm**: Windows builds fail without `node-linker=hoisted` in `.npmrc`

3. **Metadata Service Path**: `search-metadata` IPC handler hardcodes `metadata.json` path (line 230). To support custom paths, frontend must pass it as parameter

4. **Sidecar Port Conflicts**: Default port 8000 may conflict. Set `SIDECAR_PORT` env var if needed

5. **Scraper Selectors**: E-Hentai has multiple display modes (Minimal/Compact/Extended/Thumbnail). `parse_list()` uses fallback selectors—if layout changes, update `eh_scraper_service.py:25-51`

## MCP Integrations

This project is configured with:

- **Context7 MCP**: Load docs for Vue 3, TypeScript, Python, Pydantic, FastAPI
- **Serena MCP**: Semantic code search and symbol-based editing
- **Codemap CLI**: Codebase visualization and navigation (use `codemap --diff --ref master`)

Prefer Serena for symbol-based operations over file-based grep/sed when available.

## Technology Stack

This project uses:

- **Vue 3** - Progressive JavaScript framework
- **TypeScript** - Typed superset of JavaScript
- **Go** - Sidecar service (Gin, Goquery)

## Use Context7 MCP for Loading Documentation

Context7 MCP is available to fetch up-to-date documentation with code examples.

**Recommended library IDs**:

- `vue` - Vue.js 3 official documentation with composition API, reactivity system, and component patterns
- `typescript` - TypeScript language reference, type system, and compiler options
- `python` - Python standard library and language reference
- `pydantic` - Python data validation using type hints (if using Pydantic)
- `fastapi` - Modern Python web framework (if building APIs)
- `axios` - Promise-based HTTP client for browser and Node.js
- `vite` - Next generation frontend build tool
- `pinia` - Vue store library (if using state management)

### How to Use

When you need documentation for these technologies, the Context7 MCP server can fetch current documentation with examples. Simply reference the library ID when asking questions about implementation patterns or API usage.

## Use Serena MCP for Semantic Code Analysis instead of regular code search and editing

Serena MCP is available for advanced code retrieval and editing capabilities.

**When to use Serena:**

- Symbol-based code navigation (find definitions, references, implementations)
- Precise code manipulation in structured codebases
- Prefer symbol-based operations over file-based grep/sed when available

**Key tools:**

- `find_symbol` - Find symbol by name across the codebase
- `find_referencing_symbols` - Find all symbols that reference a given symbol
- `list_symbols` - List all symbols in a file or scope
- `get_symbol_source` - Get the source code of a specific symbol

**Usage notes:**

- Memory files can be manually reviewed/edited in `.serena/memories/`

## Use Codemap CLI for Codebase Navigation

Codemap CLI is available for intelligent codebase visualization and navigation.

**Required Usage** - You MUST use `codemap --diff --ref master` to research changes different from default branch, and `git diff` + `git status` to research current working state.

### Quick Start

```bash
codemap .                    # Project tree
codemap --only vue,ts,py .   # Just Vue, TypeScript, Python files
codemap --exclude .xcassets,Fonts,.png .  # Hide assets
codemap --depth 2 .          # Limit depth
codemap --diff --ref master  # What changed vs master
codemap --deps .             # Dependency flow
```

### Options

| Flag                   | Description                             |
| ---------------------- | --------------------------------------- |
| `--depth, -d <n>`      | Limit tree depth (0 = unlimited)        |
| `--only <exts>`        | Only show files with these extensions   |
| `--exclude <patterns>` | Exclude files matching patterns         |
| `--diff`               | Show files changed vs main branch       |
| `--ref <branch>`       | Branch to compare against (with --diff) |
| `--deps`               | Dependency flow mode                    |
| `--importers <file>`   | Check who imports a file                |
| `--skyline`            | City skyline visualization              |
| `--json`               | Output JSON                             |

**Smart pattern matching** - no quotes needed:

- `.png` - any `.png` file
- `Fonts` - any `/Fonts/` directory
- `*Test*` - glob pattern

### Diff Mode

See what you're working on:

```bash
codemap --diff --ref master
codemap --diff --ref dev
codemap --diff --ref v2
```
