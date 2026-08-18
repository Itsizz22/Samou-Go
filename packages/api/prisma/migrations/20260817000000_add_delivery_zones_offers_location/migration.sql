-- AddDeliveryZonesOffersLocation
-- A (delivery zones + order fee zone), B (user location), D (offers).

CREATE TABLE "delivery_zones" (
    "id" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "fee" DECIMAL(10,2) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "delivery_zones_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "delivery_zones_isActive_sortOrder_idx" ON "delivery_zones"("isActive", "sortOrder");

CREATE TABLE "offers" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "titleAr" TEXT NOT NULL,
    "titleEn" TEXT NOT NULL,
    "descriptionAr" TEXT NOT NULL,
    "descriptionEn" TEXT NOT NULL,
    "imageUrl" TEXT,
    "imageKey" TEXT,
    "startsAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "offers_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "offers_storeId_isActive_idx" ON "offers"("storeId", "isActive");
CREATE INDEX "offers_isActive_expiresAt_idx" ON "offers"("isActive", "expiresAt");

ALTER TABLE "offers" ADD CONSTRAINT "offers_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "orders" ADD COLUMN "deliveryZoneId" TEXT;
ALTER TABLE "orders" ADD CONSTRAINT "orders_deliveryZoneId_fkey" FOREIGN KEY ("deliveryZoneId") REFERENCES "delivery_zones"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "orders_deliveryZoneId_idx" ON "orders"("deliveryZoneId");

ALTER TABLE "users" ADD COLUMN "latitude" DOUBLE PRECISION;
ALTER TABLE "users" ADD COLUMN "longitude" DOUBLE PRECISION;