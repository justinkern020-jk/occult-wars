/**
 * E2E: hand drag-deploy and hand scroll, phone (touch, 390x844) and desktop (mouse, 1280x800).
 *   BASE=https://occult-wars.vercel.app/ node scripts/e2e-hand.mjs phone
 *   BASE=http://localhost:4173/ node scripts/e2e-hand.mjs desk
 * Needs `playwright` resolvable (npm i -D playwright, or NODE_PATH) and Chrome/Chromium
 * (CHROME=/path/to/chrome). Touch is real CDP touch input, so native pan and
 * touch-action behave as on a phone. Exits 1 if any check fails.
 */
import { chromium } from 'playwright';
const VIEWPORTS = { desk: { width: 1280, height: 800 }, phone: { width: 390, height: 844 } };
const launch = () => chromium.launch({ executablePath: process.env.CHROME || undefined, args: ['--no-sandbox'] });
async function newPage(browser, vp) {
  const phone = vp === 'phone';
  const ctx = await browser.newContext({ viewport: VIEWPORTS[vp], isMobile: phone, hasTouch: phone });
  const page = await ctx.newPage();
  page.on('dialog', (d) => d.accept());
  return page;
}
const tid = (page, id) => page.getByTestId(id);
async function dismissPrimer(page) {
  for (let i = 0; i < 3; i++) if (await tid(page, 'primer-dismiss').isVisible().catch(() => false)) { await tid(page, 'primer-dismiss').click().catch(() => {}); await page.waitForTimeout(250); }
}
/** Set a Battlefield state hook by shape (no test hooks ship in the app). */
async function bfSet(page, kind, src) {
  return page.evaluate(([kind, src]) => {
    const el = document.querySelector('[data-testid=battlefield]');
    const key = Object.keys(el).find((k) => k.startsWith('__reactFiber$'));
    let f = el[key];
    while (f && typeof f.type !== 'function') f = f.return;
    const hooks = []; let h = f.memoizedState; while (h) { if (h.queue && h.queue.dispatch) hooks.push(h); h = h.next; }
    const two = (v, t) => v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 2 && (t === 'arr' ? Array.isArray(v.blue) : typeof v.blue === t);
    const target = kind === 'loyalty' ? hooks.filter((x) => two(x.memoizedState, 'number'))[0] : hooks.filter((x) => two(x.memoizedState, 'arr'))[1];
    target.queue.dispatch((0, eval)(src)(target.memoizedState));
  }, [kind, src]);
}
const vp = process.argv[2] || 'phone';
const browser = await launch();
const page = await newPage(browser, vp);
const prof = { version: 1, username: 'Adept', alchemicalShards: 900, seenPrimer: true, primerVersion: 3, allegiance: 'The Columbia Lodge', lastDaily: new Date().toISOString().slice(0, 10) };
await page.addInitScript((p) => { if (!sessionStorage.getItem('s')) { localStorage.setItem('occult-wars-ai', 'easy'); localStorage.setItem('occult-wars.profile.v1', JSON.stringify(p)); sessionStorage.setItem('s', '1'); } }, prof);
await page.goto(process.env.BASE, { waitUntil: 'load' });
await tid(page, 'enter-circle').click();
await tid(page, 'start-training').click();
await tid(page, 'end-rite').waitFor({ timeout: 30000 });
await page.waitForTimeout(2200); await dismissPrimer(page);
await bfSet(page, 'loyalty', '(v)=>({blue:20,red:20})');
// long hand: repeat units to 10 cards
const HN = vp === 'desk' ? 18 : 10;
await bfSet(page, 'hand', `(v)=>{const u=v.blue.filter(c=>c.kind==="unit"&&c.cost<=3);const b=[...v.blue];let i=0;while(b.length<${HN}&&u.length){b.push(u[i++%u.length]);}return {...v,blue:b}}`);
await page.waitForTimeout(600);
const cdp = await page.context().newCDPSession(page);
const res = {};
const touch = async (pts) => {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: pts[0][0], y: pts[0][1] }] });
  for (const [x, y] of pts.slice(1)) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y }] }); await page.waitForTimeout(16); }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
};
const path = (a, b, n = 20) => Array.from({ length: n + 1 }, (_, i) => [a[0] + ((b[0] - a[0]) * i) / n, a[1] + ((b[1] - a[1]) * i) / n]);
const units = () => page.locator('.stone.has-unit').count();
const row = page.locator('.hand-row-slide');
const sl = () => row.evaluate((e) => e.scrollLeft);
res.overflow = await row.evaluate((e) => [e.scrollWidth, e.clientWidth]);
// legal spots: select a card to read them
const card = page.locator('.hand-card.is-draggable').first();
await card.scrollIntoViewIfNeeded();
await page.waitForTimeout(300);
await card.click();
await page.waitForTimeout(300);
const legal = page.locator('.stone.legal-tile');
res.legal = await legal.count();
const tb = await legal.first().boundingBox();
await card.click(); await page.waitForTimeout(300);
// the board must be on screen together with the hand
const cb = await card.boundingBox();
res.cardBox = cb; res.tileBox = tb;
res.hit = await page.evaluate(([x, y]) => { const e = document.elementFromPoint(x, y); return e ? e.className.toString().slice(0, 60) : null; }, [tb.x + tb.width / 2, tb.y + tb.height / 2]);
const u0 = await units();
const from = [cb.x + cb.width / 2, cb.y + cb.height / 2];
const to = [tb.x + tb.width / 2, tb.y + tb.height / 2];
const drag = async () => {
  if (vp === 'phone') await touch([from, ...path([from[0], from[1] - 4], to)]);
  else { await page.mouse.move(...from); await page.mouse.down(); for (const p of path(from, to)) { await page.mouse.move(...p); await page.waitForTimeout(16); } await page.mouse.up(); }
};
await drag();
await page.waitForTimeout(900);
const pop = tid(page, 'tarot-pop-close'); if (await pop.isVisible().catch(() => false)) await pop.click();
res.dragDeploy = (await units()) > u0;
res.dragScrollY = await page.evaluate(() => window.scrollY);
// diagonal-ish upward drag (more vertical than sideways)
// swipe the hand sideways
const s0 = await sl();
const c2 = await page.locator('.hand-card').nth(1).boundingBox();
const y = c2.y + c2.height / 2;
const rb0 = await row.boundingBox();
const sx = rb0.x + rb0.width - 30, ex = rb0.x + 40;
if (vp === 'phone') await touch(path([sx, y], [ex, y], 14));
else { await page.mouse.move(sx, y); await page.mouse.down(); for (const p of path([sx, y], [ex, y], 14)) await page.mouse.move(...p); await page.mouse.up(); }
res.selectedAfterSwipe = await page.locator('.hand-card.is-selected').count();
await page.waitForTimeout(900);
res.swipe = [s0, await sl()];
res.unitsAfterSwipe = await units();
// slider
const slider = page.locator('[data-testid=hand-slider]');
res.sliderVisible = await slider.isVisible().catch(() => false);
if (res.sliderVisible) {
  await row.evaluate((e) => (e.scrollLeft = 0)); await page.waitForTimeout(200);
  const sb = await slider.boundingBox();
  const sy = sb.y + sb.height / 2;
  if (vp === 'phone') await touch(path([sb.x + 10, sy], [sb.x + sb.width - 5, sy], 12));
  else { await page.mouse.move(sb.x + 10, sy); await page.mouse.down(); for (const p of path([sb.x + 10, sy], [sb.x + sb.width - 5, sy], 12)) await page.mouse.move(...p); await page.mouse.up(); }
  await page.waitForTimeout(400);
  res.slider = await sl();
  res.sliderBox = sb;
}
// arrows + wheel (desktop)
await row.evaluate((e) => (e.scrollLeft = 0)); await page.waitForTimeout(200);
const ar = tid(page, 'hand-arrow-right');
if (await ar.isVisible().catch(() => false)) { await ar.click(); await page.waitForTimeout(700); res.arrow = await sl(); }
if (vp === 'desk') { await row.evaluate((e) => (e.scrollLeft = 0)); const rb = await row.boundingBox(); await page.mouse.move(rb.x + 50, rb.y + rb.height / 2); await page.mouse.wheel(0, 300); await page.waitForTimeout(400); res.wheel = await sl(); }
if (vp === 'desk') { await row.evaluate((e) => (e.scrollLeft = 0)); await page.mouse.move(0, 0); await page.waitForTimeout(300); await page.locator('.hand-card').nth(2).hover(); await page.waitForTimeout(900); res.peek = await page.locator('.card-peek-name').isVisible().catch(() => false); await page.mouse.move(0, 0); }
// tap-select then tap-circle
const u1 = await units();
const c3 = page.locator('.hand-card.is-draggable:not(.is-disabled)').first();
await c3.scrollIntoViewIfNeeded(); await c3.click(); await page.waitForTimeout(300);
const l3 = page.locator('.stone.legal-tile');
res.tapLegal = await l3.count();
if (res.tapLegal) { await l3.first().click(); await page.waitForTimeout(900); if (await pop.isVisible().catch(() => false)) await pop.click(); }
res.tapDeploy = (await units()) > u1;
console.log(JSON.stringify(res));
await browser.close();
const fails = [];
if (!res.dragDeploy) fails.push('drag a hand card onto a legal circle');
if (!(res.swipe[1] > res.swipe[0] + 40)) fails.push('sideways swipe slides the hand');
if (res.selectedAfterSwipe) fails.push('a swipe must not select a plate');
if (!(res.slider > 100)) fails.push('gold slider slides the hand');
if ('arrow' in res && !(res.arrow > 50)) fails.push('edge arrow pages the hand');
if ('wheel' in res && !(res.wheel > 50)) fails.push('scroll wheel slides the hand');
if ('peek' in res && !res.peek) fails.push('hover peek');
if (!res.tapDeploy) fails.push('tap a plate then tap a circle');
if (fails.length) { console.error('FAIL: ' + fails.join('; ')); process.exit(1); }
console.log('OK');
