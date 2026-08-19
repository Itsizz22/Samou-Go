-- CreateTable
CREATE TABLE "platform_settings" (
    "id" TEXT NOT NULL,
    "captainDeliveryRate" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "storeCommissionRate" DECIMAL(5,4) NOT NULL DEFAULT 0.10,
    "autoAssign" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "platform_settings_pkey" PRIMARY KEY ("id")
);