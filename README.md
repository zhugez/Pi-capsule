<p align="center">
  <img src="assets/banner.svg" alt="pi-capsule: Your Pi setup, packed for every machine." width="100%">
</p>

# pi-capsule

A portable capsule for my [Pi Coding Agent](https://pi.dev) setup. One script snapshots `~/.pi/agent` into this repo; one script unpacks it on a fresh machine. Secrets stay home.

- **Settings** — theme, default provider/model, thinking level, compaction overrides, package list.
- **Providers** — custom `models.json` providers, with literal API keys swapped for `$ENV_VAR` references.
- **Skills, extensions & prompts** — distributed as a Pi package (`git:github.com/zhugez/pi-capsule`) with skills, extensions, and prompt templates.
- **Companion CLIs** — `restore.sh` installs each one if missing (official install script) and restores its config from `home/`:
  - [no-mistakes](https://github.com/kunchenguid/no-mistakes) — git push gate, plus a global `git gate` alias · `~/.no-mistakes/config.yaml`
  - [rtk](https://github.com/rtk-ai/rtk) — token-saving CLI proxy, hooked into Pi via `rtk init -g --agent pi` · `~/.config/rtk/*.toml`
  - [treehouse](https://github.com/kunchenguid/treehouse) — reusable worktree pool · `~/.config/treehouse/config.toml`
  - [gitleaks](https://github.com/gitleaks/gitleaks) — secret scanner CLI, integrated into global git pre-commit hook and Pi (`/gitleaks`) · `~/.config/git/hooks/pre-commit`
  - [agent-browser](https://github.com/vercel-labs/agent-browser) — fast browser automation CLI for AI agents (Rust CLI + Chrome CDP) · `~/.agent-browser/config.json`
  - [ExoMind](https://github.com/zhugez/ExoMind) — portable knowledge & memory runtime (`exom`)
  - [crapper](https://github.com/unclebob/crapper) + [mutator](https://github.com/unclebob/mutator) — ub-mode's CRAP and mutation gates, behind pi-pulse's `/crap` and `/mutator` · `~/.local/share/ub-tools/` (must stay siblings; wrappers in `~/.local/bin`)
- **Extension prefs** — `pi-fff.json`, `subscription-usage-prefs.json`, plus `AGENTS.md` / `SYSTEM.md` / `keybindings.json` when present.

## How it works

```text
~/.pi/agent ──export.sh──▶ agent/ ──git push──▶ GitHub
                                                  │
new machine ◀──restore.sh── agent/ ◀──git clone───┘
```

| Step | What happens |
| --- | --- |
| Local packages | `/home/dev/pi-pulse` becomes `git:github.com/zhugez/pi-pulse` (read from the repo's `origin`) |
| API keys | `"apiKey": "sk-…"` becomes `"apiKey": "$MACMINI_CODEX_API_KEY"`; existing `$VAR` / `!command` values are kept |
| Restore / Sync | config files are safely merged with atomic writes and timestamped backups (`*.bak-<timestamp>`); API keys and credentials are preserved |
| Companion CLIs | installed only when not on `PATH`; add one by appending `<command> <install-url>` to the `TOOLS` list in `restore.sh` and its config path to `DOTFILES` in `export.sh`. CLIs without an install script (crapper, mutator) get their own block |
| First launch | Pi installs any missing `npm:` / `git:` packages from `settings.json` on startup |

## Update

If a machine was set up before `pi-capsule` became a Pi package, register it **once**:

```bash
pi install git:github.com/zhugez/pi-capsule
```

From then on, update everything (extensions, skills, prompts, and merged config/models without overwriting local API keys or credentials) with a single command:

```bash
pi update --extensions
```

`pi install` and `pi update --extensions` automatically run `node scripts/sync-config.mjs --models` via `postinstall` (and move any duplicate legacy extensions/prompts/skills into `~/.pi/agent/migrated-<date>/`).

To preview or run config sync manually:

```bash
node scripts/sync-config.mjs --dry-run
node scripts/sync-config.mjs [--models]
```

### Edit workflow

1. Edit inside `~/.pi/agent/git/github.com/zhugez/pi-capsule` (or your local clone).
2. Commit and push changes to GitHub.
3. Always commit before running `pi update --extensions`, because Pi may reset and clean the clone during package reconciliation.

## Backup

```bash
./scripts/export.sh
git add -A && git commit -m "sync pi config" && git push
```

## Restore

```bash
git clone https://github.com/zhugez/pi-capsule && cd pi-capsule
./scripts/restore.sh                 # prints every env var it needs
export MACMINI_CODEX_API_KEY=...
pi
```

Then sign in to OAuth providers, and run `git gate` inside each repo you want gated:

```text
/login antigravity
/antigravity.accounts
/antigravity.refresh
/usage refresh antigravity
```

After upgrading a Google subscription, select that account with
`/antigravity.accounts switch <email>`; switching automatically refreshes its available
models. Use `/antigravity.refresh` to retry a failed refresh, and
`/usage refresh antigravity` to refresh quota and plan labels. pi-pulse reads each account's paid tier (including
Google AI Ultra) from the API; it does not assume every linked account is Pro.
Model catalogs and account credentials remain local and are not included in the capsule.

```bash
cd my-repo && git gate   # no-mistakes init + plain `git push` now goes through the gate
```

Bypass the gate for one push with `git push origin <branch>`.

Requires `bash`, `jq`, `git` and `curl`. Set `PI_AGENT_DIR` to target a directory other than `~/.pi/agent`.

## Windows (PowerShell)

Same flow, native scripts — no bash/jq needed (requires Git for Windows; Node.js LTS for `pi` / `agent-browser`):

```powershell
git clone https://github.com/zhugez/pi-capsule; cd pi-capsule
powershell -ExecutionPolicy Bypass -File .\scripts\restore.ps1   # installs CLIs to ~\.local\bin, prints env vars
[Environment]::SetEnvironmentVariable('MACMINI_CODEX_API_KEY', '...', 'User')
# open a new terminal, then: pi
```

Backup from a Windows machine: `powershell -ExecutionPolicy Bypass -File .\scripts\export.ps1`.
Shared skills are linked with junctions (no admin rights needed).

## Security and privacy

These files are **never** exported:

- `auth.json` — provider OAuth/API credentials
- `antigravity-accounts.json` — linked Google accounts and refresh tokens
- `sessions/`, `run-history.jsonl`, caches, installed packages

`export.sh` rewrites literal keys, but review `git diff` before pushing: `settings.json` and `models.json` still reveal hostnames and model IDs.

## Credits

Banner layout follows [pi-pulse](https://github.com/zhugez/pi-pulse). Illustration generated with Gemini via [`pi-antigravity`](https://github.com/Rahularya01/pi-antigravity).

## License

GPL-3.0 (SPDX: `GPL-3.0-only`). See [`LICENSE`](LICENSE).
