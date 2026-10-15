import { timingSafeEqual } from "node:crypto";
import { runSync } from "../src/run.js";

// Called daily by the cron job in vercel.json. Vercel sends the project's
// CRON_SECRET as a bearer token, which keeps anyone else from triggering it.

function authorized(request: Request): boolean {
  // Ignore stray whitespace or quotes around the stored secret.
  const secret = (process.env.CRON_SECRET ?? "").trim().replace(/^(['"])(.*)\1$/, "$2");
  if (!secret) return false;
  const given = Buffer.from((request.headers.get("authorization") ?? "").trim());
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export async function GET(request: Request): Promise<Response> {
  if (!authorized(request)) {
    // Logged so a misconfigured cron shows up in Vercel's logs; never logs the secret.
    console.warn(
      JSON.stringify({
        sync: "refused",
        cronSecretSet: Boolean(process.env.CRON_SECRET?.trim()),
        authorizationHeaderSent: request.headers.has("authorization"),
        fromVercelCron: /vercel-cron/i.test(request.headers.get("user-agent") ?? ""),
      }),
    );
    return new Response("Unauthorized", { status: 401 });
  }

  console.log("sync: started");
  try {
    const summary = await runSync();
    const failed = summary.sources.some((s) => !s.ok) || summary.calendar.errors.length > 0;
    console.log(JSON.stringify(summary));
    // A 500 makes partial failures show up in Vercel's logs and cron history.
    return Response.json(summary, { status: failed ? 500 : 200 });
  } catch (error) {
    console.error(error);
    return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
