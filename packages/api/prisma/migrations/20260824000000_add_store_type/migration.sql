-- CreateEnum
CREATE TYPE "StoreType" AS ENUM ('RESTAURANT', 'CAFE', 'SUPERMARKET', 'STORE', 'BAKERY_SWEETS', 'BUTCHERY', 'VEGETABLES_FRUITS');

-- AlterTable: add storeType column to stores table
ALTER TABLE "stores" ADD COLUMN "storeType" "StoreType";
