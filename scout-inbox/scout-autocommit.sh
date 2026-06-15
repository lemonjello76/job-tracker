#!/usr/bin/env bash
# Scout auto-commit — copies new last30days/Hermes briefs into the repo and pushes.
# Run it on a schedule (cron). Safe to run repeatedly; only commits NEW files.
set -euo pipefail

# ---- CONFIG (env vars override these defaults) ----
REPO_DIR="${SCOUT_REPO_DIR:-$HOME/scout-repo}"                          # local clone of the repo
LAST30DAYS_DIR="${LAST30DAYS_MEMORY_DIR:-$HOME/Documents/Last30Days}"   # where Hermes/last30days writes briefs
INBOX_SUBDIR="scout-inbox"                                              # target folder inside the repo
# ---------------------------------------------------

cd "$REPO_DIR"
git pull --quiet --rebase || true
mkdir -p "$INBOX_SUBDIR"

shopt -s nullglob
copied=0
for f in "$LAST30DAYS_DIR"/*.md; do
  base="$(basename "$f")"
  stamp="$(date -r "$f" +%F 2>/dev/null || date +%F)"
  dest="$INBOX_SUBDIR/${stamp}-${base}"
  if [ ! -f "$dest" ]; then
    cp "$f" "$dest"
    copied=$((copied + 1))
  fi
done

if [ "$copied" -gt 0 ]; then
  git add "$INBOX_SUBDIR"
  git commit -q -m "scout: ${copied} new brief(s) $(date +%F_%H-%M)"
  git push -q
  echo "$(date) — pushed ${copied} new brief(s)."
else
  echo "$(date) — no new briefs."
fi
