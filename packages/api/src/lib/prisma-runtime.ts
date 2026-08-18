import * as SqliteGenerated from '../../generated/prisma-sqlite';
import * as PostgresGenerated from '../../generated/prisma-postgres';
import { env } from '../config/env';

/**
 * Environment-matched Prisma runtime bindings.
 *
 * Each custom-generated client ships its own copy of the Prisma runtime
 * (error classes, `Decimal`, ...) inside `generated/prisma-*`. The
 * `instanceof` checks in the error handler must therefore test against the
 * classes of the client that is actually running — an error thrown by the
 * SQLite client is not an `instanceof` the PostgreSQL client's error class,
 * even though the two are byte-identical code. These two bindings select the
 * runtime that matches the datasource the application boots with:
 *
 *   dev/test  → SQLite    (schema.sqlite.prisma → generated/prisma-sqlite)
 *   production → PostgreSQL (schema.prisma → generated/prisma-postgres)
 */
/** Prisma namespace matching the active datasource. */
export const Prisma = env.isProduction ? PostgresGenerated.Prisma : SqliteGenerated.Prisma;

/**
 * The two generated `PrismaClient` classes are structurally identical code,
 * but asking TypeScript to compare them directly (the ternary below) blows
 * past its recursion limits once both schemas grow many relations. The type
 * is pinned to the SQLite shape — the SQLite and Postgres clients accept the
 * same options and expose the same methods.
 */
type PrismaClientConstructor = typeof SqliteGenerated.PrismaClient;

/** PrismaClient constructor matching the active datasource. */
const resolvePrismaClient = (): PrismaClientConstructor =>
  env.isProduction
    ? (PostgresGenerated.PrismaClient as unknown as PrismaClientConstructor)
    : SqliteGenerated.PrismaClient;

export const PrismaClient: PrismaClientConstructor = resolvePrismaClient();
