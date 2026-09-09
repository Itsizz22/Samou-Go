import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
const base = "http://localhost:4000/api/v1";
let checks = 0;
async function call(method, route, body, token, expected = 200) {
  const response = await fetch(base + route, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const json = await response.json();
  assert.equal(
    response.status,
    expected,
    `${method} ${route}: ${JSON.stringify(json)}`,
  );
  checks++;
  return json.data;
}
const login = async (phone) =>
  (await call("POST", "/auth/login", { phone, password: "Password123!" }))
    .accessToken;
const customer = await login("0599000007"),
  admin = await login("0599000001");
const original = await call("GET", "/stores/featured-selection", null, admin);
const ids = [
  "e2e-test-showcase-product-pizza",
  "e2e-test-showcase-product-burger",
];
try {
  await call(
    "PUT",
    "/stores/featured-selection",
    { productIds: ids },
    customer,
    403,
  );
  await call(
    "PUT",
    "/stores/featured-selection",
    { productIds: [ids[0], ids[0]] },
    admin,
    422,
  );
  await call(
    "PUT",
    "/stores/featured-selection",
    { productIds: ["e2e-test-prod-shawarma"] },
    admin,
    400,
  );
  await call("PUT", "/stores/featured-selection", { productIds: ids }, admin);
  assert.deepEqual(
    (await call("GET", "/stores/featured-products")).map((p) => p.id),
    ids,
  );
  checks++;
  await call(
    "PUT",
    "/stores/featured-selection",
    { productIds: ids.toReversed() },
    admin,
  );
  assert.deepEqual(
    (await call("GET", "/stores/featured-products")).map((p) => p.id),
    ids.toReversed(),
  );
  checks++;
  console.log(
    "PASS admin authorization, image requirement, duplicate rejection and curated order",
  );
} finally {
  await call(
    "PUT",
    "/stores/featured-selection",
    { productIds: original.map((p) => p.id) },
    admin,
  );
}
const body = {
  requestId: randomUUID(),
  storeId: "e2e-test-store-restaurant",
  fulfillmentType: "PICKUP",
  customerAddressText: "اختبار منع التكرار المحلي",
  items: [{ productId: "e2e-test-prod-shawarma", quantity: 1 }],
};
const [first, second] = await Promise.all([
  call("POST", "/orders", body, customer, 201),
  call("POST", "/orders", body, customer, 201),
]);
assert.equal(first.id, second.id);
checks++;
const repeated = await call("POST", "/orders", body, customer, 201);
assert.equal(first.id, repeated.id);
checks++;
await call(
  "POST",
  "/orders",
  { ...body, items: [{ productId: "e2e-test-prod-shawarma", quantity: 2 }] },
  customer,
  409,
);
assert.equal(
  (await call("GET", "/orders/submissions/" + body.requestId, null, customer))
    .completed,
  true,
);
checks++;
assert.equal(
  (await call("GET", "/orders/submissions/" + body.requestId, null, admin))
    .completed,
  false,
);
checks++;
await call(
  "PATCH",
  `/orders/${first.id}/status`,
  { status: "CANCELLED", note: "Local QA cleanup" },
  admin,
);
const multi = {
  requestId: randomUUID(),
  customerAddressText: "اختبار سلة متعددة محلي",
  stores: [
    {
      storeId: "e2e-test-store-restaurant",
      fulfillmentType: "PICKUP",
      items: [{ productId: "e2e-test-prod-shawarma", quantity: 1 }],
    },
    {
      storeId: "e2e-test-store-supermarket",
      fulfillmentType: "PICKUP",
      items: [{ productId: "e2e-test-showcase-product-salad", quantity: 1 }],
    },
  ],
};
const batch = await call("POST", "/orders/checkout", multi, customer, 201);
const retry = await call("POST", "/orders/checkout", multi, customer, 201);
assert.deepEqual(
  batch.orders.map((o) => o.orderId),
  retry.orders.map((o) => o.orderId),
);
checks++;
for (const order of batch.orders)
  await call(
    "PATCH",
    `/orders/${order.orderId}/status`,
    { status: "CANCELLED", note: "Local QA cleanup" },
    admin,
  );
await call("GET", "/platform/admin/overdue-orders", null, customer, 403);
const overdue = await call(
  "GET",
  "/platform/admin/overdue-orders",
  null,
  admin,
);
assert.equal(overdue.thresholdMinutes, 5);
checks++;
console.log(
  `PASS ${checks} local checks, single/concurrent/multi-store retries and account isolation; QA orders cancelled`,
);
