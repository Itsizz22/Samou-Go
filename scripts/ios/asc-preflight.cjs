// Read-only authentication check. Never print the private key or bearer token.
const crypto = require('node:crypto');

async function main() {
  const issuer = process.env.APP_STORE_CONNECT_ISSUER_ID;
  const keyId = process.env.APP_STORE_CONNECT_KEY_IDENTIFIER;
  const pem = process.env.APP_STORE_CONNECT_PRIVATE_KEY;
  if (!issuer || !keyId || !pem) {
    throw new Error('ASC_PREFLIGHT_MISSING: integration credentials are not available to this workflow.');
  }
  if (issuer !== 'b9603c98-4c72-4dcd-9204-761c32e3afe7' || keyId !== '485VLHFNY8') {
    throw new Error('ASC_PREFLIGHT_METADATA: runner Key ID or Issuer ID differs from the verified integration. Check duplicate environment variables.');
  }
  let key;
  try {
    key = crypto.createPrivateKey(pem);
  } catch {
    throw new Error('ASC_PREFLIGHT_KEY_FORMAT: integration private key is not a valid PEM key.');
  }
  const fingerprint = crypto.createHash('sha256')
    .update(crypto.createPublicKey(key).export({type: 'spki', format: 'der'})).digest('hex');
  // Public-key fingerprint only; no private key material is stored in the repository.
  if (fingerprint !== '8e998df704031679d966c4e5171223eafde258c71fa22d28bec74bb7d0926ef3') {
    throw new Error('ASC_PREFLIGHT_KEY_MISMATCH: runner private key does not match the locally verified key.');
  }
  console.log('ASC preflight: Key ID, Issuer ID and public-key fingerprint match.');
  const now = Math.floor(Date.now() / 1000);
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  const unsigned = encode({alg: 'ES256', kid: keyId, typ: 'JWT'}) + '.' +
    encode({iss: issuer, iat: now - 30, exp: now + 300, aud: 'appstoreconnect-v1'});
  const signature = crypto.sign('sha256', Buffer.from(unsigned),
    {key, dsaEncoding: 'ieee-p1363'}).toString('base64url');
  const response = await fetch('https://api.appstoreconnect.apple.com/v1/apps?filter%5BbundleId%5D=com.samougo.customer&fields%5Bapps%5D=bundleId&limit=1', {
    headers: {Authorization: 'Bearer ' + unsigned + '.' + signature},
    signal: AbortSignal.timeout(30000),
    redirect: 'error',
  });
  if (!response.ok) {
    throw new Error('ASC_PREFLIGHT_HTTP_' + response.status + ': Apple rejected the runner request. Check integration and runner clock; this is before altool.');
  }
  const body = await response.json();
  if (!body.data?.some(app => app.id === '6812869733' && app.attributes?.bundleId === 'com.samougo.customer')) {
    throw new Error('ASC_PREFLIGHT_APP: authentication succeeded but the expected application is not accessible.');
  }
  console.log('ASC preflight passed: Apple HTTP 200; expected application accessible. Upload via altool remains a separate check.');
}

main().catch(error => {
  // Only controlled diagnostics; never dump request objects or token contents.
  console.error(error.message.startsWith('ASC_PREFLIGHT_') ? error.message : 'ASC_PREFLIGHT_NETWORK: request or response failed. Retry and check Apple connectivity.');
  process.exitCode = 1;
});
