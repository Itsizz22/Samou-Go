/**
 * Shared Prisma type layer.
 *
 * All type positions in the application resolve against the SQLite generated
 * client (`generated/prisma-sqlite`). The two generated clients are
 * structurally identical for the models (the schemas mirror each other), and
 * using the SQLite types as the baseline preserves the local-dev guard against
 * Postgres-only `mode: 'insensitive'` filters — writing `{ contains, mode }`
 * inline stops typechecking, which is the behaviour documented in AGENTS.md.
 *
 * Runtime values (the `PrismaClient` constructor and the error classes) must
 * match the active datasource and come from `./prisma-runtime`, never here.
 */
export type {
  Prisma,
  PrismaClient,
  PrismaPromise,
  User,
  OtpRequest,
  RefreshToken,
  Store,
  Category,
  Product,
  Order,
  OrderItem,
  OrderStatusHistory,
  Voucher,
  Favorite,
  DailyOrderSequence,
  CaptainLocation,
  Rating,
  ChatMessage,
  SupportTicket,
  Wallet,
  LedgerEntry,
  Settlement,
} from '../../generated/prisma-sqlite';
