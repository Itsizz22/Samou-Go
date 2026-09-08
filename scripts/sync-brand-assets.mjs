import sharp from "sharp";
import { readdir, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = path.join(root, "packages/app/assets/logo.png");
const logo = await sharp(source).trim().png().toBuffer();
const fit = (size, background = { r: 0, g: 0, b: 0, alpha: 0 }) =>
  sharp(logo).resize(size, size, { fit: "contain", background });
await fit(512)
  .webp({ quality: 90 })
  .toFile(path.join(root, "packages/ui/src/assets/logo.webp"));
await fit(512).png().toFile(path.join(root, "packages/ui/src/assets/logo.png"));
for (const theme of await readdir(path.join(root, "themes"))) {
  if (!theme.startsWith("web-")) continue;
  const output = path.join(root, "themes", theme, "public");
  await mkdir(output, { recursive: true });
  for (const [filename, size] of [
    ["favicon-16.png", 16],
    ["favicon-32.png", 32],
    ["apple-touch-icon.png", 180],
  ]) {
    await fit(size).png().toFile(path.join(output, filename));
  }
}

// Keep the customer's existing native image dimensions and safe zones.
const resources = path.join(
  root,
  "themes/web-customer/android/app/src/main/res",
);
for (const directory of await readdir(resources)) {
  if (!directory.startsWith("mipmap-") && !directory.startsWith("drawable"))
    continue;
  for (const filename of await readdir(path.join(resources, directory))) {
    if (!filename.endsWith(".png")) continue;
    const target = path.join(resources, directory, filename);
    const { width, height } = await sharp(target).metadata();
    if (!width || !height) continue;
    const foreground = filename.includes("foreground");
    const size = Math.round(
      Math.min(width, height) * (foreground ? 0.65 : 0.7),
    );
    const mark = await fit(size).png().toBuffer();
    const buffer = await sharp({
      create: {
        width,
        height,
        channels: 4,
        background: foreground ? "#00000000" : "#ffffff",
      },
    })
      .composite([{ input: mark, gravity: "centre" }])
      .png()
      .toBuffer();
    await sharp(buffer).toFile(target);
  }
}
console.log(
  "Updated shared logo, seven sets of favicons, and customer Android icons/splashes.",
);
