#!/usr/bin/env bash
# Snapshot ~/.pi/agent config into ./agent. Secrets are never copied.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="${PI_AGENT_DIR:-$HOME/.pi/agent}"
DST="$ROOT/agent"
HOME_DST="$ROOT/home"

mkdir -p "$DST"

for f in settings.json pi-fff.json subscription-usage-prefs.json mcp.json AGENTS.md SYSTEM.md keybindings.json; do
  [ -f "$SRC/$f" ] && cp "$SRC/$f" "$DST/$f"
done

# Local package paths only exist on this machine: rewrite to git:<origin> when possible.
if [ -f "$DST/settings.json" ]; then
  map='{}'
  while read -r src; do
    case "$src" in /*|~*) ;; *) continue ;; esac
    url="$(git -C "$src" remote get-url origin 2>/dev/null || true)"
    if [ -z "$url" ]; then echo "warn: local package $src has no git origin, left as-is" >&2; continue; fi
    url="${url#https://}"; url="${url#git@}"; url="${url/://}"; url="${url%.git}"
    map="$(jq --arg k "$src" --arg v "git:$url" '. + {($k): $v}' <<< "$map")"
  done < <(jq -r '.packages // [] | .[] | (if type=="string" then . else .source end)' "$DST/settings.json")
  if [ "$map" != "{}" ]; then
    tmp="$(mktemp)"
    jq --argjson map "$map" '.packages |= map(
      if type=="string" then ($map[.] // .)
      elif type=="object" and .source then .source = ($map[.source] // .source)
      else . end)' "$DST/settings.json" > "$tmp" && mv "$tmp" "$DST/settings.json"
  fi
fi

# models.json: replace literal apiKeys with an env var reference ($<PROVIDER>_API_KEY).
# ponytail: keys already written as "$ENV_VAR" or "!command" are kept.
if [ -f "$SRC/models.json" ]; then
  jq '.providers |= with_entries(
        if (.value.apiKey // "" | test("^(\\$.*|!.*)?$")) then .
        else .value.apiKey = ("$" + (.key | ascii_upcase | gsub("[^A-Z0-9]"; "_")) + "_API_KEY") end)' \
    "$SRC/models.json" > "$DST/models.json"
fi

# Skills, prompts, and extensions are not copied: the repo is the source of truth.

# Companion tool configs, mirrored under ./home. State/caches stay local.
DOTFILES=(.no-mistakes/config.yaml .config/rtk/config.toml .config/rtk/filters.toml .config/treehouse/config.toml .gemini/GEMINI.md .gemini/CLAUDE_OPUS.md .config/git/hooks/pre-commit .agent-browser/config.json)
DOTDIRS=(.gemini/references .gemini/domains .gemini/scripts)
rm -rf "$HOME_DST"
for rel in "${DOTFILES[@]}"; do
  [ -f "$HOME/$rel" ] && mkdir -p "$(dirname "$HOME_DST/$rel")" && cp "$HOME/$rel" "$HOME_DST/$rel"
done
for rel in "${DOTDIRS[@]}"; do
  [ -d "$HOME/$rel" ] && mkdir -p "$(dirname "$HOME_DST/$rel")" && cp -rL "$HOME/$rel" "$HOME_DST/$rel"
done

echo "exported to $DST"
