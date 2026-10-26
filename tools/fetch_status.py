#!/usr/bin/env python3
"""Fetches the Call EOD (callsstats) dashboard's data.js and extracts the
agent-status history for ALL teams, pre-aggregated into the two table shapes
the Overview page renders:

  statusByAgent : { agent: { status: hours } }        -> "Time in Status per Status"
  statusDaily   : { agent: { date: { status: hours }}} -> "Daily Status Hours per Agent"

The source data.js is public (link-shared) at callsstats.daniellecrizaldo.com.
We keep every team's rows (brai / danielle / cess) and only the fields the two
tables need, so the baked payload stays small instead of the full 30 MB cube.

Writes tools/status.json (consumed by mkmock.js).
"""
import json
import os
import re
import sys
import urllib.request

CALLSTATS_DATA = os.environ.get('CALLSTATS_DATA_URL',
    'https://callsstats.daniellecrizaldo.com/data.js')
OUT = os.path.join(os.path.dirname(__file__), 'status.json')


def fetch(url):
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (dashboard-refresh)'})
    with urllib.request.urlopen(req, timeout=180) as r:
        return r.read().decode('utf-8', 'replace')


def main():
    print('fetching status data from', CALLSTATS_DATA)
    txt = fetch(CALLSTATS_DATA)
    m = re.search(r'window\.CALL_DATA\s*=\s*(\{.*?\});?\s*$', txt, re.S)
    if not m:
        print('FATAL: could not find window.CALL_DATA in callsstats data.js', file=sys.stderr)
        sys.exit(1)
    data = json.loads(m.group(1))
    st = data.get('status') or {}
    rows = st.get('rows') or []
    rows = [r for r in rows if (r.get('team_key') or '') == 'danielle']
    print('  Team Danielle status rows:', len(rows))

    # Time in Status per Status: agent -> {status: hours}
    byAgent = {}
    # Daily Status Hours: agent -> {date: {status: hours}}
    daily = {}
    for r in rows:
        agent = r.get('agent') or ''
        status = r.get('status') or ''
        d = r.get('d') or ''
        mins = float(r.get('min') or 0)
        if not agent or not status:
            continue
        h = mins / 60.0
        a = byAgent.setdefault(agent, {})
        a[status] = a.get(status, 0.0) + h
        dd = daily.setdefault(agent, {}).setdefault(d, {})
        dd[status] = dd.get(status, 0.0) + h

    out = {
        'byAgent': byAgent,
        'daily': daily,
        'dates': sorted({d for a in daily.values() for d in a}),
        'statuses': sorted({s for a in byAgent.values() for s in a}),
        'generated': data.get('generated', ''),
    }
    with open(OUT, 'w') as fh:
        json.dump(out, fh)
    print('  wrote', OUT, '(', os.path.getsize(OUT) // 1024, 'KB )')
    print('  agents:', len(byAgent), 'dates:', len(out['dates']), 'statuses:', len(out['statuses']))


if __name__ == '__main__':
    main()
