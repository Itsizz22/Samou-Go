import sharp from 'sharp';
import { mkdir } from 'fs/promises';
import { join } from 'path';

const SRC = 'C:/Users/Admin/Documents/Samou-Go/themes/web-customer/resources/icon.png';
const RES = 'C:/Users/Admin/Documents/Samou-Go/themes/web-customer/android/app/src/main/res';

const densities = [
  { name: 'mipmap-mdpi',  size: 48 },
  { name: 'mipmap-hdpi',  size: 72 },
  { name: 'mipmap-xhdpi',  size: 96 },
  { name: 'mipmap-xxhdpi', size: 144 },
  { name: 'mipmap-xxxhdpi', size: 192 },
];

for (const { name, size } of densities) {
  const dir = join(RES, name);
  await mkdir(dir, { recursive: true });
  
  // ic_launcher.png
  await sharp(SRC)
    .resize(size, size, { fit: 'cover' })
    .png()
    .toFile(join(dir, 'ic_launcher.png'));
  
  // ic_launcher_round.png (same as launcher for now — system applies round mask)
  await sharp(SRC)
    .resize(size, size, { fit: 'cover' })
    .png()
    .toFile(join(dir, 'ic_launcher_round.png'));

  // ic_launcher_foreground.png (for adaptive icon if ever used)
  await sharp(SRC)
    .resize(size, size, { fit: 'cover' })
    .png()
    .toFile(join(dir, 'ic_launcher_foreground.png'));

  console.log(`✅ ${name}: ${size}x${size}`);
}

console.log('\n🎉 All mipmap PNGs regenerated from master 1024x1024 icon.png');
