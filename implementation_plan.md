# Implementation Plan - EhLink-Getter V2

## Goal Description

Transform EhLink-Getter into a comprehensive desktop application for comic management, implementing the V2 Roadmap. This includes upgrading the Python Sidecar to support robust networking (proxies, concurrency) and downloading, and completely redesigning the Electron Frontend to support a multi-stage task pipeline and a local library viewer with an E-Hentai visual theme.

## User Review Required

> [!IMPORTANT]
> **Theme Overhaul**: The application theme will be switched from the current "Glassmorphism/Purple" to a strict "E-Hentai" (Dark Gray/Red Border) theme as per `docs/ui_blueprints.md`.
> **Storage Strategy**: New "Logical" storage strategy (hashing) will be introduced alongside "Traditional" folder naming.

## Proposed Changes

### Backend (Sidecar)

#### Dependencies

- [MODIFY] [requirements.txt](file://EhLink-Getter/sidecar/requirements.txt)
  - Add `httpx[socks]` for SOCKS5 proxy support.
  - Add `aiofiles` for asynchronous file I/O.

#### Architecture Components

- [NEW] `sidecar/src/services/proxy_manager.py`: Manages proxy rotation and failover.
- [NEW] `sidecar/src/services/download_manager.py`: Manages image download jobs, threading/concurrency (`download_thread_cnt`), and file writing.
- [NEW] `sidecar/src/utilities/parsers.py`: `GalleryParser` and `ImageParser` classes for E-Hentai HTML parsing.

#### API & Service Logic

- [MODIFY] [main.py](file://EhLink-Getter/sidecar/main.py)
  - Add endpoints: `POST /job/start`, `GET /job/status/{job_id}`, `POST /job/pause`, `DELETE /job/{job_id}`.
  - Integrate `ProxyManager` into the global dependency or service initialization.
- [MODIFY] `sidecar/src/services/eh_scraper_service.py`
  - Refactor to use `ProxyManager` for `httpx.Client`.
  - Implement `scan_thread_cnt` semaphore for concurrency.

### Frontend (Electron/Vue)

#### Visual Style

- [MODIFY] `tailwind.config.js`: Define new colors (`eh-bg`, `eh-panel`, `eh-border`) matching `docs/ui_blueprints.md`.
- [MODIFY] `src/renderer/src/assets/base.css`: Update global body background and font colors.

#### Components - Layout

- [MODIFY] [App.vue](file://EhLink-Getter/src/renderer/src/App.vue)
  - Update Sidebar menu items: "Task Manager", "Library".
  - Remove old separate menu items (e.g., Mapping/Search Metadata effectively merged into Library or contextually used).

#### Components - Task Manager

- [NEW] `src/renderer/src/views/TaskManager.vue`: Main container with Tabs.
- [NEW] `src/renderer/src/components/tasks/SettingsTab.vue`: Global config and Proxy pool settings.
- [NEW] `src/renderer/src/components/tasks/StartFetchTab.vue`: Input for Page/Search links.
- [NEW] `src/renderer/src/components/tasks/FetchingTab.vue`: Scraper progress monitor.
- [NEW] `src/renderer/src/components/tasks/FetchedTab.vue`: Review and configure download paths.
- [NEW] `src/renderer/src/components/tasks/DownloadingTab.vue`: Active download monitor.
- [NEW] `src/renderer/src/components/tasks/CompletedTab.vue`: History view.

#### Components - Library

- [NEW] `src/renderer/src/views/Library.vue`: Grid view logic, metadata search input, pagination.

#### Store & Logic

- [MODIFY] `src/renderer/src/stores/app.ts`: Add state for Task Lists (fetching, fetched, downloading, completed) and Library filters.
- [NEW] `src/renderer/src/services/taskService.ts`: persistent storage logic for `tasks.json`.

## Verification Plan

### Automated Tests

- **Unit Tests (Internal)**: Verify `ProxyManager` rotation logic and `parsers.py` output against sample HTML.
- **Integration**: Test API endpoints `POST /config` and `POST /job/start` via curl or Postman.

### Manual Verification

1.  **Visual Check**: Verify the App matches the "E-Hentai" mockups in `docs/ui_blueprints.md`.
2.  **Workflow Test**:
    - Input a Gallery URL in "Start Fetch".
    - Verify it appears in "Fetching" -> "Fetched".
    - Configure path and click "Download".
    - Verify file appears on disk and progress shows in "Downloading".
3.  **Proxy Test**: Configure a dummy proxy, verify failover (if testable) or connection success with valid proxy.
