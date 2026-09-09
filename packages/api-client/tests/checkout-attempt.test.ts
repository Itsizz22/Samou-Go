import { beforeEach, describe, expect, it, vi } from 'vitest';
const check = vi.hoisted(() => vi.fn());
vi.mock('@samou-go/api-client', () => ({ checkOrderSubmission: check }));
import { submitCheckoutAttempt } from '../../../themes/web-customer/src/lib/checkoutAttempt';
const storage = new Map<string,string>();
beforeEach(()=>{storage.clear();check.mockReset();vi.stubGlobal('localStorage',{getItem:(key:string)=>storage.get(key)??null,setItem:(key:string,value:string)=>storage.set(key,value),removeItem:(key:string)=>storage.delete(key)});});
describe('checkout retry identity',()=>{
  it('reuses the key after a lost response',async()=>{
    const user=crypto.randomUUID();const submit=vi.fn().mockRejectedValueOnce(new Error('network lost')).mockResolvedValueOnce({id:'order'});
    await expect(submitCheckoutAttempt(user,'single',{quantity:1},submit)).rejects.toThrow('network lost');
    expect(storage.size).toBe(1);
    expect(await submitCheckoutAttempt(user,'single',{quantity:1},submit)).toEqual({id:'order'});
    expect(submit.mock.calls[0]?.[0].requestId).toBe(submit.mock.calls[1]?.[0].requestId);expect(storage.size).toBe(0);
  });
  it('blocks a changed basket until the previous result is checked',async()=>{
    const user=crypto.randomUUID();const submit=vi.fn().mockRejectedValue(new Error('network lost'));
    await expect(submitCheckoutAttempt(user,'single',{quantity:1},submit)).rejects.toThrow();
    check.mockResolvedValue({completed:false});
    await expect(submitCheckoutAttempt(user,'single',{quantity:2},submit)).rejects.toThrow('غير مؤكدة');expect(submit).toHaveBeenCalledTimes(1);
    check.mockResolvedValue({completed:true});
    await expect(submitCheckoutAttempt(user,'single',{quantity:2},submit)).rejects.toThrow('تم تأكيد');expect(storage.size).toBe(0);expect(submit).toHaveBeenCalledTimes(1);
  });
  it('clears a rejected validation attempt',async()=>{
    const submit=vi.fn().mockRejectedValue(Object.assign(new Error('invalid'),{status:422}));
    await expect(submitCheckoutAttempt(crypto.randomUUID(),'single',{},submit)).rejects.toThrow('invalid');expect(storage.size).toBe(0);
  });
});