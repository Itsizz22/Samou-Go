-- Promote delivery-zone fees to an explicit, admin-managed column and add
-- the captain quote workflow. Existing fees are preserved by the rename.
ALTER TABLE "delivery_zones" RENAME COLUMN "fee" TO "deliveryFee";
ALTER TABLE "delivery_zones" ADD COLUMN "allowCaptainPricing" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "orders" ADD COLUMN "isCaptainPriced" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "orders" ADD COLUMN "driverQuotedFee" DOUBLE PRECISION;
ALTER TABLE "orders" ADD COLUMN "feeApprovalStatus" TEXT NOT NULL DEFAULT 'APPROVED';
