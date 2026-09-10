import { prisma } from './prisma';
// Coalesce probes; a stalled database cannot create an unbounded query backlog.
let inFlight: Promise<boolean> | undefined;
let cached: { at: number; ok: boolean } | undefined;
export async function databaseReady(): Promise<boolean> {
  if (cached && Date.now() - cached.at < 5000) return cached.ok;
  if (!inFlight) {
    inFlight = prisma.$queryRaw`SELECT 1`.then(() => true, () => false).then(ok => {
      cached = { at: Date.now(), ok }; inFlight = undefined; return ok;
    });
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  try { return await Promise.race([inFlight, new Promise<boolean>(resolve => { timer = setTimeout(() => resolve(false), 3000); })]); }
  finally { clearTimeout(timer); }
}
