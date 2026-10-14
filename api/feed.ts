import { categories } from "../src/categories.js";
import { loadFeedEvents, toICalendar } from "../src/feed.js";
import { sources } from "../src/sources/index.js";

// A custom calendar feed. Served as /feed.ics (see vercel.json).
//
//   /feed.ics                          every source
//   /feed.ics?sources=septa,dvrpc      chosen sources
//   /feed.ics?categories=government    whole categories
//   /api/feed?format=json&limit=8      the same events as JSON, for the feed builder
//
// Responses are cached by Vercel's CDN for an hour, so calendar apps polling a
// feed don't each trigger a calendar read.
const CACHE_HEADER = "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400";

function listParam(url: URL, name: string): string[] {
  return (url.searchParams.get(name) ?? "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const sourceIds = listParam(url, "sources");
  const categoryIds = listParam(url, "categories");

  const unknown = [
    ...sourceIds.filter((id) => !sources.some((s) => s.id === id)),
    ...categoryIds.filter((id) => !categories.some((c) => c.id === id)),
  ];
  if (unknown.length > 0) {
    return new Response(`Unknown source or category: ${unknown.join(", ")}`, { status: 400 });
  }

  const selected =
    sourceIds.length || categoryIds.length
      ? sources.filter((s) => sourceIds.includes(s.id) || (categoryIds as string[]).includes(s.category))
      : sources;

  try {
    let events = await loadFeedEvents(selected);

    if (url.searchParams.get("format") === "json") {
      const limit = Number(url.searchParams.get("limit"));
      if (limit > 0) events = events.filter((e) => new Date(e.end) >= new Date()).slice(0, limit);
      return Response.json({ events }, { headers: { "Cache-Control": CACHE_HEADER } });
    }

    const name =
      selected.length === sources.length
        ? "Philadelphia Urbanism Events"
        : selected.length === 1
          ? `Philadelphia Urbanism Events: ${selected[0].name}`
          : "Philadelphia Urbanism Events (custom)";
    return new Response(toICalendar(events, name), {
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": 'inline; filename="philadelphia-urbanism-events.ics"',
        "Cache-Control": CACHE_HEADER,
      },
    });
  } catch (error) {
    console.error(error);
    return new Response("Could not load events", { status: 502 });
  }
}
