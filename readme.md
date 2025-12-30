# EhLink-Getter Desktop

A modern desktop application built with Electron, Vue 3, and a Python sidecar for fetching E-Hentai favorite links and searching metadata.

## Features

- **Modern UI**: Built with Vue 3, Element Plus, and glassmorphism design.
- **Sidecar Pattern**: Python-based scraper logic decoupled from the UI.
- **Real-time Logs**: Stream logs directly from the scraper to the console.
- **Metadata Search**: Fast local search in metadata JSON indices.
- **Configuration Management**: Effortlessly manage cookies, proxies, and paths.

## Tech Stack

- **Frontend**: Vue 3, Pinia, Element Plus, Vite
- **Main Process**: Electron, Node.js
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
   npm install
   ```

3. Install Python dependencies for the sidecar:
   ```bash
   pip install -r sidecar/requirements.txt
   ```

### Development

To start the application in development mode:

```bash
npm run dev
```

### Building & Packaging

1. Build the Python sidecar:

   ```bash
   npm run build:python
   ```

2. Build the Electron application:
   ```bash
   npm run build:win  # or :mac, :linux
   ```

## Legacy Code

The original Python-only implementation has been moved to `legacy_python/` for reference.
