import { resolve, join } from "node:path";
import { EvaluationStore } from "./evaluation-store";

const root = resolve(import.meta.dir, "..");
const publicDirectory = join(root, "public");
const store = await EvaluationStore.create(root);
const port = Number(process.env.PORT ?? "3000");
const hostname = process.env.HOST ?? "127.0.0.1";

function json(value: unknown, status = 200): Response {
  return Response.json(value, { status, headers: { "cache-control": "no-store" } });
}

function validClientId(value: string | null): value is string {
  return value !== null && /^[A-Za-z0-9-]{16,80}$/.test(value);
}

const staticFiles: Record<string, { path: string; type: string }> = {
  "/": { path: "index.html", type: "text/html; charset=utf-8" },
  "/app.js": { path: "app.js", type: "text/javascript; charset=utf-8" },
  "/style.css": { path: "style.css", type: "text/css; charset=utf-8" },
};

const server = Bun.serve({
  hostname,
  port,
  async fetch(request) {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/api/next") {
      const clientId = url.searchParams.get("client");
      if (!validClientId(clientId)) return json({ error: "Invalid client id" }, 400);
      return json({ item: store.next(clientId) });
    }

    if (request.method === "POST" && url.pathname === "/api/evaluations") {
      try {
        const body = (await request.json()) as Record<string, unknown>;
        const clientId = typeof body.client === "string" ? body.client : null;
        if (!validClientId(clientId)) return json({ error: "Invalid client id" }, 400);
        if (typeof body.token !== "string") return json({ error: "Invalid token" }, 400);
        if (typeof body.score !== "number") return json({ error: "Score must be a number" }, 400);
        const comment = typeof body.comment === "string" ? body.comment : "";
        await store.submit(clientId, body.token, body.score, comment);
        return json({ ok: true });
      } catch (error) {
        return json({ error: error instanceof Error ? error.message : "Invalid request" }, 400);
      }
    }

    if (request.method === "GET" && staticFiles[url.pathname]) {
      const asset = staticFiles[url.pathname];
      return new Response(Bun.file(join(publicDirectory, asset.path)), {
        headers: { "content-type": asset.type, "cache-control": "no-cache" },
      });
    }
    return new Response("Not found", { status: 404 });
  },
});

console.log(`Hito Bench: http://${server.hostname}:${server.port}`);
