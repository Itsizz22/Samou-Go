ALTER TABLE "product_option_groups" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'ADDON';
ALTER TABLE "product_option_items" ADD COLUMN "imageUrl" TEXT, ADD COLUMN "isDefault" BOOLEAN NOT NULL DEFAULT false;
