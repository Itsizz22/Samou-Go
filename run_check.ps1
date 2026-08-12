cd 'C:\Users\Admin\Documents\Samou'Go'
node -e "
const fs = require('fs');
const path = require('path');

// Check if the modified files exist and have content
const files = [
  'packages/api/src/modules/orders/orders.routes.ts',
  'packages/api/src/modules/orders/orders.controller.ts',
  'packages/api-client/src/useApi.ts',
  'themes/web-customer/src/screens/StoreDetailScreen.tsx'
];

files.forEach(f => {
  try {
    const content = fs.readFileSync(f, 'utf8');
    console.log(f + ': ' + content.length + ' chars');
  } catch (e) {
    console.log(f + ': ERROR - ' + e.message);
  }
});
"