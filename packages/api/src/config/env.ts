import path from 'node:path';
import dotenv from 'dotenv';
import { z } from 'zod';
import { DEFAULT_DELIVERY_FEE_CONFIG, type DeliveryFeeConfig } from '@samou-go/shared-types';

// Load `packages/api/.env` regardless of the cwd the process was started from.
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),

  // Local dev/test runs on SQLite (schema.sqlite.prisma, file:./dev.db) and do
  // not need a database URL. It is only mandatory in production (PostgreSQL),
  // where it is injected as a deployment secret — see the production guard below.
  DATABASE_URL: z.string().min(1).optional(),

  JWT_SECRET: z
    .string()
    .min(32, 'JWT_SECRET must be at least 32 characters. Generate one with: node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'base64url\'))"'),
  /** Access-token lifetime. Legacy name kept for compatibility with existing `.env`s. */
  JWT_EXPIRES_IN: z.string().default('7d'),
  /** Overrides `JWT_EXPIRES_IN` for the access token — prefer a short value (e.g. 15m) in production. */
  JWT_ACCESS_EXPIRES_IN: z.string().optional(),
  /** Refresh-token lifetime. Rotated on use; stored hashed. */
  JWT_REFRESH_EXPIRES_IN: z.string().default('30d'),

  /* ---- SMS / OTP --------------------------------------------------------- */
  /** Which gateway dispatches OTP codes. `console` logs codes (dev only), `none` swallows them. */
  SMS_PROVIDER: z.enum(['twilio', 'firebase', 'generic', 'console', 'none']).default('console'),
  SMS_GENERIC_ENDPOINT: z.string().url().optional(),
  SMS_GENERIC_API_KEY: z.string().optional(),
  SMS_GENERIC_SENDER: z.string().optional(),
  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  TWILIO_FROM_NUMBER: z.string().optional(),
  FIREBASE_SMS_FUNCTION_URL: z.string().url().optional(),
  FIREBASE_SMS_API_KEY: z.string().optional(),
  /** Digits in the OTP code. 6 is the default everywhere else in the stack. */
  OTP_LENGTH: z.coerce.number().int().min(4).max(8).default(6),
  /** OTP validity, in seconds. Requirement: 3 minutes. */
  OTP_TTL_SECONDS: z.coerce.number().int().positive().default(180),
  /** Max OTP dispatches per phone inside the window below. */
  OTP_RATE_MAX: z.coerce.number().int().positive().default(3),
  /** Rate-limit window, in minutes. Requirement: 5 minutes. */
  OTP_RATE_WINDOW_MINUTES: z.coerce.number().int().positive().default(5),
  /** Wrong attempts before the code is invalidated. */
  OTP_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),

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

// Production-only guards: reject configurations that are safe in dev but
// actively dangerous once the API is reachable by real users.
if (raw.NODE_ENV === 'production') {
  if (!raw.DATABASE_URL) {
    throw new Error(
      'Invalid environment configuration:\n' +
        '  • DATABASE_URL: required in production (PostgreSQL). ' +
        'Inject it as a deployment secret — never ship it in a repository .env file.'
    );
  }
  if (raw.JWT_SECRET.includes('change-me') || raw.JWT_SECRET.length < 32) {
    throw new Error(
      'Invalid environment configuration:\n' +
        '  • JWT_SECRET: refusing to boot production with the placeholder secret. ' +
        'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'base64url\'))"'
    );
  }
  if (raw.SMS_PROVIDER === 'console') {
    throw new Error(
      'Invalid environment configuration:\n' +
        '  • SMS_PROVIDER: "console" prints OTP codes to the server log — never acceptable in production. ' +
        'Set SMS_PROVIDER=twilio|firebase|generic with real credentials.'
    );
  }
}

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

/** Parses duration strings (`7d`, `30m`, `2h`, `90` = seconds) into milliseconds. */
export function parseDurationMs(value: string): number {
  const match = /^(\d+)(s|m|h|d|w)?$/.exec(value.trim());
  if (!match) {
    throw new Error(`Invalid duration string: "${value}"`);
  }
  const amount = Number(match[1]);
  const unit = match[2] ?? 's';
  const perUnit: Record<string, number> = {
    s: 1_000,
    m: 60_000,
    h: 3_600_000,
    d: 86_400_000,
    w: 604_800_000,
  };
  return amount * (perUnit[unit] ?? 1_000);
}

export const env = {
  nodeEnv: raw.NODE_ENV,
  isProduction: raw.NODE_ENV === 'production',
  isTest: raw.NODE_ENV === 'test',
  port: raw.PORT,
  databaseUrl: raw.DATABASE_URL,
  jwt: {
    secret: raw.JWT_SECRET,
    expiresIn: raw.JWT_ACCESS_EXPIRES_IN ?? raw.JWT_EXPIRES_IN,
    refreshExpiresIn: raw.JWT_REFRESH_EXPIRES_IN,
  },
  sms: {
    provider: raw.SMS_PROVIDER,
    generic: {
      endpoint: raw.SMS_GENERIC_ENDPOINT,
      apiKey: raw.SMS_GENERIC_API_KEY,
      sender: raw.SMS_GENERIC_SENDER,
    },
    twilio: {
      accountSid: raw.TWILIO_ACCOUNT_SID,
      authToken: raw.TWILIO_AUTH_TOKEN,
      from: raw.TWILIO_FROM_NUMBER,
    },
    firebase: {
      functionUrl: raw.FIREBASE_SMS_FUNCTION_URL,
      apiKey: raw.FIREBASE_SMS_API_KEY,
    },
  },
  otp: {
    length: raw.OTP_LENGTH,
    ttlMs: raw.OTP_TTL_SECONDS * 1_000,
    rateMax: raw.OTP_RATE_MAX,
    rateWindowMs: raw.OTP_RATE_WINDOW_MINUTES * 60_000,
    maxAttempts: raw.OTP_MAX_ATTEMPTS,
  },
  corsOrigins: raw.CORS_ORIGINS.split(',')
    .map(origin => origin.trim())
    .filter(Boolean),
  deliveryFeeConfig,
} as const;

export type Env = typeof env;
