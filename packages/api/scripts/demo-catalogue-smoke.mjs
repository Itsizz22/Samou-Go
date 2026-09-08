import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
// Intentionally fixed to local API. Never runs against production.
const base = "http://localhost:4000/api/v1";
const p = "e2e-test-showcase";
let checks = 0;
async function call(method, route, body, token, expected = 200) {
  const r = await fetch(base + route, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await r.text();
  const data = text ? JSON.parse(text) : null;
  assert.equal(r.status, expected, `${method} ${route}: ${text}`);
  checks++;
  return data?.data;
}
const login = async (phone) =>
  (await call("POST", "/auth/login", { phone, password: "Password123!" }))
    .accessToken;
const customer = await login("0599000007");
const manager = await login("0599000002");
const admin = await login("0599000001");
const captain = await login("0599000004");
for (const token of [customer, manager, admin, captain])
  await call("GET", "/auth/me", null, token);
const storeId = "e2e-test-store-restaurant";
const productId = `${p}-product-pizza`;
const selectedOptions = [
  { groupId: `${p}-size`, optionId: `${p}-size-large` },
  { groupId: `${p}-extras`, optionId: `${p}-extras-cheese` },
  { groupId: `${p}-extras`, optionId: `${p}-extras-olives` },
];
const basket = {
  storeId,
  fulfillmentType: "PICKUP",
  customerAddressText: "اختبار محلي فقط",
  items: [{ productId, quantity: 2, selectedOptions }],
};
const quote = await call("POST", "/orders/quote", basket);
assert.equal(quote.subtotal, 94);
checks++;
console.log("PASS server quote: (30 + 10 + 5 + 2) x 2 = 94");
await call(
  "POST",
  "/orders/quote",
  { ...basket, items: [{ productId, quantity: 1 }] },
  null,
  422,
);
await call("POST", "/orders", basket, null, 401);
console.log("PASS required options and guest order blocking");
const bytes = await readFile(
  new URL("../demo-assets/pizza.webp", import.meta.url),
);
for (const [kind, resourceId, purpose] of [
  ["product", productId, "image"],
  ["category", `${p}-category-pizza`, "image"],
  ["offer", `${p}-offer-pizza`, "image"],
  ["store", storeId, "cover"],
]) {
  const upload = await call(
    "POST",
    "/uploads/presign",
    { kind, resourceId, purpose, contentType: "image/webp" },
    manager,
    201,
  );
  const r = await fetch(upload.uploadUrl, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${manager}`,
      "Content-Type": "image/webp",
    },
    body: bytes,
  });
  assert.equal(r.status, 204);
  checks++;
  const finalized = await call(
    "POST",
    "/uploads/finalize",
    { key: upload.key, kind },
    manager,
  );
  assert(finalized);
  console.log("PASS upload", kind);
}
const route = `/stores/${storeId}/products/${p}-product-burger/options`;
for (const stale of (await call("GET", route, null, manager)).items)
  if (stale.name === "نوع الخبز — اختبار")
    await call("DELETE", `${route}/${stale.id}`, null, manager, 204);
const group = await call(
  "POST",
  route,
  {
    name: "نوع الخبز — اختبار",
    required: true,
    minSelect: 1,
    maxSelect: 1,
    items: [
      { name: "خبز عادي", price: 0 },
      { name: "خبز أسمر", price: 2 },
    ],
  },
  manager,
  201,
);
await call(
  "PUT",
  `${route}/${group.id}`,
  { name: "نوع الخبز — تعديل ناجح" },
  manager,
);
await call("DELETE", `${route}/${group.id}`, null, manager, 204);
console.log("PASS manager creates, edits and removes option group");
const order = await call("POST", "/orders", basket, customer, 201);
assert.equal(order.subtotal, 94);
checks++;
for (const status of ["ACCEPTED", "PREPARING", "READY_FOR_PICKUP"])
  await call("PATCH", `/orders/${order.id}/status`, { status }, manager);
await call(
  "PATCH",
  `/orders/${order.id}/status`,
  { status: "CANCELLED", note: "انتهاء اختبار محلي" },
  admin,
);
console.log(
  "PASS order creation, store acceptance/preparation/ready, QA cancellation",
);
for (const store of ["restaurant", "supermarket", "sweets"]) {
  const data = await call("GET", `/stores/e2e-test-store-${store}`);
  for (const category of data.categories)
    for (const product of category.products.filter((p) =>
      p.id.startsWith("e2e-test-showcase"),
    )) {
      const r = await fetch(product.imageUrl);
      assert.equal(r.status, 200);
      assert.match(r.headers.get("content-type"), /image/);
      checks++;
    }
}
console.log(`PASS ${checks} local integration checks`);
