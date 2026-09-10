import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('../../config/env', () => ({ env: { sms: { countryCode: '+970', supercode: { allowHttp: false, apiId: 'test-secret', sender: 'SamouQuick' } } } }));
import { env } from '../../config/env';
import { createSupercodeGateway } from './supercode';
afterEach(() => { vi.unstubAllGlobals(); Object.assign(env.sms.supercode, { allowHttp: false }); });
describe('Supercode adapter', () => {
  it('encodes Arabic and sends one international destination in the POST body', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ STATUS: 'Message Sent Successfully' })));
    vi.stubGlobal('fetch', fetchMock);
    await expect(createSupercodeGateway().send({ to: '0599000008', body: 'رمزك 123456' })).resolves.toEqual({ accepted: true });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://sms.supercode.ps/API/SendJSON.aspx');
    expect(init.redirect).toBe('error');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ id: 'test-secret', sender: 'SamouQuick', to: '970599000008', msg: encodeURIComponent('رمزك 123456'), mode: '0' });
  });
  it.each(['Authentication Failed', 'Insufficient Credit', 'IP Not Allowed', 'Sender Not Allowed', 'test-secret 123456'])('rejects HTTP 200 provider failure: %s', async status => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ STATUS: status }))));
    await expect(createSupercodeGateway().send({ to: '0599000008', body: '123456' })).rejects.toThrow('Supercode rejected message; check credit, sender and IP permissions');
  });
  it('rejects malformed JSON', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('unexpected html')));
    await expect(createSupercodeGateway().send({ to: '0599000008', body: '123456' })).rejects.toThrow('invalid response');
  });
  it('does not retry uncertain delivery or expose underlying errors', async () => {
    const mock = vi.fn().mockRejectedValue(new Error('test-secret 123456'));
    vi.stubGlobal('fetch', mock);
    await expect(createSupercodeGateway().send({ to: '0599000008', body: '123456' })).rejects.toThrow('Supercode transport failed; delivery status unknown');
    expect(mock).toHaveBeenCalledTimes(1);
  });
  it('rejects HTTP failures', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('test-secret', { status: 500 })));
    await expect(createSupercodeGateway().send({ to: '0599000008', body: '123456' })).rejects.toThrow('Supercode HTTP failure (500)');
  });
});

it('uses HTTP only when the explicit compatibility flag is enabled', async () => {
  Object.assign(env.sms.supercode, { allowHttp: true });
  const mock = vi.fn().mockImplementation(async () => new Response(JSON.stringify({ STATUS: 'Message Sent Successfully' })));
  vi.stubGlobal('fetch', mock);
  await createSupercodeGateway().send({ to: '0566010623', body: 'test' });
  await createSupercodeGateway().send({ to: '0599000008', body: 'test' });
  expect(mock.mock.calls[0]?.[0]).toBe('http://sms.supercode.ps/API/SendJSON.aspx');
  expect(mock.mock.calls[1]?.[0]).toBe('http://sms.supercode.ps/API/SendJSON.aspx');
});
