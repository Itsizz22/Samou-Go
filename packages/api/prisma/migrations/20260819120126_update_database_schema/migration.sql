/*
  Warnings:

  - You are about to alter the column `nameAr` on the `delivery_zones` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(160)`.
  - You are about to alter the column `nameEn` on the `delivery_zones` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(160)`.
  - You are about to alter the column `titleAr` on the `offers` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(160)`.
  - You are about to alter the column `titleEn` on the `offers` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(160)`.
  - You are about to alter the column `descriptionAr` on the `offers` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(500)`.
  - You are about to alter the column `descriptionEn` on the `offers` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(500)`.

*/
-- CreateEnum
CREATE TYPE "CustomRequestStatus" AS ENUM ('PENDING', 'PRICE_OFFERED', 'ACCEPTED', 'REJECTED', 'CANCELLED');

-- AlterTable
ALTER TABLE "delivery_zones" ALTER COLUMN "nameAr" SET DATA TYPE VARCHAR(160),
ALTER COLUMN "nameEn" SET DATA TYPE VARCHAR(160);

-- AlterTable
ALTER TABLE "offers" ALTER COLUMN "titleAr" SET DATA TYPE VARCHAR(160),
ALTER COLUMN "titleEn" SET DATA TYPE VARCHAR(160),
ALTER COLUMN "descriptionAr" SET DATA TYPE VARCHAR(500),
ALTER COLUMN "descriptionEn" SET DATA TYPE VARCHAR(500);

-- AlterTable
ALTER TABLE "stores" ADD COLUMN     "coverUrl" TEXT,
ADD COLUMN     "isRecommended" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "custom_requests" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "description" VARCHAR(1000) NOT NULL,
    "status" "CustomRequestStatus" NOT NULL DEFAULT 'PENDING',
    "offeredPrice" DECIMAL(10,2),
    "offerNote" VARCHAR(500),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "custom_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "custom_requests_storeId_status_createdAt_idx" ON "custom_requests"("storeId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "custom_requests_customerId_status_createdAt_idx" ON "custom_requests"("customerId", "status", "createdAt");

-- AddForeignKey
ALTER TABLE "custom_requests" ADD CONSTRAINT "custom_requests_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custom_requests" ADD CONSTRAINT "custom_requests_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;
