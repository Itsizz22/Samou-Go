#!/usr/bin/env node
/**
 * Samou Quick — Brand Asset Generator
 *
 * Generates all web favicons, apple-touch-icons, Android mipmap icons,
 * splash screens, and Capacitor resources from the master logo.png.
 *
 * Prerequisites: `npm install sharp` (already in the monorepo)
 *
 * Usage:
 *   node packages/api/src/scripts/generate-brand-assets.js
 *
 * Output: $TEMP/brand-assets/ — then run deploy-brand-assets.ps1 (elevated)
 * to copy the generated files to their final locations.
 */

const sharp = require('sharp');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = path.resolve(__dirname, '../../..');
const SRC = path.join(ROOT, 'packages/app/assets/logo.png');
const TMP = path.join(os.tmpdir(), 'brand-assets');

// Brand colors
const BRAND_GREEN = { r: 5, g: 150, b: 105, alpha: 255 };  // #059669
const BRAND_DARK = { r: 4, g: 78, b: 55, alpha: 255 };     // #044E37

async function generate() {
  if (!fs.existsSync(SRC)) {
    console.error('Source not found:', SRC);
    process.exit(1);
  }

  fs.mkdirSync(TMP, { recursive: true });

  const srcMeta = await sharp(SRC).metadata();
  console.log('Source:', srcMeta.width + 'x' + srcMeta.height, srcMeta.format, 'alpha:', srcMeta.hasAlpha);

  // 1. Master logo copy
  await sharp(SRC).toFile(path.join(TMP, 'ui-logo.png'));
  console.log('✅ ui-logo.png (master copy)');

  // 2. Favicons
  for (const size of [16, 32]) {
    await sharp(SRC).resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png().toFile(path.join(TMP, `favicon-${size}.png`));
    console.log(`✅ favicon-${size}.png (${size}x${size})`);
  }

  // 3. Apple Touch Icon (180x180, emerald background)
  const appleBg = sharp({ create: { width: 180, height: 180, channels: 4, background: BRAND_GREEN } }).png();
  const logo180 = await sharp(SRC).resize(140, 140, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).toBuffer();
  await appleBg.composite([{ input: logo180, gravity: 'center' }]).toFile(path.join(TMP, 'apple-touch-icon.png'));
  console.log('✅ apple-touch-icon.png (180x180, #059669 bg)');

  // 4. Android mipmap icons
  const densities = [
    { name: 'mdpi', size: 108 },
    { name: 'hdpi', size: 162 },
    { name: 'xhdpi', size: 216 },
    { name: 'xxhdpi', size: 324 },
    { name: 'xxxhdpi', size: 432 },
  ];

  for (const d of densities) {
    const srcBuf = fs.readFileSync(SRC);

    // Adaptive icon foreground (transparent bg, logo centered at 65%)
    const fgSize = Math.round(d.size * 0.65);
    const fg = await sharp(srcBuf).resize(fgSize, fgSize, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).toBuffer();
    const fgCanvas = sharp({ create: { width: d.size, height: d.size, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).png();
    await fgCanvas.composite([{ input: fg, gravity: 'center' }]).toFile(path.join(TMP, `ic_launcher_foreground-${d.name}.png`));

    // Full launcher icon (logo on dark emerald bg)
    const fullSize = Math.round(d.size * 0.55);
    const logoFull = await sharp(srcBuf).resize(fullSize, fullSize, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).toBuffer();
    const bgCanvas = sharp({ create: { width: d.size, height: d.size, channels: 4, background: BRAND_DARK } }).png();
    await bgCanvas.composite([{ input: logoFull, gravity: 'center' }]).toFile(path.join(TMP, `ic_launcher-${d.name}.png`));

    // Round icon (same as full — circular mask applied by Android)
    const roundCanvas = sharp({ create: { width: d.size, height: d.size, channels: 4, background: BRAND_DARK } }).png();
    await roundCanvas.composite([{ input: logoFull, gravity: 'center' }]).toFile(path.join(TMP, `ic_launcher_round-${d.name}.png`));

    console.log(`✅ Android ${d.name} (${d.size}x${d.size})`);
  }

  // 5. Splash screen (1080x1920)
  const splashBg = sharp({ create: { width: 1080, height: 1920, channels: 4, background: BRAND_DARK } }).png();
  const splashLogo = await sharp(SRC).resize(400, 400, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).toBuffer();
  await splashBg.composite([{ input: splashLogo, gravity: 'center' }]).toFile(path.join(TMP, 'splash.png'));
  console.log('✅ splash.png (1080x1920)');

  // 6. Resources icon (512x512)
  await sharp(SRC).resize(512, 512, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png().toFile(path.join(TMP, 'icon-512.png'));
  console.log('✅ icon-512.png (512x512)');

  const files = fs.readdirSync(TMP);
  const totalSize = files.reduce((sum, f) => sum + fs.statSync(path.join(TMP, f)).size, 0);
  console.log(`\nGenerated ${files.length} assets (${(totalSize / 1024).toFixed(1)} KB total) in: ${TMP}`);
  console.log('Next: run deploy-brand-assets.ps1 (elevated) to copy to final locations.');
}

generate().catch(e => { console.error(e); process.exit(1); });
