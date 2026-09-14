-- Additive only: preserve existing products, stores, and orders.
ALTER TABLE "stores" ADD COLUMN "busyUntil" TIMESTAMP(3),
  ADD COLUMN "busyExtraMinutes" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "acceptsScheduledOrders" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "products" ADD COLUMN "unavailableUntil" TIMESTAMP(3);
ALTER TABLE "orders" ADD COLUMN "scheduledFor" TIMESTAMP(3),
  ADD COLUMN "scheduledReminderAt" TIMESTAMP(3),
  ADD COLUMN "scheduledReminderLeaseUntil" TIMESTAMP(3);
CREATE INDEX "stores_storeStatus_busyUntil_idx" ON "stores"("storeStatus", "busyUntil");
CREATE INDEX "products_isAvailable_unavailableUntil_idx" ON "products"("isAvailable", "unavailableUntil");
CREATE INDEX "orders_status_scheduledFor_idx" ON "orders"("status", "scheduledFor");
