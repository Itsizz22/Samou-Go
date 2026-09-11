ALTER TYPE "StoreType" ADD VALUE IF NOT EXISTS 'PHARMACY';
ALTER TABLE "custom_requests" ADD COLUMN "isPrescription" BOOLEAN NOT NULL DEFAULT false, ADD COLUMN "prescriptionImage" TEXT, ADD COLUMN "customerAddressText" TEXT, ADD COLUMN "deliveryZoneId" TEXT, ADD COLUMN "quotedDeliveryFee" DOUBLE PRECISION, ADD COLUMN "orderId" TEXT;
CREATE UNIQUE INDEX "custom_requests_orderId_key" ON "custom_requests"("orderId");
ALTER TABLE "custom_requests" ADD COLUMN "deliveryFeePending" BOOLEAN NOT NULL DEFAULT false;
