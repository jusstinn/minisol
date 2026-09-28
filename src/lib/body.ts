/** The body as text, or null once it grows past `max` bytes (never buffers more than that). */
export async function readCapped(req: Request, max: number): Promise<string | null> {
  if (Number(req.headers.get("content-length") ?? 0) > max) return null;
  if (!req.body) return "";
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(value);
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
}

/**
 * Parse a JSON body of at most `max` bytes. Returns the value, or the Response to send
 * (413 when too large, 400 when not JSON) — so a 10 MB body is never parsed.
 */
export async function readJson(req: Request, max: number): Promise<{ ok: true; body: unknown } | { ok: false; res: Response }> {
  let raw: string | null;
  try {
    raw = await readCapped(req, max);
  } catch {
    return { ok: false, res: Response.json({ error: "Invalid body" }, { status: 400 }) };
  }
  if (raw === null) return { ok: false, res: Response.json({ error: "Request too large" }, { status: 413 }) };
  try {
    return { ok: true, body: JSON.parse(raw) };
  } catch {
    return { ok: false, res: Response.json({ error: "Invalid JSON" }, { status: 400 }) };
  }
}
