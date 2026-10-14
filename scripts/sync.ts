// Runs the sync from your machine.
//
//   npm run dry-run   fetch every source and list the events; with Google
//                     credentials set, also show what would change in the calendar
//   npm run sync      fetch and write to the calendar
//
// Reads GOOGLE_SERVICE_ACCOUNT_KEY from .env if present. Calendar IDs live in
// src/categories.ts.
import { existsSync, readFileSync } from "node:fs";
import { collect, syncWindow } from "../src/collect.js";
import { runSync } from "../src/run.js";

if (existsSync(".env")) {
  for (const line of readFileSync(".env", "utf8").split("\n")) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (match && process.env[match[1]] === undefined) {
      process.env[match[1]] = match[2].replace(/^(['"])(.*)\1$/, "$2");
    }
  }
}

const dryRun = process.argv.includes("--dry-run");
const hasCredentials = Boolean(process.env.GOOGLE_SERVICE_ACCOUNT_KEY);

if (dryRun) {
  const window = syncWindow();
  console.log(`Window: ${window.from.toISODate()} to ${window.to.toISODate()}\n`);
  for (const result of await collect(window)) {
    if (!result.ok) {
      console.log(`✗ ${result.source.name}: ${result.error}\n`);
      continue;
    }
    const dupes = result.duplicatesDropped ? `, ${result.duplicatesDropped} duplicate(s) dropped` : "";
    console.log(`✓ ${result.source.name}: ${result.events.length} events${dupes}`);
    console.log(`  deletes allowed ${result.coverage.from.toISODate()} to ${result.coverage.to.toISODate()}`);
    for (const e of [...result.events].sort((a, b) => a.start.toMillis() - b.start.toMillis())) {
      const when = e.allDay ? e.start.toFormat("ccc LLL d") + " (all day)" : e.start.toFormat("ccc LLL d, h:mm a");
      console.log(`  ${when.padEnd(24)} ${e.title}${e.location ? `  @ ${e.location}` : ""}`);
    }
    console.log();
  }
}

if (!dryRun || hasCredentials) {
  const summary = await runSync({ dryRun, log: (line) => console.log(line) });
  console.log(JSON.stringify(summary, null, 2));
} else {
  console.log("No Google credentials set, so the calendar was not checked.");
}
