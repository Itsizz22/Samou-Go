import { describe, expect, it } from 'vitest';
import { toE164 } from './phone';

describe('toE164', () => {
  it('prefixes a canonical local mobile with the default +970 code', () => {
    expect(toE164('0594123456')).toBe('+970594123456');
  });

  it('strips spaces and dashes first', () => {
    expect(toE164('0594 123-456')).toBe('+970594123456');
  });

  it('honours the configured country code', () => {
    expect(toE164('0594123456', '+972')).toBe('+972594123456');
  });

  it('keeps an already-international number as-is', () => {
    expect(toE164('+970594123456')).toBe('+970594123456');
    expect(toE164('+972594123456')).toBe('+972594123456');
  });

  it('normalises a 00-prefixed international number', () => {
    expect(toE164('00970594123456')).toBe('+970594123456');
  });
});