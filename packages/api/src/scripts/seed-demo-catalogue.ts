/** Local-only catalogue fixtures. Never reads production credentials or modifies real stores. */
import { PrismaClient } from "../../generated/prisma-sqlite";
import { copyFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
const apiRoot = path.resolve(__dirname, "../..");
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: `file:${path.join(apiRoot, "prisma/dev.db").replaceAll("\\", "/")}`,
    },
  },
});
const prefix = "e2e-test-showcase";
async function main() {
  if (process.env.NODE_ENV === "production")
    throw new Error("Demo catalogue is local-only");
  const fixtures = [
    {
      key: "pizza",
      store: "restaurant",
      category: "البيتزا",
      name: "بيتزا الجبنة — تجربة التخصيص",
      price: 30,
    },
    {
      key: "burger",
      store: "restaurant",
      category: "البرغر",
      name: "برغر اللحم — تجريبي",
      price: 25,
    },
    {
      key: "salad",
      store: "supermarket",
      category: "سلطات طازجة",
      name: "سلطة خضار طازجة — تجريبي",
      price: 15,
    },
    {
      key: "dessert",
      store: "sweets",
      category: "الكيك",
      name: "كيكة الشوكولاتة — تجريبي",
      price: 20,
    },
  ];
  for (const store of new Set(fixtures.map((f) => f.store))) {
    if (
      !(await prisma.store.findUnique({
        where: { id: `e2e-test-store-${store}` },
      }))
    )
      throw new Error(
        `Missing demo store ${store}; seed local demo stores first`,
      );
  }
  const finalDir = path.join(apiRoot, ".uploads/final/demo");
  await mkdir(finalDir, { recursive: true });
  for (const f of fixtures) {
    const source = path.join(apiRoot, "demo-assets", `${f.key}.webp`);
    const hash = createHash("sha256")
      .update(await readFile(source))
      .digest("hex")
      .slice(0, 12);
    const filename = `${f.key}-${hash}.webp`;
    await copyFile(source, path.join(finalDir, filename));
    const imageUrl = `http://localhost:4000/uploads/demo/${filename}`;
    const storeId = `e2e-test-store-${f.store}`;
    const categoryId = `${prefix}-category-${f.key}`;
    const id = `${prefix}-product-${f.key}`;
    await prisma.$transaction(async (tx) => {
      await tx.category.upsert({
        where: { id: categoryId },
        create: {
          id: categoryId,
          storeId,
          nameAr: f.category,
          nameEn: `Showcase ${f.key}`,
          imageUrl,
        },
        update: { imageUrl },
      });
      const data = {
        nameAr: f.name,
        description:
          "منتج توضيحي لاختبار الصور والسلة والتخصيص في المتجر التجريبي.",
        price: f.price,
        imageUrl,
        isAvailable: true,
        optionsEnabled: f.key === "pizza",
        storeId,
        categoryId,
      };
      await tx.product.upsert({
        where: { id },
        create: { id, ...data },
        update: data,
      });
      const offerId = `${prefix}-offer-${f.key}`;
      const offer = {
        storeId,
        titleAr: `عرض تجريبي: ${f.category}`,
        titleEn: `Demo ${f.key}`,
        descriptionAr: "صور وبيانات توضيحية للمتجر التجريبي",
        descriptionEn: "Demo catalogue preview",
        imageUrl,
        isActive: true,
      };
      await tx.offer.upsert({
        where: { id: offerId },
        create: { id: offerId, ...offer },
        update: offer,
      });
      await tx.offerProduct.upsert({
        where: { offerId_productId: { offerId, productId: id } },
        create: { offerId, productId: id },
        update: {},
      });
      if (f.key === "pizza") {
        // Respect the existing five-option-per-product limit.
        const groups = [
          {
            key: "size",
            name: "اختر الحجم",
            required: true,
            max: 1,
            items: [
              { key: "medium", name: "وسط", price: 0 },
              { key: "large", name: "كبير", price: 10 },
            ],
          },
          {
            key: "extras",
            name: "إضافات البيتزا",
            required: false,
            max: 3,
            items: [
              { key: "cheese", name: "جبنة إضافية", price: 5 },
              { key: "olives", name: "زيتون", price: 2 },
              { key: "mushrooms", name: "فطر", price: 3 },
            ],
          },
        ];
        for (const [sortOrder, g] of groups.entries()) {
          const groupId = `${prefix}-${g.key}`;
          const data = {
            productId: id,
            name: g.name,
            required: g.required,
            minSelect: g.required ? 1 : 0,
            maxSelect: g.max,
            sortOrder,
          };
          await tx.productOptionGroup.upsert({
            where: { id: groupId },
            create: { id: groupId, ...data },
            update: data,
          });
          for (const [index, item] of g.items.entries()) {
            const itemId = `${groupId}-${item.key}`;
            const data = {
              groupId,
              name: item.name,
              price: item.price,
              isActive: true,
              sortOrder: index,
            };
            await tx.productOptionItem.upsert({
              where: { id: itemId },
              create: { id: itemId, ...data },
              update: data,
            });
          }
        }
      }
    });
    console.log(`${f.name}: product + category + offer image ready`);
  }
}
main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
