# How agents add ideas

The rule is the same for everyone: **create one new note in `Ideas/`, use the
[[Idea]] format, and set `source:`.** Here's how each contributor does that.

## The universal "drop prompt"
Give this to *any* LLM (Grok, Gemini, ChatGPT, etc.) and its answer will already
be a vault-ready note you can paste straight into `Ideas/`:

> Output a single Obsidian note for a monetizable business idea for Lyle — a
> traveling field installer (misting/outdoor-cooling) who has built his own job-
> tracker app, is getting his FL contractor license, and is a veteran. Use
> EXACTLY this format and nothing else:
>
> ```
> ---
> source: <grok|gemini>
> created: <today YYYY-MM-DD>
> status: raw
> score:
> tags: []
> ---
> # <title>
> **Problem** — …
> **Solution** — …
> **Why Lyle** — …
> **First step** — …
> **Effort / cost** — …
> **Risks / unknowns** — …
> **Sources / links** — …
> ```

## Per contributor

### 🟣 Hermes (your agent)
Hermes already runs research and writes to your storage. Point its output step
at the vault's `Ideas/` folder and have it emit one file per idea in the format
above with `source: hermes`. Easiest wiring:
- If the vault lives in **OneDrive**, give Hermes the OneDrive path and have it
  save `Ideas/<date> - <title>.md`.
- If the vault lives in **Git/GitHub**, have Hermes commit the file to the repo.

### 🟠 Claude (me)
When this repo/vault is in my tool scope, I write notes directly into `Ideas/`
and can also run the weekly rollup into `Delivered/`. Just say "scout" or "do
the weekly digest."

### ⚫ Grok / 🔵 Gemini
These don't have direct write access to the vault on their own. Two options:
1. **Copy-paste:** run the drop prompt above, then paste the result as a new
   note in `Ideas/` (fast from your phone in Obsidian: New note → paste).
2. **Connector/automation:** if you've wired them to OneDrive or GitHub, have
   them save the file the same way Hermes does.

### 🟢 You (Lyle)
New note in `Ideas/`, paste the [[Idea]] template, set `source: lyle`. Or just
jot the idea and an agent will formalize it on the next pass.

## Delivering results back to you
On a weekly pass, whoever runs it (me by default):
1. Reviews new `raw` notes, scores them, sets `status: reviewed`.
2. Writes the strongest ones up (`status: formulated`).
3. Creates a note in `Delivered/` from the [[Weekly Digest]] template with the
   top 3 + recommended move, and flips those ideas to `delivered`.
