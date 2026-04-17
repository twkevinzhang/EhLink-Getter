# EhLink-Getter Development Guide

This document covers the technical architecture, development setup, and build process for EhLink-Getter.

## Architecture

EhLink-Getter follows a **hybrid architecture** combining the strengths of Electron, Node.js, and Go:

- **Frontend (Renderer)**: Built with **Vue 3**, **TypeScript**, and **Element Plus**. It provides a modern, responsive UI with glassmorphism aesthetics.
- **Main Process**: Handles Electron app lifecycle, IPC communication, and high-performance file operations (like metadata searching using Node.js streams).
- **Go Sidecar**: A dedicated scraping service built with **Go (Gin framework)**. It handles external web requests, HTML parsing (via goquery), and proxy management. Communication between Main and Sidecar happens over local HTTP and structured JSON via stdout.

## Tech Stack

- **Frontend**: Vue 3 (Composition API), Pinia, Element Plus, Vite, Tailwind CSS
- **Main Process**: Electron, Node.js (Fs streams, readline for big JSON processing)
- **Sidecar**: Go 1.25+, Gin, Goquery, Resty

## Getting Started

### Prerequisites

- **Node.js**: v18 or later
- **Go**: v1.25 or later (managed via `asdf` recommended, see `.tool-versions`)
- **pnpm**: Recommended package manager

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

3. Setup and build the Go sidecar:
   ```bash
   cd sidecar
   make install
   make build
   cd ..
   ```

## Development

To start the application in development mode with Hot Module Replacement (HMR) for the renderer and automatic sidecar spawning:

```bash
pnpm run dev
```

## Building & Packaging

### 1. Build the Go Sidecar
Ensure the sidecar binary is compiled for your target platform:
```bash
pnpm run build:sidecar
```

### 2. Package the Electron Application
Use electron-builder to create a distributable package:
```bash
pnpm run build:win  # For Windows
pnpm run build:mac  # For macOS
```

## Documentation

- [User Manual (正體中文)](./USER_MANUAL.zh-TW.md): Functional guide for end-users.
- [CLAUDE.md](./CLAUDE.md): Internal developer guidelines and technical deep-dives.

## Legacy Code

The original Python-only implementation has been moved to `legacy_python/` for reference and comparative testing.
