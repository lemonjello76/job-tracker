// Drive & Work Log — the long-haul stress test.
// One traveling tech based in Las Vegas, a full month (Sun Feb 21 – Tue Mar 23, 2027):
// ~22 workdays, 2-4 jobs a day, truck trips to Bakersfield, Phoenix and Tucson, a weekend
// call-back, an overnight job across the spring-forward clock change (Sun Mar 14, 2 a.m.),
// Arizona (no daylight saving) on both sides of it, and TWO DEVICES: the phone's backup is
// restored onto the Surface, corrections are made there, and the Surface's backup is
// restored back onto the phone. Tracks whether taps, saves, reports and backups slow down
// as a month of photos piles up. Same safety as the other tests: a copy of the app with
// Firebase and EmailJS removed, every outside host blocked.
//
// Run (from ci/stress): node stress-month.js     (see stress-week.js for the safe-copy steps)
const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');

const URL_APP = process.env.APP_URL || 'http://localhost:8765/';
const EXE = process.env.CHROME || (process.env.LOCALAPPDATA + '/ms-playwright/chromium-1228/chrome-win64/chrome.exe');
const OUT = path.join(__dirname, 'out-month');
fs.mkdirSync(OUT, { recursive: true });
const ONLY = process.argv[2] || '';

function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
function zonedEpoch(tz, y, mo, d, h, mi) {
  const target = Date.UTC(y, mo - 1, d, h, mi);
  let g = target;
  const f = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  for (let i = 0; i < 4; i++) {
    const p = Object.fromEntries(f.formatToParts(new Date(g)).map(x => [x.type, x.value]));
    g -= (Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute) - target);
  }
  return g;
}
const localDay = (tz, ms) => new Date(ms).toLocaleDateString('en-CA', { timeZone: tz });
const localTime = (tz, ms) => new Date(ms).toLocaleString('en-US', { timeZone: tz, weekday: 'short', hour: 'numeric', minute: '2-digit' });

const CITIES = {
  Nashville:     { lat: 36.1627, lng: -86.7816,  st: 'TN', tz: 'America/Chicago' },
  Denver:        { lat: 39.7392, lng: -104.9903, st: 'CO', tz: 'America/Denver' },
  Phoenix:       { lat: 33.4484, lng: -112.0740, st: 'AZ', tz: 'America/Phoenix' },
  Charlotte:     { lat: 35.2271, lng: -80.8431,  st: 'NC', tz: 'America/New_York' },
  Minneapolis:   { lat: 44.9778, lng: -93.2650,  st: 'MN', tz: 'America/Chicago' },
  Houston:       { lat: 29.7604, lng: -95.3698,  st: 'TX', tz: 'America/Chicago' },
  Seattle:       { lat: 47.6062, lng: -122.3321, st: 'WA', tz: 'America/Los_Angeles' },
  Chicago:       { lat: 41.8781, lng: -87.6298,  st: 'IL', tz: 'America/Chicago' },
  'New Orleans': { lat: 29.9511, lng: -90.0715,  st: 'LA', tz: 'America/Chicago' },
  'Las Vegas':   { lat: 36.1699, lng: -115.1398, st: 'NV', tz: 'America/Los_Angeles' },
  Bakersfield:   { lat: 35.3733, lng: -119.0187, st: 'CA', tz: 'America/Los_Angeles' },
  Tucson:        { lat: 32.2226, lng: -110.9747, st: 'AZ', tz: 'America/Phoenix' },
};
const offset = (c, dxKm, dyKm) => ({ lat: c.lat + dyKm / 111, lng: c.lng + dxKm / (111 * Math.cos(c.lat * Math.PI / 180)) });
const P_ = (city, dx, dy) => Object.assign(offset(CITIES[city], dx, dy), { city });
function distMi(a, b) {
  const R = 3958.8, toR = x => x * Math.PI / 180;
  const dLa = toR(b.lat - a.lat), dLo = toR(b.lng - a.lng);
  const h = Math.sin(dLa / 2) ** 2 + Math.cos(toR(a.lat)) * Math.cos(toR(b.lat)) * Math.sin(dLo / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
const nearestCity = (lat, lng) => Object.entries(CITIES).sort((a, b) => distMi({ lat, lng }, a[1]) - distMi({ lat, lng }, b[1]))[0];

// ---------- the week, tech by tech (day 0 = Mon Nov 23; 3 = Thanksgiving; 6 = Sunday) ----------
// ---------- one month, one traveling tech (day 0 = Sun Feb 21 2027; day 21 = Sun Mar 14, clocks spring forward at 2 a.m.) ----------
const PERSONAS = [
  { id: 'lv-month', who: 'Traveling tech, Las Vegas, one month + S24 and Surface', city: 'Las Vegas', seed: 777, start: [2027, 2, 21], run: async A => {
    const home = A.home;
    const LV = (dx, dy) => P_('Las Vegas', dx, dy);
    const HEN = 'Henderson Cadence Lot 88 - new build', hen = LV(12, -14);
    const BAK = 'Bakersfield restaurant patio - install', bak = P_('Bakersfield', 2, 1), bakHotel = P_('Bakersfield', 0, 3);
    const PHX = 'Phoenix office park - patio system', phx = P_('Phoenix', 6, 4), phxHotel = P_('Phoenix', 3, 2);
    const TUC = 'Tucson resort pool deck - install', tuc = P_('Tucson', 5, -3), tucHotel = P_('Tucson', 2, 0);
    const SVC = [['Summerlin res - pump check', LV(-14, 4)], ['Spring Valley res - nozzle clog', LV(-8, -6)], ['Green Valley cafe - patio fans', LV(8, -10)],
                 ['North LV res - leak', LV(2, 12)], ['Enterprise res - timer', LV(-4, -16)], ['Downtown bar - patio mist', LV(0.5, 1)], ['Paradise res - new zone quote', LV(4, -3)]];
    let k = 0;
    const svc = async (n, hours) => { for (let i = 0; i < n; i++) { const [name, at] = SVC[k++ % SVC.length]; await A.drive(at); await A.work(name, 'service', hours || 1.2); } };
    const homeDay = async (i, fn) => { await A.day(i, 6, 30); await fn(); await A.drive(home); await A.done(); };
    const trip = async (i, dest, miles, mins) => { await A.day(i, 5, 0); await A.drive(dest, { miles, mins }); };

    // week 1 — at home: Henderson new build + service calls
    await homeDay(1, async () => { await A.drive(hen); await A.work(HEN, 'install', 6); await svc(1); });
    await homeDay(2, async () => svc(3));
    await homeDay(3, async () => { await A.drive(hen); await A.work(HEN, 'install', 8); });
    await homeDay(4, async () => { await A.drive(hen); await A.work(HEN, 'install', 5); await svc(1); });
    await homeDay(5, async () => svc(2, 1.5));
    await A.perf('end of week 1');
    await A.day(6, 19, 40); await svc(1, 1); await A.drive(home); await A.done(); // Saturday call-back

    // week 2 — Bakersfield by truck
    await trip(8, bak, 285, 280); await A.work(BAK, 'install', 3); await A.drive(bakHotel); await A.done();
    await A.day(9, 6, 15); await A.drive(bak); await A.work(BAK, 'install', 9); await A.drive(bakHotel); await A.done();
    // DEVICE 1: phone backup restored onto the Surface
    {
      const f = await A.backupFrom(A.page, 'phone-mar2');
      const surface = await A.newDevice('America/Los_Angeles');
      const msg = await A.restoreInto(surface, f);
      const c = async pg => pg.evaluate(async () => { const d = await dbGetAllDrafts(); return { jobs: d.length, segs: d.reduce((n, x) => n + ((x.state && x.state.segments) || []).length, 0), photos: d.reduce((n, x) => n + ((x.state && x.state.photos) || []).length, 0) }; });
      const a = await c(A.page), b = await c(surface);
      A.devices['1. phone backup → Surface'] = { ok: JSON.stringify(a) === JSON.stringify(b), msg: `phone ${JSON.stringify(a)} | Surface after restore ${JSON.stringify(b)} | ${msg}` };
      A.surface = surface;
    }
    await A.day(10, 6, 15); await A.drive(bak); await A.work(BAK, 'install', 4); await A.rain(60); await A.work(BAK, 'install', 4); await A.drive(bakHotel); await A.done();
    await A.day(11, 6, 15); await A.drive(bak); await A.work(BAK, 'install', 8); await A.drive(bakHotel); await A.done();
    await A.day(12, 6, 15); await A.drive(bak); await A.work(BAK, 'install', 4); await A.drive(home, { miles: 285, mins: 285 }); await A.done();
    await A.perf('end of week 2');
    await A.day(14, 8, 10); await svc(1, 1.5); await A.drive(home); await A.done(); // Sunday emergency

    // week 3 — Phoenix by truck (Arizona: an hour ahead of Las Vegas until Mar 14)
    await trip(15, phx, 300, 300); await A.setTz('America/Phoenix'); await A.work(PHX, 'install', 2); await A.drive(phxHotel); await A.done();
    await A.day(16, 6, 0); await A.drive(phx); await A.work(PHX, 'install', 9); await A.drive(phxHotel); await A.done();
    await A.day(17, 6, 0); await A.drive(phx); await A.work(PHX, 'install', 9); await A.drive(phxHotel); await A.done();
    // DEVICE 2: corrections made on the Surface (paperwork night at the hotel)
    {
      await A.surface.clock.setSystemTime(A.now);
      const r = await A.surface.evaluate(async J => {
        const d = (await dbGetAllDrafts()).find(x => x.name === J);
        if (!d) return { err: 'job not on Surface' };
        await switchToDraft(d.id);
        const s = segments.find(x => x.type === 'drive');
        s.manualMiles = 23; s.note = (s.note ? s.note + ' · ' : '') + 'Corrected on Surface: odometer photo was blurry';
        notes.push({ title: 'From the Surface', text: 'Customer asked for a quote on a second zone' });
        renderNotes(); renderSegments();
        await autoSave();
        return { jobId: d.id, segId: s.id };
      }, HEN);
      A.devices['2. corrections on the Surface'] = { ok: !r.err, msg: r.err || `Henderson drive set to 23 mi with a note, plus a new note (job ${r.jobId})` };
      A.surfaceEdit = r;
    }
    await A.day(18, 6, 0); await A.drive(phx); await A.work(PHX, 'install', 8); await A.drive(phxHotel); await A.done();
    await A.day(19, 6, 0); await A.drive(phx); await A.work(PHX, 'install', 3); await A.drive(home, { miles: 300, mins: 300 }); await A.setTz('America/Los_Angeles'); await A.done();
    await A.perf('end of week 3');

    // Saturday night Mar 13: overnight emergency across the spring-forward change (2 a.m. → 3 a.m., Mar 14)
    await A.day(20, 21, 50); await A.drive(LV(-10, 8)); await A.work('Summerlin res - "emergency" pump down overnight', 'service', 5); await A.drive(home); await A.done();

    // week 4 — Tucson by truck (now Las Vegas and Arizona show the same clock time)
    await trip(22, tuc, 410, 400); await A.setTz('America/Phoenix'); await A.work(TUC, 'install', 1); await A.drive(tucHotel); await A.done();
    await A.day(23, 6, 0); await A.drive(tuc); await A.work(TUC, 'install', 9); await A.drive(tucHotel); await A.done();
    await A.day(24, 6, 0); await A.drive(tuc); await A.work(TUC, 'install', 9); await A.drive(tucHotel); await A.done();
    // DEVICE 3: Surface backup restored back onto the phone — do the Surface corrections come across?
    {
      await A.surface.clock.setSystemTime(A.now);
      const f = await A.backupFrom(A.surface, 'surface-mar17');
      const before = await A.page.evaluate(async () => (await dbGetAllDrafts()).reduce((n, x) => n + ((x.state && x.state.segments) || []).length, 0));
      const msg = await A.restoreInto(A.page, f);
      const chk = await A.page.evaluate(async e => {
        const d = (await dbGetAllDrafts()).find(x => x.id === e.jobId);
        const s = d && (d.state.segments || []).find(x => x.id === e.segId);
        const n = d && (d.state.notes || []).some(x => /second zone/.test(x.text || ''));
        const segs = (await dbGetAllDrafts()).reduce((k, x) => k + ((x.state && x.state.segments) || []).length, 0);
        return { miles: s && s.manualMiles, note: !!(s && /Corrected on Surface/.test(s.note || '')), newNote: !!n, segs };
      }, A.surfaceEdit);
      const ok = chk.miles == 23 && chk.note && chk.newNote && chk.segs >= before;
      A.devices['3. Surface backup → phone'] = { ok, msg: `Surface fix on phone after restore: miles ${chk.miles}, drive note ${chk.note}, new note ${chk.newNote}; phone entries ${before} → ${chk.segs} | ${msg}` };
    }
    await A.day(25, 6, 0); await A.drive(tuc); await A.work(TUC, 'install', 6); await A.drive(home, { miles: 410, mins: 400 }); await A.setTz('America/Los_Angeles'); await A.done();
    await homeDay(26, async () => svc(2, 1.5));
    await A.perf('end of week 4');
    await homeDay(29, async () => svc(3));
    await A.perf('end of month');
  } },
];

async function runPersona(browser, P) {
  const R = rng(P.seed);
  const homeC = CITIES[P.city];
  let tz = homeC.tz;
  const homeTz = homeC.tz;
  const log = [], issues = [], timings = [], perfLog = [], extraCtx = [], devices = {};
  const note = (kind, msg) => issues.push({ kind, msg });
  const home = Object.assign(offset(homeC, (R() - .5) * 16, (R() - .5) * 16), { city: P.city });

  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, // time zone is set per page below so it can change in flight
    geolocation: { latitude: home.lat, longitude: home.lng, accuracy: 12 }, permissions: ['geolocation'], acceptDownloads: true,
  });
  let gpsNow = home;
  await ctx.route(u => !u.href.startsWith(URL_APP), async route => {
    const u = route.request().url();
    if (u.includes('bigdatacloud')) {
      const m = /latitude=([-\d.]+)&longitude=([-\d.]+)/.exec(u);
      const [name, c] = m ? nearestCity(+m[1], +m[2]) : [P.city, homeC];
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ city: name, locality: name, principalSubdivisionCode: 'US-' + c.st }) });
    }
    if (u.includes('overpass')) return route.fulfill({ contentType: 'application/json', body: '{"elements":[]}' });
    return route.abort();
  });
  await ctx.addInitScript(() => { const g = navigator.geolocation; if (!g) return; const orig = g.getCurrentPosition.bind(g); g.getCurrentPosition = (ok, bad, o) => orig(ok, bad, Object.assign({}, o, { maximumAge: 0 })); });
  await ctx.addInitScript(() => {
    window.__blobs = [];
    const orig = URL.createObjectURL;
    URL.createObjectURL = function (b) { try { window.__blobs.push({ type: b.type, size: b.size }); } catch (e) {} return orig.call(URL, b); };
    window.open = () => ({ document: { write() {}, close() {} }, focus() {}, close() {} });
    try { localStorage.setItem('fieldlog_helpSeen', '1'); } catch (e) {}
  });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Emulation.setTimezoneOverride', { timezoneId: tz });
  const consoleErrs = [];
  page.on('pageerror', e => consoleErrs.push('PAGEERROR ' + String(e.message).slice(0, 200)));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|ERR_FAILED|net::|bad HTTP response code/.test(m.text())) consoleErrs.push(m.text().slice(0, 200)); });

  // car odometers: the truck, and whatever rental is in hand
  const S = { car: 'truck', odo: { truck: 40000 + Math.floor(R() * 60000), rental: 0 }, jobName: '', intended: '', odoPrompts: 0, odoWaiters: [] };
  const dialogs = [];
  page.on('dialog', async d => {
    const m = d.message();
    dialogs.push({ t: d.type(), m: m.slice(0, 90) });
    try {
      if (d.type() === 'confirm' && /odometer/i.test(m)) return d.accept();
      if (d.type() === 'confirm' && /Start work here/i.test(m)) return (S.intended && m.includes(S.intended.slice(0, 20))) ? d.accept() : d.dismiss();
      if (d.type() === 'confirm' && /Reopen this saved job/i.test(m)) return d.accept();
      if (d.type() === 'confirm' && /Did you fly during it|Looks like you flew/i.test(m)) { note('flight-question', m.split(String.fromCharCode(10))[0].slice(0, 120)); return S.flew ? d.accept() : d.dismiss(); }
      if (d.type() === 'prompt' && /odometer reading/i.test(m)) { S.odoPrompts++; await d.accept(String(S.odo[S.car])); S.odoWaiters.splice(0).forEach(f => f()); return; }
      if (d.type() === 'prompt' && /Job name/i.test(m)) return d.accept(S.jobName);
      if (d.type() === 'prompt' && /How many miles did you drive/i.test(m)) { note('two-vehicle-question', m.slice(0, 120)); return d.accept(String(S.answerMiles || '')); }
      if (d.type() === 'alert' && /Freeze copy saved/.test(m)) return d.accept();
      if (d.type() === 'alert') { note('alert', m.slice(0, 160)); return d.accept(); }
      if (d.type() === 'confirm') { note('unexpected-confirm', m.slice(0, 160)); return d.accept(); }
      note('unexpected-prompt', m.slice(0, 160)); return d.dismiss();
    } catch (e) {}
  });

  // a few real-size phone photos
  await page.goto('about:blank');
  const pool = await page.evaluate(async () => {
    const out = [];
    for (let k = 0; k < 2; k++) {
      const c = document.createElement('canvas'); c.width = 4032; c.height = 3024;
      const g = c.getContext('2d');
      g.fillStyle = `hsl(${k * 90},30%,40%)`; g.fillRect(0, 0, c.width, c.height);
      for (let i = 0; i < 700; i++) { g.fillStyle = `hsl(${Math.random() * 360},45%,${20 + Math.random() * 60}%)`; g.fillRect(Math.random() * c.width, Math.random() * c.height, 30 + Math.random() * 400, 30 + Math.random() * 400); }
      const b = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.88));
      out.push(await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(String(fr.result).split(',')[1]); fr.readAsDataURL(b); }));
    }
    return out;
  });
  const imgs = pool.map(b64 => Buffer.from(b64, 'base64'));
  const file = i => ({ name: `IMG_${2000 + i}.jpg`, mimeType: 'image/jpeg', buffer: imgs[i % imgs.length] });

  // Mon Nov 23 2026 is day 0
  const [SY, SM, SD] = P.start;
  const dayDate = i => { const d = new Date(Date.UTC(SY, SM - 1, SD + i)); return [d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()]; };
  let now = zonedEpoch(tz, SY, SM, SD, 4, 0);
  await page.clock.install({ time: now });
  await page.goto(URL_APP);
  await page.waitForFunction(() => typeof getRunningSegment === 'function' && typeof db !== 'undefined' && db, null, { timeout: 20000 });
  await page.waitForTimeout(800);

  const setTime = async ms => { if (ms < now) ms = now + 60000; now = ms; await page.clock.setSystemTime(now); };
  const plus = async min => setTime(now + min * 60000);
  const setGps = async p => { gpsNow = p; await ctx.setGeolocation({ latitude: p.lat, longitude: p.lng, accuracy: 10 + R() * 15 }); };
  const setTz = async t => { tz = t; await cdp.send('Emulation.setTimezoneOverride', { timezoneId: '' }); await cdp.send('Emulation.setTimezoneOverride', { timezoneId: t }); };
  const flowBtn = re => page.locator('#dayFlowBox button').filter({ hasText: re }).first();
  const step = async (label, fn) => {
    const t0 = Date.now();
    try { await fn(); } catch (e) {
      note('step-failed', `${label} @ ${localTime(tz, now)}: ${String(e.message).split('\n')[0].slice(0, 180)}`);
      console.log(`  [${P.id}] FAIL ${label} @ ${localTime(tz, now)}: ${String(e.message).split('\n')[0].slice(0, 160)}`);
      await page.screenshot({ path: path.join(OUT, `${P.id}-fail-${issues.length}.png`) }).catch(() => {});
      await page.evaluate(() => document.querySelectorAll('#dayPickOverlay, [style*="z-index:10060"]').forEach(o => o.remove())).catch(() => {});
    }
    timings.push({ label, ms: Date.now() - t0 });
  };
  const waitOdo = n => new Promise(res => { if (S.odoPrompts >= n) return res(); S.odoWaiters.push(res); setTimeout(res, 15000); });
  const choose = async (trigger, inputSel, files) => {
    const fc = page.waitForEvent('filechooser', { timeout: 2500 }).catch(() => null);
    await trigger();
    const ch = await fc;
    if (ch) await ch.setFiles(files); else await page.setInputFiles(inputSel, files);
  };

  // ground truth
  let open = null;
  const closeOpen = end => { if (open) { log.push(Object.assign({}, open, { end })); open = null; } };
  let curPos = home, curJob = '';
  const seen = new Set();

  const beat = async () => { await page.waitForFunction(() => !document.body.classList.contains('flow-busy'), null, { timeout: 30000 }).catch(() => {}); await plus(0.02); }; // a person waits for dimmed buttons to light back up; // ~1.2 s between taps, like a thumb; the app ignores taps inside 0.7 s as double-taps
  const tap = async (loc, dbl) => { await beat(); return dbl ? loc.dblclick() : loc.click(); }; // a gloved double-tap lands twice on the same spot
  const tapStartDrive = async (label, dbl) => step('start drive ' + label + (dbl ? ' (double-tap)' : ''), async () => {
    if (await page.locator('#dayFlowBox button').filter({ hasText: /STOP WORK/ }).count()) { // a stale work entry blocks it
      note('stop-before-drive', 'had to tap STOP WORK before START DRIVE');
      await beat(); await flowBtn(/STOP WORK/).click(); await page.waitForFunction(() => !getRunningSegment(), null, { timeout: 8000 });
    }
    await setGps(curPos);
    const before = S.odoPrompts;
    const fc = page.waitForEvent('filechooser', { timeout: 4000 }).catch(() => null);
    await tap(flowBtn(/START DRIVE/), dbl);
    const ch = await fc; if (ch) await ch.setFiles(file(1)); else await page.setInputFiles('#segOdoInput', file(1));
    await waitOdo(before + 1);
    await page.waitForFunction(() => getRunningSegment() && getRunningSegment().type === 'drive', null, { timeout: 8000 });
  });
  const tapArrive = async (label, dbl) => step('arrive ' + label + (dbl ? ' (double-tap)' : ''), async () => {
    const before = S.odoPrompts;
    const fc = page.waitForEvent('filechooser', { timeout: 4000 }).catch(() => null);
    await tap(flowBtn(/I'VE ARRIVED/), dbl);
    if (dbl) { await page.waitForTimeout(800); await page.evaluate(() => document.querySelectorAll('#dayPickOverlay').forEach(o => o.remove())); }
    const ch = await fc; if (ch) await ch.setFiles(file(0)); else await page.setInputFiles('#segOdoInput', file(0));
    await waitOdo(before + 1);
    await page.waitForFunction(() => !getRunningSegment(), null, { timeout: 8000 });
  });

  const A = {
    home,
    async day(i, hh, mm) {
      const [y, mo, d] = dayDate(i);
      await setTime(zonedEpoch(tz, y, mo, d, hh, mm));
      await page.evaluate(() => { if (typeof homeWatchTick === 'function') homeWatchTick(); }).catch(() => {});
      await page.waitForTimeout(300);
      // a "when did you stop?" card from a bad prior night would be answered by a person
      if (await page.locator('#stalePrompt').count()) note('stale-prompt-seen', 'asked when the clock stopped on ' + localTime(tz, now));
    },
    async drive(to, o = {}) {
      const miles = o.miles || Math.max(1, Math.round(distMi(curPos, to) * 1.3));
      const mins = o.mins || Math.max(6, Math.round(miles / 28 * 60 * (0.85 + R() * 0.3)));
      if (open && open.type === 'workday') closeOpen(now);
      await tapStartDrive('-> ' + (to.label || to.city), o.dblStart);
      open = { type: 'drive', start: now, miles, car: S.car };
      if (o.gpsOffMid) { await plus(Math.round(mins / 2)); await ctx.clearPermissions(); log.push({ type: 'event', start: now, what: 'battery saver turned location off mid-drive' }); await plus(mins - Math.round(mins / 2)); }
      else await plus(mins);
      S.odo[S.car] += miles;
      curPos = to; await setGps(to);
      await tapArrive('-> ' + (to.label || to.city), o.dblArrive);
      if (o.gpsOffMid) await ctx.grantPermissions(['geolocation']);
      closeOpen(now);
    },
    async work(job, kind, hours, o = {}) {
      const isNew = !seen.has(job);
      S.intended = job; S.jobName = job;
      await step('start work ' + job, async () => {
        await setGps(curPos);
        await beat(); await flowBtn(/^\s*START WORK\s*$|ALREADY ON SITE/).click();
        const picked = await page.waitForSelector('#dayPickOverlay', { timeout: 5000 }).catch(() => null);
        if (picked) {
          let want = isNew ? page.locator('#dayPickOverlay [data-pick="__new"]') : page.locator('#dayPickOverlay [data-pick]').filter({ hasText: job.slice(0, 24) }).first();
          if (!isNew && !(await want.count())) { note('job-missing-from-picker', job); want = page.locator('#dayPickOverlay [data-pick="__new"]'); }
          await want.click();
          if (await page.waitForSelector('[data-type="1"]', { timeout: 2500 }).catch(() => null)) {
            await page.waitForFunction(() => /just type the name|tap one/.test(document.body.innerText), null, { timeout: 8000 }).catch(() => {});
            await page.locator('[data-type="1"]').click();
          }
        }
        await page.waitForFunction(() => getRunningSegment() && getRunningSegment().type === 'workday', null, { timeout: 10000 });
        if (isNew) await page.evaluate(k => { const s = document.getElementById('jobKind'); s.value = k; s.dispatchEvent(new Event('change')); }, kind);
        const name = await page.evaluate(() => document.getElementById('client').value);
        if (name !== job) note('wrong-job-open', `wanted "${job}" got "${name}"`);
      });
      seen.add(job);
      open = { type: 'workday', start: now, job };
      curJob = job;
      const n = 2 + Math.floor(R() * 3);
      await plus(Math.round(hours * 30));
      await step(`photos x${n}`, async () => {
        const before = await page.evaluate(() => photos.length);
        await choose(() => page.locator('.bottombar .bb-photo').click(), '#photoInput', Array.from({ length: n }, (_, i) => file(i)));
        await page.waitForFunction(b => photos.length >= b, before + n, { timeout: 60000 });
      });
      log.push({ type: 'photo', start: now, n, job });
      if (R() < 0.35) {
        const amt = +(12 + R() * 180).toFixed(2);
        await step(`receipt $${amt}`, async () => {
          const before = await page.evaluate(() => receipts.length);
          await choose(() => page.locator('.bottombar .bb-btn', { hasText: 'Receipt' }).click(), '#receiptInput', [file(0)]);
          await page.waitForFunction(b => receipts.length > b, before, { timeout: 20000 });
          const card = page.locator('#receiptGrid > *').last();
          await card.locator('input[type="number"]').fill(String(amt)); await card.locator('input[type="number"]').blur();
          await card.locator('select').first().selectOption('parts');
        });
        log.push({ type: 'receipt', start: now, amount: amt, job });
      }
      await plus(Math.round(hours * 30));
      if (o.phoneDiesH) {   // battery dies mid-job; plugs in and reopens hours later, still working
        await page.goto('about:blank'); log.push({ type: 'event', start: now, what: `phone died for ${o.phoneDiesH} h mid-job` });
        await plus(o.phoneDiesH * 60);
        await step('reopen after dead phone', async () => { await page.goto(URL_APP); await page.waitForFunction(() => typeof db !== 'undefined' && db && getRunningSegment && getRunningSegment(), null, { timeout: 20000 }); });
        if (await page.waitForSelector('#stalePrompt', { timeout: 6000 }).catch(() => null)) {
          const still = page.locator('#stalePrompt [data-stale="still"]');
          if (await still.count()) { await still.click(); log.push({ type: 'event', start: now, what: '12-hour check: answered "still working"' }); }
          else note('stale-prompt-same-day', 'same-day long run asked "when did you stop?" with no "still working" first');
        }
      }
      if (!o.forgetStop) {
        await step('stop work' + (o.dblStop ? ' (double-tap)' : ''), async () => {
          await tap(flowBtn(/STOP WORK/), o.dblStop);
          await page.waitForFunction(() => !getRunningSegment() || getRunningSegment().type !== 'workday', null, { timeout: 8000 });
          await page.waitForTimeout(800);
          const after = await page.evaluate(() => { const r = getRunningSegment(); return r ? r.type : null; });
          if (after) note('double-tap-side-effect', `after STOP WORK double-tap a ${after} is running`);
          await page.evaluate(() => document.querySelectorAll('#dayPickOverlay').forEach(o => o.remove()));
        });
        closeOpen(now);
      }
    },
    async rain(min) {   // stops the clock, sits in the truck, starts again on the same job
      log.push({ type: 'event', start: now, what: `rain delay ${min} min` });
      await plus(min);
    },
    async rainout() {   // rained out: straight home
      log.push({ type: 'event', start: now, what: 'rained out' });
      await A.drive(home);
    },
    async noshow(job, waitMin, startClock) {
      log.push({ type: 'event', start: now, what: `no-show: ${job} (${startClock ? 'clock running while waiting' : 'waited, no clock'})` });
      if (startClock) { await A.work(job, 'service', waitMin / 60); }
      else await plus(waitMin);
    },
    async done() {
      await step('done for the day', async () => {
        if (!(await page.locator('#dayFlowBox .btn-endday').count())) {
          note('no-done-button', JSON.stringify(await page.evaluate(() => ({ today: dayKey(), sent: localStorage.getItem('dayEndEmailDate'), running: !!getRunningSegment() }))));
          return;
        }
        await beat(); await page.locator('#dayFlowBox .btn-endday').click();
        await page.waitForTimeout(600);
      });
      closeOpen(now);
      const r = await page.evaluate(async () => { const t = performance.now(); await autoSave(); const e = await navigator.storage.estimate(); return { ms: Math.round(performance.now() - t), mb: +(e.usage / 1048576).toFixed(1) }; }).catch(e => ({ err: e.message }));
      timings.push(Object.assign({ label: 'save ' + localTime(tz, now) }, r));
    },
    // Drive left running door to door: home → airport → gate → flight → rental → destination
    async flyThrough(o) {
      if (open && open.type === 'workday') closeOpen(now);
      await tapStartDrive('door to door via flight');
      open = { type: 'drive', start: now, miles: o.truckMiles, car: S.car };
      await plus(o.truckMins); S.odo[S.car] += o.truckMiles;
      await setGps(o.airport); closeOpen(now);
      open = { type: 'flight', start: now, what: `gate ${o.gateMin + (o.delayMin || 0)} min + flight ${o.flightMin} min` };
      await plus(o.gateMin + (o.delayMin || 0) + o.flightMin);
      closeOpen(now);
      await setTz(CITIES[o.destCity].tz); await setGps(o.destAirport);
      S.car = o.carAfter || 'rental'; if (o.rentalOdo) S.odo.rental = o.rentalOdo;
      S.answerMiles = o.truckMiles + o.rentalMiles;
      open = { type: 'drive', start: now, miles: o.rentalMiles, car: S.car };
      await plus(o.rentalMins); S.odo[S.car] += o.rentalMiles;
      curPos = o.to; await setGps(o.to);
      closeOpen(now);
      await tapArrive('after flight (different car, different odometer)');
      log.push({ type: 'event', start: now, what: 'one drive entry spans truck + flight + rental' });
    },
    // Uses the FLYING button: tap it at the airport (from a running drive or idle), LANDED on arrival
    async flyButton(o) {
      await step('tap FLYING', async () => {
        const before = S.odoPrompts;
        const wasDriving = await page.evaluate(() => !!(getRunningSegment() && getRunningSegment().type === 'drive'));
        const fc = wasDriving ? page.waitForEvent('filechooser', { timeout: 4000 }).catch(() => null) : null;
        await beat(); await page.locator('#dayFlowBox button').filter({ hasText: /flying/i }).first().click();
        if (wasDriving) { const ch = await fc; if (ch) await ch.setFiles(file(0)); else await page.setInputFiles('#segOdoInput', file(0)); await waitOdo(before + 1); }
        await page.waitForFunction(() => getRunningSegment() && getRunningSegment().mode === 'flight', null, { timeout: 8000 });
      });
      open = { type: 'flight', start: now, what: 'flying (button)' };
      await plus(o.gateMin + (o.delayMin || 0) + o.flightMin);
      await setTz(CITIES[o.destCity].tz); curPos = o.destAirport; await setGps(o.destAirport);
      await step('tap LANDED', async () => {
        await beat(); await flowBtn(/LANDED/).click();
        await page.waitForFunction(() => !getRunningSegment(), null, { timeout: 8000 });
      });
      closeOpen(now);
      S.car = o.car; if (o.rentalOdo) S.odo.rental = o.rentalOdo;
    },
    async driveThenFly(airport, o) {   // drives toward the airport and taps FLYING from the running drive
      const miles = Math.max(1, Math.round(distMi(curPos, airport) * 1.3)), mins = Math.max(10, Math.round(miles / 28 * 60));
      if (open && open.type === 'workday') closeOpen(now);
      await tapStartDrive('-> airport');
      open = { type: 'drive', start: now, miles, car: S.car };
      await plus(mins); S.odo[S.car] += miles; curPos = airport; await setGps(airport);
      closeOpen(now);
      await A.flyButton(o);
    },
    // Drive stopped at the airport; next tap is START DRIVE in the next car after landing
    async flyStopStart(o) {
      open = { type: 'flight', start: now, what: `gate ${o.gateMin + (o.delayMin || 0)} min + flight ${o.flightMin} min` };
      await plus(o.gateMin + (o.delayMin || 0) + o.flightMin);
      closeOpen(now);
      await setTz(CITIES[o.destCity].tz); curPos = o.destAirport; await setGps(o.destAirport);
      S.car = o.car; if (o.rentalOdo) S.odo.rental = o.rentalOdo;
      log.push({ type: 'event', start: now, what: 'landed; airport time and flight not tapped' });
    },
    get page() { return page; },
    get now() { return now; },
    async setTz(t) { await setTz(t); },
    async perf(label) {
      const r = await page.evaluate(async () => {
        const t = {}; let a = performance.now();
        await loadMasterLogData(); t.masterLogMs = Math.round(performance.now() - a);
        a = performance.now(); await autoSave(); t.saveMs = Math.round(performance.now() - a);
        a = performance.now(); await refreshWeekAgg(true); t.weekTotalsMs = Math.round(performance.now() - a);
        a = performance.now(); await generateReport(); t.reportMs = Math.round(performance.now() - a);
        document.querySelectorAll('.dialog-overlay.open').forEach(o => o.classList.remove('open')); // the "Save & New Job?" box after a report
        const full = JSON.stringify({ jobs: await dbGetAll(), drafts: await dbGetAllDrafts() });
        const rec = JSON.stringify({ jobs: (await dbGetAll()).map(j => Object.assign({}, j, { rawState: stripBinaryForCloud(j.rawState) })), drafts: (await dbGetAllDrafts()).map(d => Object.assign({}, d, { state: stripBinaryForCloud(d.state) })) });
        t.backupMB = +(full.length / 1048576).toFixed(1); t.recordsKB = Math.round(rec.length / 1024);
        const e = await navigator.storage.estimate(); t.storageMB = +(e.usage / 1048576).toFixed(0);
        t.jobs = (await dbGetAllDrafts()).length + (await dbGetAll()).length;
        t.photos = (await dbGetAllDrafts()).reduce((n, d) => n + ((d.state && d.state.photos) || []).length, 0);
        return t;
      }).catch(e => ({ err: e.message }));
      const tapMs = timings.filter(x => /^start work|^stop work|^start drive|^arrive/.test(x.label)).slice(-12).map(x => x.ms);
      r.tapMsAvg = tapMs.length ? Math.round(tapMs.reduce((a, b) => a + b, 0) / tapMs.length) : null;
      perfLog.push(Object.assign({ label, at: localTime(tz, now) }, r));
    },
    // the same file freezeCopy() writes as the full backup
    async backupFrom(pg, name) {
      const json = await pg.evaluate(async () => JSON.stringify({ app: 'Field Log (Lyle Krug)', version: 2, exportedAt: new Date().toISOString(), jobs: await dbGetAll(), drafts: await dbGetAllDrafts(), trips: await dbGetAllTrips() }));
      const f = path.join(OUT, `${P.id}-${name}.json`); fs.writeFileSync(f, json); return f;
    },
    async restoreInto(pg, file) {
      const alerts = [];
      const h = d => { alerts.push(d.message().split(String.fromCharCode(10)).join(' ').slice(0, 200)); d.accept().catch(() => {}); }; // the main page has its own handler too
      pg.on('dialog', h);
      await pg.setInputFiles('#importInput', file);
      await pg.waitForTimeout(6000);
      pg.off('dialog', h);
      return alerts.join(' / ');
    },
    async newDevice(tzid) {
      const c2 = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      await c2.route(u => !u.href.startsWith(URL_APP), r => r.abort());
      await c2.addInitScript(() => { try { localStorage.setItem('fieldlog_helpSeen', '1'); } catch (e) {} });
      const pg = await c2.newPage();
      const cd = await c2.newCDPSession(pg); await cd.send('Emulation.setTimezoneOverride', { timezoneId: tzid });
      await pg.clock.install({ time: now });
      await pg.goto(URL_APP);
      await pg.waitForFunction(() => typeof db !== 'undefined' && db, null, { timeout: 20000 });
      extraCtx.push(c2);
      return pg;
    },
    async forgotDriveHomeAppOpen(to) {
      await step('forgot STOP WORK, drives home with the app open', async () => {
        const tick = async () => { await page.clock.fastForward(60000); now += 60000; await page.waitForTimeout(300); };
        await setGps(offset(curPos, 1.5, 1.5)); await tick();
        closeOpen(now);
        open = { type: 'drive', start: now, miles: 0, gpsDrive: true };
        await setTime(now + 18 * 60000);
        curPos = to; await setGps(to); await tick();
        closeOpen(now);
        if (!(await page.waitForSelector('#homePrompt', { timeout: 5000 }).catch(() => null))) note('no-home-prompt', 'back home with work running, no prompt');
        for (let i = 0; i < 16; i++) await tick();
        await page.waitForFunction(() => !getRunningSegment(), null, { timeout: 8000 });
      });
    },
  };

  A.devices = devices;
  await A.day(0, 4, 0);
  await P.run(A);
  for (const c of extraCtx) await c.close().catch(() => {});
  closeOpen(now);

  // audit read-back, in the tech's home time zone
  await setTz(homeTz);
  await setTime(now + 30 * 60000);
  const app = await page.evaluate(async () => {
    await autoSave(); await loadMasterLogData();
    return {
      ev: masterLogEvents.map(e => ({ type: e.type, start: e.startedAt, end: e.endedAt, job: e.jobName, miles: e.miles, amount: e.amount, b: (e.type === 'drive' || e.type === 'workday') ? segTimeBreakdown(e._raw) : null, odo: e._raw && [e._raw.startOdoMiles, e._raw.endOdoMiles], note: e._raw && e._raw.note })),
      jobs: (await dbGetAllDrafts()).map(d => ({ name: d.name, kind: d.state && d.state.jobKind, done: d.state && d.state.jobDone, dateEnd: d.state && d.state.dateEnd, photos: (d.state && d.state.photos || []).length })),
    };
  }).catch(e => ({ err: e.message }));
  const outputs = {};
  for (const fn of ['generateReport', 'generateWeeklyDigest', 'generateDailyReport', 'exportMasterLogCSV', 'freezeCopy']) {
    const t0 = Date.now();
    const r = await page.evaluate(async f => { const b = window.__blobs.length; try { if (f === 'exportMasterLogCSV') await openMasterLog(); await window[f](); } catch (e) { return { err: String(e.message || e).slice(0, 160) }; } await new Promise(r => setTimeout(r, 400)); return { blobs: window.__blobs.length - b }; }, fn).catch(e => ({ err: e.message.slice(0, 160) }));
    outputs[fn] = Object.assign(r, { ms: Date.now() - t0 });
  }
  await ctx.close();
  return { P, tz: homeTz, log, app, issues, timings, consoleErrs, outputs, perfLog, devices };
}

function audit(r) {
  const { tz, log, app } = r;
  const out = [];
  if (app.err) return [{ sev: 'BREAK', msg: 'read-back failed: ' + app.err }];
  const H = ms => +(ms / 3600000).toFixed(2);
  const days = {};
  const d = k => (days[k] = days[k] || { tWork: 0, tDrive: 0, tFlight: 0, tMiles: 0, tSpent: 0, aWork: 0, aDrive: 0, aUnacc: 0, aMiles: 0, aSpent: 0 });
  log.forEach(x => {
    const k = localDay(tz, x.start);
    if (x.type === 'workday') d(k).tWork += x.end - x.start;
    if (x.type === 'drive') { d(k).tDrive += x.end - x.start; d(k).tMiles += x.miles; }
    if (x.type === 'flight') d(k).tFlight += x.end - x.start;
    if (x.type === 'receipt') d(k).tSpent += x.amount;
  });
  app.ev.forEach(e => {
    const k = localDay(tz, e.start);
    if (e.b) { d(k).aWork += e.b.workMs; d(k).aDrive += e.b.driveMs; d(k).aUnacc += e.b.unaccountedMs; d(k).aMiles += e.miles; }
    if (e.type === 'receipt') d(k).aSpent += e.amount;
  });
  Object.entries(days).sort().forEach(([k, v]) => {
    if (Math.abs(v.tWork - v.aWork) > 120000) out.push({ sev: 'WRONG', msg: `${k}: work hours truth ${H(v.tWork)} vs app ${H(v.aWork)}` });
    const tTravel = v.tDrive + v.tFlight, aTravel = v.aDrive + v.aUnacc;
    if (v.tFlight) out.push({ sev: Math.abs(tTravel - aTravel) > 120000 ? 'TRAVEL' : 'INFO', msg: `${k}: travel day — truth drive ${H(v.tDrive)} h + airport/flight ${H(v.tFlight)} h; app counted drive ${H(v.aDrive)} h${v.aUnacc ? ` + "unaccounted" ${H(v.aUnacc)} h` : ''}` });
    else if (Math.abs(v.tDrive - v.aDrive) > 120000) out.push({ sev: v.aUnacc ? 'CUT' : 'WRONG', msg: `${k}: drive hours truth ${H(v.tDrive)} vs app counted ${H(v.aDrive)}${v.aUnacc ? ` (${H(v.aUnacc)} h moved to "unaccounted")` : ''}` });
    if (Math.abs(v.tMiles - v.aMiles) > 0.5) out.push({ sev: 'WRONG', msg: `${k}: miles truth ${v.tMiles} vs app ${v.aMiles}` });
    if (Math.abs(v.tSpent - v.aSpent) > 0.01) out.push({ sev: 'WRONG', msg: `${k}: spent truth $${v.tSpent.toFixed(2)} vs app $${v.aSpent.toFixed(2)}` });
  });
  // odometer sanity: an entry whose end reading is below its start, or a jump no truck makes
  app.ev.filter(e => e.type === 'drive' && e.odo && e.odo[0] && e.odo[1]).forEach(e => {
    const diff = e.odo[1] - e.odo[0];
    if ((diff < 0 || diff > 1500) && !/two vehicles/.test(e.note || '')) out.push({ sev: 'WRONG', msg: `drive ${localTime(tz, e.start)}: odometer ${e.odo[0]} → ${e.odo[1]} (${diff} mi) — two different vehicles in one entry; app counted ${e.miles} mi` });
  });
  const tJobs = [...new Set(log.filter(x => x.type === 'workday').map(x => x.job))];
  tJobs.forEach(j => { const n = app.jobs.filter(a => a.name === j).length; if (n !== 1) out.push({ sev: n ? 'WRONG' : 'BREAK', msg: `job "${j}" appears ${n} times` }); });
  app.jobs.filter(a => !tJobs.includes(a.name) && a.name !== 'Travel — no job picked').forEach(a => out.push({ sev: 'JUNK', msg: `extra job "${a.name}"` }));
  app.jobs.filter(a => a.dateEnd).forEach(a => {
    const last = log.filter(x => x.type === 'workday' && x.job === a.name).sort((x, y) => y.end - x.end)[0];
    if (last && a.dateEnd !== localDay(tz, last.end) && a.dateEnd !== localDay(tz, last.start)) out.push({ sev: 'WRONG', msg: `"${a.name}" end date ${a.dateEnd}, last work ${localDay(tz, last.end)}` });
  });
  const tPh = log.filter(x => x.type === 'photo').reduce((a, x) => a + x.n, 0), aPh = app.jobs.reduce((a, j) => a + j.photos, 0);
  if (tPh !== aPh) out.push({ sev: 'WRONG', msg: `photos taken ${tPh} vs saved ${aPh}` });
  Object.entries(r.outputs).forEach(([f, o]) => { if (o.err) out.push({ sev: 'BREAK', msg: `${f} threw: ${o.err}` }); else if (!o.blobs) out.push({ sev: 'BREAK', msg: `${f} produced nothing` }); });
  r.issues.forEach(i => out.push({ sev: i.kind === 'step-failed' ? 'BREAK' : 'ODD', msg: `${i.kind}: ${i.msg}` }));
  [...new Set(r.consoleErrs)].forEach(e => out.push({ sev: 'ERROR', msg: e }));
  log.filter(x => x.type === 'event').forEach(x => out.push({ sev: 'SCENE', msg: `${localTime(tz, x.start)} ${x.what}` }));
  r.timings.filter(t => t.label.startsWith('save') && t.ms > 1500).forEach(t => out.push({ sev: 'SLOW', msg: `${t.label}: ${t.ms} ms, ${t.mb} MB` }));
  (r.perfLog || []).forEach(p => out.push({ sev: 'PERF', msg: JSON.stringify(p) }));
  Object.entries(r.devices || {}).forEach(([k, v]) => out.push({ sev: v.ok === false ? 'BREAK' : 'DEVICE', msg: `${k}: ${v.msg}` }));
  return out;
}

(async () => {
  const browser = await chromium.launch({ executablePath: EXE, headless: true });
  const list = PERSONAS.filter(p => !ONLY || ONLY.split(',').includes(p.id));
  const all = [];
  const one = async P => {
    const t0 = Date.now();
    let r;
    try { r = await runPersona(browser, P); } catch (e) { console.log(`\n=== ${P.id} CRASHED: ` + e.stack); return; }
    const f = audit(r);
    console.log([`\n=== ${P.id} (${P.who}) ${((Date.now() - t0) / 1000).toFixed(0)}s`].concat(f.map(x => `  [${x.sev}] ${x.msg}`)).join('\n'));
    all.push({ id: P.id, findings: f });
    fs.writeFileSync(path.join(OUT, `${P.id}.json`), JSON.stringify({ findings: f, log: r.log, app: r.app, timings: r.timings, dialogs: r.dialogs }, null, 1));
  };
  for (let i = 0; i < list.length; i += 3) await Promise.all(list.slice(i, i + 3).map(one));
  fs.writeFileSync(path.join(OUT, 'summary.json'), JSON.stringify(all, null, 1));
  await browser.close();
})();
