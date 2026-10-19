---
name: agent-browser
description: >
  Browser automation CLI for AI agents (fast native Rust CLI via Chrome CDP).
  MUST USE whenever interacting with websites: opening URLs, navigating pages,
  clicking buttons, filling forms, taking screenshots, inspecting DOM/React state,
  scraping JavaScript-heavy / dynamic SPAs, testing web apps, or authenticating into sites.
  Replaces Selenium/Playwright/Puppeteer with instant accessibility snapshots (@e1, @e2 refs).
allowed-tools: Bash(agent-browser:*), Bash(npx agent-browser:*)
---

# agent-browser — fast browser automation CLI for AI agents

Chrome/Chromium via CDP with accessibility-tree snapshots and compact `@eN` element refs.
Trained for web navigation, form filling, clicking, dynamic scraping, taking screenshots, and web testing.

## Core Loop

Always follow the snapshot-and-act loop:

```bash
agent-browser open <url>        # 1. Open target URL
agent-browser snapshot -i       # 2. Get interactive elements with refs (@e1, @e2...)
agent-browser click @e1         # 3. Act on refs (click, fill, hover, select...)
agent-browser snapshot -i       # 4. Re-snapshot immediately after any page change
agent-browser close             # 5. Clean up when finished
```

> **Rule:** Refs (`@e1`, `@e2`, ...) become STALE the moment the page changes or navigates. Always re-run `agent-browser snapshot -i` after any click, form submit, or page transition before issuing further actions.

## Common Operations

### 1. Navigate & Read
```bash
agent-browser open https://example.com
agent-browser snapshot -i              # Interactive elements only (preferred)
agent-browser snapshot -i -u           # Include href URLs
agent-browser get text @e1             # Extract visible text
agent-browser get html @e1             # Extract innerHTML
agent-browser get attr @e1 href        # Extract attribute
```

### 2. Interaction
```bash
agent-browser click @e1                # Click ref
agent-browser fill @e2 "my-input"      # Clear and type
agent-browser type @e2 " more text"    # Type without clearing
agent-browser press Enter              # Press keyboard key (Enter, Tab, Control+a)
agent-browser select @e3 "value"       # Select dropdown option
agent-browser check @e4                # Check checkbox
agent-browser scroll down 500          # Scroll page
agent-browser scrollintoview @e1       # Scroll element into view
```

### 3. Waiting & Stability
```bash
agent-browser wait @e1                 # Wait for element ref to appear
agent-browser wait --text "Dashboard"  # Wait for text to appear
agent-browser wait --url "**/home"     # Wait for URL pattern
agent-browser wait --load networkidle  # Wait for SPA network calls to finish
```

### 4. Screenshots & Vision
```bash
agent-browser screenshot page.png               # Standard screenshot
agent-browser screenshot --full full.png        # Full scrollable height
agent-browser screenshot --annotate labeled.png # Numbered boxes matching @eN refs for vision models
```

### 5. Authentication & State Persistence
```bash
# Save session state (cookies + localStorage)
agent-browser state save ./auth.json

# Resume session in subsequent runs
agent-browser --state ./auth.json open https://app.example.com
```

### 6. React & Performance Inspection
```bash
agent-browser open --enable react-devtools http://localhost:3000
agent-browser react tree               # Inspect React component tree
agent-browser vitals                   # Core Web Vitals (LCP, CLS, TTFB, INP)
```
