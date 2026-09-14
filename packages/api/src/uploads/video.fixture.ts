/** Minimal structural MP4 fixture for container validation tests; not a playable clip. */
export function videoFixture(seconds = 10, codec = 'avc1'): Buffer {
  const box = (type: string, data: Buffer) => { const header = Buffer.alloc(8); header.writeUInt32BE(data.length + 8); header.write(type, 4); return Buffer.concat([header, data]); };
  const header = Buffer.alloc(100); header.writeUInt32BE(1000, 12); header.writeUInt32BE(seconds * 1000, 16);
  const handler = Buffer.alloc(24); handler.write('vide', 8);
  const sample = Buffer.alloc(78); sample.writeUInt16BE(1920, 24); sample.writeUInt16BE(1080, 26);
  const stsd = box('stsd', Buffer.concat([Buffer.from([0,0,0,0,0,0,0,1]), box(codec, sample)]));
  const track = box('trak', box('mdia', Buffer.concat([box('hdlr', handler), box('minf', box('stbl', stsd))])));
  return Buffer.concat([box('ftyp', Buffer.from('isom0000')), box('moov', Buffer.concat([box('mvhd', header), track])), box('mdat', Buffer.from([1,2,3]))]);
}
