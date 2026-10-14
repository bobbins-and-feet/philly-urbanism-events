import { categories } from "../src/categories.js";
import { site } from "../src/site.js";
import { sources } from "../src/sources/index.js";

// Categories and sources for the feed builder page, with subscribe links for
// each category's Google Calendar once its ID is set in src/categories.ts.
export function GET(): Response {
  const body = {
    submitCalendarUrl: site.submitCalendarUrl || null,
    categories: categories.map((category) => ({
      id: category.id,
      name: category.name,
      description: category.description,
      calendar: category.calendarId
        ? {
            google: `https://calendar.google.com/calendar/u/0/r?cid=${encodeURIComponent(category.calendarId)}`,
            ics: `https://calendar.google.com/calendar/ical/${encodeURIComponent(category.calendarId)}/public/basic.ics`,
          }
        : null,
      sources: sources
        .filter((s) => s.category === category.id)
        .map((s) => ({ id: s.id, name: s.name, homepage: s.homepage })),
    })),
  };
  return Response.json(body, { headers: { "Cache-Control": "public, max-age=300, s-maxage=3600" } });
}
