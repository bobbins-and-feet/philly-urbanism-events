# Philadelphia Urbanism Events

Pulls events from Philadelphia urbanism groups and public agencies into Google Calendars that anyone can subscribe to. A Vercel cron job runs the sync once a day.

There are two ways to subscribe, both on the site's home page:

- **By category.** Each category is its own public Google Calendar, so people can toggle categories on and off in their calendar app.
- **Build your own feed.** People pick organizations and get a personal `/feed.ics?sources=…` link for Google, Apple or Outlook. Choices are kept in the page's address, so a selection can be shared as a link.

| Category | Sources |
|---|---|
| Advocacy groups | 5th Square Advocacy, Philly Bike Action, Transit Forward Philadelphia, Clean Air Council |
| Government & agencies | City Council, City Planning Commission, OTIS, SEPTA, DVRPC |
| Rides & bike events | Philly Bike Train, Indego, Bicycle Coalition |
| Parks & public space | Friends of the Rail Park, Center City District |

Categories and their calendar IDs live in `src/categories.ts`, and each source's category is set in `src/sources/index.ts`.

| Source | How it's read |
|---|---|
| 5th Square Advocacy | Their public Google Calendar feed (.ics), which their Neon CRM event list syncs to |
| Philly Bike Action | Their calendar feed at `bikeaction.org/events/calendar/all/` |
| Transit Forward Philadelphia | The NationBuilder events list at `www.transitforwardphilly.org/events` |
| Philly Bike Train | The ride-tracker API behind `phillybiketrain.org`; one calendar event per ride day, with every route listed |
| Friends of the Rail Park | The public Prismic content API behind `therailpark.org` |
| Clean Air Council | The Events Calendar REST API at `cleanair.org`, Philadelphia venues only |
| Philadelphia City Council | The Legistar calendar table at `phila.legistar.com`, this month and next |
| City Planning Commission | The events list on its phila.gov department page |
| OTIS | The events list on its phila.gov department page (often empty) |
| SEPTA | The events list at `wwww.septa.org/events/` |
| DVRPC | The JSON endpoint behind `dvrpc.org/stay-connected/events`, without "Offices Closed" days |
| Center City District | The Events Calendar REST API at `centercityphila.org`, without Dilworth Park programming |
| Indego | The Events Calendar REST API at `rideindego.com` |
| Bicycle Coalition | The events RSS feed; it only lists the next 10 events |

Each event title starts with its source, e.g. `[SEPTA] SEPTA Board Regular Meeting`.

Two listings count as the same event when they share a start time and title, treating "Philly" and "Philadelphia" as the same word. Duplicates are handled like this:

- **Within a category calendar**, the copy from the source listed first in `src/sources/index.ts` is kept. The other sources are recorded on the event, so a custom feed for any of them still includes it.
- **In a custom feed**, each event appears once, even if it's listed in more than one category.
- **If you subscribe to two category calendars**, an event listed by groups in both can appear twice.

Some groups have no event listing to pull from. Feet First Philly announces its quarterly meetings through its newsletter and social media. Families for Safe Streets and Vision Zero Philadelphia have no calendars of their own, and their events (such as World Day of Remembrance) usually appear on the Bicycle Coalition's calendar. The Streets Department's page has no calendar.

## How the sync behaves

- It only touches events it created, which it finds by a hidden tag on each event. Events you add to the calendar by hand are left alone.
- Changed events are updated in place, and unchanged ones are skipped.
- An event is deleted when its source stops listing it. Deletion only happens inside the date range that source fully covers, so the Bicycle Coalition's short feed never deletes events further out.
- If a source fails (the site is down or its layout changed), its existing events stay as they are, and the run reports the error.
- Canceled City Council meetings are removed.

## Setup

Do the Google steps signed in as the group's shared Google account, so the calendars and the Cloud project belong to the group rather than to one person.

### 1. Create a service account

1. In the [Google Cloud console](https://console.cloud.google.com/), create a project.
2. Enable the **Google Calendar API** under APIs & Services → Library.
3. Under IAM & Admin → Service Accounts, create a service account. It needs no roles.
4. Open the service account, then **Keys → Add key → JSON**. Save the file as `service-account.json` in this folder; git and Vercel both ignore it. Keep it private.
5. Optional: under IAM & Admin → IAM, add organizers' personal accounts as **Owner**, so they can manage the project without the shared login.

### 2. Create the four category calendars

For each category in `src/categories.ts`:

1. In Google Calendar, go to **Other calendars → + → Create new calendar**. Name it, e.g. "Philadelphia Urbanism: Advocacy groups", and set the time zone to Eastern.
2. In its **Settings and sharing**:
   - Under **Access permissions for events**, turn on **Make available to public**.
   - Under **Share with specific people or groups**, add the service account's email (`…@….iam.gserviceaccount.com`) with **Make changes to events**. Add organizers' own accounts with **Make changes and manage sharing**.
3. Copy the **Calendar ID** from "Integrate calendar" into that category's `calendarId` in `src/categories.ts`. Calendar IDs aren't secret, so they're committed with the code.

### 3. Try it locally

```bash
npm install
cp .env.example .env
```

Put the key in `.env` without printing it:

```bash
printf 'GOOGLE_SERVICE_ACCOUNT_KEY=%s\n' "$(base64 -i service-account.json | tr -d '\n')" >> .env
```

Then run:

```bash
npm run dry-run
```

This lists every event it found. With credentials set, it also prints what it would create, update and delete, without changing anything. When that looks right:

```bash
npm run sync
```

To work on the site itself:

```bash
npm run dev
```

Then open http://localhost:3000. With the key in `.env`, feeds are read from the calendars. Without it, every source is fetched directly, so the first load takes several seconds.

### 4. Deploy to Vercel

Push this folder to a GitHub repository, then in Vercel choose **Add New → Project** and import it. No build settings are needed. Before the first deploy, add these environment variables under **Settings → Environment Variables**:

- `GOOGLE_SERVICE_ACCOUNT_KEY`: the base64 key, the same value as in `.env`.
- `CRON_SECRET`: any long random string, for example from `openssl rand -hex 32`. Vercel sends it with every cron call, and the sync endpoint rejects requests without it.

After that, every push to the main branch deploys automatically.

The cron in `vercel.json` runs daily at 10:00 UTC, which is 6 am Eastern in summer and 5 am in winter. On the Hobby plan, Vercel may start it any time within that hour. Cron jobs only run on production deployments.

To run a sync right away:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" https://YOUR-PROJECT.vercel.app/api/sync
```

The response lists each source's event count and what changed. It returns status 500 if any source or calendar write failed, so failures show up in Vercel's logs.

## The site

- `public/` holds the home page: the category subscribe cards and the feed builder.
- `api/catalog.ts` lists the categories and sources for the page.
- `api/feed.ts` serves custom feeds as `/feed.ics` (iCalendar) and `/api/feed?format=json` (for the page's preview). It reads events back from the category calendars rather than fetching the source sites. Vercel's CDN caches each feed URL for an hour, so subscribers polling their feeds don't each trigger a calendar read.

## Calendar suggestions

The page has a "Submit a calendar" button at the top right, plus a link in the footer. It links to a Google Form, so suggestions land in the shared Google account. The button stays hidden until the form's link is set in `src/site.ts`.

The form is "Submit a calendar (Philadelphia Urbanism Events)" in the shared account's Google Forms, published to anyone with the link. Its questions:

- Organization or calendar name (required)
- Website (required)
- Where do they post their events? (required): a link to an events page, calendar, newsletter or social account
- What kinds of events do they hold?
- Your email, if you'd like to hear back

It doesn't collect email addresses automatically, so no one has to sign in. To use a different form, publish it, click the link icon to copy its responder link, and paste that into `submitCalendarUrl` in `src/site.ts`. Optionally, under **Responses**, link the form to a Google Sheet to keep a running list.

To be emailed about each new suggestion, open the form's **Responses** tab, click **⋮** and choose **Get email notifications for new responses**.

## Adding a source

Sources live in `src/sources/`. Each one returns its events plus the date range it fully covers. Add it to `src/sources/index.ts` with its category and homepage, and it appears on the site and in the sync.

- If the group publishes an `.ics` feed, add an `icsSource({...})` entry to `src/sources/index.ts`. That's all it takes.
- If its site runs The Events Calendar for WordPress (check for `/wp-json/tribe/events/v1/events`), add a `tribeSource({...})` entry.
- For another phila.gov department with an Events section, add a `philaGovCalendar({...})` entry.
- Otherwise, copy the adapter closest to the site's format: `bicycleCoalition.ts` (RSS), `septa.ts` or `transitForward.ts` (an HTML list), `cityCouncil.ts` (an HTML table), or `dvrpc.ts` / `bikeTrain.ts` (a JSON API).

Run `npm run dry-run` to check a new source.

## Known fragile spots

- **SEPTA**: the page is served from `wwww.septa.org` (four w's) and returns 403 unless the request looks like a browser. A site redesign will likely break this adapter. Its events have no location; the link goes to SEPTA's page for the meeting.
- **City Council**: the date range is chosen with Legistar's `Setting-30-…` cookies. If Legistar renumbers them, the table falls back to "This Month" only.
- **Bicycle Coalition**: the feed only shows about the next 10 days of events, so events further out appear as they come into range. It also lists many community events that the Coalition doesn't run.
- **Transit Forward** and **phila.gov** pages: these adapters read page markup, so a site redesign will break them. phila.gov lists only the next few events per department.
- **Philly Bike Train** and **Rail Park**: both read APIs their websites use internally, which aren't documented and could change. A Rail Park event set to repeat is only added on its first date; none repeat today.
- **DVRPC**: its events have no IDs, so renaming an event deletes it and adds it again.

## License

MIT. See [LICENSE](LICENSE).
