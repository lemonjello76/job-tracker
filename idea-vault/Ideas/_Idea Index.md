# 🗂️ Idea Index

Your one-stop dashboard. Open this note to see every idea in the vault.

> The table below uses the **Dataview** community plugin (Settings → Community
> plugins → Browse → "Dataview" → install + enable). If you don't use Dataview,
> the manual list further down works the same way.

## All ideas (auto — needs Dataview)

```dataview
table without id
  link(file.link, default(title, file.name)) as "Idea",
  source as "Source",
  status as "Status",
  score as "Score",
  created as "Added"
from "idea-vault/Ideas"
where file.name != "_Idea Index"
sort score desc, created desc
```

## Highest scored, formulated (auto — needs Dataview)

```dataview
list
from "idea-vault/Ideas"
where status = "formulated" or status = "delivered"
sort score desc
```

## Manual list (no plugin needed)
Keep this in sync if you're not using Dataview:

- ⭐ 5 · `formulated` · **hermes/claude** — [[2026-06-07 - Vertical FSM app for misting installers]]

---
*New idea? Duplicate [[Idea]] from `Templates/` into this folder and fill it in.*
