/**
 * Publishes the snapshot `POST /api/demo-reset` restores from.
 *
 *   pnpm demo:snapshot
 *
 * Whatever is in the database now becomes the books every reset returns to,
 * so run it against sample data and nothing else: `pnpm seed` into a fresh
 * database, then this. A deployment publishes from the image it is deploying,
 * so the snapshot always matches the schema it was taken against.
 *
 * Safe while the server runs — it stages and renames, and changes nothing
 * live. Restoring is the endpoint's job: a script would be a second writer.
 */
import { readDemoResetSettings } from "./app/demo-reset.js";
import { captureSnapshot } from "./modules/demo-reset/snapshot.js";
import { openProjectRuntime } from "./runtime.js";

const runtime = await openProjectRuntime({ sendMail: false });
const settings = readDemoResetSettings(process.env, runtime.projectRoot);

try {
  if (!settings) {
    throw new Error(
      "Set SAPPORTA_DEMO_SNAPSHOT to the file this should write, and the demo reset should restore from.",
    );
  }
  captureSnapshot(runtime.conn.sqlite, settings.snapshotPath);
  console.log(`Published the demo snapshot to ${settings.snapshotPath}`);
} finally {
  runtime.close();
}
