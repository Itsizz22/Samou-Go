-- CreateTable
CREATE TABLE "offer_products" (
    "id" TEXT NOT NULL,
    "offerId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,

    CONSTRAINT "offer_products_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "offer_products_offerId_productId_key" ON "offer_products"("offerId", "productId");

-- CreateIndex
CREATE INDEX "offer_products_productId_idx" ON "offer_products"("productId");

-- AddForeignKey
ALTER TABLE "offer_products" ADD CONSTRAINT "offer_products_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "offers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offer_products" ADD CONSTRAINT "offer_products_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
