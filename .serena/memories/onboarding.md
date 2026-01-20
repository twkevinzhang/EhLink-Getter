# EhLink-Getter Onboarding

## Project Purpose
EhLink-Getter is a desktop application (Electron + Vue) designed to fetch and manage E-Hentai gallery links. It features a scraper that fetches gallery items from provided URLs and a downloader that (presumably) downloads them.

## Tech Stack
- **Frontend**: Vue 3, Pinia, Element Plus, Tailwind CSS
- **Backend (Electron)**: Electron, Node.js, IPC communication
- **Sidecar**: Python-based scraper/service (handled via `spawn`)
- **Persistence**: Currently uses manual JSON file reading/writing, but refactoring to use `electron-store`.
- **Package Manager**: pnpm

## Codebase Structure
- `src/main`: Electron main process logic, services (metadata, config).
- `src/preload`: IPC bridge.
- `src/renderer`: Vue frontend.
- `sidecar`: Python logic.

## Developing & Running
- `pnpm dev`: Start development server and Electron app.
- `pnpm build`: Build production app.
- `pnpm lint`: Run ESLint.
- `pnpm format`: Run Prettier.

## Code Style
- TypeScript for frontend and main process.
- Pinia for state management.
- Standard Vue 3 Composition API.
- Chinese (Traditional, Taiwan) for plans and documentation; English for code comments/messages.
