# Running locally

How to run the sync and the site on your own computer. For how the project fits together and how to look after it, see the [README](../README.md).

## What you need

- [Node.js](https://nodejs.org/) 20 or newer, which includes npm.
- Git.
- Optional: access to the group's Google Cloud project, if you need to work with the real calendars. Everything else works without it.

```bash
git clone https://github.com/bobbins-and-feet/philly-urbanism-events.git
```

```bash
cd philly-urbanism-events && npm install
```

## Without Google credentials

Most work, like adding a source, fixing a broken one or changing the site, needs no credentials at all.

### See what every source returns

```bash
npm run dry-run
```

This fetches all the sources and prints the events each one found for the next 180 days, plus any errors. It doesn't touch Google. For each source it also prints the date range it fully covers. The sync only deletes events inside that range.

### Run the site

```bash
npm run dev
```

Then open http://localhost:3000. Without credentials, feeds and the "Coming up" preview are built by fetching every source directly. The first load takes several seconds, and after that results are cached for 10 minutes.

The dev server doesn't reload code changes:
- **Files in `src/` or `api/`:** stop it with Ctrl+C and start it again.
- **Files in `public/`:** take effect on reload, but the browser caches `/api/catalog` for 5 minutes, so use a hard refresh (Cmd+Shift+R) if a change doesn't show.

### Check types

```bash
npm run typecheck
```

## With Google credentials

You only need this to see exactly what the sync would change in the real calendars, or to run a sync by hand.

> `npm run sync` writes to the live public calendars that people subscribe to. Run `npm run dry-run` first and read what it plans to do.

### Get a key

Use your own key rather than copying someone else's, so it can be removed when you step away.

1. In the [Google Cloud console](https://console.cloud.google.com/), open the project the group uses. Ask a current maintainer to add you under **IAM & Admin → IAM** if you can't see it.
2. Go to **IAM & Admin → Service Accounts**, click the `calendar-sync` account, then **Keys → Add key → Create new key → JSON**.
3. Save the downloaded file in the project folder as `service-account.json`. Git and Vercel both ignore that name, along with Google's default `philly-urbanism-events-*.json` names. Never commit it or paste it anywhere.

Then add the key to `.env` without printing it:

```bash
printf 'GOOGLE_SERVICE_ACCOUNT_KEY=%s\n' "$(base64 -i service-account.json | tr -d '\n')" > .env
```

### Preview the changes, then sync

```bash
npm run dry-run
```

With a key in `.env`, the dry run also reads the four calendars. It prints every event it would create, update or delete, without changing anything. When that looks right:

```bash
npm run sync
```

The output ends with a summary: counts of created, updated, deleted and unchanged events, and any errors. Running it again straight away should report everything as unchanged.

With a key in `.env`, `npm run dev` reads feeds from the real calendars, the same way the live site does.

When you're done with the project, delete your key on the service account's **Keys** tab.

## Commands

| Command | What it does |
|---|---|
| `npm run dry-run` | Fetch every source and list events. With a key, also show what the sync would change. |
| `npm run sync` | Fetch every source and write the changes to the calendars. Needs a key. |
| `npm run dev` | Serve the site and API at http://localhost:3000. |
| `npm run typecheck` | Check the TypeScript. |
| `npm run og-image` | Re-render the link-preview image and home-screen icon from `assets/`. Needs Google Chrome. |

## Where things are

```
api/                 Vercel functions
  sync.ts            daily cron job: fetch sources, update calendars
  feed.ts            custom feeds (/feed.ics) and the page's event preview
  catalog.ts         categories and sources for the page
src/
  sources/           one adapter per site, plus index.ts, the list of sources
  categories.ts      the four categories and their calendar IDs
  collect.ts         runs the adapters and removes duplicates
  googleCalendar.ts  writes events to the calendars
  feed.ts            builds custom feeds from the calendars
  site.ts            site settings (the "Submit a calendar" form link)
public/              the home page: index.html, styles.css, app.js, and images
assets/              sources for the link-preview image and icon
scripts/             the dry-run, sync and dev-server commands
vercel.json          cron schedule and routes
```

## Adding or fixing a source

1. Pick a starting point from the list in the README's [Adding a source](../README.md#add-a-source) section. If the site publishes an `.ics` feed, a single `icsSource({...})` entry in `src/sources/index.ts` is enough.
2. Add the source to `src/sources/index.ts` with its category and homepage. Its position in the list decides which copy is kept when two sources list the same event.
3. Run `npm run dry-run` and check its events: titles, times in Eastern time, locations and links.
4. Run `npm run dev` and check that it shows up in the category card and the feed builder.
5. Open a pull request. Once it's merged, the next daily sync picks it up.

## Troubleshooting

- **A source shows ✗ in the dry run.** The error says which request failed. Open that URL in a browser: sites often redesign, move their events page, or start blocking scripts.
- **"Rate Limit Exceeded" from Google.** This happens when many events are written at once, as on a first sync. The sync waits and retries on its own. If some still fail, run it again; it only writes what's missing.
- **Times look a few hours off in your terminal.** Check whether you're seeing UTC. Events are stored with their time zone, and the dry run prints Philadelphia time.
- **The page shows old data after a change.** Restart `npm run dev` and hard refresh.
