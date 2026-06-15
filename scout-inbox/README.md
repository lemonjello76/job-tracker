# 📥 Scout Inbox — Hermes auto-dump target

This folder is where the **Hermes / last30days agent commits its findings** as
markdown, automatically, on a schedule. Because it lives in GitHub:

- **Claude (me) reads it instantly** — no approval popups, ever.
- **You read it on your phone** — GitHub mobile app or any browser, or sync it
  into Obsidian with the Obsidian Git plugin.

Each pull lands as one file: `YYYY-MM-DD-<topic>-raw.md`.

---

## One-time setup on the machine running Hermes

**1. Make a GitHub token for Hermes**
- GitHub → Settings → Developer settings → **Fine-grained personal access tokens**.
- Scope it to **this one repo**, permission **Contents: Read and write**. Set an expiry.
- Copy the token (starts `github_pat_…`).

**2. Point git on the Hermes box at this repo**
```bash
git clone https://<TOKEN>@github.com/lemonjello76/job-tracker.git
# (for the clean separate version, replace with your dedicated private repo)
```

**3. Add a Hermes scheduled task ("research while you sleep")**
In Hermes, create a scheduled job (natural language or cron) that runs your
research and then commits the output here. The shell it runs:
```bash
cd /path/to/job-tracker
# copy the newest last30days briefs in (adjust path to your LAST30DAYS_MEMORY_DIR)
cp "$HOME/Documents/Last30Days/"*-raw.md scout-inbox/ 2>/dev/null
git add scout-inbox
git commit -m "scout: nightly pull $(date +%F)" && git push
```
Example Hermes schedule: **“Every night at 2am, run my last30days research on
[your topics], then run the commit script.”**

That's it. From then on, every pull shows up here automatically, and I can read
"Scout's last couple pulls" any time you ask — no Drive, no approvals, no Telegram
needed.

---

## Keep it secure
- Repo should be **private** (this is a demo pipe in `job-tracker`; for real use,
  make a **dedicated private repo** and add it to the session).
- **One token, scoped to this one repo only**, with an expiry; rotate it.
- Don't let Hermes commit sensitive screenshots (account numbers, etc.) here.
