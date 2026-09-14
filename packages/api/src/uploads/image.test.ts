import { expect, it } from "vitest";
import sharp from "sharp";
import { processImage } from "./image";

it("preserves the aspect ratio of store covers and logos", async () => {
  const buffer = await sharp({
    create: {
      width: 1600,
      height: 900,
      channels: 3,
      background: { r: 8, g: 28, b: 48 },
    },
  })
    .png()
    .toBuffer();
  const cover = (
    await processImage({ buffer, kind: "store", purpose: "cover" })
  ).variants[0]!;
  expect([cover.width, cover.height]).toEqual([1600, 900]);
  const metadata = await sharp(cover.buffer).metadata();
  expect(metadata.width).toBe(1600);
  expect(metadata.height).toBe(900);
  const logo = (await processImage({ buffer, kind: "store", purpose: "logo" }))
    .variants[0]!;
  expect([logo.width, logo.height]).toEqual([1600, 900]);
});

it("preserves cover detail and aspect ratio without inventing resolution", async () => {
  for (const [width, height, expectedWidth, expectedHeight] of [
    [1672, 941, 1672, 941],
    [3200, 1800, 3200, 1800],
    [320, 180, 320, 180],
  ]) {
    const buffer = await sharp({
      create: {
        width: width!,
        height: height!,
        channels: 3,
        background: "navy",
      },
    })
      .png()
      .toBuffer();
    const cover = (
      await processImage({ buffer, kind: "store", purpose: "cover" })
    ).variants[0]!;
    const metadata = await sharp(cover.buffer).metadata();
    expect([metadata.width, metadata.height]).toEqual([
      expectedWidth,
      expectedHeight,
    ]);
    expect(metadata.format).toBe("webp");
  }
});

it("creates responsive store variants and rejects malformed image data", async () => {
  const buffer = await sharp({
    create: { width: 4000, height: 2500, channels: 3, background: "navy" },
  })
    .png()
    .toBuffer();
  const image = await processImage({ buffer, kind: "store", purpose: "cover" });
  expect(image.variants.map((v) => v.width)).toEqual([4000, 320, 640, 1280]);
  await expect(
    processImage({ buffer: Buffer.from("not an image"), kind: "store" }),
  ).rejects.toThrow();
});
