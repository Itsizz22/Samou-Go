import { describe, it, expect } from 'vitest';
import { normalizePhoneNumber, toWhatsAppE164, formatWhatsAppLink, WHATSAPP_MESSAGES } from '../phone';

describe('WhatsApp-specific formatting without country-code reassignment', () => {
  it.each([
    ['059 912-3456', '+970599123456'],
    ['(056) 912-3456', '+970569123456'],
    ['00970 599 123456', '+970599123456'],
    ['00 972 (599) 123456', '+972599123456'],
    ['+972599123456', '+972599123456'],
    ['+970599123456', '+970599123456'],
    ['+972501234567', '+972501234567'],
  ])('normalizes %s to %s', (input, expected) => {
    expect(toWhatsAppE164(input)).toBe(expected);
    expect(formatWhatsAppLink(input)).toBe(`https://wa.me/${expected.slice(1)}`);
  });
  it.each(['+970abcdefghij', '+00000000000', '059123', '+970599123456?text=x'])('rejects ambiguous or malformed %s', input => {
    expect(formatWhatsAppLink(input)).toBe('');
  });
  it('preserves both explicitly supplied country codes in general normalization', () => {
    expect(normalizePhoneNumber('+970599123456')).toBe('+970599123456');
    expect(normalizePhoneNumber('+972599123456')).toBe('+972599123456');
  });
});

describe('normalizePhoneNumber', () => {
  describe('Palestinian numbers', () => {
    it('converts 059XXXXXXX to +97059XXXXXXX', () => {
      expect(normalizePhoneNumber('0599123456')).toBe('+970599123456');
    });

    it('converts 056XXXXXXX to +97056XXXXXXX', () => {
      expect(normalizePhoneNumber('0569123456')).toBe('+970569123456');
    });

    it('handles spaces and dashes', () => {
      expect(normalizePhoneNumber('059-912-3456')).toBe('+970599123456');
      expect(normalizePhoneNumber('059 912 3456')).toBe('+970599123456');
      expect(normalizePhoneNumber('(059) 912-3456')).toBe('+970599123456');
    });

    it('preserves already international +970 format', () => {
      expect(normalizePhoneNumber('+970599123456')).toBe('+970599123456');
    });

    it('preserves already international +972 format', () => {
      expect(normalizePhoneNumber('+972599123456')).toBe('+972599123456');
    });

    it('converts 970XXXXXXXXXX to +970XXXXXXXXXX', () => {
      expect(normalizePhoneNumber('970599123456')).toBe('+970599123456');
    });

    it('converts 972XXXXXXXXXX to +972XXXXXXXXXX', () => {
      expect(normalizePhoneNumber('972599123456')).toBe('+972599123456');
    });
  });

  describe('Non-Palestinian numbers (return as-is)', () => {
    it('returns Jordanian number as-is (not normalized)', () => {
      expect(normalizePhoneNumber('0791234567')).toBe('0791234567');
    });

    it('returns other unrecognized formats as-is', () => {
      expect(normalizePhoneNumber('1234567890')).toBe('1234567890');
    });
  });

  describe('Edge cases', () => {
    it('returns empty string for empty input', () => {
      expect(normalizePhoneNumber('')).toBe('');
    });

    it('handles numbers with country code but wrong length', () => {
      // Numbers with 11 digits get + prefix since they look like international format
      expect(normalizePhoneNumber('97059912345')).toBe('+97059912345');
    });
  });
});

describe('formatWhatsAppLink', () => {
  it('generates correct wa.me link for Palestinian number (059)', () => {
    const link = formatWhatsAppLink('0599123456');
    expect(link).toBe('https://wa.me/970599123456');
  });

  it('generates correct wa.me link for Palestinian number (056)', () => {
    const link = formatWhatsAppLink('0569123456');
    expect(link).toBe('https://wa.me/970569123456');
  });

  it('includes encoded message when provided', () => {
    const link = formatWhatsAppLink('0599123456', 'Hello world');
    expect(link).toBe('https://wa.me/970599123456?text=Hello%20world');
  });

  it('handles Arabic message correctly', () => {
    const message = 'مرحباً، معك كابتن التوصيل';
    const link = formatWhatsAppLink('0599123456', message);
    expect(link).toContain(encodeURIComponent(message));
  });

  it('returns empty string for invalid phone', () => {
    expect(formatWhatsAppLink('')).toBe('');
    expect(formatWhatsAppLink('123')).toBe('');
    expect(formatWhatsAppLink('059')).toBe('');
    // Jordanian numbers return empty since they're not valid
    expect(formatWhatsAppLink('0791234567')).toBe('');
  });

  it('works with already international format', () => {
    const link = formatWhatsAppLink('+970599123456', 'Test');
    expect(link).toBe('https://wa.me/970599123456?text=Test');
  });
});

describe('WHATSAPP_MESSAGES', () => {
  it('generates captain message with order number', () => {
    const msg = WHATSAPP_MESSAGES.captain('SG-260728-0042');
    expect(msg).toContain('SG-260728-0042');
    expect(msg).toContain('كابتن التوصيل');
    expect(msg).toContain('سموع كويك');
  });

  it('generates captain message with customer name', () => {
    const msg = WHATSAPP_MESSAGES.captain('SG-260728-0042', 'أحمد');
    expect(msg).toContain('أحمد');
  });

  it('generates store manager message with order number', () => {
    const msg = WHATSAPP_MESSAGES.storeManager('SG-260728-0042');
    expect(msg).toContain('SG-260728-0042');
    expect(msg).toContain('إدارة المتجر');
    expect(msg).toContain('سموع كويك');
  });

  it('generates store manager message with customer name and store name', () => {
    const msg = WHATSAPP_MESSAGES.storeManager('SG-260728-0042', 'أحمد', 'مطعم السموع');
    expect(msg).toContain('أحمد');
    expect(msg).toContain('مطعم السموع');
  });

  it('generates generic message', () => {
    const msg = WHATSAPP_MESSAGES.generic('فريق الدعم');
    expect(msg).toContain('فريق الدعم');
    expect(msg).toContain('سموع كويك');
  });
});
