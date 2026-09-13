ALTER TABLE "users" ADD COLUMN "lastDispatchAt" TIMESTAMP(3);
ALTER TABLE "orders" ADD COLUMN "dispatchCaptainId" TEXT;
ALTER TABLE "orders" ADD COLUMN "dispatchExpiresAt" TIMESTAMP(3);
ALTER TABLE "orders" ADD COLUMN "preparationStartedAt" TIMESTAMP(3);
ALTER TABLE "orders" ADD COLUMN "preparedAt" TIMESTAMP(3);
