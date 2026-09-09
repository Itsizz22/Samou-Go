CREATE TABLE "notification_deliveries" (
 "id" TEXT NOT NULL PRIMARY KEY, "userId" TEXT NOT NULL, "orderId" TEXT, "type" TEXT NOT NULL, "title" TEXT NOT NULL,
 "status" TEXT NOT NULL DEFAULT 'PENDING', "sentCount" INTEGER NOT NULL DEFAULT 0, "failedCount" INTEGER NOT NULL DEFAULT 0,
 "errorCode" TEXT, "providerAcceptedAt" TIMESTAMP(3), "openedAt" TIMESTAMP(3),
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "notification_deliveries_createdAt_idx" ON "notification_deliveries"("createdAt");
CREATE INDEX "notification_deliveries_userId_createdAt_idx" ON "notification_deliveries"("userId", "createdAt");
CREATE INDEX "notification_deliveries_orderId_createdAt_idx" ON "notification_deliveries"("orderId", "createdAt");
CREATE TABLE "background_job_heartbeats" (
 "id" TEXT NOT NULL PRIMARY KEY, "lastStartedAt" TIMESTAMP(3) NOT NULL, "lastSucceededAt" TIMESTAMP(3), "lastFailedAt" TIMESTAMP(3)
);
