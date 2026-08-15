import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { defineConfig } from 'prisma/config';

// تحديد مسار المجلد الحالي بدقة لبيئة ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// تحميل ملف .env مباشرة من مجلد packages/api
dotenv.config({ path: path.resolve(__dirname, '.env'), override: true });

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    seed: 'tsx src/scripts/seed.ts',
  },
});