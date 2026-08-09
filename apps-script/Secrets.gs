/**
 * Team Weekly QA & Performance Dashboard
 * FILE 4 of 5  ->  Secrets.gs
 *
 * ===========================================================================
 * ONE-TIME SETUP - do this once, then blank out the two IDs below.
 * ===========================================================================
 *
 * The Sheet IDs are stored as Script Properties, which are Apps Script's
 * built-in secret store. They are visible only to you as the project owner,
 * and they are never sent to the browser or committed to GitHub.
 *
 * HOW TO USE
 *   1. Paste your two Sheet IDs between the quotes below.
 *   2. In the Apps Script toolbar choose the function  setSecrets  and Run.
 *   3. You should see "Secrets saved" in the execution log.
 *   4. DELETE the two IDs again (set them back to '') and save.
 *      The values now live in Script Properties, not in this file.
 *
 * WHERE TO FIND A SHEET ID
 *   https://docs.google.com/spreadsheets/d/THIS_LONG_PART_IS_THE_ID/edit#gid=0
 *
 * You can also skip this file entirely and add the properties by hand:
 *   Apps Script -> Project Settings (gear) -> Script Properties -> Add
 *   Property: PERF_SHEET_ID    Value: <the QA sheet id>
 *   Property: SCHED_SHEET_ID   Value: <the schedule sheet id>
 */

function setSecrets() {
  var PERF  = '';   // <- paste the Team Weekly QA sheet ID here
  var SCHED = '';   // <- paste the Schedule / Leave sheet ID here

  if (!PERF || !SCHED) {
    throw new Error('Paste both Sheet IDs into setSecrets() first, then Run again.');
  }

  PropertiesService.getScriptProperties().setProperties({
    PERF_SHEET_ID:  PERF.trim(),
    SCHED_SHEET_ID: SCHED.trim()
  });

  Logger.log('Secrets saved. Now clear the two IDs from this file and save.');
  return 'Secrets saved.';
}

/** Confirms the secrets are set WITHOUT printing them. Safe to run anytime. */
function checkSecrets() {
  var p = PropertiesService.getScriptProperties();
  var out = ['PERF_SHEET_ID', 'SCHED_SHEET_ID'].map(function (k) {
    var v = p.getProperty(k);
    return k + ': ' + (v ? 'set (' + v.length + ' chars, ends ...' + v.slice(-4) + ')' : 'MISSING');
  }).join('\n');
  Logger.log(out);
  return out;
}

/** Removes the stored secrets. Use if you ever rotate the sheets. */
function clearSecrets() {
  PropertiesService.getScriptProperties()
    .deleteProperty('PERF_SHEET_ID')
    .deleteProperty('SCHED_SHEET_ID');
  Logger.log('Secrets cleared.');
  return 'Secrets cleared.';
}
