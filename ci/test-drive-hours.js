/* Failing test for the Field Log drive-hours defect.
   Reproduces the real 2026-07-21 record: 81 miles logged as 11.1h of DRIVE
   time (7.3 mph), with 0.0h site time. Run: node test-drive-hours.js  */

const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const INDEX = path.join('C:/Users/lylek/Projects/job-tracker', 'index.html');
let failed = false;
const fail = (m) => { console.error('  ✗ ' + m); failed = true; };
const pass = (m) => console.log('  ✓ ' + m);

const dom = new JSDOM(fs.readFileSync(INDEX, 'utf8'), {
  runScripts: 'dangerously', pretendToBeVisual: true,
  url: 'https://lemonjello76.github.io/job-tracker/',
  beforeParse(w) {
    w.confirm = () => true; w.alert = () => {}; w.scrollTo = () => {}; w.print = () => {};
    w.matchMedia = w.matchMedia || (() => ({ matches: false, addListener(){}, removeListener(){} }));
    w.indexedDB = undefined;
    w.fetch = () => Promise.resolve({ ok: true, json: () => ({}), text: () => '' });
    w.URL.createObjectURL = () => 'blob:fake'; w.URL.revokeObjectURL = () => {};
    w.addEventListener('error', () => {});
  }
});
const win = dom.window;

const HOUR = 3600000;
const T0 = new Date('2026-07-21T07:00:00').getTime();

// The actual bad record from the 7/21 day-recap email.
const jul21 = { id: 's1', type: 'drive', startedAt: T0, endedAt: T0 + 11.1 * HOUR, manualMiles: 81 };
// A normal highway haul: 520 miles in 8.5h = 61 mph. Must pass through untouched.
const realHaul = { id: 's2', type: 'drive', startedAt: T0, endedAt: T0 + 8.5 * HOUR, manualMiles: 520 };
// A workday must never be reclassified.
const workday = { id: 's3', type: 'workday', startedAt: T0, endedAt: T0 + 7.3 * HOUR };

setTimeout(() => {
  console.log('\nDrive-hours integrity');

  if (typeof win.segTimeBreakdown !== 'function') {
    fail('segTimeBreakdown() does not exist — elapsed time is still reported raw as drive time');
    console.error('\nFAILED'); process.exit(1);
  }

  const bad = win.segTimeBreakdown(jul21);
  if (bad.implausible) pass('7/21 (81mi/11.1h = 7mph) flagged implausible');
  else fail('7/21 (81mi/11.1h = 7mph) NOT flagged — this is the defect');

  if (bad.driveMs / HOUR < 3) pass('7/21 drive time reduced to ' + (bad.driveMs / HOUR).toFixed(1) + 'h (was 11.1h)');
  else fail('7/21 still reports ' + (bad.driveMs / HOUR).toFixed(1) + 'h of drive time');

  if (Math.abs((bad.driveMs + bad.unaccountedMs) - bad.elapsedMs) < 1000) pass('drive + unaccounted reconciles to the full elapsed span (nothing hidden)');
  else fail('breakdown does not reconcile to elapsed');

  const ok = win.segTimeBreakdown(realHaul);
  if (!ok.implausible && Math.abs(ok.driveMs - 8.5 * HOUR) < 1000 && ok.unaccountedMs === 0) pass('real 520mi/8.5h haul passes through untouched at 8.5h');
  else fail('legitimate haul was wrongly reduced to ' + (ok.driveMs / HOUR).toFixed(1) + 'h');

  const w = win.segTimeBreakdown(workday);
  if (Math.abs(w.workMs - 7.3 * HOUR) < 1000 && w.driveMs === 0) pass('workday segment reports 7.3h site time, 0 drive');
  else fail('workday segment mishandled');

  console.log(failed ? '\nFAILED' : '\nPASSED');
  process.exit(failed ? 1 : 0);
}, 900);

setTimeout(() => { console.error('TIMEOUT'); process.exit(3); }, 20000).unref?.();
process.on('uncaughtException', () => {});
