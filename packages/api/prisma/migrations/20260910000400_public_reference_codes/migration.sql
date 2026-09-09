CREATE TABLE "reference_sequences" ("prefix" TEXT NOT NULL PRIMARY KEY, "value" INTEGER NOT NULL);
ALTER TABLE "users" ADD COLUMN "publicCode" TEXT;
ALTER TABLE "stores" ADD COLUMN "publicCode" TEXT;
WITH numbered AS (
 SELECT "id", CASE "role" WHEN 'CUSTOMER' THEN 'C' WHEN 'CAPTAIN' THEN 'D' WHEN 'STORE_MANAGER' THEN 'M' ELSE 'A' END AS prefix,
 ROW_NUMBER() OVER (PARTITION BY "role" ORDER BY "createdAt", "id") + 10000 AS n FROM "users"
) UPDATE "users" u SET "publicCode" = numbered.prefix || '-' || numbered.n FROM numbered WHERE u."id" = numbered."id";
WITH numbered AS (SELECT "id", ROW_NUMBER() OVER (ORDER BY "createdAt", "id") + 10000 AS n FROM "stores")
UPDATE "stores" s SET "publicCode" = 'S-' || numbered.n FROM numbered WHERE s."id" = numbered."id";
CREATE UNIQUE INDEX "users_publicCode_key" ON "users"("publicCode");
CREATE UNIQUE INDEX "stores_publicCode_key" ON "stores"("publicCode");
INSERT INTO "reference_sequences" ("prefix", "value")
SELECT split_part(code, '-', 1), MAX(split_part(code, '-', 2)::INTEGER)
FROM (SELECT "publicCode" AS code FROM "users" UNION ALL SELECT "publicCode" FROM "stores") codes GROUP BY 1;
