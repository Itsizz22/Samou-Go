ALTER TABLE "orders" ADD COLUMN "orderNote" VARCHAR(500);
ALTER TABLE "orders" ADD COLUMN "estimatedPrepMinutes" INTEGER;
ALTER TABLE "order_items" ADD COLUMN "note" VARCHAR(500);
