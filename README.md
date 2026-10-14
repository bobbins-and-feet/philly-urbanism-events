# Philadelphia Urbanism Events

Meetings, hearings, rides and public-space events from Philadelphia's urbanist groups and public agencies, gathered into calendars anyone can subscribe to: **[phillyurbanismevents.com](https://phillyurbanismevents.com)**.

This README is the playbook for looking after the project: how it works, where everything lives, and what to do when something needs attention. To run it on your own computer, see [Running locally](docs/running-locally.md).

## How it works

```
14 source websites ──▶ daily sync (Vercel cron) ──▶ 4 public Google Calendars ──▶ people subscribe
                                                              │
                                                              └──▶ website: category links + custom feeds (/feed.ics)
```

1. **Every morning** a Vercel cron job calls `/api/sync`. It fetches events from each source's website for the next 180 days.
2. **Each source belongs to one of four categories**, and each category has its own public Google Calendar. The sync creates, updates and deletes events so that each calendar matches its sources.
3. **The website** has an "Add to Google Calendar" link and an iCal link for each category. It also has a feed builder, where people pick organizations and get a personal `/feed.ics?sources=…` link. Custom feeds are read back out of the four calendars, not fetched from the source sites.

Rules the sync follows:

- **It only touches events it created.** Each one carries a hidden tag. Anything added to a calendar by hand is left alone.
- **Changed events are updated in place**, and unchanged ones are skipped.
- **An event is deleted when its source stops listing it**, but only inside the date range that source's fetch fully covers. For example, the Bicycle Coalition's feed only shows about 10 days ahead, so it never deletes events further out.
- **If a source fails** (its site is down, or the layout changed), its existing events stay as they are, and the run is marked as failed.
- **Duplicates:** two listings count as the same event when they share a start time and title, treating "Philly" and "Philadelphia" as the same word.
  - Within a category calendar, the copy from the source listed first in `src/sources/index.ts` is kept, and the event records the other sources that list it.
  - A custom feed includes an event if any source that lists it is chosen, and shows it once.
  - Someone subscribed to two category calendars can see an event twice if groups in both categories list it.
- **Canceled City Council meetings are removed.**

## Where everything lives

| What | Where | Notes |
|---|---|---|
| Code | [github.com/bobbins-and-feet/philly-urbanism-events](https://github.com/bobbins-and-feet/philly-urbanism-events) | Public, MIT licensed. Pushing to `main` deploys. |
| Website and daily sync | Vercel project `philly-urbanism-events` (team "Helen Holmes' projects", Hobby plan) | Settings, logs and cron history are in the Vercel dashboard. |
| Domain | `phillyurbanismevents.com`, registered at Namecheap | DNS in Namecheap's **Advanced DNS**: an A record for `@` to `76.76.21.21` and a CNAME for `www` to `cname.vercel-dns.com`. In Vercel, `www` redirects to the main domain. Keep `philly-urbanism-events.vercel.app` working too; some early subscriptions use it. |
| The four calendars | The group's shared Google account | IDs are in `src/categories.ts`. |
| Google Cloud project and the `calendar-sync` service account | The group's shared Google account | The service account is what the sync uses to write to the calendars. |
| "Submit a calendar" form | The group's shared Google account, in Google Forms | Its link is in `src/site.ts`. |
| Secrets | Vercel → Settings → Environment Variables | `GOOGLE_SERVICE_ACCOUNT_KEY` and `CRON_SECRET`. Never in the repo. |
| Sync schedule | `vercel.json` | Daily at 10:00 UTC: 6 am Eastern in summer, 5 am in winter. |

### Categories and sources

| Category | Sources |
|---|---|
| Advocacy groups | 5th Square Advocacy, Philly Bike Action, Transit Forward Philadelphia, Clean Air Council |
| Government & agencies | City Council, City Planning Commission, OTIS, SEPTA, DVRPC |
| Rides & bike events | Philly Bike Train, Indego, Bicycle Coalition |
| Parks & public space | Friends of the Rail Park, Center City District |

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

Some groups have no event listing to pull from:
- **Feet First Philly** announces its quarterly meetings through its newsletter and social media.
- **Families for Safe Streets** and **Vision Zero Philadelphia** have no calendars of their own. Their events, such as World Day of Remembrance, usually appear on the Bicycle Coalition's calendar.
- **The Streets Department's** page has no calendar.

## Routine tasks

### Check that the daily sync is working

In Vercel, open the project and go to **Logs**, filtered to `/api/sync`, or to **Settings → Cron Jobs**.

- **Status 200:** everything synced.
- **Status 500:** at least one source failed to fetch or a calendar write failed. The logged JSON lists each source with `ok: true` or an `error`, plus `calendar.errors`. Other sources still synced normally.

One failed day is usually a site being briefly down. If the same source fails several days running, its website has probably changed, so fix it as below.

### Run a sync now

In Vercel, go to **Settings → Cron Jobs** and click **Run** next to `/api/sync`. Or, with the `CRON_SECRET` value:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" https://phillyurbanismevents.com/api/sync
```

### Fix a broken source

1. Find the failing source in the sync log, then reproduce the problem locally with `npm run dry-run` (see [Running locally](docs/running-locally.md)).
2. Open the source's events page in a browser to see what changed. Sites move their events page, switch platforms or start blocking scripts.
3. Fix the adapter in `src/sources/`, check it with `npm run dry-run`, and push to `main`. The next sync uses the fix.

Until it's fixed, the source's existing events stay in the calendar, but no new ones arrive. If a source can't be fixed, remove it as below.

### Handle a "Submit a calendar" suggestion

Suggestions arrive in the form's **Responses** tab in the shared account. To be emailed about new ones, open **Responses**, click **⋮** and choose **Get email notifications for new responses**.

For each suggestion:
1. Look at where the group posts events. An `.ics` or Google Calendar link, or a WordPress site running The Events Calendar, takes a few minutes to add. A plain HTML page needs a small scraper. A newsletter or social media account can't be pulled automatically.
2. Add the source as below, or note it under "Some groups have no event listing" above.
3. If they left an email address, let them know.

### Add a source

Sources live in `src/sources/`, and `src/sources/index.ts` lists them all with each one's category and homepage. A source added there appears on the site and in the sync.

- **The group publishes an `.ics` feed** (including a public Google Calendar): add an `icsSource({...})` entry. That's all it takes.
- **Its site runs The Events Calendar for WordPress** (`/wp-json/tribe/events/v1/events` returns JSON): add a `tribeSource({...})` entry.
- **It's another phila.gov department with an Events section:** add a `philaGovCalendar({...})` entry.
- **Otherwise:** copy the adapter closest to the site's format: `bicycleCoalition.ts` (RSS), `septa.ts` or `transitForward.ts` (an HTML list), `cityCouncil.ts` (an HTML table), or `dvrpc.ts` / `bikeTrain.ts` (a JSON API).

Its position in the list matters. When two sources in a category list the same event, the earlier one's copy is kept, so put organizers before sites that repost other groups' events.

### Move a source to another category

Change its category in `src/sources/index.ts` and push. The next sync adds its events to the new calendar and deletes them from the old one.

### Remove a source

Delete its entry from `src/sources/index.ts` and push. The sync stops managing that source's events, but the ones already in the calendar stay. To clear them, delete them by hand in Google Calendar. Their titles start with the source's `[prefix]`.

### Add a category

1. Create and share a calendar as in [Setting up from scratch](#setting-up-from-scratch), step 2.
2. Add the category to `CategoryId` and `categories` in `src/categories.ts`, with its calendar ID.
3. Move sources into it in `src/sources/index.ts`.
4. Add a color for it in `public/styles.css` (`--cat-…` and `.cat-…`).

### Rotate the Google key

Do this when a maintainer leaves, or if the key might have been exposed.

1. In the Cloud console, open the `calendar-sync` service account and go to **Keys → Add key → JSON**.
2. Put the new key in Vercel's `GOOGLE_SERVICE_ACCOUNT_KEY` as base64. On macOS: `base64 -i new-key.json | tr -d '\n' | pbcopy`.
3. Redeploy: Vercel → **Deployments → ⋮ → Redeploy**. Environment changes only take effect on a new deployment.
4. Run a sync to check it works, then delete the old key on the **Keys** tab.

Each maintainer who runs syncs locally should have their own key, so one person's key can be removed without affecting anyone else.

### Rotate `CRON_SECRET`

Set a new random value (`openssl rand -hex 32`) in Vercel's environment variables, then redeploy. Vercel's cron uses the new value automatically.

### Change the site

- **The page itself** is plain HTML, CSS and JavaScript in `public/`.
- **The link-preview card** (what shows when someone shares the link) is `public/og-image.png`, made from `assets/og-image.html` by `npm run og-image`. Its text and description are the `og:` and `twitter:` tags in `public/index.html`. If you change the number of sources, update both.
- **The "Submit a calendar" form link** is in `src/site.ts`. Leave it empty to hide the button.
- **The sync schedule** is the `crons` entry in `vercel.json`. The Hobby plan allows one run a day, and may start it any time within the scheduled hour.

## Handing the project over

To give the project to a new maintainer:

- [ ] **GitHub:** make them an owner of the repo, or of the `bobbins-and-feet` org.
- [ ] **Domain:** transfer `phillyurbanismevents.com` to their Namecheap account (or another registrar), keeping the DNS records above, and make sure auto-renew is on.
- [ ] **Vercel:** Hobby projects can't be shared. Either transfer the project to their account (**Settings → Advanced → Transfer**), or move it to a team on a paid plan. Bring the two environment variables along, and check the cron job is listed afterwards.
- [ ] **Google:** pass on access to the group's shared Google account, including its recovery phone and email. Or add their own account as an Owner of the Cloud project, and with "Make changes and manage sharing" on each of the four calendars and the form.
- [ ] **Keys:** have them create their own service-account key, and delete yours.
- [ ] **Form notifications:** turn on email notifications for them, and off for you.
- [ ] **This README:** update anything above that has changed.

## Setting up from scratch

Only needed to rebuild everything, for example under a different Google account. Do the Google steps signed in as the group's shared account, so nothing belongs to one person.

1. **Service account.** In the [Google Cloud console](https://console.cloud.google.com/), create a project and enable the **Google Calendar API** under **APIs & Services → Library**. Under **IAM & Admin → Service Accounts**, create an account named `calendar-sync`; it needs no roles. Create a JSON key for it.
2. **Calendars.** For each category in `src/categories.ts`:
   1. In Google Calendar, go to **Other calendars → + → Create new calendar** and set the time zone to Eastern.
   2. In its **Settings and sharing**, turn on **Make available to public** with "See all event details".
   3. Share it with the service account's email, with **Make changes to events**.
   4. Copy its **Calendar ID** from "Integrate calendar" into `calendarId`. Calendar IDs aren't secret; they appear in the public subscribe links.
3. **Form.** Create a Google Form with the questions below, leave "Collect email addresses" off so no one has to sign in, and publish it to anyone with the link. Put its responder link in `src/site.ts`.
   - Organization or calendar name (required)
   - Website (required)
   - Where do they post their events? (required)
   - What kinds of events do they hold?
   - Your email, if you'd like to hear back
4. **Vercel.** Import the GitHub repo at [vercel.com/new](https://vercel.com/new). Leave the framework preset as "Other", with no build settings. Before deploying, add the environment variables:
   - `GOOGLE_SERVICE_ACCOUNT_KEY`: the JSON key, base64-encoded.
   - `CRON_SECRET`: a long random string.
5. **First sync.** Run it from **Settings → Cron Jobs**. Google limits how fast events can be added, so a first sync into empty calendars can log some rate-limit errors. Run it again until it reports no errors. It only adds what's missing.

## Known fragile spots

- **SEPTA:** its events are served from `wwww.septa.org` (four w's), which returns 403 unless the request looks like it comes from a browser. A redesign will likely break this adapter. Its events have no location; the link goes to SEPTA's page for the meeting.
- **City Council:** the date range comes from Legistar's `Setting-30-…` cookies. If Legistar renumbers them, only this month's meetings are fetched.
- **Bicycle Coalition:** the feed only shows about the next 10 days, so events further out appear as they come into range. It also lists many community events the Coalition doesn't run.
- **Transit Forward and phila.gov:** these adapters read page markup, so a redesign will break them. phila.gov lists only the next few events per department.
- **Philly Bike Train and Rail Park:** both read undocumented APIs their websites use internally, which could change. A Rail Park event set to repeat is only added on its first date; none repeat today.
- **DVRPC:** its events have no IDs, so renaming one deletes it and adds it again.

## License

MIT. See [LICENSE](LICENSE).
