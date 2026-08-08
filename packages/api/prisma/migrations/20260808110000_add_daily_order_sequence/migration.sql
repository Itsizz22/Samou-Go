-- CreateTable
CREATE TABLE "daily_order_sequences" (
    "date" DATE NOT NULL,
    "sequence" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "daily_order_sequences_pkey" PRIMARY KEY ("date")
);
