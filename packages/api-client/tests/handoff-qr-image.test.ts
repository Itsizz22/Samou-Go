import QRCode from 'qrcode';
import { BinaryBitmap, HybridBinarizer, QRCodeReader, RGBLuminanceSource } from '@zxing/library';
import { expect, it } from 'vitest';
it('decodes both handoff QR images with the production reader including a long order ID', () => {
  for (const stage of ['pickup', 'delivery']) {
    const token = `SAMOU:1:${stage}:cmuwx00150002u694bu1rm0nz:abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG`;
    const qr = QRCode.create(token, { errorCorrectionLevel: 'M' });
    const scale = 5, margin = 4, width = (qr.modules.size + 2 * margin) * scale;
    const pixels = new Uint8ClampedArray(width * width).fill(255);
    for (let y = 0; y < qr.modules.size; y++) for (let x = 0; x < qr.modules.size; x++) {
      if (!qr.modules.get(y, x)) continue;
      for (let dy = 0; dy < scale; dy++) for (let dx = 0; dx < scale; dx++) pixels[((y + margin) * scale + dy) * width + (x + margin) * scale + dx] = 0;
    }
    const bitmap = new BinaryBitmap(new HybridBinarizer(new RGBLuminanceSource(pixels, width, width)));
    expect(new QRCodeReader().decode(bitmap).getText()).toBe(token);
  }
});
