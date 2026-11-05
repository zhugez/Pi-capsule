# Verify

Look at the lesson the way a demanding reviewer would, before anyone else does. Rendering it is cheap, and guessing is expensive.

## Capture

Build the page, then inspect it in a real browser. Prefer `agent-browser` when available:

```sh
agent-browser open ./lessons/0001-example.html
agent-browser snapshot -i
agent-browser screenshot --full-page
agent-browser close
```

Check at minimum:

- **Desktop** (1440px) and **phone** (390px): no horizontal scroll, text never clipped, interactive elements reachable.
- **Every interactive state**: hover, click each quiz option, each tab, each simulator control. Feedback must be instant and correct.
- **Quiz balance**: each answer same word count (and characters if possible), correct position varies across questions, no bold/ordering clues.
- **Citations**: every non-obvious claim links to a source in `RESOURCES.md`; all links resolve; no uncited assertions.
- **Primary source**: each lesson recommends one best resource to read/watch next.
- **Sibling links**: lessons link to each other and to `./reference/*` docs; anchors resolve.
- **Print**: `reference/*.html` prints cleanly (layout survives print preview); lessons still read when re-opened later.
- **4× close-up sweep**: zoom into every section, widget and edge. A bare region or unfinished corner is unfinished work, not calm. Add the missing pieces.
- **Fresh-eyes pass**: read the full lesson top to bottom once. Is it instantly one clear idea (1×) and still rewarding at 4×? Iterate until yes.
