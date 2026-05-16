import { loadEnvFiles } from './env-loader.js';
// Load .env then .env.local before anything reads process.env, so the
// hub-internal precedence matches what /api/settings hot-applies later.
const envReport = loadEnvFiles();

import { createApp } from './app.js';
import { startAdbServer } from './adb-server.js';

const port = Number(process.env.PORT ?? 4000);
const host = process.env.HOST ?? '127.0.0.1';

const app = await createApp();

app.log.info({ files: envReport.files.map((f) => f.name) }, 'env files loaded');

// Opt-in: bring the local adb-server up at hub boot so /devices works without
// the operator having to remember `adb start-server` after every machine
// restart. Best-effort — if adb isn't on PATH we log and continue.
if (process.env.ADB_AUTO_START === '1') {
  try {
    const result = await startAdbServer();
    app.log.info({ output: result.output }, 'adb-server auto-started');
  } catch (err) {
    app.log.warn({ err }, 'ADB_AUTO_START=1 set but starting adb-server failed');
  }
}

process.on('unhandledRejection', (reason) => {
  app.log.error({ err: reason }, 'unhandled rejection');
});
process.on('uncaughtException', (err) => {
  app.log.error({ err }, 'uncaught exception');
});

try {
  await app.listen({ port, host });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
