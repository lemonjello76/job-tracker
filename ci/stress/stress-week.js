// Field Log / Drive & Work Log — one-week field stress test.
// Six simulated techs, each in an isolated browser profile with its own time
// zone, fake GPS and a fake clock. Drives the real UI (buttons, pop-ups, file
// pickers), then audits what the app recorded against what actually happened.
// Runs against the SAFE preview copy (no Firebase, no EmailJS) and blocks every
// outside host, so no real data or email can be touched.
//
// Run (from ci/stress, needs `npm i playwright-core@1.56` there):
//   1. Make the safe copy: grep -v -E 'gstatic.com/firebasejs|@emailjs/browser' ../../index.html > <dir>/index.html
//   2. Serve <dir> on a local port, e.g. python -m http.server 8765 --directory <dir>
//   3. node stress-week.js            (all six techs)   or   node stress-week.js knx-hvac,bos-elec
// Findings print per tech; details land in ci/stress/out/<tech>.json.
const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');

// Point at a SAFE copy of the app with the Firebase and EmailJS script tags removed.
const URL_APP = process.env.APP_URL || 'http://localhost:8765/';
const EXE = process.env.CHROME || (process.env.LOCALAPPDATA + '/ms-playwright/chromium-1228/chrome-win64/chrome.exe');
const OUT = path.join(__dirname, 'out');
fs.mkdirSync(OUT, { recursive: true });
const ONLY = process.argv[2] || '';

// ---------- seeded random ----------
function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

// ---------- time zones ----------
function zonedEpoch(tz, y, mo, d, h, mi) {
  const target = Date.UTC(y, mo - 1, d, h, mi);
  let g = target;
  const f = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  for (let i = 0; i < 4; i++) {
    const p = Object.fromEntries(f.formatToParts(new Date(g)).map(x => [x.type, x.value]));
    const asUTC = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute);
    g -= (asUTC - target);
  }
  return g;
}
const localDay = (tz, ms) => new Date(ms).toLocaleDateString('en-CA', { timeZone: tz });
const localTime = (tz, ms) => new Date(ms).toLocaleString('en-US', { timeZone: tz, weekday: 'short', hour: 'numeric', minute: '2-digit' });

// ---------- geography ----------
const CITIES = {
  Knoxville: { lat: 35.9606, lng: -83.9207, st: 'TN', tz: 'America/New_York' },
  Austin:    { lat: 30.2672, lng: -97.7431, st: 'TX', tz: 'America/Chicago' },
  Orlando:   { lat: 28.5384, lng: -81.3789, st: 'FL', tz: 'America/New_York' },
  Boston:    { lat: 42.3601, lng: -71.0589, st: 'MA', tz: 'America/New_York' },
  Boise:     { lat: 43.6150, lng: -116.2023, st: 'ID', tz: 'America/Boise' },
};
const offset = (c, dxKm, dyKm) => ({ lat: c.lat + dyKm / 111, lng: c.lng + dxKm / (111 * Math.cos(c.lat * Math.PI / 180)) });
function distMi(a, b) {
  const R = 3958.8, toR = x => x * Math.PI / 180;
  const dLa = toR(b.lat - a.lat), dLo = toR(b.lng - a.lng);
  const h = Math.sin(dLa / 2) ** 2 + Math.cos(toR(a.lat)) * Math.cos(toR(b.lat)) * Math.sin(dLo / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// ---------- personas ----------
// installs = multi-day construction/new-build; services = one-day calls.
const PERSONAS = [
  { id: 'knx-hvac', who: 'HVAC tech, Knoxville', city: 'Knoxville', seed: 11, mph: 32, week: [2026, 11, 9],
    installs: [{ name: 'Kroger Marketplace Turkey Creek - new build RTUs', kind: 'install', cls: 'commercial', at: [-14, 3] }],
    services: [['Henley residence - no cool', 'res'], ['Food City #612 - RTU service', 'commercial'], ['Bearden heat pump - noise', 'res'], ['Fountain City duplex - furnace', 'res'], ['UT Medical office - VAV', 'commercial'], ['Farragut residence - thermostat', 'res']],
    plan: ['install+svc', 'install', 'install+svc', 'svc', 'install', 'off'], quirks: { reloadMidWork: 2 } },
  { id: 'atx-elec', who: 'Electrician, Austin', city: 'Austin', seed: 22, mph: 30, week: [2026, 11, 9],
    installs: [{ name: 'Easton Park Lot 41 - new build rough-in', kind: 'install', cls: 'res', at: [9, -12] }],
    services: [['Mueller residence - breaker trips', 'res'], ['Torchy\'s Tacos S Lamar - panel', 'commercial'], ['Zilker residence - EV charger', 'res']],
    plan: ['install', 'install', 'install+svc', 'install+forgotOpen', 'install+svc', 'svc'], quirks: { gpsJitterM: 90 } },
  { id: 'mco-hvac', who: 'HVAC tech, Orlando', city: 'Orlando', seed: 33, mph: 27, week: [2026, 11, 9],
    installs: [{ name: 'Publix #1544 - overnight RTU swap', kind: 'install', cls: 'commercial', at: [6, 8] }],
    services: [['Baldwin Park residence - no cool', 'res'], ['Winter Park office - condenser', 'commercial'], ['College Park residence - drain line', 'res'], ['Lake Nona clinic - split system', 'commercial'], ['Conway residence - capacitor', 'res'], ['Mills 50 restaurant - make-up air', 'commercial'], ['Dr Phillips residence - duct leak', 'res'], ['Hunters Creek residence - thermostat', 'res']],
    plan: ['svc', 'svc', 'svc', 'svc+overnight', 'svc', 'off'], quirks: {} },
  { id: 'bos-elec', who: 'Electrician, Boston', city: 'Boston', seed: 44, mph: 10, week: [2026, 11, 9],
    installs: [{ name: 'Seaport tenant fit-out 5th floor', kind: 'install', cls: 'commercial', at: [2, -1.5] }],
    services: [['Back Bay brownstone - knob and tube', 'res'], ['Southie triple-decker - service upgrade', 'res'], ['Newbury St retail - lighting', 'commercial']],
    plan: ['install', 'install', 'install', 'install', 'svc', 'off'], quirks: { photosPerDay: 40, reloadNewJob: 4 } },
  { id: 'boi-handy', who: 'Handyman (solo), Boise', city: 'Boise', seed: 55, mph: 30, week: [2026, 10, 26],
    installs: [{ name: 'Harris Ranch bathroom remodel', kind: 'install', cls: 'res', at: [8, -4] }],
    services: [['North End - door rehang', 'res'], ['Bench - drywall patch', 'res'], ['Garden City cafe - shelving', 'commercial'], ['Meridian rental - turnover punch list', 'res'], ['East End - gutter clean', 'res'], ['Downtown dental office - door closer', 'commercial'], ['Collister - fence repair', 'res'], ['Warm Springs - faucet', 'res']],
    plan: ['svc', 'install+svc', 'svc', 'install', 'svc', 'svc+lateDST'], quirks: { receiptsHeavy: true } },
  { id: 'mco-handy', who: 'Handyman (solo), Orlando', city: 'Orlando', seed: 66, mph: 26, week: [2026, 11, 9],
    installs: [{ name: 'Thornton Park kitchen backsplash', kind: 'install', cls: 'res', at: [-3, 2] }],
    services: [['Ivanhoe Village bistro - booth repair', 'commercial'], ['Audubon Park - ceiling fan', 'res'], ['Delaney Park - screen door', 'res'], ['Colonialtown - toilet', 'res'], ['SoDo salon - shelving', 'commercial']],
    plan: ['svc', 'install', 'install+forget', 'svc+gpsoff', 'install', 'off'], quirks: {} },
];

// ---------- one persona ----------
async function runPersona(browser, P) {
  const C = CITIES[P.city];
  const tz = C.tz;
  const R = rng(P.seed);
  const log = [];          // what actually happened (the ground truth)
  const issues = [];       // anything the app did wrong or threw
  const timings = [];
  const note = (kind, msg, extra) => issues.push(Object.assign({ kind, msg }, extra || {}));
  const home = offset(C, (R() - .5) * 20, (R() - .5) * 20);
  const sites = {};
  P.installs.forEach(j => { sites[j.name] = offset(C, j.at[0], j.at[1]); });
  P.services.forEach(([n]) => { sites[n] = offset(C, (R() - .5) * 28, (R() - .5) * 28); });

  const ctx = await browser.newContext({
    timezoneId: tz, viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true,
    geolocation: { latitude: home.lat, longitude: home.lng, accuracy: 12 }, permissions: ['geolocation'],
    acceptDownloads: true,
  });
  // Block the outside world; fake the two free lookups the app makes
  await ctx.route(u => !u.href.startsWith(URL_APP), async route => {
    const u = route.request().url();
    if (u.includes('bigdatacloud')) {
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ city: P.city, locality: P.city, principalSubdivisionCode: 'US-' + C.st }) });
    }
    if (u.includes('overpass')) return route.fulfill({ contentType: 'application/json', body: '{"elements":[]}' });
    if (u.includes('fonts.g')) return route.abort();
    return route.abort();
  });
  // the fake clock jumps hours in real seconds, so the browser's 60 s GPS cache would hand back old spots; always ask fresh
  await ctx.addInitScript(() => { const g = navigator.geolocation; if (!g) return; const orig = g.getCurrentPosition.bind(g); g.getCurrentPosition = (ok, bad, o) => orig(ok, bad, Object.assign({}, o, { maximumAge: 0 })); });
  await ctx.addInitScript(() => {
    window.__blobs = [];
    const orig = URL.createObjectURL;
    URL.createObjectURL = function (b) { try { window.__blobs.push({ type: b.type, size: b.size, blob: b }); } catch (e) {} return orig.call(URL, b); };
    window.open = () => ({ document: { write() {}, close() {} }, focus() {}, close() {} });
    try { localStorage.setItem('fieldlog_helpSeen', '1'); } catch (e) {}
  });
  const page = await ctx.newPage();
  const consoleErrs = [];
  page.on('pageerror', e => consoleErrs.push('PAGEERROR ' + String(e.message).slice(0, 200)));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|ERR_FAILED|net::|bad HTTP response code/.test(m.text())) consoleErrs.push(m.text().slice(0, 200)); });

  // ----- dialogs: answer like a person -----
  const S = { odo: 40000 + Math.floor(R() * 60000), jobName: '', intended: '', gasAmt: 0, odoPrompts: 0, odoWaiters: [] };
  const dialogs = [];
  page.on('dialog', async d => {
    const m = d.message();
    dialogs.push({ t: d.type(), m: m.slice(0, 90) });
    try {
      if (d.type() === 'confirm' && /odometer/i.test(m)) return d.accept();
      if (d.type() === 'confirm' && /Start work here/i.test(m)) return (S.intended && m.includes(S.intended.slice(0, 20))) ? d.accept() : d.dismiss();
      if (d.type() === 'prompt' && /odometer reading/i.test(m)) { S.odoPrompts++; await d.accept(String(S.odo)); S.odoWaiters.splice(0).forEach(f => f()); return; }
      if (d.type() === 'prompt' && /Job name/i.test(m)) return d.accept(S.jobName);
      if (d.type() === 'prompt' && /Gas amount/i.test(m)) return d.accept(String(S.gasAmt));
      if (d.type() === 'alert' && /Freeze copy saved/.test(m)) return d.accept();
      if (d.type() === 'alert') { note('alert', m.slice(0, 160)); return d.accept(); }
      if (d.type() === 'confirm') { note('unexpected-confirm', m.slice(0, 160)); return d.accept(); }
      note('unexpected-prompt', m.slice(0, 160)); return d.dismiss();
    } catch (e) { /* dialog already handled */ }
  });

  // ----- photo pool (real phone size: 12 MP JPEG) -----
  await page.goto('about:blank');
  const pool = await page.evaluate(async () => {
    const out = [];
    for (let k = 0; k < 3; k++) {
      const c = document.createElement('canvas'); c.width = 4032; c.height = 3024;
      const g = c.getContext('2d');
      g.fillStyle = `hsl(${k * 70},30%,40%)`; g.fillRect(0, 0, c.width, c.height);
      for (let i = 0; i < 900; i++) { g.fillStyle = `hsl(${Math.random() * 360},${30 + Math.random() * 40}%,${20 + Math.random() * 60}%)`; g.fillRect(Math.random() * c.width, Math.random() * c.height, 30 + Math.random() * 400, 30 + Math.random() * 400); }
      const img = g.getImageData(0, 0, 1400, 1000); for (let i = 0; i < img.data.length; i += 4) { const n = Math.random() * 80; img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n; } g.putImageData(img, 0, 0);
      const b = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.88));
      out.push(await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(String(fr.result).split(',')[1]); fr.readAsDataURL(b); }));
    }
    return out;
  }).catch(() => null);
  const imgs = (pool || []).map(b64 => Buffer.from(b64, 'base64'));
  const file = i => ({ name: `IMG_${1000 + i}.jpg`, mimeType: 'image/jpeg', buffer: imgs[i % imgs.length] });
  const photoBytes = imgs.length ? imgs[0].length : 0;

  // ----- clock -----
  const [Y, MO, D0] = P.week;
  const dayDate = i => { const d = new Date(Date.UTC(Y, MO - 1, D0 + i)); return [d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()]; };
  const at = (i, hh, mm) => { const [y, mo, d] = dayDate(i); return zonedEpoch(tz, y, mo, d, hh, mm); };
  let now = at(0, 5, 30);
  await page.clock.install({ time: now });
  await page.goto(URL_APP);
  await page.waitForFunction(() => typeof getRunningSegment === 'function' && typeof db !== 'undefined' && db, null, { timeout: 20000 });
  await page.waitForTimeout(800);

  const setTime = async ms => { if (ms < now) ms = now + 60000; now = ms; await page.clock.setSystemTime(now); };
  const plus = async min => setTime(now + min * 60000);
  const setGps = async (p, jitterM) => {
    let q = p;
    if (jitterM) q = offset(p, (R() - .5) * jitterM / 1000 * 2, (R() - .5) * jitterM / 1000 * 2);
    await ctx.setGeolocation({ latitude: q.lat, longitude: q.lng, accuracy: 10 + R() * 15 });
  };
  const flowBtn = re => page.locator('#dayFlowBox button').filter({ hasText: re }).first();
  const step = async (label, fn) => {
    const t0 = Date.now();
    try { await fn(); } catch (e) {
      note('step-failed', `${label} @ ${localTime(tz, now)}: ${String(e.message).split('\n')[0].slice(0, 180)}`);
      await page.screenshot({ path: path.join(OUT, `${P.id}-fail-${issues.length}.png`) }).catch(() => {});
      await page.evaluate(() => document.querySelectorAll('#dayPickOverlay, [style*="z-index:10060"]').forEach(o => o.remove())).catch(() => {});
    }
    timings.push({ label, ms: Date.now() - t0 });
  };
  const waitOdo = (n) => new Promise(res => { if (S.odoPrompts >= n) return res(); S.odoWaiters.push(res); setTimeout(res, 12000); });
  // pick a file through the real file chooser when one opens, else set it directly
  const choose = async (trigger, inputSel, files) => {
    const fc = page.waitForEvent('filechooser', { timeout: 2500 }).catch(() => null);
    await trigger();
    const chooser = await fc;
    if (chooser) await chooser.setFiles(files); else await page.setInputFiles(inputSel, files);
  };

  // ----- ground-truth ledger -----
  let open = null; // { type, start, miles, job }
  const closeOpen = (end) => { if (open) { log.push(Object.assign({}, open, { end })); open = null; } };
  let curPos = home;
  let curJob = '';

  async function drive(toPos, label) {
    const miles = Math.max(1, Math.round(distMi(curPos, toPos) * 1.3));
    const mins = Math.max(6, Math.round(miles / P.mph * 60 * (0.85 + R() * 0.3)));
    if (open && open.type === 'workday') {
      // a person who forgot last night sees STOP WORK first and taps it
      await step('stop forgotten work', async () => {
        await setGps(curPos);
        await flowBtn(/STOP WORK/).click();
        await page.waitForFunction(() => !getRunningSegment(), null, { timeout: 8000 });
      });
      closeOpen(now);
    }
    await step('start drive ' + label, async () => {
      await setGps(curPos);
      const before = S.odoPrompts;
      // odometer photo goes through segOdoInput after the confirm
      const fc = page.waitForEvent('filechooser', { timeout: 4000 }).catch(() => null);
      await flowBtn(/START DRIVE/).click();
      const ch = await fc; if (ch) await ch.setFiles(file(1)); else await page.setInputFiles('#segOdoInput', file(1));
      await waitOdo(before + 1);
      await page.waitForFunction(() => getRunningSegment() && getRunningSegment().type === 'drive', null, { timeout: 8000 });
    });
    if (open && open.type === 'workday') closeOpen(now);
    open = { type: 'drive', start: now, miles, job: '(trip)', odoStart: S.odo };
    await plus(mins);
    S.odo += miles;
    curPos = toPos;
    await step('arrive ' + label, async () => {
      await setGps(toPos);
      const before = S.odoPrompts;
      const fc = page.waitForEvent('filechooser', { timeout: 4000 }).catch(() => null);
      await flowBtn(/I'VE ARRIVED/).click();
      const ch = await fc; if (ch) await ch.setFiles(file(2)); else await page.setInputFiles('#segOdoInput', file(2));
      await waitOdo(before + 1);
      await page.waitForFunction(() => !getRunningSegment(), null, { timeout: 8000 });
    });
    closeOpen(now);
  }

  async function startWork(job, kind, isNew) {
    S.intended = job; S.jobName = job;
    await step('start work ' + job, async () => {
      await setGps(curPos, P.quirks.gpsJitterM);
      await flowBtn(/^\s*START WORK\s*$|ALREADY ON SITE/).click();
      // either the GPS confirm (handled by the dialog handler) or the picker
      const picked = await page.waitForSelector('#dayPickOverlay', { timeout: 5000 }).catch(() => null);
      if (picked) {
        const want = isNew ? page.locator('#dayPickOverlay [data-pick="__new"]')
          : page.locator('#dayPickOverlay [data-pick]').filter({ hasText: job.slice(0, 24) }).first();
        if (!isNew && !(await want.count())) { note('job-missing-from-picker', job); }
        await ((!isNew && !(await want.count())) ? page.locator('#dayPickOverlay [data-pick="__new"]') : want).click();
        // The name box redraws once the nearby lookup returns; wait for that, then click the live button
        const nameBox = await page.waitForSelector('[data-type="1"]', { timeout: 2500 }).catch(() => null);
        if (nameBox) {
          await page.waitForFunction(() => /just type the name|tap one/.test(document.body.innerText), null, { timeout: 8000 }).catch(() => {});
          await page.locator('[data-type="1"]').click();
        }
      }
      await page.waitForFunction(() => getRunningSegment() && getRunningSegment().type === 'workday', null, { timeout: 10000 });
      if (isNew) await page.evaluate(k => { const s = document.getElementById('jobKind'); s.value = k; s.dispatchEvent(new Event('change')); }, kind);
      const name = await page.evaluate(() => document.getElementById('client').value);
      if (name !== job) note('wrong-job-open', `wanted "${job}" got "${name}"`);
    });
    open = { type: 'workday', start: now, miles: 0, job };
    curJob = job;
  }
  async function leaveSite() {
    await step('stop work', async () => {
      await setGps(curPos, P.quirks.gpsJitterM);
      await flowBtn(/STOP WORK/).click();
      await page.waitForFunction(() => !getRunningSegment(), null, { timeout: 8000 });
    });
    closeOpen(now);
  }
  async function photos(n) {
    await step(`photos x${n}`, async () => {
      const before = await page.evaluate(() => photos.length);
      const files = Array.from({ length: n }, (_, i) => file(i));
      await choose(() => page.locator('.bottombar .bb-photo').click(), '#photoInput', files);
      await page.waitForFunction(b => photos.length >= b, before + n, { timeout: 60000 });
    });
    log.push({ type: 'photo', start: now, n, job: curJob });
  }
  async function receipt(amount, vendor, cat) {
    await step(`receipt $${amount}`, async () => {
      const before = await page.evaluate(() => receipts.length);
      await choose(() => page.locator('.bottombar .bb-btn', { hasText: 'Receipt' }).click(), '#receiptInput', [file(0)]);
      await page.waitForFunction(b => receipts.length > b, before, { timeout: 20000 });
      // a person types the amount into the receipt card, then taps out of the field
      const card = page.locator('#receiptGrid > *').last();
      await card.locator('input[type="number"]').fill(String(amount));
      await card.locator('input[type="number"]').blur();
      await card.locator('input[type="text"]').first().fill(vendor);
      await card.locator('input[type="text"]').first().blur();
      await card.locator('select').first().selectOption(cat);
      const got = await page.evaluate(() => receipts[receipts.length - 1].amount);
      if (String(got) !== String(amount)) note('receipt-typing', `typed ${amount}, app holds ${got}`);
    });
    log.push({ type: 'receipt', start: now, amount, job: curJob });
  }
  async function gas(amount) {
    S.gasAmt = amount;
    await step(`gas $${amount}`, async () => {
      const before = await page.evaluate(() => receipts.length);
      await choose(() => page.locator('.sv-tool', { hasText: 'Gas' }).click(), '#gasInput', [file(0)]);
      await page.waitForFunction(b => receipts.length > b, before, { timeout: 20000 });
    });
    log.push({ type: 'receipt', start: now, amount, job: curJob, gas: true });
  }
  async function writeNote(text) {
    await step('note', async () => {
      await page.locator('.sv-tool', { hasText: 'Write' }).click();
      if (await page.evaluate(() => document.getElementById('notesSection').classList.contains('hidden'))) {
        note('write-hid-notes', 'tapping Write closed the notes box; had to tap it again');
        await page.locator('.sv-tool', { hasText: 'Write' }).click();
      }
      const ta = page.locator('#notesSection textarea').last();
      await ta.fill(text); await ta.dispatchEvent('change'); await ta.dispatchEvent('input');
    });
  }
  async function endDay() {
    await step('done for the day', async () => {
      await setGps(curPos);
      if (!(await page.locator('#dayFlowBox .btn-endday').count())) {
        const dbg = await page.evaluate(() => ({ today: dayKey(), sent: localStorage.getItem('dayEndEmailDate'), running: !!getRunningSegment(), job: document.getElementById('client').value, segsToday: segments.filter(s => dayKey(s.startedAt) === dayKey()).length, segs: segments.length }));
        note('no-done-button', JSON.stringify(dbg));
        return;
      }
      await page.locator('#dayFlowBox .btn-endday').click();
      await page.waitForTimeout(600);
    });
    closeOpen(now);
  }
  async function saveTiming(label) {
    const r = await page.evaluate(async () => { const t = performance.now(); await autoSave(); const e = await navigator.storage.estimate(); return { ms: Math.round(performance.now() - t), mb: +(e.usage / 1048576).toFixed(1) }; }).catch(e => ({ err: e.message }));
    timings.push(Object.assign({ label }, r));
    return r;
  }

  // ----- the week -----
  const svcQueue = P.services.slice();
  let svcN = 0;
  const nextSvc = () => svcQueue.length ? svcQueue.shift() : P.services[(svcN++ * 3) % P.services.length]; // repeat customers once the list runs out
  const install = P.installs[0];
  const seenJobs = new Set();
  const doJob = async (name, kind, hours, opts = {}) => {
    const pos = sites[name] || offset(C, (R() - .5) * 20, (R() - .5) * 20);
    if (!opts.noDrive) await drive(pos, '-> ' + name);
    if (opts.lingerMin) await plus(opts.lingerMin);
    const wasNew = !seenJobs.has(name);
    await startWork(name, kind, wasNew);
    seenJobs.add(name);
    const n = P.quirks.photosPerDay ? Math.round(P.quirks.photosPerDay * hours / 8) : 2 + Math.floor(R() * 6);
    const chunks = Math.max(1, Math.round(hours / 2.5));
    for (let c = 0; c < chunks; c++) {
      await plus(Math.round(hours * 60 / chunks / 2));
      await photos(Math.max(1, Math.round(n / chunks)));
      if (R() < (P.quirks.receiptsHeavy ? 0.8 : 0.3)) {
        const v = P.quirks.receiptsHeavy ? ['Home Depot', 'Lowe\'s', 'Ace Hardware'][Math.floor(R() * 3)] : ['Ferguson', 'Johnstone Supply', 'Graybar', 'Platt'][Math.floor(R() * 4)];
        await receipt(+(15 + R() * 220).toFixed(2), v, 'parts');
      }
      if (c === 0 && (P.quirks.reloadMidWork === dayIdx || (P.quirks.reloadNewJob === dayIdx && wasNew && !reloadedNew && (reloadedNew = true)))) {
        if (process.env.RELOAD_WAIT) await page.waitForTimeout(+process.env.RELOAD_WAIT);
        const pBefore = await page.evaluate(() => photos.length);
        await step('app reload mid-work', async () => { await page.reload(); await page.waitForFunction(() => typeof db !== 'undefined' && db && getRunningSegment && getRunningSegment(), null, { timeout: 20000 }); });
        await page.waitForFunction(b => photos.length >= b, pBefore, { timeout: 8000 }).catch(() => {}); // give the journal recovery its moment
        const pAfter = await page.evaluate(() => photos.length).catch(() => -1);
        if (pAfter !== pBefore) note('lost-on-reload', `photos on this job before reload ${pBefore}, after ${pAfter}`);
        log.push({ type: 'event', start: now, what: 'reload' });
      }
      await plus(Math.round(hours * 60 / chunks / 2));
    }
    if (R() < 0.5) await writeNote(`${name}: ${['checked static pressure', 'pulled wire, waiting on inspection', 'replaced part, tested OK', 'customer wants quote for more'][Math.floor(R() * 4)]}`);
    if (!opts.forgetStop) await leaveSite();
  };

  let dayIdx = 0;
  let appClosed = false;
  let reloadedNew = false;
  for (dayIdx = 0; dayIdx < P.plan.length; dayIdx++) {
    const plan = P.plan[dayIdx];
    if (plan === 'off') continue;
    const startH = 6 + Math.floor(R() * 2), startM = Math.floor(R() * 50);
    await setTime(at(dayIdx, startH, startM));
    await setGps(curPos = home);
    if (appClosed) {
      // Opens the app next morning with work still running → it must ask, not guess
      await step('reopen app, answer "when did you stop?"', async () => {
        await page.goto(URL_APP);
        await page.waitForFunction(() => typeof db !== 'undefined' && db && typeof getRunningSegment === 'function', null, { timeout: 20000 });
        await page.waitForSelector('#stalePrompt [data-stale="last"]', { timeout: 15000 });
        await page.locator('#stalePrompt [data-stale="last"]').click();
        await page.waitForFunction(() => !getRunningSegment(), null, { timeout: 8000 });
        const n = await page.evaluate(() => segments.filter(s => s.autoStop).map(s => s.note).pop() || '');
        if (!/stop time set to when you last had the app open/.test(n)) note('stale-label-missing', n.slice(0, 160));
      });
      appClosed = false;
    }
    if (plan.includes('gpsoff')) { await ctx.clearPermissions(); log.push({ type: 'event', start: now, what: 'GPS permission off' }); }

    if (plan.startsWith('install')) {
      await doJob(install.name, 'install', 7 + R() * 2.5, { forgetStop: plan.includes('forgotOpen') });
      if (plan.includes('svc')) { const s = nextSvc(); if (s) await doJob(s[0], 'service', 1 + R() * 1.5); }
      if (plan.includes('forget')) {
        // forgets STOP WORK on the last job, pockets the phone, the app gets closed
        const s = nextSvc(); if (s) await doJob(s[0], 'service', 1.2, { forgetStop: true });
        log.push({ type: 'event', start: now, what: 'forgot STOP WORK, app closed' });
        closeOpen(now); // truth: he stopped when he walked off
        await page.goto('about:blank');
        appClosed = true;
        continue; // no drive home tap, no done-for-the-day
      }
      if (plan.includes('forgotOpen')) {
        // forgets STOP WORK, drives home with the app open on the dash
        await step('forgot stop, drive home with app open', async () => {
          await page.waitForFunction(() => getRunningSegment() && getRunningSegment().type === 'workday', null, { timeout: 5000 });
          const tick = async () => { await page.clock.fastForward(60000); now += 60000; await page.waitForTimeout(300); };
          const off = offset(curPos, 1.5, 1.5);                 // well outside the job-site pin
          await ctx.setGeolocation({ latitude: off.lat, longitude: off.lng, accuracy: 15 });
          await tick();
          if (open) { log.push(Object.assign({}, open, { end: now })); open = null; } // truth: work ended as he left
          open = { type: 'drive', start: now, miles: 0, job: '(trip)', gpsDrive: true };
          const mins = Math.max(8, Math.round(distMi(curPos, home) * 1.3 / P.mph * 60));
          await setTime(now + mins * 60000);
          await ctx.setGeolocation({ latitude: home.lat, longitude: home.lng, accuracy: 10 });
          curPos = home;
          await tick();                                         // app sees him home
          if (open) { log.push(Object.assign({}, open, { end: now })); open = null; }
          const shown = await page.waitForSelector('#homePrompt', { timeout: 5000 }).catch(() => null);
          if (!shown) note('no-home-prompt', 'back at the start spot with work running, no prompt');
          for (let i = 0; i < 16; i++) await tick();             // nobody answers for 15+ minutes
          await page.waitForFunction(() => !getRunningSegment(), null, { timeout: 8000 });
          const notes = await page.evaluate(() => segments.filter(s => s.autoStop).map(s => s.note));
          if (!notes.some(n => /Auto-stopped/.test(n))) note('auto-label-missing', JSON.stringify(notes).slice(0, 200));
          log.push({ type: 'event', start: now, what: 'auto-stopped at base: ' + notes.join(' | ').slice(0, 220) });
        });
        await saveTiming('end of day ' + (dayIdx + 1));
        continue; // the app closed the day out itself
      }
    } else {
      const calls = plan.includes('overnight') ? 2 : 3 + Math.floor(R() * 2);
      for (let k = 0; k < calls; k++) { const s = nextSvc(); if (!s) break; await doJob(s[0], 'service', 0.8 + R() * 1.8, { lingerMin: k === 1 ? 18 : 0 }); }
    }
    if (dayIdx === 2 || dayIdx === 4) await gas(+(48 + R() * 40).toFixed(2));
    await drive(home, '-> home');
    await endDay();
    if (plan.includes('gpsoff')) { await ctx.grantPermissions(['geolocation']); }

    if (plan.includes('overnight')) {
      // back out at 21:40 for an overnight install, crosses midnight
      await setTime(at(dayIdx, 21, 40));
      await doJob(install.name, 'install', 5.5);
      await drive(home, '-> home after overnight');
      await endDay();
    }
    if (plan.includes('lateDST')) {
      // Saturday-night emergency that runs across the clocks falling back
      await setTime(at(dayIdx, 22, 50));
      await doJob('Emergency - burst pipe, Hyde Park', 'service', 3.75);
      await drive(home, '-> home after emergency');
      await endDay();
    }
    await saveTiming('end of day ' + (dayIdx + 1));
    const snap = await page.evaluate(async () => (await dbGetAllDrafts()).map(d => [d.name, d.state && d.state.jobDone, d.state && d.state.dateEnd])).catch(() => []);
    log.push({ type: 'event', start: now, what: 'jobs tonight: ' + JSON.stringify(snap) });
    await page.screenshot({ path: path.join(OUT, `${P.id}-day${dayIdx + 1}.png`) }).catch(() => {});
  }
  closeOpen(now); // anything still running at week's end

  // ----- audit -----
  await setTime(now + 30 * 60000);
  const app = await page.evaluate(async () => {
    await autoSave();
    await loadMasterLogData();
    const ev = masterLogEvents.map(e => {
      const b = (e.type === 'drive' || e.type === 'workday') ? segTimeBreakdown(e._raw) : null;
      return { type: e.type, start: e.startedAt, end: e.endedAt, job: e.jobName, miles: e.miles, amount: e.amount, hours: e.hours, b };
    });
    const drafts = (await dbGetAllDrafts()).map(d => ({ name: d.name, kind: d.state && d.state.jobKind, done: d.state && d.state.jobDone, dateStart: d.state && d.state.dateStart, dateEnd: d.state && d.state.dateEnd, photos: (d.state && d.state.photos || []).length, receipts: (d.state && d.state.receipts || []).length, bytes: JSON.stringify(d).length }));
    const jobs = (await dbGetAll()).map(j => ({ name: j.client, done: true, dateStart: j.dateStart || (j.rawState && j.rawState.dateStart), dateEnd: j.dateEnd || (j.rawState && j.rawState.dateEnd), photos: (j.rawState && j.rawState.photos || []).length }));
    await refreshWeekAgg(true); await refreshWeekStrip();
    return { ev, drafts, jobs, week: __weekAgg, strip: __weekTotals };
  }).catch(e => ({ err: e.message }));

  // reports + exports
  const outputs = {};
  for (const fn of ['generateReport', 'generateSummary', 'generateDailyReport', 'generateWeeklyDigest', 'exportMasterLogCSV', 'freezeCopy']) {
    const t0 = Date.now();
    const dl = page.waitForEvent('download', { timeout: 15000 }).catch(() => null);
    const r = await page.evaluate(async f => {
      const before = window.__blobs.length;
      try { if (f === 'exportMasterLogCSV') { await openMasterLog(); } await window[f](); } catch (e) { return { err: String(e.message || e).slice(0, 160) }; }
      await new Promise(r => setTimeout(r, 400));
      const nb = window.__blobs.slice(before);
      return { blobs: nb.map(b => ({ type: b.type, size: b.size })) };
    }, fn).catch(e => ({ err: e.message.slice(0, 160) }));
    const d = (r.blobs && r.blobs.length) ? null : await dl;
    let saved = null;
    if (d) { saved = path.join(OUT, `${P.id}-${d.suggestedFilename()}`); await d.saveAs(saved).catch(() => {}); }
    outputs[fn] = Object.assign(r, { ms: Date.now() - t0, download: saved ? path.basename(saved) : null });
    await page.evaluate(() => document.querySelectorAll('#masterLogModal').forEach(m => m.style.display = 'none')).catch(() => {});
  }
  await page.screenshot({ path: path.join(OUT, `${P.id}-final.png`), fullPage: false }).catch(() => {});
  await ctx.close();
  return { P, tz, log, app, issues, timings, consoleErrs, dialogs, outputs, photoBytes };
}

// ---------- compare truth vs app ----------
function audit(r) {
  const { tz, log, app } = r;
  const found = [];
  if (app.err) return [{ sev: 'BREAK', msg: 'audit read failed: ' + app.err }];
  const truthSegs = log.filter(x => x.type === 'drive' || x.type === 'workday');
  const appSegs = app.ev.filter(e => e.type === 'drive' || e.type === 'workday');
  const H = ms => +(ms / 3600000).toFixed(2);
  // per-day totals
  const days = {};
  const bump = (k, f, v) => { days[k] = days[k] || { tDrive: 0, tWork: 0, tMiles: 0, tSpent: 0, aDrive: 0, aWork: 0, aUnacc: 0, aMiles: 0, aSpent: 0, aRaw: 0 }; days[k][f] += v; };
  truthSegs.forEach(s => { const k = localDay(tz, s.start); bump(k, s.type === 'drive' ? 'tDrive' : 'tWork', s.end - s.start); if (s.type === 'drive') bump(k, 'tMiles', s.miles); });
  log.filter(x => x.type === 'receipt').forEach(x => bump(localDay(tz, x.start), 'tSpent', x.amount));
  appSegs.forEach(e => { const k = localDay(tz, e.start); bump(k, 'aDrive', e.b.driveMs); bump(k, 'aWork', e.b.workMs); bump(k, 'aUnacc', e.b.unaccountedMs); bump(k, 'aMiles', e.miles); bump(k, 'aRaw', (e.end || e.start) - e.start); });
  app.ev.filter(e => e.type === 'receipt').forEach(e => bump(localDay(tz, e.start), 'aSpent', e.amount));
  Object.entries(days).sort().forEach(([k, d]) => {
    if (Math.abs(d.tWork - d.aWork) > 120000) found.push({ sev: 'WRONG', msg: `${k}: work hours truth ${H(d.tWork)} vs app ${H(d.aWork)}` });
    if (Math.abs(d.tDrive - d.aDrive) > 120000) found.push({ sev: d.aUnacc > 0 ? 'CUT' : 'WRONG', msg: `${k}: drive hours truth ${H(d.tDrive)} vs app counted ${H(d.aDrive)}${d.aUnacc ? ` (${H(d.aUnacc)} h moved to "unaccounted")` : ''}` });
    if (Math.abs(d.tMiles - d.aMiles) > 0.5) found.push({ sev: 'WRONG', msg: `${k}: miles truth ${d.tMiles} vs app ${d.aMiles}` });
    if (Math.abs(d.tSpent - d.aSpent) > 0.01) found.push({ sev: 'WRONG', msg: `${k}: spent truth $${d.tSpent.toFixed(2)} vs app $${d.aSpent.toFixed(2)}` });
  });
  if (truthSegs.length !== appSegs.length) found.push({ sev: 'WRONG', msg: `segment count truth ${truthSegs.length} vs app ${appSegs.length}` });
  // jobs
  const jobsTruth = [...new Set(truthSegs.filter(s => s.type === 'workday').map(s => s.job))];
  const appJobs = app.drafts.concat(app.jobs);
  jobsTruth.forEach(j => { const n = appJobs.filter(a => a.name === j).length; if (n !== 1) found.push({ sev: n ? 'WRONG' : 'BREAK', msg: `job "${j}" appears ${n} times in the app` }); });
  const TRAVEL = 'Travel — no job picked'; // the named bucket for drives before any job is picked
  appJobs.filter(a => !jobsTruth.includes(a.name) && a.name !== TRAVEL).forEach(a => found.push({ sev: 'JUNK', msg: `extra job in app: "${a.name || '(blank)'}" (${a.photos} photos)` }));
  if (appJobs.some(a => a.name === TRAVEL)) found.push({ sev: 'INFO', msg: 'pre-job drives saved under "' + TRAVEL + '"' });
  // end dates: closed services should end on the local day of their last work
  appJobs.filter(a => a.dateEnd).forEach(a => {
    const last = truthSegs.filter(s => s.job === a.name).sort((x, y) => y.end - x.end)[0];
    if (last && localDay(tz, last.end) !== a.dateEnd && localDay(tz, last.start) !== a.dateEnd) found.push({ sev: 'WRONG', msg: `"${a.name}" end date ${a.dateEnd} but last work was ${localDay(tz, last.end)}` });
  });
  // photos
  const tPhotos = log.filter(x => x.type === 'photo').reduce((a, x) => a + x.n, 0);
  const aPhotos = appJobs.reduce((a, j) => a + j.photos, 0);
  if (tPhotos !== aPhotos) found.push({ sev: 'WRONG', msg: `photos taken ${tPhotos} vs saved ${aPhotos}` });
  // reports
  Object.entries(r.outputs).forEach(([f, o]) => {
    if (o.err) found.push({ sev: 'BREAK', msg: `${f} threw: ${o.err}` });
    else if (!(o.blobs && o.blobs.length) && !o.download) found.push({ sev: 'BREAK', msg: `${f} produced nothing` });
    if (o.ms > 20000) found.push({ sev: 'SLOW', msg: `${f} took ${(o.ms / 1000).toFixed(1)}s` });
  });
  r.timings.filter(t => t.ms > 8000 && !/^photos/.test(t.label) && !/^end of day/.test(t.label)).forEach(t => found.push({ sev: 'SLOW', msg: `${t.label} took ${(t.ms / 1000).toFixed(1)}s` }));
  r.timings.filter(t => /^end of day/.test(t.label)).forEach(t => { if (t.ms > 1500) found.push({ sev: 'SLOW', msg: `save at ${t.label}: ${(t.ms / 1000).toFixed(1)}s, storage ${t.mb} MB` }); });
  r.issues.forEach(i => found.push({ sev: i.kind === 'step-failed' ? 'BREAK' : 'ODD', msg: `${i.kind}: ${i.msg}` }));
  [...new Set(r.consoleErrs)].forEach(e => found.push({ sev: 'ERROR', msg: e }));
  return found.concat([{ sev: 'INFO', msg: 'days: ' + JSON.stringify(Object.fromEntries(Object.entries(days).sort().map(([k, d]) => [k, { work: H(d.aWork), drive: H(d.aDrive), unacc: H(d.aUnacc), mi: d.aMiles, $: +d.aSpent.toFixed(2) }]))) }]);
}

(async () => {
  const browser = await chromium.launch({ executablePath: EXE, headless: true });
  const all = [];
  const one = async P => {
    const t0 = Date.now();
    let r;
    try { r = await runPersona(browser, P); } catch (e) { console.log(`\n=== ${P.id} CRASHED: ` + e.stack); return; }
    const f = audit(r);
    const lines = [`\n=== ${P.id} (${P.who}) ${((Date.now() - t0) / 1000).toFixed(0)}s`];
    f.forEach(x => lines.push(`  [${x.sev}] ${x.msg}`));
    lines.push('  timings: ' + r.timings.filter(x => /^end of day/.test(x.label)).map(x => `${x.label.replace('end of day ', 'd')}: save ${x.ms}ms ${x.mb}MB`).join(' | '));
    console.log(lines.join('\n'));
    all.push({ id: P.id, who: P.who, findings: f, timings: r.timings, dialogs: r.dialogs.length, outputs: r.outputs, log: r.log.length });
    fs.writeFileSync(path.join(OUT, `${P.id}.json`), JSON.stringify({ findings: f, log: r.log, timings: r.timings, outputs: r.outputs, issues: r.issues, dialogs: r.dialogs, app: r.app && { drafts: r.app.drafts, jobs: r.app.jobs, week: r.app.week } }, null, 1));
  };
  const list = PERSONAS.filter(p => !ONLY || ONLY.split(',').includes(p.id));
  for (let i = 0; i < list.length; i += 3) await Promise.all(list.slice(i, i + 3).map(one)); // three techs at a time
  fs.writeFileSync(path.join(OUT, 'summary.json'), JSON.stringify(all, null, 1));
  await browser.close();
})();
