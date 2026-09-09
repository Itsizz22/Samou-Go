ALTER TABLE "products" ADD COLUMN "featuredRank" INTEGER;
CREATE TABLE "order_submissions" (
  "customerId" TEXT NOT NULL,
  "requestId" TEXT NOT NULL,
  "requestHash" TEXT NOT NULL,
  "response" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "order_submissions_pkey" PRIMARY KEY ("customerId", "requestId")
);