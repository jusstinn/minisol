/**
 * Minimal Chrome DevTools Protocol driver for QA runs (Node 22+ built-in WebSocket, no puppeteer).
 *
 *   import { launch, openPage } from "./scripts/qa/cdp.mjs";
 *   const { port } = await launch();                         // headless Chrome on :9333
 *   const p = await openPage(port, "http://localhost:3310/?demo=1", { width: 390, height: 844, mobile: true });
 *   const turn = await p.chat("Vreau o terasă de 4 x 3 m");  // → { text, cards, total, verified, ui, err }
 *
 * Every page records API calls (window.__api) and chat stream events per turn (window.__turns); p.idle()
 * waits for in-flight API calls to settle. Offline only: run the app with ?demo=1 or AGENT_MODE=scripted.
 */
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Tracks in-flight API calls and records chat stream events (window.__events, one array per turn). */
const INIT = `(() => {
  window.__inflight = 0; window.__lastDone = Date.now(); window.__turns = []; window.__api = [];
  const orig = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input.url;
    if (!/\\/api\\//.test(url)) return orig(input, init);
    window.__inflight++;
    const rec = { url, body: init && init.body ? String(init.body).slice(0, 4000) : null, status: 0 };
    window.__api.push(rec);
    let res;
    try { res = await orig(input, init); } catch (e) { window.__inflight--; window.__lastDone = Date.now(); rec.error = String(e); throw e; }
    rec.status = res.status;
    if (!/\\/api\\/chat/.test(url) || !res.body) {
      const clone = res.clone();
      clone.text().then(t => { rec.resp = t.slice(0, 20000); }).finally(() => { window.__inflight--; window.__lastDone = Date.now(); });
      return res;
    }
    const turn = []; window.__turns.push(turn);
    const reader = res.body.getReader();
    const dec = new TextDecoder(); let buf = '';
    const stream = new ReadableStream({
      async pull(c) {
        const { done, value } = await reader.read();
        if (done) { window.__inflight--; window.__lastDone = Date.now(); c.close(); return; }
        buf += dec.decode(value, { stream: true });
        let i; while ((i = buf.indexOf('\\n')) >= 0) { const line = buf.slice(0, i); buf = buf.slice(i + 1); try { turn.push(JSON.parse(line)); } catch {} }
        c.enqueue(value);
      },
    });
    return new Response(stream, { status: res.status, headers: res.headers });
  };
})();`;

export async function launch({ port = 9333, profile = join(tmpdir(), "blueprint-qa-chrome"), headless = true } = {}) {
  mkdirSync(profile, { recursive: true });
  try {
    const r = await fetch(`http://127.0.0.1:${port}/json/version`);
    if (r.ok) return { port, proc: null };
  } catch {}
  const args = [
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-background-timer-throttling",
    "--disable-renderer-backgrounding",
    "--disable-backgrounding-occluded-windows",
    "--enable-unsafe-swiftshader",
    "--use-angle=swiftshader",
    "--window-size=1440,900",
    "about:blank",
  ];
  if (headless) args.unshift("--headless=new");
  const proc = spawn(CHROME, args, { stdio: "ignore", detached: false });
  for (let i = 0; i < 100; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (r.ok) return { port, proc };
    } catch {}
    await sleep(100);
  }
  throw new Error("chrome did not start");
}

export async function openPage(port, url, { width = 1440, height = 900, mobile = false, scale = 1 } = {}) {
  const t = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: "PUT" })).json();
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((res, rej) => {
    ws.onopen = res;
    ws.onerror = rej;
  });
  let id = 0;
  const pending = new Map();
  const logs = [];
  const listeners = [];
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) {
      const { res, rej } = pending.get(m.id);
      pending.delete(m.id);
      if (m.error) rej(new Error(JSON.stringify(m.error)));
      else res(m.result);
      return;
    }
    if (m.method === "Runtime.consoleAPICalled") {
      const text = m.params.args.map((a) => a.value ?? a.description ?? a.type).join(" ");
      logs.push({ level: m.params.type, text });
    } else if (m.method === "Runtime.exceptionThrown") {
      logs.push({ level: "exception", text: m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text });
    } else if (m.method === "Log.entryAdded") {
      logs.push({ level: "log-" + m.params.entry.level, text: m.params.entry.text + " " + (m.params.entry.url ?? "") });
    }
    for (const l of listeners) l(m);
  };
  const send = (method, params = {}) =>
    new Promise((res, rej) => {
      const i = ++id;
      pending.set(i, { res, rej });
      ws.send(JSON.stringify({ id: i, method, params }));
    });
  await send("Runtime.enable");
  await send("Page.enable");
  await send("Page.addScriptToEvaluateOnNewDocument", { source: INIT });
  await send("Log.enable");
  await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: scale, mobile });
  if (mobile) await send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
  await send("Emulation.setFocusEmulationEnabled", { enabled: true }).catch(() => {});
  const page = {
    targetId: t.id,
    logs,
    send,
    async goto(u) {
      await send("Page.navigate", { url: u });
      await page.waitFor("document.readyState === 'complete'", 30000);
    },
    async eval(expr) {
      const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true });
      if (r.exceptionDetails) throw new Error("eval: " + (r.exceptionDetails.exception?.description ?? r.exceptionDetails.text) + "\n" + expr.slice(0, 200));
      return r.result.value;
    },
    async waitFor(expr, timeout = 20000, interval = 150) {
      const t0 = Date.now();
      let last;
      while (Date.now() - t0 < timeout) {
        try {
          last = await page.eval(expr);
          if (last) return last;
        } catch (e) {
          last = e.message;
        }
        await sleep(interval);
      }
      throw new Error(`timeout waiting for: ${expr.slice(0, 160)} (last=${JSON.stringify(last)?.slice(0, 200)})`);
    },
    /** Click the first visible element matching a CSS selector and (optionally) containing text. */
    async click(selector, text, { index = 0 } = {}) {
      const ok = await page.eval(`(() => {
        const els = [...document.querySelectorAll(${JSON.stringify(selector)})].filter(e => {
          const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && ${text ? `(e.innerText||e.getAttribute('aria-label')||e.title||'').toLowerCase().includes(${JSON.stringify((text || "").toLowerCase())})` : "true"};
        });
        const el = els[${index}];
        if (!el) return false;
        el.scrollIntoView({block:'center'});
        el.click();
        return true;
      })()`);
      if (!ok) throw new Error(`click: not found ${selector} ${text ?? ""}`);
      await sleep(120);
    },
    /** Real mouse click at the element centre (for pointer-event handlers). */
    async mouseClick(selector, text, { index = 0 } = {}) {
      const c = await page.center(selector, text, index);
      await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: c.x, y: c.y });
      await send("Input.dispatchMouseEvent", { type: "mousePressed", x: c.x, y: c.y, button: "left", clickCount: 1 });
      await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: c.x, y: c.y, button: "left", clickCount: 1 });
      await sleep(150);
    },
    async center(selector, text, index = 0) {
      const c = await page.eval(`(() => {
        const els = [...document.querySelectorAll(${JSON.stringify(selector)})].filter(e => {
          const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && ${text ? `(e.innerText||e.getAttribute('aria-label')||e.title||e.textContent||'').toLowerCase().includes(${JSON.stringify((text || "").toLowerCase())})` : "true"};
        });
        const el = els[${index}];
        if (!el) return null;
        el.scrollIntoView({block:'center'});
        const r = el.getBoundingClientRect();
        return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
      })()`);
      if (!c) throw new Error(`center: not found ${selector} ${text ?? ""}`);
      return c;
    },
    async drag(from, to, steps = 12) {
      await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: from.x, y: from.y });
      await send("Input.dispatchMouseEvent", { type: "mousePressed", x: from.x, y: from.y, button: "left", buttons: 1, clickCount: 1 });
      for (let i = 1; i <= steps; i++) {
        const x = from.x + ((to.x - from.x) * i) / steps;
        const y = from.y + ((to.y - from.y) * i) / steps;
        await send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y, button: "left", buttons: 1 });
        await sleep(16);
      }
      await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: to.x, y: to.y, button: "left", buttons: 0, clickCount: 1 });
      await sleep(200);
    },
    async type(text) {
      await send("Input.insertText", { text });
      await sleep(60);
    },
    async key(key, code = key, keyCode = 13) {
      await send("Input.dispatchKeyEvent", { type: "keyDown", key, code, windowsVirtualKeyCode: keyCode, text: key === "Enter" ? "\r" : undefined });
      await send("Input.dispatchKeyEvent", { type: "keyUp", key, code, windowsVirtualKeyCode: keyCode });
      await sleep(60);
    },
    async screenshot(path, { full = false } = {}) {
      const r = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: full });
      writeFileSync(path, Buffer.from(r.data, "base64"));
      return path;
    },
    async close() {
      try {
        await fetch(`http://127.0.0.1:${port}/json/close/${t.id}`);
      } catch {}
      ws.close();
    },
    text: () => page.eval("document.body.innerText"),
    async idle(extra = 900, timeout = 30000) {
      await sleep(250);
      await page.waitFor(`window.__inflight === 0 && Date.now() - window.__lastDone > ${extra}`, timeout);
    },
    /** Type into the chat box of the workspace and send. */
    async chat(text) {
      const n = await page.eval("window.__turns.length");
      // Phones: the conversation lives in the Chat tab.
      await page.eval(`(() => { if (![...document.querySelectorAll('textarea')].some(e => e.getBoundingClientRect().width > 0)) document.getElementById('mtab-btn-chat')?.click(); })()`);
      await sleep(300);
      await page.eval(`(() => { const ta = [...document.querySelectorAll('textarea')].filter(e => e.getBoundingClientRect().width > 0).pop(); ta.focus(); return true; })()`);
      await page.type(text);
      await page.key("Enter");
      await page.waitFor(`window.__turns.length > ${n}`, 8000).catch(async () => {
        // Enter may insert a newline on some inputs: click the send button instead.
        await page.eval(`(() => { const b = [...document.querySelectorAll('button[aria-label]')].filter(e => /trimite|send/i.test(e.getAttribute('aria-label')) && e.getBoundingClientRect().width > 0).pop(); b && b.click(); })()`);
        await page.waitFor(`window.__turns.length > ${n}`, 8000);
      });
      await page.idle();
      return page.lastTurn();
    },
    /** Summary of the last chat turn: reply text, card kinds, verified badge, errors. */
    lastTurn() {
      return page.eval(`(() => {
        const t = window.__turns[window.__turns.length - 1] || [];
        const text = t.filter(e => e.type === 'text').map(e => e.delta).join('');
        const cards = t.filter(e => e.type === 'card').map(e => e.card.kind);
        const q = [...t].reverse().find(e => e.type === 'card' && e.card.kind === 'quote');
        const ch = [...t].reverse().find(e => e.type === 'card' && e.card.kind === 'change');
        const ver = t.find(e => e.type === 'verified');
        const err = t.filter(e => e.type === 'error').map(e => e.message);
        const ui = t.filter(e => e.type === 'ui').map(e => e.command);
        const st = [...t].reverse().find(e => e.type === 'state');
        return { text, cards, total: q ? q.card.quote.total : undefined, change: ch ? { edits: ch.card.change.edits, delta: ch.card.change.delta, after: ch.card.change.totalAfter } : undefined,
          verified: ver ? { ok: ver.ok, checked: ver.checked } : null, err, ui, project: st && st.state.project ? { type: st.state.project.type, title: st.state.project.title, inputs: st.state.project.inputs } : undefined };
      })()`);
    },
  };
  await page.goto(url);
  return page;
}

export { sleep };
