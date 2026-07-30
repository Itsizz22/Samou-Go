import path from 'node:path';
import dotenv from 'dotenv';
import { z } from 'zod';
import { DEFAULT_DELIVERY_FEE_CONFIG, type DeliveryFeeConfig } from '@samou-go/shared-types';

// Load `packages/api/.env` regardless of the cwd the process was started from.
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required — see .env.example'),

  JWT_SECRET: z
    .string()
    .min(32, 'JWT_SECRET must be at least 32 characters. Generate one with: node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'base64url\'))"'),
  JWT_EXPIRES_IN: z.string().default('7d'),

  CORS_ORIGINS: z.string().default('http://localhost:5173'),

  DELIVERY_BASE_FEE: z.coerce.number().nonnegative().default(DEFAULT_DELIVERY_FEE_CONFIG.baseFee),
  DELIVERY_BULK_FEE: z.coerce.number().nonnegative().default(DEFAULT_DELIVERY_FEE_CONFIG.bulkFee),
  DELIVERY_BULK_THRESHOLD: z.coerce
    .number()
    .int()
    .positive()
    .default(DEFAULT_DELIVERY_FEE_CONFIG.bulkThreshold),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const lines = parsed.error.issues.map(
    issue => `  • ${issue.path.join('.') || '(root)'}: ${issue.message}`
  );
  // Fail loudly at boot rather than 500-ing on the first request.
  throw new Error(`Invalid environment configuration:\n${lines.join('\n')}`);
}

const raw = parsed.data;

/**
 * The delivery tariff this deployment runs on. Values come from the environment
 * so the fee can be changed without a code release, but the *rule* (tiered by
 * item count) lives in @samou-go/shared-types and is not configurable here.
 */
export const deliveryFeeConfig: DeliveryFeeConfig = {
  baseFee: raw.DELIVERY_BASE_FEE,
  bulkFee: raw.DELIVERY_BULK_FEE,
  bulkThreshold: raw.DELIVERY_BULK_THRESHOLD,
  currency: DEFAULT_DELIVERY_FEE_CONFIG.currency,
};

export const env = {
  nodeEnv: raw.NODE_ENV,
  isProduction: raw.NODE_ENV === 'production',
  isTest: raw.NODE_ENV === 'test',
  port: raw.PORT,
  databaseUrl: raw.DATABASE_URL,
  jwt: {
    secret: raw.JWT_SECRET,
    expiresIn: raw.JWT_EXPIRES_IN,
  },
  corsOrigins: raw.CORS_ORIGINS.split(',')
    .map(origin => origin.trim())
    .filter(Boolean),
  deliveryFeeConfig,
} as const;

export type Env = typeof env;
