/**
 * Photorealism QA (iteration 3): drives the real GPU Chrome through the workspace and the start
 * screen's hero, saving screenshots to docs/screenshots/real3-*.png and (optionally) frame times.
 *
 *   node scripts/qa/real3.mjs real deck paving fence bathroom lawn   # settled REAL frames
 *   node scripts/qa/real3.mjs close deck bathroom lawn               # close-ups (wood, tiles, grass)
 *   node scripts/qa/real3.mjs hero                                    # five hero projects, settled frames
 *   node scripts/qa/real3.mjs fps deck bathroom                       # rAF frame times in the workspace
 *   node scripts/qa/real3.mjs herofps                                 # two full hero loops
 *
 * Env: BASE (default http://localhost:3111), PORT (Chrome, default 9341), OUT (default docs/screenshots),
 * TAG (file prefix, default real3), W / H (viewport, default 1440 x 900).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { launchGpu } from "./launch-gpu.mjs";
import { openPage, sleep } from "./cdp.mjs";

const BASE = process.env.BASE ?? "http://localhost:3111";
const PORT = Number(process.env.PORT ?? 9341);
const OUT = process.env.OUT ?? "docs/screenshots";
const TAG = process.env.TAG ?? "real3";
const W = Number(process.env.W ?? 1440);
const H = Number(process.env.H ?? 900);
mkdirSync(OUT, { recursive: true });

const PROMPTS = {
  deck: "Vreau o terasă de 4 x 3 m",
  paving: "Vreau o terasă pavată de 4,5 x 3,5 m",
  fence: "Vreau un gard de 11 m înalt de 1,8 m",
  bathroom: "Vreau să placăm o baie de 2,5 x 2 m",
  lawn: "Vreau gazon nou de 24 m2",
};

const [cmd, ...args] = process.argv.slice(2);

/** Collects requestAnimationFrame deltas for `ms`, returns summary stats. */
const FRAME_PROBE = (ms) => `new Promise((res) => {
  const t = []; let last = performance.now(); const end = last + ${ms};
  const tick = (now) => { t.push(now - last); last = now; if (now < end) requestAnimationFrame(tick); else {
    const s = t.slice(3).sort((a, b) => a - b);
    const avg = s.reduce((a, b) => a + b, 0) / s.length;
    res({ frames: s.length, fps: +(1000 / avg).toFixed(1), avg: +avg.toFixed(2), p95: +s[Math.floor(s.length * 0.95)].toFixed(2), max: +s[s.length - 1].toFixed(2), over50: s.filter((x) => x > 50).length, over100: s.filter((x) => x > 100).length });
  } };
  requestAnimationFrame(tick);
})`;

async function workspace(kind, { mode = "real" } = {}) {
  const { port } = await launchGpu({ port: PORT, profile: `/tmp/bp-qa-${PORT}` });
  const page = await openPage(port, `${BASE}/?demo=1`, { width: W, height: H });
  await sleep(1500);
  await page.chat(PROMPTS[kind]);
  await sleep(1200);
  if (mode === "real") await page.click("button[aria-label]", "real").catch(() => page.click("button", "real"));
  // Coach marks / tours hover over the sketch: dismiss them so frames are clean.
  await page.eval(`[...document.querySelectorAll('button')].filter((b) => /am înțeles|got it|închide|skip|sari/i.test(b.innerText)).forEach((b) => b.click())`).catch(() => {});
  return page;
}

/** Screenshot of just the sketch card (the canvas' @container), not the whole workspace. */
async function shot(page, path) {
  const clip = await page.eval(
    `(() => { const c = document.querySelector('canvas'); const el = c.closest('[class*="@container"]') ?? c.parentElement; const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height, scale: 1 }; })()`,
  );
  const r = await page.send("Page.captureScreenshot", { format: "png", clip });
  writeFileSync(path, Buffer.from(r.data, "base64"));
}

/** Scroll-zoom the canvas (OrbitControls dolly): negative deltaY zooms in. */
async function zoom(page, steps, deltaY = -240) {
  const c = await page.eval(`(() => { const r = document.querySelector('canvas').getBoundingClientRect(); return { x: r.x + r.width * 0.5, y: r.y + r.height * 0.55 }; })()`);
  for (let i = 0; i < steps; i++) {
    await page.send("Input.dispatchMouseEvent", { type: "mouseWheel", x: c.x, y: c.y, deltaX: 0, deltaY });
    await sleep(60);
  }
}

/** Camera presets are keys 1-6 (iso, top, front, side, eye, tour) while the pointer is over the sketch. */
async function preset(page, n) {
  const c = await page.eval(`(() => { const r = document.querySelector('canvas').getBoundingClientRect(); return { x: r.x + r.width * 0.5, y: r.y + r.height * 0.5 }; })()`);
  await page.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: c.x, y: c.y });
  await sleep(100);
  await page.send("Input.dispatchKeyEvent", { type: "keyDown", key: String(n), text: String(n), code: `Digit${n}`, windowsVirtualKeyCode: 48 + n });
  await page.send("Input.dispatchKeyEvent", { type: "keyUp", key: String(n), code: `Digit${n}`, windowsVirtualKeyCode: 48 + n });
  await sleep(1500);
}

async function oneScenario(kind) {
  const page = await workspace(kind);
  console.log(kind, "opened");
  await sleep(9000);
  if (cmd === "real") {
    await shot(page, `${OUT}/${TAG}-${kind}-real-settled.png`);
  } else if (cmd === "eye") {
    await preset(page, 5);
    await sleep(1500);
    await shot(page, `${OUT}/${TAG}-${kind}-eye.png`);
  } else if (cmd === "close") {
    await zoom(page, 14);
    await sleep(1500);
    await shot(page, `${OUT}/${TAG}-${kind}-closeup.png`);
  } else {
    const stats = await page.eval(FRAME_PROBE(6000));
    console.log(kind, "fps", JSON.stringify(stats));
  }
  await page.close();
}

if (cmd === "real" || cmd === "close" || cmd === "eye") {
  // Scenarios run side by side in their own tabs: a capture of all five takes about a minute.
  await Promise.all(args.map(oneScenario));
  process.exit(0);
}
if (cmd === "fps") {
  for (const kind of args) await oneScenario(kind);
  process.exit(0);
}

if (cmd === "hero") {
  const { port } = await launchGpu({ port: PORT, profile: `/tmp/bp-qa-${PORT}` });
  const page = await openPage(port, `${BASE}/?demo=1`, { width: W, height: H });
  // The hero cycles through five projects; grab a settled frame of each as it comes round.
  const seen = new Set();
  const names = ["deck", "paving", "fence", "bathroom", "lawn"];
  const t0 = Date.now();
  while (seen.size < 5 && Date.now() - t0 < 240000) {
    const label = await page.eval(`(document.querySelector('section canvas')?.closest('section')?.innerText ?? '').slice(0, 80)`).catch(() => "");
    const idx = names.findIndex((n, i) => !seen.has(n) && /terasă din deck|terasă pavată|gard|baie|gazon/i.test(label) && ["deck", "pavată", "gard", "baie", "gazon"][i] && label.toLowerCase().includes(["din deck", "pavată", "gard", "baie", "gazon"][i]));
    if (idx >= 0) {
      await sleep(Number(process.env.HERO_SETTLE ?? 7500));
      await page.screenshot(`${OUT}/${TAG}-hero-${names[idx]}.png`);
      seen.add(names[idx]);
      console.log("hero", names[idx]);
      await sleep(3000);
    } else await sleep(700);
  }
  process.exit(0);
}

if (cmd === "herofps") {
  const { port } = await launchGpu({ port: PORT, profile: `/tmp/bp-qa-${PORT}` });
  const page = await openPage(port, `${BASE}/?demo=1`, { width: W, height: H });
  await sleep(3000);
  const stats = await page.eval(FRAME_PROBE(Number(process.env.MS ?? 130000)));
  console.log("hero fps", JSON.stringify(stats));
  process.exit(0);
}

console.log("usage: real3.mjs real|close|fps <deck|paving|fence|bathroom|lawn>... | hero | herofps");
process.exit(1);
