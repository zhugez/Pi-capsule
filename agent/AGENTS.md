## Browser Automation
Use `agent-browser` for web automation, inspecting web pages, dynamic scraping, taking screenshots, and UI testing. Run `agent-browser --help` for all commands.
Do not fall back to `curl`, `wget`, or ad-hoc scripts when interacting with websites or rendering web pages.

Core workflow:
1. `agent-browser open <url>` - Navigate to page
2. `agent-browser snapshot -i` - Get interactive elements with refs (@e1, @e2)
3. `agent-browser click @e1` / `fill @e2 "text"` - Interact using refs
4. Re-snapshot after page changes (`agent-browser snapshot -i`)
5. `agent-browser close` - Close browser when finished
