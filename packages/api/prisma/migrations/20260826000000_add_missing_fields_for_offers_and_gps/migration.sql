-- AddMissingFields
-- Adds columns that were added to schema.prisma after the last migration
-- but never shipped to production PostgreSQL.

-- 1. Platform settings: GPS capture feature flag
ALTER TABLE "platform_settings" ADD COLUMN "gpsCaptureEnabled" BOOLEAN NOT NULL DEFAULT false;

-- 2. Orders: voice note support
ALTER TABLE "orders" ADD COLUMN "voiceNoteUrl" TEXT;
ALTER TABLE "orders" ADD COLUMN "voiceNoteDuration" INTEGER;

-- 3. Order items: standalone offer support
ALTER TABLE "order_items" ADD COLUMN "isOfferItem" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "order_items" ADD COLUMN "offerTitle" VARCHAR(200);
ALTER TABLE "order_items" ADD COLUMN "offerId" TEXT;
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "offers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "order_items_offerId_idx" ON "order_items"("offerId");

-- 4. Offers: standalone purchase price
ALTER TABLE "offers" ADD COLUMN "price" DECIMAL(10,2);
