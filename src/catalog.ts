import { categories } from "./categories.js";
import { site } from "./site.js";
import { sources } from "./sources/index.js";

/** Categories and sources as the home page uses them, with subscribe links. */
export type Catalog = {
  submitCalendarUrl: string | null;
  categories: {
    id: string;
    name: string;
    description: string;
    calendar: { google: string; ics: string } | null;
    sources: { id: string; name: string; homepage: string }[];
  }[];
};

export function buildCatalog(): Catalog {
  return {
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
}
