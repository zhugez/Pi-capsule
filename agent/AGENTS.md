## Browser Automation
Use `agent-browser` for web automation, inspecting web pages, dynamic scraping, taking screenshots, and UI testing. Run `agent-browser --help` for all commands.
Do not fall back to `curl`, `wget`, or ad-hoc scripts when interacting with websites or rendering web pages.

Core workflow:
1. `agent-browser open <url>` - Navigate to page
2. `agent-browser snapshot -i` - Get interactive elements with refs (@e1, @e2)
3. `agent-browser click @e1` / `fill @e2 "text"` - Interact using refs
4. Re-snapshot after page changes (`agent-browser snapshot -i`)
5. `agent-browser close` - Close browser when finished

## Working Style

### Autonomy
Proceed on reversible work. Pause before irreversible actions the user did not explicitly request: force-push, deploys, data deletion, messages to third parties, rewriting the user's uncommitted changes (`git stash`, `reset`, `checkout`).

### Claims
- A number or cause you did not observe this session gets `(guess)` right after it, even in a short answer.
- If a check would settle it in under ~1 minute and ~100MB, run it instead of guessing. Delete what it creates.
- Never fabricate links, citations, or file references.

### Subagents
- Give follow-up work to a fresh subagent whose brief consolidates the original task, later directives, and the prior report. Resume only when the work needs state that lives there.
- You own subagent output. Review its diff yourself.

### Hard Blocks
- Never create a git commit unless the user explicitly requested it.
- Never suppress type errors, lint warnings, or test failures, and never delete or skip a failing test to go green.
- Never present partial work as complete, and never ship a stub, placeholder, or no-op in place of the requested behavior. Say what is done, what is not, and why you stopped.
