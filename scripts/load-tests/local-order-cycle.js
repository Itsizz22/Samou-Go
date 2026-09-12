import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate } from 'k6/metrics';
const base = __ENV.BASE_URL || 'http://127.0.0.1:4059/api/v1';
if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+\/api\/v1$/.test(base)) throw new Error('Write test restricted to isolated localhost');
const tokens = JSON.parse(open(__ENV.TOKENS_FILE));
const completed = new Rate('completed_order_cycles');
export const options = { stages: [{duration:'10s',target:1},{duration:'20s',target:5},{duration:'20s',target:5},{duration:'5s',target:0}], thresholds: {http_req_failed:[{threshold:'rate<0.01',abortOnFail:true,delayAbortEval:'10s'}],completed_order_cycles:['rate>0.99'],http_req_duration:['p(95)<2000']}};
function request(method,path,role,body,name) {
 const r=http.request(method,base+path,body?JSON.stringify(body):null,{headers:{Authorization:`Bearer ${tokens[role]}`,'Content-Type':'application/json'},tags:{name},timeout:'10s'});
 if(!check(r,{ 'successful operation':r=>r.status>=200&&r.status<300 })) throw new Error(`${name}: ${r.status} ${r.body}`);
 return r.json('data');
}
export default function(){try{
 const body={storeId:'flow-store',customerAddressText:'عنوان فحص محلي فقط',items:[{productId:'flow-product',quantity:1}]};
 request('POST','/orders/quote','CUSTOMER',body,'quote');
 const order=request('POST','/orders','CUSTOMER',body,'create');
 const path=`/orders/${order.id}`;
 request('GET',path,'STORE_MANAGER',null,'store_details');
 let ready;for(const status of ['ACCEPTED','PREPARING','READY_FOR_PICKUP']) ready=request('PATCH',path+'/status','STORE_MANAGER',{status,...(status==='ACCEPTED'?{estimatedPrepMinutes:15}:{})},status);
 request('POST',path+'/claim','CAPTAIN',{handoffCode:ready.captainHandoffCode},'claim');
 const pin=request('GET',path+'/pin','CUSTOMER',null,'customer_pin');
 const delivered=request('PATCH',path+'/status','CAPTAIN',{status:'DELIVERED',deliveryPin:pin.deliveryPin},'deliver');
 completed.add(delivered.status==='DELIVERED');
 }catch(e){completed.add(false);console.error(String(e));}sleep(2);}
