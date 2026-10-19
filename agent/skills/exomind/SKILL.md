---
name: exomind
description: >
  ExoMind persistent second brain & memory runtime for Pi.
  USE WHEN the user asks to recall knowledge from past sessions, search personal notes,
  remember architectural decisions, or query long-term memory.
  Also use when saving new patterns, preferences, or rules across coding sessions.
allowed-tools: Bash(exom:*), exom_recall, exom_capture
---

# ExoMind — Portable Knowledge & Memory Runtime

ExoMind indexes and recalls context from your trusted knowledge vault (`~/Yasna-Memory`), using hybrid recall (lexical token overlap + graph structure) and typed relations.

## Available Tools & Commands

1. **In-Chat Tools (from pi-pulse):**
   - `exom_recall(query, topk)`: Query the memory vault and retrieve relevant notes/excerpts.
   - `exom_capture(input)`: Save a new observation, technical decision, or preference.

2. **Slash Commands:**
   - `/remember <text>`: Quickly append a note, rule, or preference to `00_Inbox`.
   - `/recall <query>`: Search and preview related memory notes directly.

3. **CLI Direct Invocations:**
   - `exom pi-context --query "<query>" --notes-root ~/Yasna-Memory`
   - `exom capture --input "REL:CAUSED_BY(A->B)[0.9] note..." --notes-root ~/Yasna-Memory`
   - `exom index --notes-root ~/Yasna-Memory`
   - `exom lifecycle --mode consolidate --notes-root ~/Yasna-Memory`
