import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildCatalog } from "../src/catalog.js";
import { loadFeedEvents } from "../src/feed.js";
import { renderPage } from "../src/render.js";
import { sources } from "../src/sources/index.js";

// The home page, served at "/" (see vercel.json). It fills templates/index.html
// with the categories, organizations, upcoming events and their structured
// data, so search engines see the content without running JavaScript.
// Vercel's CDN caches it for an hour, like the feeds.
const CACHE_HEADER = "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400";

let template: string | undefined;

export async function GET(): Promise<Response> {
  template ??= readFileSync(join(process.cwd(), "templates", "index.html"), "utf8");

  let events: Awaited<ReturnType<typeof loadFeedEvents>> = [];
  try {
    events = await loadFeedEvents(sources);
  } catch (error) {
    // Still serve the page; the script in the browser loads events itself.
    console.error("home: could not load events", error);
  }

  return new Response(renderPage(template, buildCatalog(), events), {
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": CACHE_HEADER },
  });
}
