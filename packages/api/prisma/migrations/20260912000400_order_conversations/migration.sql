ALTER TABLE "chat_messages" ADD COLUMN "recipientId" TEXT;
ALTER TABLE "chat_messages" ADD COLUMN "clientMessageId" TEXT;
ALTER TABLE "chat_messages" ADD COLUMN "readAt" TIMESTAMP(3);
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE UNIQUE INDEX "chat_messages_senderId_clientMessageId_key" ON "chat_messages"("senderId", "clientMessageId");
CREATE INDEX "chat_messages_orderId_recipientId_readAt_idx" ON "chat_messages"("orderId", "recipientId", "readAt");
