const BASE = 'http://localhost:4000/api/v1';
let pass = 0, fail = 0;

async function call(method, path, { token, body } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: res.status, json: await res.json() };
}

function check(label, cond, extra = '') {
  if (cond) { pass++; console.log('  ok   ' + label); }
  else { fail++; console.log('  FAIL ' + label + '  ' + extra); }
}

const login = async phone =>
  (await call('POST', '/auth/login', { body: { phone, password: 'samou1234' } })).json.data.accessToken;

console.log('\n[1] auth');
const customer = await login('0599300101');
const manager = await login('0567100302'); // Abu Saleh Shawarma
const captain = await login('0599200101');
const admin = await login('0599000000');
check('4 roles logged in', [customer, manager, captain, admin].every(Boolean));

const bad = await call('POST', '/auth/login', { body: { phone: '0599300101', password: 'wrong' } });
check('wrong password -> 401', bad.status === 401, bad.status);

const ghost = await call('POST', '/auth/login', { body: { phone: '0599999999', password: 'samou1234' } });
check('unknown phone -> identical 401 message', ghost.status === 401 && ghost.json.error.message === bad.json.error.message);

const me = await call('GET', '/auth/me', { token: customer });
check('GET /auth/me returns the profile', me.status === 200 && me.json.data.id === 'user-customer-1', me.status);
check('GET /auth/me leaks no passwordHash', !JSON.stringify(me.json).includes('passwordHash'));

const noToken = await call('GET', '/auth/me');
check('no token -> 401', noToken.status === 401, noToken.status);

console.log('\n[2] catalogue');
const cat = await call('GET', '/stores/store-shawarma');
const products = cat.json.data.categories.flatMap(c => c.products);
check('store catalogue returns products', products.length > 0, products.length);
check('unavailable products hidden', products.every(p => p.isAvailable));
check('price is a number, not a Decimal string', typeof products[0].price === 'number', typeof products[0].price);

console.log('\n[3] delivery tariff at the API boundary');
const small = await call('POST', '/orders/quote', {
  body: { storeId: 'store-shawarma', items: [{ productId: 'p-shawarma-chicken', quantity: 4 }] },
});
check('4 units -> 3 ILS', small.json.data.deliveryFee === 3, JSON.stringify(small.json.data));

const bulk = await call('POST', '/orders/quote', {
  body: { storeId: 'store-shawarma', items: [{ productId: 'p-shawarma-chicken', quantity: 5 }] },
});
check('5 units -> 5 ILS', bulk.json.data.deliveryFee === 5, JSON.stringify(bulk.json.data));
check('subtotal priced from DB (5 x 15)', bulk.json.data.subtotal === 75, bulk.json.data.subtotal);
check('total = subtotal + fee', bulk.json.data.totalAmount === 80, bulk.json.data.totalAmount);

console.log('\n[4] money cannot come from the client');
const forged = await call('POST', '/orders', {
  token: customer,
  body: {
    storeId: 'store-shawarma',
    items: [{ productId: 'p-shawarma-meat', quantity: 2 }],
    customerAddressText: 'حارة الرأس، بجانب المسجد',
    subtotal: 1,
    deliveryFee: 0,
    totalAmount: 1,
  },
});
const order = forged.json.data;
check('order created (201)', forged.status === 201, JSON.stringify(forged.json.error ?? ''));
check('forged subtotal ignored -> 44', order.subtotal === 44, order.subtotal);
check('forged fee ignored -> 3', order.deliveryFee === 3, order.deliveryFee);
check('total = 47', order.totalAmount === 47, order.totalAmount);
check('orderNumber SG-YYMMDD-NNNN', /^SG-\d{6}-\d{4}$/.test(order.orderNumber), order.orderNumber);
check('initial PENDING + 1 history row', order.status === 'PENDING' && order.statusHistory.length === 1);

console.log('\n[5] basket validation');
const foreign = await call('POST', '/orders/quote', {
  body: { storeId: 'store-shawarma', items: [{ productId: 'p-baraka-milk', quantity: 1 }] },
});
check('product from another store -> 422', foreign.status === 422 && foreign.json.error.code === 'PRODUCT_NOT_IN_STORE', foreign.status);

const gone = await call('POST', '/orders/quote', {
  body: { storeId: 'store-albaraka', items: [{ productId: 'p-baraka-tea', quantity: 1 }] },
});
check('unavailable product -> 422', gone.status === 422 && gone.json.error.code === 'PRODUCT_UNAVAILABLE', JSON.stringify(gone.json.error));

const empty = await call('POST', '/orders/quote', { body: { storeId: 'store-shawarma', items: [] } });
check('empty basket -> 422', empty.status === 422, empty.status);

console.log('\n[6] state machine');
const setStatus = (token, status) => call('PATCH', '/orders/' + order.id + '/status', { token, body: { status } });

const skip = await setStatus(manager, 'ON_THE_WAY');
check('PENDING -> ON_THE_WAY blocked', skip.status === 422 && skip.json.error.code === 'ILLEGAL_TRANSITION', skip.status);

const wrongRole = await setStatus(captain, 'ACCEPTED');
check('captain cannot ACCEPT', wrongRole.status === 403 || wrongRole.status === 422, wrongRole.status);

check('manager: ACCEPTED', (await setStatus(manager, 'ACCEPTED')).status === 200);
check('manager: PREPARING', (await setStatus(manager, 'PREPARING')).status === 200);

const lateCancel = await setStatus(customer, 'CANCELLED');
check('customer cannot cancel while PREPARING', lateCancel.status === 422 && lateCancel.json.error.code === 'CANCEL_WINDOW_CLOSED', JSON.stringify(lateCancel.json.error));

check('manager: READY_FOR_PICKUP', (await setStatus(manager, 'READY_FOR_PICKUP')).status === 200);

const claimed = await setStatus(captain, 'ON_THE_WAY');
check('captain claims job -> auto-assigned', claimed.status === 200 && claimed.json.data.captainId !== null, JSON.stringify(claimed.json.error ?? claimed.json.data.captainId));

const done = await setStatus(captain, 'DELIVERED');
check('captain: DELIVERED', done.status === 200);
check('history recorded every step', done.json.data.statusHistory.length === 6, done.json.data.statusHistory.map(h => h.status).join(' > '));

const afterClose = await setStatus(manager, 'CANCELLED');
check('closed order is immutable', afterClose.status === 422 && afterClose.json.error.code === 'ORDER_CLOSED', afterClose.status);

console.log('\n[7] role-scoped visibility');const otherCustomer = await login('0567300102');
const peek = await call('GET', '/orders/' + order.id, { token: otherCustomer });
check('another customer -> 403', peek.status === 403, peek.status);

const mine = await call('GET', '/orders', { token: customer });
check('customer sees own orders', mine.json.data.items.length > 0);

const managerList = await call('GET', '/orders', { token: manager });
check('manager sees their store', managerList.json.data.items.length > 0);

const adminList = await call('GET', '/orders', { token: admin });
check('admin sees all', adminList.json.data.total >= managerList.json.data.total, adminList.json.data.total + ' >= ' + managerList.json.data.total);

console.log('\n[8] privilege escalation');
const esc = await call('POST', '/auth/register', {
  body: { name: 'مهاجم', phone: '0599888777', password: 'samou1234', role: 'ADMIN' },
});
check('self-registering as ADMIN -> 403', esc.status === 403, esc.status);

console.log('\n[9] captain race condition (optimistic lock)');
// Place a fresh order and walk it to READY_FOR_PICKUP so two captains can race.
const raceOrder = (await call('POST', '/orders', {
  token: customer,
  body: {
    storeId: 'store-shawarma',
    items: [{ productId: 'p-shawarma-chicken', quantity: 1 }],
    customerAddressText: 'حارة الرأس، بجانب المسجد',
  },
})).json.data;

const captain2 = await login('0567200102');
check('second captain logged in', Boolean(captain2));

// Walk to READY_FOR_PICKUP with manager token
await call('PATCH', '/orders/' + raceOrder.id + '/status', { token: manager, body: { status: 'ACCEPTED' } });
await call('PATCH', '/orders/' + raceOrder.id + '/status', { token: manager, body: { status: 'PREPARING' } });
await call('PATCH', '/orders/' + raceOrder.id + '/status', { token: manager, body: { status: 'READY_FOR_PICKUP' } });

// Both captains claim simultaneously — only one should win
const [claim1, claim2] = await Promise.all([
  call('PATCH', '/orders/' + raceOrder.id + '/status', { token: captain, body: { status: 'ON_THE_WAY' } }),
  call('PATCH', '/orders/' + raceOrder.id + '/status', { token: captain2, body: { status: 'ON_THE_WAY' } }),
]);

const statuses = [claim1.status, claim2.status].sort();
check(
  'concurrent claims: one 200 and one 409',
  statuses[0] === 200 && statuses[1] === 409,
  `statuses: ${statuses.join(', ')}`
);

const winner = claim1.status === 200 ? claim1 : claim2;
check('winning captain is assigned on the order', winner.json.data?.captainId !== null, JSON.stringify(winner.json.error ?? ''));

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
