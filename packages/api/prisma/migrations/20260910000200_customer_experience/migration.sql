ALTER TABLE "users" ADD COLUMN "marketingNotificationsEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "orders" ADD COLUMN "unavailableAction" TEXT NOT NULL DEFAULT 'CONTACT', ADD COLUMN "changeProposal" TEXT, ADD COLUMN "unclaimedAlertAt" TIMESTAMP(3);
DROP INDEX "order_items_orderId_productId_key";
CREATE INDEX "order_items_orderId_productId_idx" ON "order_items"("orderId", "productId");
