// Serveur de développement local : sert l'API (même routeur que la fonction
// Netlify) et, si `dist/` existe, les fichiers statiques du frontend compilé.
// Usage : npm run dev  (PORT=8888 par défaut)

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { handleApiRequest } from "../server/router.js";
import { loadDotEnv } from "./load-env.js";

loadDotEnv();

const PORT = Number(process.env.PORT || 8888);
const DIST = join(process.cwd(), "dist");

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

async function toRequest(req: IncomingMessage): Promise<Request> {
  const url = `http://localhost:${PORT}${req.url ?? "/"}`;
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (typeof value === "string") headers.set(key, value);
    else if (Array.isArray(value)) headers.set(key, value.join(", "));
  }
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const bodyBuffer = Buffer.concat(chunks);
  return new Request(url, {
    method: req.method,
    headers,
    body: ["GET", "HEAD"].includes(req.method ?? "GET") ? undefined : bodyBuffer,
  });
}

async function writeResponse(res: ServerResponse, response: Response): Promise<void> {
  const headers: Record<string, string | string[]> = {};
  response.headers.forEach((value, key) => {
    headers[key] = key.toLowerCase() === "set-cookie" ? [value] : value;
  });
  res.writeHead(response.status, headers);
  const buffer = Buffer.from(await response.arrayBuffer());
  res.end(buffer);
}

const server = createServer(async (req, res) => {
  try {
    const url = req.url ?? "/";
    if (url.startsWith("/api/")) {
      const response = await handleApiRequest(await toRequest(req));
      await writeResponse(res, response);
      return;
    }
    // Frontend statique (SPA)
    if (existsSync(DIST)) {
      const clean = normalize(url.split("?")[0]).replace(/^(\.\.[/\\])+/, "");
      let filePath = join(DIST, clean);
      if (!existsSync(filePath) || clean === "/") filePath = join(DIST, "index.html");
      const type = MIME[extname(filePath)] ?? "application/octet-stream";
      res.writeHead(200, { "content-type": type });
      res.end(readFileSync(filePath));
      return;
    }
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("dist/ introuvable — exécutez `npm run build` d'abord.");
  } catch (err) {
    console.error(err);
    res.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
    res.end("Erreur interne");
  }
});

server.listen(PORT, () => {
  console.log(`Gestionnaire St-Amour du Vert — serveur local sur http://localhost:${PORT}`);
});
