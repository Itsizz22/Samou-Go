import 'dotenv/config';
import { defineConfig } from 'prisma/config';

/**
 * Prisma config file (replaces the deprecated `package.json#prisma` key).
 *
 * The default schema is the PRODUCTION PostgreSQL one — this matches the old
 * auto-discovery behaviour for commands run without `--schema` (e.g. the
 * postinstall / `prisma:generate:prod`). Every local-dev script passes
 * `--schema=prisma/schema.sqlite.prisma` explicitly and the CLI flag always
 * overrides the config-file schema.
 *
 * `import 'dotenv/config'` restores the .env loading that Prisma performs
 * automatically only when no config file exists.
 */
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    seed: 'tsx src/scripts/seed.ts',
  },
});
