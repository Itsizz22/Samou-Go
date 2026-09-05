import type { Server } from 'node:http';
import { createApp } from './app';
import { env } from './config/env';
import { disconnectPrisma } from './lib/prisma';
import { attachRealtime } from './realtime';

const app = createApp();

// Bind to 0.0.0.0 so physical devices / the Android emulator on the same LAN
// can reach the API at the host's IP (e.g. http://192.168.0.100:4000), not just
// localhost on this machine.
const server: Server = app.listen(env.port, '0.0.0.0', () => {
  // eslint-disable-next-line no-console
  console.log(
    `🚚  Samou Quick API — http://0.0.0.0:${env.port}/api/v1  [${env.nodeEnv}]\n` +
      `    رسوم التوصيل يحددها السائق عند الاستلام / ` +
      `Delivery fee determined by driver upon delivery`
  );

  // ── Firebase push notification status ──────────────────────────────────
  // This log is intentionally LOUD so a missing Firebase config is never
  // silently invisible in Render logs. Push notifications will silently
  // no-op without credentials — store managers and captains will not
  // receive order alerts on their phones.
  // eslint-disable-next-line no-console
  if (env.firebase.serviceAccountJson || env.firebase.serviceAccountPath) {
    const projectId = env.firebase.projectId ?? '(derived from service account)';
    console.log(`
  ✅  [push] Firebase push NOTIFICATIONS ENABLED — project: ${projectId}
` +
      `       Store managers and captains will receive order alerts on their devices.`);
  } else {
    console.error(
      `\n  ⚠️  [push] Firebase push NOTIFICATIONS DISABLED — no credentials configured!\n` +
        `       Set FIREBASE_SERVICE_ACCOUNT_JSON (inline JSON) or\n` +
        `       FIREBASE_SERVICE_ACCOUNT_PATH (file path) in your environment.\n` +
        `       Store managers and captains will NOT receive order alerts on their phones.\n` +
        `       This is not a boot-blocking error, but push is completely non-functional.`
    );
  }
});
attachRealtime(server);

/**
 * Graceful shutdown: stop accepting connections, let in-flight requests finish,
 * then close the pool. Without this, `docker stop` can drop a live order write.
 */
let shuttingDown = false;

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  // eslint-disable-next-line no-console
  console.log(`\n${signal} received — shutting down…`);

  const forceExit = setTimeout(() => {
    // eslint-disable-next-line no-console
    console.error('Shutdown timed out after 10s — forcing exit.');
    process.exit(1);
  }, 10_000);
  forceExit.unref();

  server.close(async closeError => {
    if (closeError) {
      // eslint-disable-next-line no-console
      console.error('Error closing HTTP server:', closeError);
    }
    await disconnectPrisma();
    clearTimeout(forceExit);
    process.exit(closeError ? 1 : 0);
  });
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

process.on('unhandledRejection', reason => {
  // eslint-disable-next-line no-console
  console.error('Unhandled promise rejection:', reason);
});

process.on('uncaughtException', error => {
  // eslint-disable-next-line no-console
  console.error('Uncaught exception:', error);
  void shutdown('uncaughtException');
});

export { app, server };
