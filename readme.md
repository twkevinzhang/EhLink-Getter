# EhLink-Getter Desktop

A modern desktop application built with Electron, Vue 3, and a Python sidecar for fetching E-Hentai gallery links and searching metadata.

## Features

- **Generic List Scraper**: Support for fetching any E-Hentai list page, including favorites, search results, and tag categories.
- **Improved Performance**: Metadata search and CSV generation are handled natively by Node.js for maximum speed and compatibility.
- **Modern UI**: Built with Vue 3, Element Plus, and glassmorphism design.
- **Sidecar Scraper**: Python-based scraper logic handles complex web scraping while main process handles data.
- **Batch Metadata Mapping**: Map large lists of titles to gallery links using your local `metadata.json`.
- **Excel Friendly**: CSV exports include UTF-8 BOM to ensure correct character display in Excel.

## Tech Stack

- **Frontend**: Vue 3 (Composition API), Pinia, Element Plus, Vite
- **Main Process**: Electron, Node.js (Fs streams, readline)
- **Sidecar**: Python 3.9+, FastAPI, Httpx, BeautifulSoup4

## Getting Started

### Prerequisites

- Node.js (v18+)
- Python 3.9+

### Installation

1. Clone the repository:

   ```bash
   git clone https://github.com/twkevinzhang/EhLink-Getter.git
   cd EhLink-Getter
   ```

2. Install Node.js dependencies:

   ```bash
   pnpm install  # or npm install
   ```

3. Install Python dependencies for the sidecar:
   ```bash
   pip install -r sidecar/requirements.txt
   ```

### Development

To start the application in development mode:

```bash
pnpm run dev
```

### Building & Packaging

1. Build the Python sidecar:

   ```bash
   pnpm run build:python
   ```

2. Build the Electron application:
   ```bash
   pnpm run build:win  # or :mac, :linux
   ```

## Documentation

For detailed usage instructions, please refer to the [User Manual (正體中文)](./USER_MANUAL.zh-TW.md).

## Legacy Code

The original Python-only implementation has been moved to `legacy_python/` for reference.
