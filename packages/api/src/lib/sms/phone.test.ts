import { describe, expect, it } from 'vitest';
import { toE164 } from './phone';

describe('toE164', () => {
  it('prefixes a canonical local mobile with the default +970 code', () => {
    expect(toE164('0594123456')).toBe('+970594123456');
  });

  it('strips spaces and dashes first', () => {
    expect(toE164('0594 123-456')).toBe('+970594123456');
  });

  it('routes West Bank prefixes to 970 regardless of the environment default', () => {
    expect(toE164('0594123456', '+972')).toBe('+970594123456');
  });

  it('keeps an already-international number as-is', () => {
    expect(toE164('+970594123456')).toBe('+970594123456');
    expect(toE164('+972594123456')).toBe('+970594123456');
  });

  it('normalises a 00-prefixed international number', () => {
    expect(toE164('00970594123456')).toBe('+970594123456');
  });
});
it.each(['050','051','052','053','054','055','057','058'])('routes %s to 972 for all accepted input formats', prefix => {
  const local = prefix + '1234567'; const national = local.slice(1);
  for (const phone of [local, '+972'+national, '00972'+national]) expect(toE164(phone, '+970')).toBe('+972'+national);
});
