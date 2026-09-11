import { describe, expect, it } from 'vitest';
import { phoneSchema, otpRequestSchema } from './auth.schemas';
describe('international OTP phone routing', () => {
  it.each(['+972599000008','00972599000008','972599000008'])('preserves route for %s without duplicating existing local identity', phone => {
    expect(otpRequestSchema.parse({phone})).toEqual({phone:'0599000008',smsCountryCode:'+972'});
  });
  it('keeps Israeli mobile identities international', () => {
    expect(phoneSchema.parse('+972501234567')).toBe('+972501234567');
  });
  it('keeps local Jawwal and Ooredoo accounts unchanged', () => {
    expect(phoneSchema.parse('0599000008')).toBe('0599000008');
    expect(phoneSchema.parse('0566010623')).toBe('0566010623');
  });
  it('rejects invalid numbers cleanly', () => {
    expect(otpRequestSchema.safeParse({phone:'invalid'}).success).toBe(false);
  });
});

it.each(['050','051','052','053','054','055','057','058'])('normalizes local %s for OTP without duplicate identity', prefix => { const phone = prefix + '1234567'; const expected = '+972' + phone.slice(1); expect(phoneSchema.parse(phone)).toBe(expected); expect(phoneSchema.parse(expected)).toBe(expected); expect(otpRequestSchema.parse({ phone }).phone).toBe(expected); });
