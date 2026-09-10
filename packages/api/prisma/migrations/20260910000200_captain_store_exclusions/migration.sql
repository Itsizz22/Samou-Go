CREATE TABLE "_BlockedCaptainStores" (
  "A" TEXT NOT NULL,
  "B" TEXT NOT NULL,
  CONSTRAINT "_BlockedCaptainStores_AB_pkey" PRIMARY KEY ("A", "B")
);
CREATE INDEX "_BlockedCaptainStores_B_index" ON "_BlockedCaptainStores"("B");
ALTER TABLE "_BlockedCaptainStores" ADD CONSTRAINT "_BlockedCaptainStores_A_fkey" FOREIGN KEY ("A") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "_BlockedCaptainStores" ADD CONSTRAINT "_BlockedCaptainStores_B_fkey" FOREIGN KEY ("B") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
