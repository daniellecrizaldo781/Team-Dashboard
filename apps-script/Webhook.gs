/**
 * Webhook.gs  ->  paste into the SHEET's bound Apps Script project
 * (Tools > Script editor, or Extensions > Apps Script from the sheet).
 *
 * WHAT IT DOES
 *   Fires on every edit to the sheet and pings a PUBLIC GitHub repository_dispatch
 *   URL, which triggers the "Realtime sync" GitHub Action to rebuild data.js and
 *   redeploy. No GitHub secret lives in the sheet - the dispatch URL is public and
 *   can only start a build; it cannot read or write anything.
 *
 * SETUP (3 steps, one-time)
 *   1. In the bound script, go to Project Settings > Scopes, ensure
 *      `https://www.googleapis.com/auth/script.external_request` is enabled
 *      (it'll be requested automatically on first run).
 *   2. Replace DISPATCH_URL below with your repo's dispatch URL:
 *        https://api.github.com/repos/<OWNER>/<REPO>/dispatches
 *      It must include the ?token=... PUBLIC token from the workflow_dispatch
 *      (the long "Public" URL GitHub shows you under the workflow's "Run workflow"
 *      REST API). That token is NOT a secret - it only triggers a run.
 *   3. Save, then run `installTrigger()` once (or add the onEdit trigger manually
 *      via Triggers > + Event source = From spreadsheet > On edit).
 */

var DISPATCH_URL = 'https://api.github.com/repos/daniellecrizaldo781/Team-Dashboard/dispatches?token=REPLACE_WITH_PUBLIC_DISPATCH_TOKEN';

function onEdit(e) {
  // Debounce: GitHub Actions concurrency cancels overlapping runs, but avoid
  // spamming on rapid multi-cell edits by firing at most once per ~20s.
  var now = Date.now();
  var props = PropertiesService.getScriptProperties();
  var last = Number(props.getProperty('LAST_EDIT_PING') || 0);
  if (now - last < 20000) return;
  props.setProperty('LAST_EDIT_PING', String(now));

  var payload = JSON.stringify({
    event_type: 'sheet-updated',
    client_payload: {
      sheet: SpreadsheetApp.getActiveSpreadsheet().getName(),
      edited_at: new Date().toISOString()
    }
  });
  try {
    UrlFetchApp.fetch(DISPATCH_URL, {
      method: 'post',
      contentType: 'application/json',
      payload: payload,
      muteHttpExceptions: true
    });
  } catch (err) {
    // Non-fatal: the hourly refresh is the safety net if a ping ever fails.
  }
}

/** Install the on-edit trigger (run once from the script editor). */
function installTrigger() {
  // remove any prior copy so re-running doesn't duplicate
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'onEdit') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('onEdit').forSpreadsheet(SpreadsheetApp.getActiveSpreadsheet()).onEdit().create();
  Logger.log('onEdit trigger installed.');
}
