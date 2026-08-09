# Team Performance Command Center

Interactive QA, productivity, call-stats, schedule and leave dashboard for
Team Danielle, built on live Google Sheets data.

**Live site:** enable GitHub Pages on this repo (Settings → Pages → Branch `main` → `/root`).

---

## How the data flows

```
Google Sheets  ->  Google Apps Script Web App  ->  JSON  ->  this dashboard
   (private)         (runs as you, server-side)             (browser)
```

**No credential ever reaches the browser or this repository.** The Sheet IDs
live only inside the Apps Script project, which runs under your own Google
account. The dashboard only knows one public read-only URL.

---

## Files

| File | Purpose |
|---|---|
| `index.html` | Page structure and navigation |
| `styles.css` | Pastel pink theme + responsive rules |
| `config.js` | **The one file you edit** — your Apps Script URL |
| `app-core.js` | Data fetching, caching, filtering, ranking |
| `app-charts.js` | Chart.js wrappers + interactive table engine |
| `app-render.js` | Overview, Daily Productivity, Weekly Calls, QA |
| `app-render2.js` | Scorecards, Schedule, OT & Break, Leave |
| `app-init.js` | Navigation, filters, auto-refresh |
| `apps-script/` | The backend — paste these into Google Apps Script |

---

## Setup (once)

### 1. Deploy the Apps Script

1. Open the **Team Weekly QA** Google Sheet → **Extensions → Apps Script**
2. Create four script files and paste in the matching file from `apps-script/`:
   `Code.gs`, `Parsers.gs`, `Parsers2.gs`, `Parsers3.gs`
3. **Deploy → New deployment → Web app**
   - Execute as: **Me**
   - Who has access: **Anyone**
4. Approve the permission prompt and copy the **Web app URL**

> "Anyone" means the endpoint needs no Google login. It exposes only the
> dashboard data — never your account, never write access, never the Sheet IDs.

### 2. Point the dashboard at it

Edit `config.js` and replace the placeholder with your Web app URL.

### 3. Publish

Settings → Pages → Branch `main` → Save.

---

## Updating data

Nothing to do. The dashboard re-fetches every **5 minutes**, and there is a
**Refresh Data** button for an immediate pull. Add rows, agents, weeks or new
QA tabs to the Sheets and they appear automatically after the next sync.

**After changing any `.js` or `.html` file**, bump the `?v=` number on the
matching `<script>`/`<link>` tag in `index.html` so browsers don't serve a
cached copy.

---

## Data sources actually used

**Team Weekly QA sheet**
- `TEAM STATS`, `Daily and Weekly Call Stats` → daily productivity
- `Team Weekly and Monthly Stats` → weekly OHA / Non-OHA call stats
- `WEEKLY SCORECARD` → official `Overall %`, `TEAM RANKING`, component scores
- `MONTHLY SCORECARD` → monthly official scores
- One tab per agent (`Dan`, `Godwin`, …) → per-call QA evaluations

**Schedule sheet**
- `Team Schedule`, `NEW TEAM SCHEDULE` → shifts
- `OT SCHEDULE` → overtime + computed hours
- `Break Schedule`, `SEPTEMBER BREAK SCHED`, `NEW TEAM BREAK SCHEDULE`,
  `BREAK SCHEDULE AND ADMIN TASK A` → breaks
- `Leave Request Sheet` → leave requests

Rankings use the spreadsheet's **own** `Overall %` / `OVERALL SCORE` column.
No scoring formula is invented here. Weeks whose scorecard is still all zeros
are treated as in-progress and skipped in favour of the last completed week.

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| "The dashboard API URL has not been set yet" | Paste your Web app URL into `config.js` |
| "Unable to retrieve the latest data" | Re-deploy the Apps Script with access **Anyone**; the dashboard keeps showing the last good data meanwhile |
| A change to the code did nothing | Bump `?v=` in `index.html` |
| A new agent is missing | Check the name spelling; `canonAgent()` in `Code.gs` folds known variants |

---

Created by Danielle Ann Mari Crizaldo — Call Team Lead
