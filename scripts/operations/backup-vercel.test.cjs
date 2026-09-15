const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Readable } = require('node:stream');
const { uploadVerified } = require('./backup-vercel.cjs');
for (const scenario of ['verified', 'corrupt', 'public', 'missing']) {
  test(`backup readback: ${scenario}`, async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'backup-test-'));
    const file = path.join(directory, 'fixture');
    fs.writeFileSync(file, 'synthetic backup fixture');
    let body;
    const blob = {
      async put(destination, stream, options) {
        assert.equal(options.access, 'private');
        assert.equal(options.allowOverwrite, false);
        const chunks = [];
        for await (const chunk of stream) chunks.push(chunk);
        body = Buffer.concat(chunks);
        return { url: `https://test.${scenario === 'public' ? 'public' : 'private'}.blob.vercel-storage.com/${destination}` };
      },
      async get(url, options) {
        assert.equal(options.access, 'private');
        assert.equal(options.useCache, false);
        return scenario === 'missing' ? null : { statusCode: 200, stream: Readable.from(scenario === 'corrupt' ? ['wrong bytes'] : [body]) };
      },
    };
    try {
      if (scenario === 'verified') assert.match(await uploadVerified(file, 'backups/test.dump', blob), /^[a-f0-9]{64}$/);
      else await assert.rejects(uploadVerified(file, 'backups/test.dump', blob));
    } finally { fs.unlinkSync(file); fs.rmdirSync(directory); }
  });
}
