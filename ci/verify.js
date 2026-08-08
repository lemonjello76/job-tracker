/* CI verification for the Job Tracker.
   Run with: node ci/verify.js
   Exits non-zero on any failure so GitHub Actions blocks the deploy.

   Two checks:
     1. SYNTAX  — every inline <script> block in index.html parses cleanly.
                  This catches the class of bug that took the app down last
                  week (a stray backslash inside a JS string literal).
     2. SMOKE   — load index.html in jsdom, verify the script runs without
                  errors, that every advertised feature button is wired to a
                  defined function, and that one report generator produces a
                  non-empty HTML payload. Catches "all my buttons died"
                  regressions before they ship. */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const INDEX = path.join(ROOT, 'index.html');
const HELP = path.join(ROOT, 'help/index.html');

let failed = false;
const fail = (msg) => { console.error('  ✗ ' + msg); failed = true; };
const pass = (msg) => console.log('  ✓ ' + msg);

// ─── 1. SYNTAX ───────────────────────────────────────────────────────────
console.log('\n[1/2] Syntax check');
function syntaxCheck(file) {
  const html = fs.readFileSync(file, 'utf8');
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
  if (!scripts.length) { pass(file + ': no inline scripts'); return; }
  let i = 0;
  for (const s of scripts) {
    i++;
    try { new Function(s); }
    catch (e) { fail(file + ' script block ' + i + ': ' + e.message); }
  }
  if (!failed) pass(file + ': ' + scripts.length + ' inline block(s) parse cleanly');
}
syntaxCheck(INDEX);
if (fs.existsSync(HELP)) syntaxCheck(HELP);

if (failed) { console.error('\nSYNTAX CHECK FAILED'); process.exit(1); }

// ─── 2. SMOKE TEST ───────────────────────────────────────────────────────
console.log('\n[2/2] Smoke test (jsdom)');
const { JSDOM } = require('jsdom');

const captured = [];
const runtimeErrs = [];
const html = fs.readFileSync(INDEX, 'utf8');

const dom = new JSDOM(html, {
  runScripts: 'dangerously',
  pretendToBeVisual: true,
  url: 'https://lemonjello76.github.io/job-tracker/',
  beforeParse(w) {
    w.confirm = () => true;
    w.alert = () => {};
    w.scrollTo = () => {};
    w.print = () => {};
    w.matchMedia = w.matchMedia || (() => ({ matches: false, addListener(){}, removeListener(){} }));
    w.indexedDB = undefined;
    w.fetch = () => Promise.resolve({ ok: true, json: () => ({}), text: () => '', headers: { get: () => '' } });
    w.URL.createObjectURL = (blob) => {
      const url = 'blob:fake/' + captured.length;
      // Read the blob safely. Different jsdom versions implement different
      // subsets of the Blob spec; never throw inside this stub or the app's
      // try/catch around URL.createObjectURL will swallow the report silently.
      const readBlob = () => new Promise(resolve => {
        if (!blob) return resolve('');
        // 1. FileReader path (most reliable in jsdom)
        try {
          const FR = w.FileReader;
          if (FR) {
            const fr = new FR();
            fr.onload = () => resolve(typeof fr.result === 'string' ? fr.result : '');
            fr.onerror = () => resolve('');
            fr.readAsText(blob);
            return;
          }
        } catch (_) {}
        // 2. arrayBuffer fallback
        try {
          if (typeof blob.arrayBuffer === 'function') {
            return blob.arrayBuffer().then(b => resolve(Buffer.from(b).toString('utf8')), () => resolve(''));
          }
        } catch (_) {}
        // 3. text() fallback
        try {
          if (typeof blob.text === 'function') {
            return blob.text().then(resolve, () => resolve(''));
          }
        } catch (_) {}
        resolve('');
      });
      captured.push({ url, size: blob && blob.size, type: blob && blob.type, pending: readBlob() });
      return url;
    };
    w.URL.revokeObjectURL = () => {};
    w.open = (url) => ({ document: { write(){}, close(){}, body: { innerHTML: '' } }, focus(){}, location: { href: url }, closed: false, close(){} });
    Object.defineProperty(w.navigator, 'share', { value: undefined, configurable: true });
    Object.defineProperty(w.navigator, 'clipboard', { value: { writeText: () => Promise.resolve() }, configurable: true });
    w.addEventListener('error', e => runtimeErrs.push((e.error && e.error.stack) || e.message));
    w.addEventListener('unhandledrejection', e => runtimeErrs.push((e.reason && e.reason.message) || e.reason));
  }
});

const win = dom.window;
const doc = dom.window.document;

(async () => {
  await new Promise(r => setTimeout(r, 900));

  // 2a. zero runtime errors at load
  if (runtimeErrs.length === 0) pass('page loads with 0 runtime errors');
  else { fail(runtimeErrs.length + ' runtime errors at load'); runtimeErrs.slice(0, 3).forEach((e, i) => console.error('     ['+i+']', String(e).split('\n')[0].slice(0, 160))); }

  // 2b. every inline onclick handler resolves to a defined function (skipping DOM methods)
  const DOM_METHODS = new Set(['scrollIntoView','click','focus','blur','toggle','contains','remove','add','append','removeChild','appendChild','setAttribute','removeAttribute','getElementById','querySelector','querySelectorAll','splice','push','slice','filter','map','forEach','reduce']);
  const onclickEls = [...doc.querySelectorAll('[onclick]')];
  const callNames = new Set();
  for (const el of onclickEls) {
    const v = el.getAttribute('onclick');
    for (const m of v.matchAll(/([a-zA-Z_$][\w$]*)\s*\(/g)) {
      const name = m[1];
      if (DOM_METHODS.has(name)) continue;
      if (/^(if|else|for|while|return|var|let|const|function|new|this|true|false|null|undefined|typeof|document|window|console|Array|Object|String|Number|JSON|Math|setTimeout|setInterval|requestAnimationFrame|Event|URL|Blob|File|FileReader|Promise|Date|Error|alert|confirm|prompt|esc|fmtDate)$/.test(name)) continue;
      callNames.add(name);
    }
  }
  const missing = [...callNames].filter(n => typeof win[n] !== 'function');
  if (missing.length === 0) pass(onclickEls.length + ' inline handlers, ' + callNames.size + ' distinct names, all resolve');
  else fail('inline handlers reference undefined functions: ' + missing.slice(0, 10).join(', '));

  // 2c. critical feature buttons present and click without throwing
  const findBtn = (re) => [...doc.querySelectorAll('button')].find(b => re.test((b.textContent || '').replace(/\s+/g, ' ').trim()));
  const required = [
    ['CHECKLIST',       /CHECKLIST/],
    ['VIDEOS',          /VIDEOS/],
    ['PHOTOS',          /PHOTOS/],
    ['COMM LOG',        /COMM LOG/],
    ['START DRIVE',     /START DRIVE/],
    ['FULL REPORT',     /^FULL REPORT$/],
    ['GC COMPLETION',   /GC COMPLETION REPORT/],
    ['USER GUIDE',      /USER GUIDE/],
  ];
  let buttonsOk = true;
  for (const [label, re] of required) {
    const btn = findBtn(re);
    if (!btn) { fail('button not found: ' + label); buttonsOk = false; continue; }
    try { btn.click(); } catch (e) { fail('button "' + label + '" threw: ' + e.message.slice(0, 140)); buttonsOk = false; }
  }
  if (buttonsOk) pass(required.length + ' critical feature buttons present and click cleanly');

  // 2d. one report generator end-to-end: produce a substantial HTML blob.
  // We check blob size and type (both reliable in jsdom). If the runtime can
  // read the blob body we additionally check the client name appears; if not
  // (jsdom version quirk), we settle for size confirming the report rendered.
  doc.getElementById('client').value = 'CI Smoke Test Client #999';
  doc.getElementById('city').value = 'Phoenix';
  doc.getElementById('state').value = 'AZ';
  const beforeBlobs = captured.length;
  try {
    await win.generateReport();
    await new Promise(r => setTimeout(r, 300));
  } catch (e) { fail('generateReport threw: ' + e.message.slice(0, 140)); }
  const newBlobs = captured.slice(beforeBlobs);
  const reportBlob = newBlobs.find(b => b.type === 'text/html' && b.size > 5000);
  if (!reportBlob) {
    fail('generateReport did not produce an HTML blob > 5KB (' + newBlobs.length + ' blob(s) seen)');
  } else {
    const body = await reportBlob.pending;
    if (body.length === 0) {
      pass('generateReport produced ' + reportBlob.size + '-byte text/html blob (body unreadable in this jsdom — size confirms render)');
    } else if (!/CI Smoke Test Client #999/.test(body)) {
      fail('generateReport blob is ' + body.length + ' bytes but missing client name');
    } else {
      pass('generateReport produced ' + body.length + '-byte HTML containing the client name');
    }
  }

  // 2e. checklist templates load
  try {
    const sel = doc.getElementById('checklistType');
    const types = [...sel.options].map(o => o.value).filter(Boolean);
    let allOk = true;
    for (const t of types) {
      win.loadChecklist(t);
      const rows = doc.getElementById('checklistItems').children.length;
      if (rows < 3) { fail('checklist "' + t + '" rendered only ' + rows + ' rows'); allOk = false; }
    }
    if (allOk) pass(types.length + ' checklist templates load and render');
  } catch (e) { fail('checklist load threw: ' + e.message.slice(0, 140)); }

  // 2f. drive-time integrity — elapsed span must never be reported as drive
  // time when the mileage can't support it (the 81mi/11.1h = 7mph defect).
  try {
    const HOUR = 3600000, T0 = Date.now() - 24 * HOUR;
    const bad = win.segTimeBreakdown({ id: 'x', type: 'drive', startedAt: T0, endedAt: T0 + 11.1 * HOUR, manualMiles: 81 });
    const good = win.segTimeBreakdown({ id: 'y', type: 'drive', startedAt: T0, endedAt: T0 + 8.5 * HOUR, manualMiles: 520 });
    if (!bad.implausible) fail('drive integrity: 81mi/11.1h (7mph) not flagged');
    else if (bad.driveMs / HOUR > 3) fail('drive integrity: 7mph span still reports ' + (bad.driveMs / HOUR).toFixed(1) + 'h drive');
    else if (Math.abs((bad.driveMs + bad.unaccountedMs) - bad.elapsedMs) > 1000) fail('drive integrity: breakdown does not reconcile to elapsed');
    else if (good.implausible || Math.abs(good.driveMs - 8.5 * HOUR) > 1000) fail('drive integrity: legitimate 520mi/8.5h haul was wrongly reduced');
    else pass('drive-time integrity: implausible spans reduced, real hauls untouched');
  } catch (e) { fail('drive integrity check threw: ' + e.message.slice(0, 140)); }

  if (failed) { console.error('\nSMOKE TEST FAILED'); process.exit(1); }
  console.log('\nAll checks passed.');
  process.exit(0);
})().catch(e => { console.error('\nHARNESS CRASHED:', e.stack); process.exit(2); });

// Hard timeout — jsdom intervals can keep the loop alive after we're done.
setTimeout(() => { console.error('HARD TIMEOUT'); process.exit(3); }, 30000).unref?.();

// Swallow late errors thrown by intervals firing after we exit logically.
process.on('uncaughtException', e => {
  if (failed) process.exit(1);
  // Late errors after success path: ignore.
});
