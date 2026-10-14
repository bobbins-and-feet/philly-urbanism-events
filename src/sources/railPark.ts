import { DateTime } from "luxon";
import { fetchText } from "../http.js";
import { inWindow } from "../text.js";
import { TIME_ZONE, type CalEvent, type SourceAdapter } from "../types.js";

// therailpark.org is built on the Prismic CMS, whose content API is public.
// Event documents carry exact start and end times in UTC.
const API = "https://railpark.cdn.prismic.io/api/v2";
const SITE = "https://www.therailpark.org";

type RichText = { type: string; text: string }[];
type EventDoc = {
  uid: string;
  data: {
    title?: string;
    start?: string;
    end?: string | null;
    all_day?: boolean;
    featured_excerpt?: string | RichText | null;
    recurring_event?: boolean;
    location?: { venue?: string | null; address?: RichText }[];
  };
};

function richText(value: string | RichText | null | undefined): string {
  if (!value) return "";
  if (typeof value === "string") return value.trim();
  return value.map((block) => block.text).join("\n").trim();
}

export const railPark: SourceAdapter = {
  id: "rail-park",
  name: "Friends of the Rail Park",
  shortName: "Rail Park",
  async fetchEvents(window) {
    const api = JSON.parse(await fetchText(API));
    const ref = api.refs.find((r: { isMasterRef?: boolean }) => r.isMasterRef)?.ref;
    if (!ref) throw new Error("Prismic API returned no master ref");

    const docs: EventDoc[] = [];
    for (let page = 1, totalPages = 1; page <= totalPages && page <= 10; page++) {
      const url = new URL(`${API}/documents/search`);
      url.searchParams.set("ref", ref);
      url.searchParams.append("q", '[[at(document.type,"event")]]');
      // Starts up to a week back, so events already underway are included.
      url.searchParams.append("q", `[[date.after(my.event.start,"${window.from.minus({ days: 7 }).toISODate()}")]]`);
      url.searchParams.append("q", `[[date.before(my.event.start,"${window.to.toISODate()}")]]`);
      url.searchParams.set("pageSize", "100");
      url.searchParams.set("page", String(page));
      const body = JSON.parse(await fetchText(url.toString()));
      docs.push(...body.results);
      totalPages = body.total_pages ?? 1;
    }

    const events: CalEvent[] = [];
    for (const doc of docs) {
      const { data } = doc;
      if (!data.start) continue;
      // Repeating events are listed by their first date only. None exist today;
      // if they appear, expand them using data.frequency / data.interval.
      const allDay = Boolean(data.all_day);
      let start = DateTime.fromISO(data.start).setZone(TIME_ZONE);
      let end = data.end ? DateTime.fromISO(data.end).setZone(TIME_ZONE) : start.plus({ hours: 1 });
      if (!start.isValid) continue;
      if (allDay) {
        start = start.startOf("day");
        end = (end.isValid && end > start ? end : start).startOf("day").plus({ days: 1 });
      } else if (!end.isValid || end <= start) {
        end = start.plus({ hours: 1 });
      }

      const place = data.location?.[0];
      const location = [place?.venue, richText(place?.address)].filter(Boolean).join(", ");
      const event: CalEvent = {
        uid: doc.uid,
        title: data.title?.trim() || "(untitled event)",
        start,
        end,
        allDay,
        location: location || undefined,
        url: `${SITE}/event/${doc.uid}/`,
        description: richText(data.featured_excerpt) || undefined,
      };
      if (inWindow(event, window)) events.push(event);
    }

    return { events, coverage: window };
  },
};
