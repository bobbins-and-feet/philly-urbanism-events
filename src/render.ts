import { DateTime } from "luxon";
import type { Catalog } from "./catalog.js";
import type { FeedEvent } from "./feed.js";
import { TIME_ZONE } from "./types.js";

// Server-side rendering for the home page, so search engines and link
// previews see the categories, organizations and upcoming events without
// running JavaScript. The markup matches what public/app.js builds, and
// app.js takes over once it loads.

export const SITE_URL = "https://phillyurbanismevents.com/";

const PREVIEW_COUNT = 8;
const STRUCTURED_DATA_DAYS = 60;
const STRUCTURED_DATA_MAX = 100;

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** JSON for inside a <script> tag; escapes "<" so the content can't close the tag. */
function scriptJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

function startOf(event: FeedEvent): DateTime {
  return event.allDay ? DateTime.fromISO(event.start, { zone: TIME_ZONE }) : DateTime.fromISO(event.start, { setZone: true });
}

function endOf(event: FeedEvent): DateTime {
  return event.allDay ? DateTime.fromISO(event.end, { zone: TIME_ZONE }) : DateTime.fromISO(event.end, { setZone: true });
}

/** Events that haven't finished yet, soonest first. */
export function upcoming(events: FeedEvent[], now = DateTime.now()): FeedEvent[] {
  return events.filter((e) => endOf(e) >= now);
}

// ----- Visible content (mirrors public/app.js) -----

export function renderCards(catalog: Catalog): string {
  return catalog.categories
    .map((category) => {
      const actions = category.calendar
        ? `<a class="button primary" href="${escapeHtml(category.calendar.google)}" target="_blank" rel="noopener">Add to Google Calendar</a>` +
          `<button type="button" class="button">Copy iCal link</button>`
        : `<span class="muted">Subscribe link coming soon. Use the feed builder below in the meantime.</span>`;
      const orgs = category.sources
        .map((s) => `<li><a href="${escapeHtml(s.homepage)}" target="_blank" rel="noopener">${escapeHtml(s.name)}</a></li>`)
        .join("");
      return (
        `<article class="card cat-${escapeHtml(category.id)}">` +
        `<h3>${escapeHtml(category.name)}</h3>` +
        `<p>${escapeHtml(category.description)}</p>` +
        `<ul class="org-list" aria-label="Organizations in ${escapeHtml(category.name)}">${orgs}</ul>` +
        `<div class="card-actions">${actions}</div>` +
        `</article>`
      );
    })
    .join("");
}

export function renderPicker(catalog: Catalog): string {
  return catalog.categories
    .map((category) => {
      const options = category.sources
        .map(
          (s) =>
            `<label class="option"><input type="checkbox" name="source" value="${escapeHtml(s.id)}" checked><span>${escapeHtml(s.name)}</span></label>`,
        )
        .join("");
      return (
        `<fieldset class="group cat-${escapeHtml(category.id)}">` +
        `<legend><span class="group-head"><span class="group-title">${escapeHtml(category.name)}</span>` +
        `<button type="button" class="link-button" aria-label="Clear in ${escapeHtml(category.name)}">Clear</button></span></legend>` +
        `<div class="options">${options}</div>` +
        `</fieldset>`
      );
    })
    .join("");
}

function formatWhen(event: FeedEvent): { day: string; sub: string } {
  const start = startOf(event).setZone(TIME_ZONE);
  const day = start.toFormat("LLL d");
  return event.allDay
    ? { day, sub: `${start.toFormat("ccc")} · all day` }
    : { day, sub: `${start.toFormat("ccc")} ${start.toFormat("h:mm a")}` };
}

export function renderPreview(events: FeedEvent[]): string {
  if (events.length === 0) {
    return `<li class="preview-empty">No upcoming events right now.</li>`;
  }
  return events
    .slice(0, PREVIEW_COUNT)
    .map((event) => {
      const when = formatWhen(event);
      const title = event.url
        ? `<a href="${escapeHtml(event.url)}" target="_blank" rel="noopener">${escapeHtml(event.title)}</a>`
        : escapeHtml(event.title);
      const meta = [event.sourceName, event.location].filter(Boolean).map((v) => escapeHtml(v!)).join(" · ");
      return (
        `<li><div class="preview-date"><strong>${escapeHtml(when.day)}</strong>${escapeHtml(when.sub)}</div>` +
        `<div><div class="preview-title">${title}</div><div class="preview-meta">${meta}</div></div></li>`
      );
    })
    .join("");
}

// ----- Structured data -----

const VIRTUAL = /\b(virtual|online|zoom|webex|teams)\b/i;

/** The event's own description, without the "More info" and "Source" lines the sync adds. */
function cleanDescription(event: FeedEvent): string | undefined {
  const text = (event.description ?? "")
    .split(/\n{2,}/)
    .filter((part) => !/^(More info|Source|Agenda):/.test(part.trim()))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  return text ? text.slice(0, 300) : undefined;
}

/**
 * schema.org Event data for upcoming events, so search engines can show them
 * in event listings. Events without a location are left out, because search
 * engines require one.
 */
export function structuredData(events: FeedEvent[], catalog: Catalog, now = DateTime.now()): object {
  const homepages = new Map(catalog.categories.flatMap((c) => c.sources.map((s) => [s.id, s.homepage] as const)));
  const until = now.plus({ days: STRUCTURED_DATA_DAYS });

  const eventData = events
    .filter((e) => e.location && startOf(e) <= until)
    .slice(0, STRUCTURED_DATA_MAX)
    .map((e) => {
      const virtual = VIRTUAL.test(e.location ?? "");
      const data: Record<string, unknown> = {
        "@type": "Event",
        name: e.title,
        startDate: e.allDay ? e.start : startOf(e).toISO({ suppressMilliseconds: true }),
        endDate: e.allDay ? endOf(e).minus({ days: 1 }).toISODate() : endOf(e).toISO({ suppressMilliseconds: true }),
        eventStatus: "https://schema.org/EventScheduled",
        eventAttendanceMode: virtual ? "https://schema.org/OnlineEventAttendanceMode" : "https://schema.org/OfflineEventAttendanceMode",
        location: virtual
          ? { "@type": "VirtualLocation", url: e.url ?? SITE_URL }
          : { "@type": "Place", name: e.location, address: { "@type": "PostalAddress", streetAddress: e.location, addressCountry: "US" } },
        organizer: { "@type": "Organization", name: e.sourceName, url: homepages.get(e.sourceId) },
      };
      if (e.url) data.url = e.url;
      const description = cleanDescription(e);
      if (description) data.description = description;
      return data;
    });

  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        name: "Philadelphia Urbanism Events",
        url: SITE_URL,
        description:
          "Calendars of Philadelphia City Council hearings, SEPTA and planning meetings, group bike rides and urbanist advocacy events.",
      },
      ...eventData,
    ],
  };
}

// ----- Page -----

export function renderPage(template: string, catalog: Catalog, events: FeedEvent[]): string {
  const soon = upcoming(events);
  const total = catalog.categories.reduce((n, c) => n + c.sources.length, 0);
  const head =
    `<script type="application/ld+json">${scriptJson(structuredData(soon, catalog))}</script>\n` +
    `<script id="catalog-data" type="application/json">${scriptJson(catalog)}</script>`;

  let html = template
    .replace("<!--ssr:head-->", head)
    .replace("<!--ssr:cards-->", renderCards(catalog))
    .replace("<!--ssr:picker-->", renderPicker(catalog))
    .replace("<!--ssr:count-->", escapeHtml(`All ${total} organizations`))
    .replace("<!--ssr:preview-->", renderPreview(soon));

  if (catalog.submitCalendarUrl) {
    const href = escapeHtml(catalog.submitCalendarUrl);
    html = html
      .replace(/data-submit-calendar-link/g, `data-submit-calendar-link href="${href}"`)
      .replace(/(<[^>]*\bdata-submit-calendar\b[^>]*?)\s+hidden>/g, "$1>");
  }
  return html;
}
