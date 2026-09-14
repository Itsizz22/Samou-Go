CREATE TABLE "product_option_templates" (
  "id" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "configuration" TEXT NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "product_option_templates_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "product_option_templates_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "product_option_templates_storeId_idx" ON "product_option_templates"("storeId");
ALTER TABLE "product_option_groups" ADD COLUMN "templateId" TEXT;
ALTER TABLE "product_option_items" ADD COLUMN "templateItemId" TEXT;
ALTER TABLE "product_option_groups" ADD CONSTRAINT "product_option_groups_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "product_option_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "product_option_groups_templateId_idx" ON "product_option_groups"("templateId");
