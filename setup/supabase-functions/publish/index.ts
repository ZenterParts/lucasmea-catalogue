// Supabase Edge Function "publish" (deployed to the Master Data project).
// 1. Staff site "Publish to website" button (signed-in editor): records a request and, if a GitHub token
//    is configured (secret GH_PUBLISH_TOKEN), starts the GitHub publish job straight away.
// 2. The GitHub publish job: proves who it is with GitHub's own identity token (OIDC), then reads the
//    catalogue numbers and reports the result. No passwords are stored on GitHub.
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { createRemoteJWKSet, jwtVerify } from "npm:jose@5.9.6";

const REPO = "ZenterParts/lucasmea-catalogue";
const AUDIENCE = "lucasmea-publish";
const GH_JWKS = createRemoteJWKSet(new URL("https://token.actions.githubusercontent.com/.well-known/jwks"));
const URL_ = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const ORIGINS = ["https://lucasmeacatalogue.com", "https://www.lucasmeacatalogue.com"];
function cors(req: Request) {
  const o = req.headers.get("origin") || "";
  return {
    "Access-Control-Allow-Origin": ORIGINS.includes(o) ? o : ORIGINS[0],
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}
const json = (req: Request, body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors(req), "Content-Type": "application/json" } });

async function fromGitHub(token: string) {
  const { payload } = await jwtVerify(token, GH_JWKS, { issuer: "https://token.actions.githubusercontent.com", audience: AUDIENCE });
  if (payload.repository !== REPO || payload.ref !== "refs/heads/main") throw new Error("wrong repository or branch");
  return payload;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(req) });
  if (req.method !== "POST") return json(req, { error: "POST only" }, 405);
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* empty */ }
  const action = String(body.action || "");

  try {
    // ---- staff site button
    if (action === "request") {
      const user = createClient(URL_, ANON, { global: { headers: { Authorization: "Bearer " + token } }, auth: { persistSession: false } });
      const { data: id, error } = await user.rpc("request_publish");
      if (error) return json(req, { error: error.message }, 403);
      const gh = Deno.env.get("GH_PUBLISH_TOKEN");
      let dispatched = false, note = "";
      if (gh) {
        const r = await fetch(`https://api.github.com/repos/${REPO}/actions/workflows/publish.yml/dispatches`, {
          method: "POST",
          headers: { Authorization: "Bearer " + gh, Accept: "application/vnd.github+json", "User-Agent": "lucas-publish", "Content-Type": "application/json" },
          body: JSON.stringify({ ref: "main", inputs: { source: "button" } }),
        });
        dispatched = r.ok; if (!r.ok) note = "GitHub said " + r.status;
      }
      return json(req, { id, dispatched, note });
    }

    // ---- GitHub publish job
    await fromGitHub(token);
    const svc = createClient(URL_, SERVICE, { auth: { persistSession: false } });
    if (action === "pending") {
      const { data, error } = await svc.rpc("publish_pending", { p_key: "" }); if (error) throw error;
      return json(req, { pending: data });
    }
    if (action === "snapshot") {
      const { data, error } = await svc.rpc("publish_snapshot", { p_key: "" }); if (error) throw error;
      return json(req, data);
    }
    if (action === "report") {
      const { error } = await svc.rpc("publish_report", { p_key: "", p_status: String(body.status || ""), p_source: (body.source as string) || null, p_sha: (body.sha as string) || null, p_summary: body.summary ?? null });
      if (error) throw error;
      return json(req, { ok: true });
    }
    return json(req, { error: "unknown action" }, 400);
  } catch (e) {
    return json(req, { error: String((e as Error)?.message || e) }, 401);
  }
});
