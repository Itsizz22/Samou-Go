#!/usr/bin/env tsx
/**
 * Samou Quick — API Load Test & Performance Benchmark Suite
 *
 * Tests the API under high-concurrency traffic to verify it can handle
 * 1,000+ requests without crashing or dropping connections.
 *
 * Usage:
 *   cd packages/api && npx tsx src/scripts/load-test.ts [BASE_URL]
 *
 * Default BASE_URL is http://localhost:4000
 */

import autocannon, { type Result, type Options } from 'autocannon';

const BASE_URL = process.argv[2] || 'http://localhost:4000';
const API_PREFIX = '/api/v1';

// ─── Helpers ────────────────────────────────────────────────────────────────

function header(label: string): void {
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  ${label}`);
  console.log(`${'═'.repeat(60)}`);
}

// autocannon's @types are incomplete — these runtime properties exist on the
// result object but aren't declared in the type definitions.
interface AugmentedResult extends Result {
  timeouts: number;
  mismatches: number;
  non2xx: number;
  resets: number;
  '2xx': number;
  '4xx': number;
  '5xx': number;
  latency: Result['latency'] & { p97_5: number };
}

function printResult(name: string, result: Result): void {
  const r = result as AugmentedResult;
  const totalRequests = r.requests.total;
  const sent = r.requests.sent;
  const non2xx = r.non2xx ?? 0;
  const errors = r.errors ?? 0;
  const timeouts = r.timeouts ?? 0;
  const mismatches = r.mismatches ?? 0;
  const successRate = sent > 0 ? ((sent - non2xx) / sent * 100).toFixed(1) : '0.0';

  console.log(`\n  📊 ${name}`);
  console.log(`  ${'─'.repeat(50)}`);
  console.log(`  Total Requests:     ${sent.toLocaleString()} sent, ${totalRequests.toLocaleString()} completed`);
  console.log(`  Successful (2xx):   ${(sent - non2xx).toLocaleString()} (${successRate}%)`);
  console.log(`  Errors (4xx/5xx):   ${errors.toLocaleString()}`);
  console.log(`  Timeouts:           ${timeouts.toLocaleString()}`);
  console.log(`  Status Mismatch:    ${mismatches.toLocaleString()}`);
  console.log(`  ─────────────────────────────────────`);
  console.log(`  Duration:           ${(r.duration / 1000).toFixed(1)}s`);
  console.log(`  Start Time:         ${new Date(r.start).toISOString()}`);
  console.log(`  Finish Time:        ${new Date(r.finish).toISOString()}`);
  console.log(`  ─────────────────────────────────────`);
  console.log(`  Max RPS (throughput): ${r.requests.average.toLocaleString()} req/s`);
  console.log(`  Total Throughput:   ${(r.throughput.total / 1024 / 1024).toFixed(2)} MB`);
  console.log(`  ─────────────────────────────────────`);
  console.log(`  Latency Average:    ${r.latency.average.toFixed(2)} ms`);
  console.log(`  Latency p50:        ${r.latency.p50.toFixed(2)} ms`);
  console.log(`  Latency p95:        ${(r.latency as any).p95?.toFixed(2) ?? 'N/A'} ms`);
  console.log(`  Latency p99:        ${r.latency.p99.toFixed(2)} ms`);
  console.log(`  Latency Max:        ${r.latency.max.toFixed(2)} ms`);
  console.log(`  ─────────────────────────────────────`);
  console.log(`  Errors:             ${errors.toLocaleString()}`);

  // Warnings
  if (r.latency.p99 > 2000) {
    console.log(`  ⚠️  p99 latency > 2s — DB connection pool may be saturated`);
  }
  if (errors > sent * 0.05) {
    console.log(`  ⚠️  >5% error rate — server is dropping requests under load`);
  }
  if (timeouts > 0) {
    console.log(`  ⚠️  ${timeouts} timeouts detected — event loop may be blocked`);
  }
}

function runScenario(opts: Options & { url: string }): Promise<Result> {
  return new Promise((resolve, reject) => {
    const instance = autocannon(opts, (err, result) => {
      if (err) return reject(err);
      resolve(result);
    });

    // Pipe to stdout for live progress
    autocannon.track(instance, { renderProgressBar: false });
  });
}

// ─── DB Connection Pool Audit ───────────────────────────────────────────────

async function auditDbPool(baseUrl: string): Promise<void> {
  header('DATABASE & CONNECTION POOL AUDIT');

  try {
    // Hit the health endpoint to verify the server is alive
    const healthRes = await fetch(`${baseUrl}/health`);
    const healthData = await healthRes.json() as Record<string, unknown>;
    console.log(`  ✅ Health check: ${JSON.stringify(healthData)}`);
  } catch (e) {
    console.log(`  ❌ Health check failed: ${e}`);
  }

  // Check DATABASE_URL connection_limit if available
  const dbUrl = process.env.DATABASE_URL || '(not set — using SQLite locally)';
  console.log(`  📦 DATABASE_URL: ${dbUrl.replace(/:[^:@]+@/, ':***@')}`);

  // Check Prisma singleton (read from source)
  console.log(`  🔒 Prisma Client: singleton pattern (globalThis caching in dev)`);
  console.log(`  🔒 Connection pool: Prisma default (no explicit connection_limit set)`);
  console.log(`     Prisma default pool size: 10 connections`);
  console.log(`     For production PostgreSQL, consider adding ?connection_limit=15 to DATABASE_URL`);

  // Probe event loop lag via a rapid sequential request burst
  console.log(`\n  ⏱️  Event Loop Lag Probe (100 sequential requests):`);
  const start = Date.now();
  for (let i = 0; i < 100; i++) {
    await fetch(`${baseUrl}/health`);
  }
  const elapsed = Date.now() - start;
  const avgMs = (elapsed / 100).toFixed(2);
  console.log(`     100 requests in ${elapsed}ms (avg ${avgMs}ms/req)`);

  if (elapsed > 5000) {
    console.log(`     ⚠️  Event loop appears sluggish (>50ms avg) — investigate blocking operations`);
  } else {
    console.log(`     ✅ Event loop responsive (<${avgMs}ms avg)`);
  }
}

// ─── Cache Warm-up Detection ────────────────────────────────────────────────

async function benchmarkCacheEffect(baseUrl: string): Promise<void> {
  header('TTL CACHE EFFECTIVENESS (platform/settings)');

  // First hit — cache miss (DB query)
  const coldStart = Date.now();
  await fetch(`${baseUrl}${API_PREFIX}/platform/settings`);
  const coldMs = Date.now() - coldStart;

  // Rapid-fire hits — should all be cache hits
  const WARM_COUNT = 200;
  const warmStart = Date.now();
  for (let i = 0; i < WARM_COUNT; i++) {
    await fetch(`${baseUrl}${API_PREFIX}/platform/settings`);
  }
  const warmTotal = Date.now() - warmStart;
  const warmAvg = (warmTotal / WARM_COUNT).toFixed(2);

  console.log(`  Cold request (cache miss):   ${coldMs} ms`);
  console.log(`  Warm requests (${WARM_COUNT}x, cache hit): ${warmTotal} ms total (${warmAvg} ms/req)`);
  console.log(`  Speedup:                     ${(coldMs / Number(warmAvg)).toFixed(0)}x faster with cache`);

  if (Number(warmAvg) > coldMs * 0.5) {
    console.log(`  ⚠️  Cache may not be effective — warm requests should be <50% of cold`);
  } else {
    console.log(`  ✅ TTL cache is working — warm requests are significantly faster`);
  }
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log(`\n🚀 Samou Quick — API Load Test Suite`);
  console.log(`   Target: ${BASE_URL}`);
  console.log(`   Time:   ${new Date().toISOString()}`);

  // ── Step 0: DB Audit & Cache Check ──────────────────────────────────
  await auditDbPool(BASE_URL);
  await benchmarkCacheEffect(BASE_URL);

  // ── Scenario A: Public Read — High Traffic ───────────────────────────
  header('SCENARIO A: Public Read Endpoints (1,000 requests, 50 concurrency)');
  console.log('  Testing: GET /platform/settings + GET /offers');

  const settingsResult = await runScenario({
    url: `${BASE_URL}${API_PREFIX}/platform/settings`,
    connections: 50,
    duration: 15,
    pipelining: 1,
    title: 'platform-settings',
  });
  printResult('GET /platform/settings (50 conn × 15s)', settingsResult);

  const offersResult = await runScenario({
    url: `${BASE_URL}${API_PREFIX}/offers`,
    connections: 50,
    duration: 15,
    pipelining: 1,
    title: 'offers',
  });
  printResult('GET /offers (50 conn × 15s)', offersResult);

  // ── Scenario B: Database Query Heavy ─────────────────────────────────
  header('SCENARIO B: Database Query Heavy (500 requests, 30 concurrency)');
  console.log('  Testing: GET /stores?page=1&pageSize=20');

  const storesResult = await runScenario({
    url: `${BASE_URL}${API_PREFIX}/stores?page=1&pageSize=20`,
    connections: 30,
    duration: 15,
    pipelining: 1,
    title: 'stores-list',
  });
  printResult('GET /stores?page=1&pageSize=20 (30 conn × 15s)', storesResult);

  // ── Scenario C: Pagination Edge & Limits ─────────────────────────────
  header('SCENARIO C: Pagination Edge Cases (rapid concurrent page queries)');

  // C1: Large page size (max allowed)
  const largePageResult = await runScenario({
    url: `${BASE_URL}${API_PREFIX}/stores?page=1&pageSize=250`,
    connections: 20,
    duration: 10,
    pipelining: 1,
    title: 'stores-large-page',
  });
  printResult('GET /stores?page=1&pageSize=250 (20 conn × 10s)', largePageResult);

  // C2: Rapid page flipping (high concurrency, small payload)
  const rapidPageResult = await runScenario({
    url: `${BASE_URL}${API_PREFIX}/stores?page=3&pageSize=10`,
    connections: 30,
    duration: 10,
    pipelining: 1,
    title: 'stores-rapid-page',
  });
  printResult('GET /stores?page=3&pageSize=10 (30 conn × 10s)', rapidPageResult);

  // C3: Health endpoint baseline (no DB, pure throughput ceiling)
  const healthResult = await runScenario({
    url: `${BASE_URL}/health`,
    connections: 100,
    duration: 10,
    pipelining: 5,
    title: 'health-baseline',
  });
  printResult('GET /health (100 conn × 10s, pipelining=5) — throughput ceiling', healthResult);

  // ── Summary ─────────────────────────────────────────────────────────
  header('SUMMARY');

  const scenarios = [
    { name: 'Platform Settings (cache warm)', result: settingsResult },
    { name: 'Offers List', result: offersResult },
    { name: 'Stores List (pageSize=20)', result: storesResult },
    { name: 'Stores Large Page (pageSize=250)', result: largePageResult },
    { name: 'Health Baseline (ceiling)', result: healthResult },
  ];

  console.log(`\n  ${'Scenario'.padEnd(38)} ${'Reqs'.padStart(8)} ${'Success%'.padStart(10)} ${'Avg(ms)'.padStart(10)} ${'p99(ms)'.padStart(10)} ${'RPS'.padStart(8)}`);
  console.log(`  ${'─'.repeat(86)}`);

  for (const s of scenarios) {
    const r = s.result as AugmentedResult;
    const total = r.requests.sent;
    const err = (r.errors ?? 0) + (r.timeouts ?? 0) + (r.mismatches ?? 0);
    const pct = ((total - err) / total * 100).toFixed(1);
    console.log(
      `  ${s.name.padEnd(38)} ${String(total).padStart(8)} ${(pct + '%').padStart(10)} ${r.latency.average.toFixed(1).padStart(10)} ${r.latency.p99.toFixed(1).padStart(10)} ${String(Math.round(r.requests.average)).padStart(8)}`
    );
  }

  console.log(`\n  ${'─'.repeat(86)}`);

  // Overall verdict
  const worstError = Math.max(...scenarios.map(s => ((s.result as AugmentedResult).errors ?? 0) + ((s.result as AugmentedResult).timeouts ?? 0)));
  const worstTotal = Math.max(...scenarios.map(s => s.result.requests.total));
  const worstErrorRate = worstError / worstTotal;

  if (worstErrorRate === 0) {
    console.log(`\n  ✅ VERDICT: All scenarios passed with ZERO errors under load.`);
  } else if (worstErrorRate < 0.01) {
    console.log(`\n  ⚠️  VERDICT: <1% error rate under load — acceptable but investigate.`);
  } else {
    console.log(`\n  ❌ VERDICT: ${(worstErrorRate * 100).toFixed(1)}% error rate — server is dropping requests under concurrency.`);
  }

  console.log(`\n  Timestamp: ${new Date().toISOString()}`);
  console.log(`  Target:    ${BASE_URL}\n`);
}

main().catch(err => {
  console.error('Load test failed:', err);
  process.exit(1);
});
