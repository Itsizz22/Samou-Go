-- Preserve legacy tickets and their descriptions while introducing conversations.
ALTER TABLE "support_tickets"
  ADD COLUMN "ticketNumber" TEXT,
  ADD COLUMN "orderId" TEXT,
  ADD COLUMN "category" TEXT NOT NULL DEFAULT 'GENERAL',
  ADD COLUMN "priority" TEXT NOT NULL DEFAULT 'NORMAL',
  ADD COLUMN "updatedAt" TIMESTAMP(3);

WITH numbered AS (
  SELECT "id", 1000 + ROW_NUMBER() OVER (ORDER BY "createdAt", "id") AS number
  FROM "support_tickets"
)
UPDATE "support_tickets" AS ticket
SET "ticketNumber" = 'TKT-' || numbered.number::text,
    "updatedAt" = COALESCE(ticket."resolvedAt", ticket."createdAt")
FROM numbered WHERE ticket."id" = numbered."id";

ALTER TABLE "support_tickets"
  ALTER COLUMN "ticketNumber" SET NOT NULL,
  ALTER COLUMN "updatedAt" SET NOT NULL,
  ALTER COLUMN "category" DROP DEFAULT,
  ALTER COLUMN "role" DROP NOT NULL,
  ALTER COLUMN "description" DROP NOT NULL,
  ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "support_tickets" ALTER COLUMN "status" TYPE TEXT USING "status"::text;
ALTER TABLE "support_tickets" ALTER COLUMN "status" SET DEFAULT 'OPEN';
CREATE UNIQUE INDEX "support_tickets_ticketNumber_key" ON "support_tickets"("ticketNumber");

CREATE TABLE "TicketMessage" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "ticketId" TEXT NOT NULL,
  "senderId" TEXT NOT NULL,
  "senderRole" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "attachments" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TicketMessage_ticketId_fkey" FOREIGN KEY ("ticketId")
    REFERENCES "support_tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

INSERT INTO "TicketMessage" ("id", "ticketId", "senderId", "senderRole", "message", "createdAt")
SELECT 'legacy:' || "id", "id", "userId", "role"::text, "description", "createdAt"
FROM "support_tickets" WHERE "description" IS NOT NULL;
