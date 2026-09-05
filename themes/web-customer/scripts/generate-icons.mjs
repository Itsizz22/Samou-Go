/**
 * generate-icons.mjs
 *
 * Generates Android launcher icons from the SVG brand asset.
 * Run:  node themes/web-customer/scripts/generate-icons.mjs
 *
 * Requires: npm install sharp (or have it globally available).
 * The @capacitor/assets tool also does this but may be broken on some Windows setups.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..');
const SVG_PATH = resolve(ROOT, 'themes/web-customer/src/assets/icon.svg');
const RES_DIR = resolve(ROOT, 'themes/web-customer/android/app/src/main/res');

const DENSITIES = {
  'mipmap-mdpi': 48,
  'mipmap-hdpi': 72,
  'mipmap-xhdpi': 96,
  'mipmap-xxhdpi': 144,
  'mipmap-xxxhdpi': 192,
};

const BG_COLOR = '#044E37';

async function main() {
  let sharp;
  try {
    sharp = (await import('sharp')).default;
  } catch {
    console.error(
      'sharp is not installed. Run: npm install sharp\n' +
      'Then re-run this script: node themes/web-customer/scripts/generate-icons.mjs'
    );
    process.exit(1);
  }

  const svgBuffer = readFileSync(SVG_PATH);

  for (const [folder, size] of Object.entries(DENSITIES)) {
    const dir = resolve(RES_DIR, folder);
    mkdirSync(dir, { recursive: true });

    // Square icon
    const iconPng = await sharp(svgBuffer)
      .resize(size, size)
      .png()
      .toBuffer();
    writeFileSync(resolve(dir, 'ic_launcher.png'), iconPng);

    // Round icon (same for now — Capacitor treats them identically)
    const roundPng = await sharp(svgBuffer)
      .resize(size, size)
      .png()
      .toBuffer();
    writeFileSync(resolve(dir, 'ic_launcher_round.png'), roundPng);

    // Foreground layer for adaptive icons (512×512, transparent background)
    const fgPng = await sharp(svgBuffer)
      .resize(512, 512)
      .png()
      .toBuffer();
    writeFileSync(resolve(dir, 'ic_launcher_foreground.png'), fgPng);

    console.log(`✅ ${folder}: ic_launcher.png (${size}×${size}), ic_launcher_round.png, ic_launcher_foreground.png`);
  }

  console.log('\n🎉 All Android icons generated from the brand SVG.');
}

main();
