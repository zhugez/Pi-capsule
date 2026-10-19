---
name: agent-browser
description: >
  Browser automation CLI for AI agents (fast native Rust CLI via Chrome CDP).
  MUST USE whenever interacting with websites: navigating pages, filling forms,
  clicking buttons, taking screenshots, extracting data, scraping dynamic SPAs,
  testing web apps, authenticating, or reverse-engineering APIs.
  Also covers exploratory testing (dogfood), Electron desktop apps (VS Code, Figma, Slack),
  Slack automation, or recording HAR traffic (derive-client).
allowed-tools: Bash(agent-browser:*), Bash(npx agent-browser:*)
---

# agent-browser — Fast browser automation CLI for AI agents

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

---

## Specialized Skills (served directly by CLI)

When dealing with specialized workflows, run the corresponding command to get full instructions and patterns:

- **Full Reference:** `agent-browser skills get core --full` (complete command listing, flags, and templates)
- **Exploratory Testing / QA:** `agent-browser skills get dogfood` (systematic testing, finding bugs, repro steps + screenshots + video)
- **Reverse-engineer APIs:** `agent-browser skills get derive-client` (record HAR, find endpoints, generate standalone client)
- **Desktop Electron Apps:** `agent-browser skills get electron` (automate VS Code, Discord, Figma, Slack via CDP port)
- **Slack Workspace:** `agent-browser skills get slack` (read unreads, send messages, search channels)
- **Vercel Protected Deployments:** `agent-browser skills get protected-vercel-deployments` (bypass Vercel Auth with OIDC tokens)
- **Vercel Sandbox:** `agent-browser skills get vercel-sandbox` (run inside microVMs)
