import { prisma, isPostgresProvider } from "../../lib/prisma";
import type { Prisma } from "../../lib/prisma-types";

let sqliteWrites: Promise<unknown> = Promise.resolve();
/** SQLite has one writer; queue local transactions without changing PostgreSQL row locking. */
export function deliveryTransaction<T>(
  work: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  if (isPostgresProvider) return prisma.$transaction(work);
  const operation = sqliteWrites.then(() => prisma.$transaction(work));
  sqliteWrites = operation.catch(() => undefined);
  return operation;
}
