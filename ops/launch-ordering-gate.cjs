// Temporary production launch gate. Run: node ops/launch-ordering-gate.cjs pause|status|resume|verify
// Uses existing DATABASE_URL without printing credentials. Store availability is backed up in DB.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const envFile = path.join(root, 'packages/api/.env');
const env = fs.existsSync(envFile) ? require('dotenv').parse(fs.readFileSync(envFile)) : {};
if (!process.env.DATABASE_URL && !env.DATABASE_URL) throw Error('DATABASE_URL is required');
const { PrismaClient } = require('../packages/api/generated/prisma-postgres');
const db = new PrismaClient({datasources:{db:{url:process.env.DATABASE_URL || env.DATABASE_URL}}});
const action = process.argv[2];
async function main() {
 if (action === 'pause') {
  await db.$transaction(async tx => {
   await tx.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS ops_launch_gate (id integer PRIMARY KEY CHECK(id=1), paused boolean NOT NULL, opens_at timestamptz NOT NULL, stores_before jsonb NOT NULL, changed_at timestamptz NOT NULL DEFAULT now())`);
   await tx.$executeRawUnsafe(`INSERT INTO ops_launch_gate(id,paused,opens_at,stores_before) SELECT 1,true,TIMESTAMPTZ '2026-10-03 13:00:00 Asia/Hebron',coalesce(jsonb_agg(jsonb_build_object('id',id,'accepting',"isAcceptingOrders")),'[]'::jsonb) FROM stores ON CONFLICT(id) DO NOTHING`);
   const state = await tx.$queryRawUnsafe('SELECT paused,opens_at FROM ops_launch_gate WHERE id=1');
   if (!state[0]?.paused) throw Error('Gate already released; do not overwrite the original snapshot.');
   await tx.$executeRawUnsafe(`CREATE OR REPLACE FUNCTION samou_launch_block_order() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF EXISTS(SELECT 1 FROM ops_launch_gate WHERE id=1 AND paused AND now()<opens_at) THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='ORDERING_NOT_LAUNCHED: يبدأ استقبال الطلبات السبت 3 أكتوبر الساعة 1 ظهرًا'; END IF; RETURN NEW; END $$`);
   await tx.$executeRawUnsafe(`CREATE OR REPLACE FUNCTION samou_launch_store_availability() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF EXISTS(SELECT 1 FROM ops_launch_gate WHERE id=1 AND paused AND now()<opens_at) THEN NEW."isAcceptingOrders" := false; END IF; RETURN NEW; END $$`);
   for (const table of ['orders','custom_requests']) {
    await tx.$executeRawUnsafe(`DROP TRIGGER IF EXISTS samou_launch_gate ON ${table}`);
    await tx.$executeRawUnsafe(`CREATE TRIGGER samou_launch_gate BEFORE INSERT ON ${table} FOR EACH ROW EXECUTE FUNCTION samou_launch_block_order()`);
   }
   await tx.$executeRawUnsafe('DROP TRIGGER IF EXISTS samou_launch_store_gate ON stores');
   await tx.$executeRawUnsafe('CREATE TRIGGER samou_launch_store_gate BEFORE INSERT OR UPDATE OF "isAcceptingOrders" ON stores FOR EACH ROW EXECUTE FUNCTION samou_launch_store_availability()');
   await tx.store.updateMany({data:{isAcceptingOrders:false}});
  });
 } else if (action === 'resume') {
  await db.$transaction(async tx => {
   const rows = await tx.$queryRawUnsafe('SELECT *, now()>=opens_at AS ready FROM ops_launch_gate WHERE id=1 FOR UPDATE');
   const state = rows[0];
   if (!state || !state.paused) return;
   if (!state.ready) throw Error('Launch time has not arrived; refusing early reopening.');
   await tx.$executeRawUnsafe('UPDATE ops_launch_gate SET paused=false,changed_at=now() WHERE id=1');
   for (const item of state.stores_before) await tx.store.updateMany({where:{id:item.id},data:{isAcceptingOrders:item.accepting}});
   await tx.$executeRawUnsafe('DROP TRIGGER IF EXISTS samou_launch_store_gate ON stores');
   for (const table of ['orders','custom_requests']) await tx.$executeRawUnsafe(`DROP TRIGGER IF EXISTS samou_launch_gate ON ${table}`);
  });
 } else if (action === 'verify') {
  for(const table of ['orders','custom_requests']) {
   let blocked=false;
   try { await db.$executeRawUnsafe(`INSERT INTO ${table} DEFAULT VALUES`); }
   catch(e) { blocked=String(e.message).includes('ORDERING_NOT_LAUNCHED'); }
   if(!blocked) throw Error(`Launch guard did not reject ${table}`);
   console.log(`${table}: launch guard verified, no row created`);
  }
 } else if (action !== 'status') throw Error('Use pause, status, verify or resume');
 const state = await db.$queryRawUnsafe('SELECT paused,opens_at,changed_at FROM ops_launch_gate WHERE id=1');
 console.log(JSON.stringify({gate:state,acceptingStores:await db.store.count({where:{isAcceptingOrders:true}}),totalStores:await db.store.count()}));
}
main().catch(e=>{console.error(e.message);process.exitCode=1}).finally(()=>db.$disconnect());
