# Project Progress

## Phase 1: Sidecar 2.0 (Networking & Downloads)

- [ ] **Dependencies**
  - [ ] Update `sidecar/requirements.txt` with `httpx[socks]` and `aiofiles`.
  - [ ] Verify installation by running `pip install -r sidecar/requirements.txt`.

- [ ] **Core Services**
  - [ ] Create `sidecar/src/services/proxy_manager.py`: Implement `ProxyManager` class for rotating proxies.
  - [ ] Create `sidecar/src/utilities/parsers.py`: Implement `GalleryParser` and `ImageParser` using BeautifulSoup.
  - [ ] Create `sidecar/src/services/download_manager.py`: Implement file download logic and concurrency control.

- [ ] **Service Integration**
  - [ ] Refactor `EhScraperService` to use `ProxyManager`.
  - [ ] Integrate `DownloadManager` into the service layer.

- [ ] **API Endpoints**
  - [ ] Update `sidecar/main.py` with `job` endpoints (`start`, `status`, `pause`, `delete`).
  - [ ] Update `Config` model to support proxy list.

## Phase 2: Task Management UI (Electron/Vue)

- [ ] **Styles & Theme**
  - [ ] Update `tailwind.config.js` with E-Hentai color palette.
  - [ ] Update `src/renderer/src/assets/base.css` for global theme.

- [ ] **Layout Refactor**
  - [ ] Refactor `App.vue` sidebar to include "Task Manager" and "Library".
  - [ ] Create placeholder views for `TaskManager.vue` and `Library.vue`.

- [ ] **Task Manager Components**
  - [ ] Implement `src/renderer/src/views/TaskManager.vue` (Tabs container).
  - [ ] Implement `SettingsTab.vue` (Config form).
  - [ ] Implement `StartFetchTab.vue` (Input form).
  - [ ] Implement `FetchingTab.vue` (Progress tracking).
  - [ ] Implement `FetchedTab.vue` (Review & Download config).
  - [ ] Implement `DownloadingTab.vue` (Active job monitor).
  - [ ] Implement `CompletedTab.vue` (History).

- [ ] **State Management**
  - [ ] Update `stores/app.ts` to manage task lists and global status.
  - [ ] Implement IPC listeners for new Sidecar events/status.

## Phase 3: Library Management

- [ ] **Library UI**
  - [ ] Implement `src/renderer/src/views/Library.vue` with Grid Layout.
  - [ ] Implement Pagination logic.

- [ ] **Search Functionality**
  - [ ] Integrate metadata search logic into `Library.vue`.
  - [ ] Add advanced filters (Rating, Expunged).

## Phase 4: Polish & Integration

- [ ] **Cleanup**
  - [ ] Remove unused components (`MappingMetadata`, `SearchMetadata` old views).
  - [ ] Finalize `tasks.json` persistence.

- [ ] **Verification**
  - [ ] Test full flow: Fetch -> Review -> Download -> Library.
  - [ ] Verify Proxy failover.
