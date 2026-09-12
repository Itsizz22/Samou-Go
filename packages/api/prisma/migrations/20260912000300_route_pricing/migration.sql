ALTER TABLE "stores" ADD COLUMN "deliveryZoneId" TEXT;
ALTER TABLE "stores" ADD CONSTRAINT "stores_deliveryZoneId_fkey" FOREIGN KEY ("deliveryZoneId") REFERENCES "delivery_zones"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE TABLE "delivery_pricing_config" ("id" TEXT NOT NULL DEFAULT 'routes', "enabled" BOOLEAN NOT NULL DEFAULT false, "revision" INTEGER NOT NULL DEFAULT 0, CONSTRAINT "delivery_pricing_config_pkey" PRIMARY KEY ("id"));
CREATE TABLE "delivery_route_rates" ("fromZoneId" TEXT NOT NULL, "toZoneId" TEXT NOT NULL, "fee" DECIMAL(10,2) NOT NULL, CONSTRAINT "delivery_route_rates_pkey" PRIMARY KEY ("fromZoneId", "toZoneId"), CONSTRAINT "route_fee_nonnegative" CHECK ("fee" >= 0), CONSTRAINT "route_canonical" CHECK ("fromZoneId" <= "toZoneId"), CONSTRAINT "route_from_fkey" FOREIGN KEY ("fromZoneId") REFERENCES "delivery_zones"("id") ON DELETE CASCADE ON UPDATE CASCADE, CONSTRAINT "route_to_fkey" FOREIGN KEY ("toZoneId") REFERENCES "delivery_zones"("id") ON DELETE CASCADE ON UPDATE CASCADE);
CREATE INDEX "delivery_route_rates_toZoneId_idx" ON "delivery_route_rates"("toZoneId");

ALTER TABLE "custom_requests" ADD COLUMN "quotedAutoPriced" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "platform_settings" ADD COLUMN "freeDeliveryEnabled" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "stores_deliveryZoneId_idx" ON "stores"("deliveryZoneId");
