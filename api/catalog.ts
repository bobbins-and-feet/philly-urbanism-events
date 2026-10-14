import { buildCatalog } from "../src/catalog.js";

// Categories and sources for the feed builder page, with subscribe links for
// each category's Google Calendar once its ID is set in src/categories.ts.
export function GET(): Response {
  return Response.json(buildCatalog(), { headers: { "Cache-Control": "public, max-age=300, s-maxage=3600" } });
}
