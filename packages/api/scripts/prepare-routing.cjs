'use strict';
// Native bundle preparation is an explicit opt-in, and runs only during build.
if (process.env.SAMOU_ROUTING_ENABLED === 'true') {
  if (process.platform !== 'linux' || process.arch !== 'x64') {
    throw new Error('SAMOU_ROUTING_ENABLED requires Linux x64');
  }
  require('node:child_process').execFileSync('bash', ['scripts/prepare-routing.sh'], {
    cwd: require('node:path').resolve(__dirname, '..'), stdio: 'inherit',
  });
}
