# EhLink-Getter Development Guide

This document covers the technical architecture, development setup, and build process for EhLink-Getter.

## Architecture

EhLink-Getter is migrating to a **TypeScript-first Electron architecture**:

- **Frontend (Renderer)**: Built with **Vue 3**, **TypeScript**, and **PrimeVue**.
- **Main Process**: Handles Electron app lifecycle, IPC communication, E-Hentai scraping, downloads, and high-performance file operations such as metadata searching with Node.js streams.
- **Temporary Go Fallback**: The previous Gin/goquery sidecar remains packaged for one transition release. It is not the default backend and will be removed after cross-platform validation.

## Tech Stack

- **Frontend**: Vue 3 (Composition API), Pinia, PrimeVue, Vite, Tailwind CSS
- **Main Process**: Electron, Node.js, TypeScript, Cheerio, Axios
- **Temporary Fallback**: Go, Gin, Goquery, Resty

## Getting Started

### Prerequisites

- **Node.js**: v20 or later
- **pnpm**: Recommended package manager
- **Go**: v1.25 or later, required only while building or testing the temporary fallback sidecar

### Installation

1. Clone the repository:

   ```bash
   git clone https://github.com/twkevinzhang/EhLink-Getter.git
   cd EhLink-Getter
   ```

2. Install Node.js dependencies:

   ```bash
   pnpm install
   ```

3. Optional: build the temporary Go fallback if you need to test it:
   ```bash
   cd sidecar
   make install
   make build
   cd ..
   ```

## Development

To start the application in development mode with Hot Module Replacement (HMR), using the default TypeScript scraper:

```bash
pnpm run dev
```

To diagnose a regression against the temporary Go fallback:

```bash
EH_SCRAPER_BACKEND=go pnpm run dev
```

Supported values are `ts` (default) and `go`. The fallback still uses a local sidecar process and port; the TypeScript backend runs directly in Electron main.

## Building & Packaging

### 1. Verify the TypeScript application

```bash
pnpm test
pnpm run typecheck
pnpm exec electron-vite build
```

### 2. Build the temporary Go fallback

The transition release still packages the fallback, so release builds must compile it for the target platform:

```bash
pnpm run build:sidecar
```

### 3. Package the Electron Application

Use electron-builder to create a distributable package:

```bash
pnpm exec electron-builder --win --publish never  # Windows
pnpm exec electron-builder --mac --publish never  # macOS
```

The Windows target is a portable `.exe`, not an NSIS installer.

## Post-transition cleanup

After one stable release with TypeScript as the default backend:

1. Remove `EH_SCRAPER_BACKEND=go` and the sidecar lifecycle code.
2. Delete `sidecar/`, `build:sidecar`, and Go-specific setup documentation.
3. Remove `setup-go`, the sidecar build step, and sidecar cache settings from release CI.
4. Remove the sidecar entry from `electron-builder.json5` (`asarUnpack` and `extraResources`).
5. Verify packaged macOS and Windows builds before declaring the migration complete.

## Documentation

- [CLAUDE.md](./CLAUDE.md): Internal developer guidelines and technical deep-dives.
