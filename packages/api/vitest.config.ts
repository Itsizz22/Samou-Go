import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    // CI has no developer .env file. These values apply only to Vitest workers.
    env: {
      JWT_SECRET: 'samou-vitest-only-secret-not-for-deployment-2026',
      SMS_PROVIDER: 'none',
    },
    include: ['src/**/*.test.ts'],
    globals: true,
    typecheck: {
      tsconfig: './tsconfig.test.json',
    },
  },
});
