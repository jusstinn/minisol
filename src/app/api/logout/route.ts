import { loginCookieName, loginCookieOptions } from "@/lib/siteLogin";

export const runtime = "nodejs";

function cleared(res: Response): Response {
  const o = loginCookieOptions(0);
  res.headers.append("Set-Cookie", `${loginCookieName()}=; Path=${o.path}; Max-Age=0; HttpOnly; SameSite=Lax${o.secure ? "; Secure" : ""}`);
  return res;
}

/** Sign out of the site gate. POST from the app; GET so a plain link works too. */
export async function POST() {
  return cleared(Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } }));
}

export async function GET(req: Request) {
  return cleared(new Response(null, { status: 303, headers: { Location: new URL("/login", req.url).toString(), "Cache-Control": "no-store" } }));
}
