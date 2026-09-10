'use strict';
if (process.env.SAMOU_ROUTING_ENABLED === 'true') {
  require('./supervise-routing.cjs').main().catch(error => {
    console.error('[supervisor]', error.message);
    process.exitCode = 1;
  });
} else {
  require('../dist/server.js');
}
