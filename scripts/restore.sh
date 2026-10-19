#!/usr/bin/env bash
# Copy ./agent into ~/.pi/agent and ./home into ~, install CLI tools.
# Existing files are backed up to <file>.bak first.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/agent"
DST="${PI_AGENT_DIR:-$HOME/.pi/agent}"
mkdir -p "$DST"

for f in "$SRC"/*; do
  name="$(basename "$f")"
  [ -e "$DST/$name" ] && { rm -rf "$DST/$name.bak"; mv "$DST/$name" "$DST/$name.bak"; }
  cp -r "$f" "$DST/$name"
done
chmod 600 "$DST/models.json" 2>/dev/null || true

# Deduplicate skills if ~/.agents/skills exists: symlink so Pi canonicalizes without collision warnings.
if [ -d "$HOME/.agents/skills" ] && [ -d "$DST/skills" ]; then
  for s in "$DST/skills"/*; do
    name="$(basename "$s")"
    if [ -d "$HOME/.agents/skills/$name" ]; then
      rm -rf "$s"
      ln -s "../../../.agents/skills/$name" "$s"
    fi
  done
fi

# Dotfiles of companion tools, mirrored from ~ (see DOTFILES in export.sh).
if [ -d "$ROOT/home" ]; then
  (cd "$ROOT/home" && find . -type f) | while read -r rel; do
    mkdir -p "$(dirname "$HOME/$rel")"
    [ -e "$HOME/$rel" ] && cp "$HOME/$rel" "$HOME/$rel.bak"
    cp "$ROOT/home/$rel" "$HOME/$rel"
  done
fi

# Companion CLIs: <command> <official install script>. Skipped when already on PATH.
while read -r cmd url; do
  command -v "$cmd" >/dev/null || curl -fsSL "$url" | sh
done <<'TOOLS'
no-mistakes https://raw.githubusercontent.com/kunchenguid/no-mistakes/main/docs/install.sh
rtk https://raw.githubusercontent.com/rtk-ai/rtk/refs/heads/master/install.sh
treehouse https://kunchenguid.github.io/treehouse/install.sh
TOOLS

# Gitleaks: secret scanner CLI (installed to ~/.local/bin if missing)
if ! command -v gitleaks >/dev/null; then
  os="$(uname -s | tr '[:upper:]' '[:lower:]')"
  arch="$(uname -m)"
  [ "$arch" = "x86_64" ] && arch="x64"
  [ "$arch" = "aarch64" ] && arch="arm64"
  mkdir -p "$HOME/.local/bin"
  curl -fsSL "https://github.com/gitleaks/gitleaks/releases/latest/download/gitleaks_${os}_${arch}.tar.gz" 2>/dev/null | tar -xz -C "$HOME/.local/bin" gitleaks 2>/dev/null || true
  chmod +x "$HOME/.local/bin/gitleaks" 2>/dev/null || true
fi
export PATH="$HOME/.local/bin:$PATH"

# Global git hooks: enable pre-commit secret leak guardrail via gitleaks
if [ -f "$HOME/.config/git/hooks/pre-commit" ]; then
  chmod +x "$HOME/.config/git/hooks/pre-commit"
  git config --global core.hooksPath "$HOME/.config/git/hooks"
fi

# agent-browser: browser automation CLI for AI agents
if ! command -v agent-browser >/dev/null; then
  npm install -g agent-browser 2>/dev/null && agent-browser install 2>/dev/null || true
fi

# `git gate`: enable the no-mistakes gate in a repo and route plain `git push` through it.
git config --global alias.gate '!no-mistakes init && git config remote.pushDefault no-mistakes'

echo "restored to $DST"
jq -r '.. | .apiKey? | select(type=="string" and startswith("$")) | "set env var: " + gsub("[${}]"; "")' "$SRC/models.json" 2>/dev/null
echo "then run: pi   (missing npm:/git: packages install on first startup), then /login for OAuth providers"
echo "per repo: git gate   (no-mistakes init + plain git push goes through the gate)"
