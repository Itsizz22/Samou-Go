-- Keep the legacy column for installed clients; migrate every existing assignment.
CREATE TABLE "_MultiStoreCaptains" (
  "A" TEXT NOT NULL,
  "B" TEXT NOT NULL,
  CONSTRAINT "_MultiStoreCaptains_AB_pkey" PRIMARY KEY ("A", "B")
);
CREATE INDEX "_MultiStoreCaptains_B_index" ON "_MultiStoreCaptains"("B");
ALTER TABLE "_MultiStoreCaptains" ADD CONSTRAINT "_MultiStoreCaptains_A_fkey" FOREIGN KEY ("A") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "_MultiStoreCaptains" ADD CONSTRAINT "_MultiStoreCaptains_B_fkey" FOREIGN KEY ("B") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
INSERT INTO "_MultiStoreCaptains" ("A", "B") SELECT "assignedStoreId", "id" FROM "users" WHERE "assignedStoreId" IS NOT NULL ON CONFLICT DO NOTHING;
