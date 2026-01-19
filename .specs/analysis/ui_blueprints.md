# UI Blueprints

This document outlines the user interface design for the new EhLink-Getter desktop application.

> **Design Constraint**:
>
> - **Layout & Metrics**: STRICTLY maintain `v0.0.1` layout styling (padding, margins, font sizes, sidebar width `240px`).
> - **Theme**: Apply **E-Hentai Theme** colors (Dark Gray backgrounds, distinct borders) replacing the current "glassmorphism/purple" theme.

## 0. Visual Style & Theme (E-Hentai)

| Component          | Current (v0.0.1)                | New (E-Hentai)                                                     |
| :----------------- | :------------------------------ | :----------------------------------------------------------------- |
| **App Background** | `bg-bg-dark` (Radial Gradient)  | `#34353b` (Flat Dark Gray)                                         |
| **Sidebar Bg**     | `bg-bg-sidebar` (Glass)         | `#2b2c31` (Darker Gray)                                            |
| **Text Color**     | `text-text-main` (White/Silver) | `#f1f1f1` (Main), `#b4b5bc` (Muted)                                |
| **Accent/Links**   | Purple/Indigo (`primary`)       | `#b3b3b3` (Standard) / `#ffae00` (Rating stars)                    |
| **Headers/Panels** | Transparent/Glass               | `#4f535b` (Panel Headers)                                          |
| **Borders**        | `border-glass-border`           | `#5c0d11` (Classic EH Red-Border for tables) or `#b4b5bc` (Subtle) |

## 1. Main Navigation Structure (Sidebar)

The sidebar (`el-aside`, width: 240px) remains the primary navigation controller.

```plantuml
@startsalt
{+
  <b>EhLink Getter</b>
  .
  [Task Manager]
  [Library]
  .
  .
  (Bottom Status)
  Sidecar: Online
}
@endsalt
```

## 2. Task Manager View (Main Content)

When **Task Manager** is selected in the sidebar, the Main Content area (`el-main`, padding: `p-10`) displays a **Tabbed Interface**.

**Tabs**: `[ Settings ] [ Start Fetch ] [ Fetching ] [ Fetched ] [ Downloading ] [ Completed ]`

### 2.1 Settings Tab

_Focus: Global Configuration & Request Management_

```plantuml
@startsalt
{+
  {/ <b>Settings</b> | Start Fetch | Fetching | Fetched | Downloading | Completed }
  {
    <b>Core Configuration
    tasks.json Path:
    "C:/Path/tasks.json" | [Browse]
    -
    <b>Storage Strategy
    (X) Logical (Hashed) | () Traditional
    -
    <b>Request Management
    Proxy Pool:
    {
      socks5h://127.0.0.1:1080
      http://proxy:8080
      .
    }
    Scan Threads: "3" | Download Threads: "5"
    -
    [ Save Changes ]
  }
}
@endsalt
```

### 2.2 Start Fetch Tab

_Focus: Step 1 - Input Page/Search Links to Scrape_

```plantuml
@startsalt
{+
  {/ Settings | <b>Start Fetch</b> | Fetching | Fetched | Downloading | Completed }
  {
    <b>Page / Search Link
    "https://e-hentai.org/?f_search=..."
    -
    <b>Fetch Settings
    Download Range: | From: "1" | To: "All"
    Meta DB: | "C:/Path/meta.json" | [Browse]
    -
    [ > Start Fetching List ]
  }
}
@endsalt
```

### 2.3 Fetching Tab

_Focus: Step 2 - Monitor List Scraping Progress_

```plantuml
@startsalt
{+
  {/ Settings | Start Fetch | Fetching | <b>Fetching</b> | Fetched | Downloading | Completed }
  {
    <b>Active Scraper Jobs
    {
      Link: https://e-hentai.org/...
      [====......] 40% (Parsing Page 2/5)
      -
      Link: https://exhentai.org/...
      [==========] 100% (Finished)
    }
    -
    [ Cancel Selected ]
  }
}
@endsalt
```

### 2.4 Fetched Tab (Review & Configure)

_Focus: Step 3 - Review Results & Configure Download Paths_

```plantuml
@startsalt
{+
  {/ Settings | Start Fetch | Fetching | <b>Fetched | Downloading | Completed }
  {
    <b>Fetched Tasks (Ready to Download)
    {SI
Task: [GuiGu] Collection (5 Galleries)
  [GuiGu] Comic 1
  [GuiGu] Comic 2
    }
    --
    <b>Download Configuration (For this task)
    Target: "C:/DL/\EN_TITLE\" | [Browse]
    Placeholders: [\EN_TITLE\] [\ID\]
    Archive: [X] Zip | Password: "pass"
    --
    [Add All to Download Queue]
  }
}
@endsalt
```

### 2.5 Downloading Tab

_Focus: Step 4 - Active Image Downloads_

```plantuml
@startsalt
{+
  {/ Settings | Start Fetch | Fetching | Fetched | <b>Downloading</b> | Completed }
  {
    <b>Active Downloads
    {T
     + Running: [Artist] Manga Name
     ++ [====......] 40% Total
     ++ Downloading: 01.jpg
     + Paused: [Cosplay] Title
    }
    -
    [Pause] [Resume] [Delete]
  }
}
@endsalt
```

## 3. Library View (Main Content)

When **Library** is selected in the sidebar, the Main Content area displays the Gallery.

_Style Note: Mimic E-Hentai Gallery Grid (padding, borders, background)._

```plantuml
@startsalt
{+
  <b>Library Search
  "language:chinese tag:color " | [Search]
  [X] Expunged | Rating > "3"
  .
  <b>Gallery Grid
  {+
    {
      [ Thumb ] | [ Thumb ]
      <b>Title A | <b>Title B
      *****    | ****
      Chinese  | English
    }
    .
    {
      [ Thumb ] | [ Thumb ]
      <b>Title C | <b>Title D
      *****    | ***
    }
  }
  .
  < Page 1 / 50 >
}
@endsalt
```
