ALTER TABLE "products" ADD COLUMN "minimumQuantity" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "products" ADD CONSTRAINT "products_minimumQuantity_check" CHECK ("minimumQuantity" BETWEEN 1 AND 99);
