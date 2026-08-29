#!/usr/bin/env python3
"""
Downloads the two source Google Sheets as .xlsx, then the rest of the pipeline
(togrid.py -> mkmock.js -> bake.js) runs unchanged.

No Google account, service account, key or token is involved. Google's own
export endpoint serves any sheet whose link sharing is "Anyone with the link",
which is how the Call EOD and Sales dashboards already work.

Sheet IDs come from the environment so they stay out of the committed files:
  PERF_SHEET_ID   - Team QA sheet id
  SCHED_SHEET_ID  - Leave / Schedule sheet id
  CASC_SHEET_ID   - Cascades & Handling sheet id

Run locally:
  PERF_SHEET_ID=... SCHED_SHEET_ID=... CASC_SHEET_ID=... python tools/fetch.py
"""
import os
import sys
import urllib.error
import urllib.request

EXPORT = 'https://docs.google.com/spreadsheets/d/{id}/export?format=xlsx'
TIMEOUT = 180


def die(msg):
    sys.stderr.write('fetch.py: ' + msg + '\n')
    sys.exit(1)


def get(sheet_id, out):
    req = urllib.request.Request(
        EXPORT.format(id=sheet_id),
        # without a normal UA Google sometimes serves an interstitial page
        headers={'User-Agent': 'Mozilla/5.0 (compatible; dashboard-refresh)'})
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
            body = r.read()
    except urllib.error.HTTPError as e:
        if e.code in (401, 403, 404):
            die('cannot download sheet %s (HTTP %d).\n'
                '  Open the sheet -> Share -> General access ->\n'
                '  "Anyone with the link" -> Viewer, then re-run.' % (sheet_id, e.code))
        die('download of %s failed: HTTP %d' % (sheet_id, e.code))
    except urllib.error.URLError as e:
        die('network error fetching %s: %s' % (sheet_id, e.reason))

    # A sharing/consent page returns 200 with HTML, so check the real format.
    # Every .xlsx is a zip and starts with the bytes 'PK'.
    if not body.startswith(b'PK'):
        die('%s did not come back as a spreadsheet (got %d bytes starting %r).\n'
            '  That usually means the sheet is not link-shared. Open it ->\n'
            '  Share -> General access -> "Anyone with the link" -> Viewer.'
            % (out, len(body), body[:40]))

    with open(out, 'wb') as fh:
        fh.write(body)
    print('  %-11s %8.0f KB' % (out, len(body) / 1024))


def main():
    perf = os.environ.get('PERF_SHEET_ID', '').strip()
    sched = os.environ.get('SCHED_SHEET_ID', '').strip()
    casc = os.environ.get('CASC_SHEET_ID', '').strip()
    missing = [n for n, v in (('PERF_SHEET_ID', perf), ('SCHED_SHEET_ID', sched), ('CASC_SHEET_ID', casc)) if not v]
    if missing:
        die('missing environment variable(s): ' + ', '.join(missing))

    print('downloading sheets (no credentials needed)')
    get(perf, 'qa.xlsx')
    get(sched, 'sched.xlsx')
    if casc:
        get(casc, 'casc.xlsx')


if __name__ == '__main__':
    main()
