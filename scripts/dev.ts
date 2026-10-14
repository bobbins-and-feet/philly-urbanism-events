// A small local server for working on the feed builder: serves public/ and
// the API routes the same way Vercel does.
//
//   npm run dev     then open http://localhost:3000
//
// Without GOOGLE_SERVICE_ACCOUNT_KEY in .env, feeds are built by fetching every
// source directly, so the first request takes several seconds.
import { existsSync, readFileSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";

if (existsSync(".env")) {
  for (const line of readFileSync(".env", "utf8").split("\n")) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (match && process.env[match[1]] === undefined) {
      process.env[match[1]] = match[2].replace(/^(['"])(.*)\1$/, "$2");
    }
  }
}

const { GET: feed } = await import("../api/feed.js");
const { GET: catalog } = await import("../api/catalog.js");

const routes: Record<string, (request: Request) => Response | Promise<Response>> = {
  "/api/feed": feed,
  "/feed.ics": feed,
  "/api/catalog": catalog,
};

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
};

const port = Number(process.env.PORT ?? 3000);

createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://localhost:${port}`);
  try {
    const route = routes[url.pathname];
    if (route) {
      const response = await route(new Request(url));
      res.writeHead(response.status, Object.fromEntries(response.headers));
      res.end(Buffer.from(await response.arrayBuffer()));
      return;
    }

    const path = normalize(join("public", url.pathname === "/" ? "index.html" : url.pathname));
    if (!path.startsWith("public") || !existsSync(path)) {
      res.writeHead(404).end("Not found");
      return;
    }
    res.writeHead(200, { "Content-Type": TYPES[extname(path)] ?? "application/octet-stream" });
    res.end(readFileSync(path));
  } catch (error) {
    console.error(error);
    res.writeHead(500).end("Server error");
  }
}).listen(port, () => console.log(`http://localhost:${port}`));
