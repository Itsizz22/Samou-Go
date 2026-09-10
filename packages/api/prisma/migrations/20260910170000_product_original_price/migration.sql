ALTER TABLE "products" ADD COLUMN "originalPrice" DECIMAL(10,2);
ALTER TABLE "products" ADD CONSTRAINT "Product_discount_valid" CHECK ("originalPrice" IS NULL OR "originalPrice" > "price");
