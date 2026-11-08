/*
google-places's Bugsink reporter (Sentry-compatible), built on argsbarg's createErrorReporter.
The app passes it as `errorReporter`, so command failures are reported automatically. Off when BUGSINK_DSN is set to an empty string.
*/
import { createErrorReporter } from "argsbarg";

/** google-places's Bugsink project DSN (send-only key); override with BUGSINK_DSN, "" disables. */
const DEFAULT_DSN = "https://fba55fce33d34e4886f42aeee72be0f8@bugsink.btek.cc/7";
/** The app's error reporter. */
export const errors = createErrorReporter({ dsn: DEFAULT_DSN, env: "BUGSINK_DSN" });
