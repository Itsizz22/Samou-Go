import { badRequest } from '../lib/http-error';
import { MAX_VIDEO_BYTES } from './uploads.config';

/** Read bounded ISO-BMFF boxes; reject truncated or malformed containers. */
function boxes(data: Buffer): { type: string; data: Buffer }[] {
  const result: { type: string; data: Buffer }[] = [];
  for (let offset = 0; offset < data.length;) {
    if (offset + 8 > data.length) throw badRequest('ملف MP4 غير مكتمل');
    let size = data.readUInt32BE(offset), header = 8;
    if (size === 1) {
      if (offset + 16 > data.length) throw badRequest('ملف MP4 غير مكتمل');
      size = Number(data.readBigUInt64BE(offset + 8)); header = 16;
    } else if (size === 0) size = data.length - offset;
    if (!Number.isSafeInteger(size) || size < header || offset + size > data.length) throw badRequest('ملف MP4 غير صالح');
    result.push({ type: data.toString('ascii', offset + 4, offset + 8), data: data.subarray(offset + header, offset + size) });
    offset += size;
  }
  return result;
}

export function inspectVideo(raw: Buffer): { width: number; height: number } {
  if (raw.length > MAX_VIDEO_BYTES) throw badRequest('الحد الأقصى للفيديو 40 ميغابايت');
  const top = boxes(raw);
  const movie = top.find(box => box.type === 'moov');
  if (!top.some(box => box.type === 'ftyp') || !top.some(box => box.type === 'mdat' && box.data.length > 0) || !movie) throw badRequest('اختر فيديو MP4 صالحًا');
  const children = boxes(movie.data);
  const header = children.find(box => box.type === 'mvhd')?.data;
  if (!header || header.length < 32 || (header[0] !== 0 && header[0] !== 1)) throw badRequest('مدة الفيديو غير صالحة');
  const scale = header.readUInt32BE(header[0] === 1 ? 20 : 12);
  const duration = header[0] === 1 ? Number(header.readBigUInt64BE(24)) : header.readUInt32BE(16);
  if (!scale || duration / scale <= 0 || duration / scale > 120) throw badRequest('مدة الإعلان يجب أن تكون بين ثانية ودقيقتين');
  for (const track of children.filter(box => box.type === 'trak')) {
    const media = boxes(track.data).find(box => box.type === 'mdia');
    if (!media) continue;
    const parts = boxes(media.data);
    const handler = parts.find(box => box.type === 'hdlr')?.data;
    if (handler?.toString('ascii', 8, 12) !== 'vide') continue;
    const minf = parts.find(box => box.type === 'minf');
    const stbl = minf && boxes(minf.data).find(box => box.type === 'stbl');
    const stsd = stbl && boxes(stbl.data).find(box => box.type === 'stsd');
    const sample = stsd && boxes(stsd.data.subarray(8)).find(box => box.type === 'avc1');
    if (!sample || sample.data.length < 78) throw badRequest('استخدم MP4 بترميز H.264 ليعمل على iPhone وAndroid');
    const width = sample.data.readUInt16BE(24), height = sample.data.readUInt16BE(26);
    if (width < 1 || height < 1 || width > 3840 || height > 3840) throw badRequest('أبعاد الفيديو غير مدعومة');
    return { width, height };
  }
  throw badRequest('الملف لا يحتوي مسار فيديو صالحًا');
}
