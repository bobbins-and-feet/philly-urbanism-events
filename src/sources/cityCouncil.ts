import * as cheerio from "cheerio";
import { DateTime } from "luxon";
import { fetchText } from "../http.js";
import { inWindow } from "../text.js";
import { TIME_ZONE, type CalEvent, type SourceAdapter } from "../types.js";

// Council's calendar is a Legistar site. Its official API (webapi.legistar.com)
// needs a token, so this reads the public calendar table instead. The table's
// date range is chosen by a cookie; "This Month" plus "Next Month" covers
// everything that is normally scheduled.
const BASE_URL = "https://phila.legistar.com/";
const RANGES = ["This Month", "Next Month"];

function cookieFor(range: string): string {
  return [
    `Setting-30-Calendar Year=${range}`,
    "Setting-30-Calendar Body=All",
    "Setting-30-Calendar Options=info|",
  ].join("; ");
}

function parseTable(html: string): CalEvent[] {
  const $ = cheerio.load(html);
  const events: CalEvent[] = [];

  $("tr.rgRow, tr.rgAltRow").each((_, row) => {
    const cells = $(row).children("td");
    const body = cells.eq(0).text().trim();
    const date = cells.eq(1).text().trim();
    const time = cells.eq(3).text().trim();
    if (!body || !date) return;
    if (/cancel/i.test(time)) return;

    const icsHref = cells.eq(2).find("a[href*='M=IC']").attr("href") ?? "";
    const id = /ID=(\d+)/.exec(icsHref)?.[1];
    if (!id) return;

    const start = DateTime.fromFormat(`${date} ${time}`, "M/d/yyyy h:mm a", { zone: TIME_ZONE });
    if (!start.isValid) return;

    // The location cell is "Room 400, City Hall<br><em>note</em>".
    const locationCell = cells.eq(4);
    const note = locationCell.find("em").text().trim();
    locationCell.find("em").remove();
    const location = locationCell.text().trim();

    const detailHref = cells.eq(5).find("a").attr("href");
    const agendaHref = cells.eq(6).find("a").attr("href");
    const url = new URL(detailHref ?? "Calendar.aspx", BASE_URL).toString();

    events.push({
      uid: `legistar-${id}`,
      title: body,
      start,
      end: start.plus({ hours: 2 }),
      allDay: false,
      location: location || undefined,
      url,
      description:
        [note, agendaHref && `Agenda: ${new URL(agendaHref, BASE_URL)}`].filter(Boolean).join("\n\n") || undefined,
    });
  });

  return events;
}

export const cityCouncil: SourceAdapter = {
  id: "city-council",
  name: "Philadelphia City Council",
  shortName: "City Council",
  async fetchEvents(window) {
    const pages = await Promise.all(
      RANGES.map((range) => fetchText(`${BASE_URL}Calendar.aspx`, { Cookie: cookieFor(range) })),
    );
    const byId = new Map<string, CalEvent>();
    for (const event of pages.flatMap(parseTable)) byId.set(event.uid, event);
    const events = [...byId.values()].filter((e) => inWindow(e, window));

    const now = DateTime.now().setZone(TIME_ZONE);
    const coveredUntil = DateTime.min(now.plus({ months: 1 }).endOf("month"), window.to);
    return { events, coverage: { from: window.from, to: coveredUntil } };
  },
};
