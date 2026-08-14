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
export const Prisma = env.isProduction ? PostgresGenerated.Prisma : SqliteGenerated.Prisma;

/** PrismaClient constructor matching the active datasource. */
export const PrismaClient = env.isProduction
  ? PostgresGenerated.PrismaClient
  : SqliteGenerated.PrismaClient;
