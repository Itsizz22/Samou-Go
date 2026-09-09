ALTER TABLE "orders" ADD COLUMN "estimatedReadyAt" TIMESTAMP(3), ADD COLUMN "prepReminderSentAt" TIMESTAMP(3), ADD COLUMN "prepReminderLeaseUntil" TIMESTAMP(3);
ALTER TABLE "platform_settings" ADD COLUMN "preparationReminderMinutes" INTEGER NOT NULL DEFAULT 5;
CREATE INDEX "orders_preparation_reminder_idx" ON "orders" ("status", "prepReminderSentAt", "estimatedReadyAt");
