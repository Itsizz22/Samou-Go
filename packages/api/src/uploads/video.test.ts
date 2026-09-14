import { describe, expect, it } from 'vitest';
import { inspectVideo } from './video';
import { videoFixture } from './video.fixture';

describe('advertisement MP4 validation', () => {
  it('reads original dimensions without recompressing', () => expect(inspectVideo(videoFixture())).toEqual({ width: 1920, height: 1080 }));
  it('rejects renamed images and truncated containers', () => {
    expect(() => inspectVideo(Buffer.from('not a video'))).toThrow();
    expect(() => inspectVideo(videoFixture().subarray(0, -2))).toThrow();
  });
  it('rejects unsupported codec and excessive duration', () => {
    expect(() => inspectVideo(videoFixture(10, 'hvc1'))).toThrow();
    expect(() => inspectVideo(videoFixture(121))).toThrow();
    expect(() => inspectVideo(videoFixture(0))).toThrow();
  });
});
