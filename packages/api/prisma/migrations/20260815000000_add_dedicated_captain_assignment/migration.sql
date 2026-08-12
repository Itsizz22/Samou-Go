ALTER TABLE "users" ADD COLUMN "assignedStoreId" TEXT;
CREATE INDEX "users_assignedStoreId_idx" ON "users"("assignedStoreId");
ALTER TABLE "users" ADD CONSTRAINT "users_assignedStoreId_fkey" FOREIGN KEY ("assignedStoreId") REFERENCES "stores"("id") ON DELETE SET NULL ON UPDATE CASCADE;
