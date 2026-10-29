import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Same as ./cdp.mjs launch(), but WITHOUT forcing SwiftShader (software GL) — this
 *  Mac's headless Chrome gets real Metal-backed ANGLE acceleration, which is what we want for a
 *  representative frame-time measurement. */
export async function launchGpu({ port = 9335, profile = join(tmpdir(), "blueprint-qa-chrome-gpu-real"), headless = true } = {}) {
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
