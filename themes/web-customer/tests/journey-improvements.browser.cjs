const {chromium}=require('C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict');
process.env.PW_TEST_SCREENSHOT_NO_FONTS_READY='1';
(async()=>{
const browser=await chromium.launch({headless:true,executablePath:process.env.LOCALAPPDATA+'/ms-playwright/chromium-1243/chrome-win64/chrome.exe'});
try {
 const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,reducedMotion:'reduce'});
 const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const store={id:'qa-store',nameAr:'مطعم سموع',storeType:'RESTAURANT',isActive:true,isAcceptingOrders:true,storeStatus:'OPEN',deliveryEstimate:{minMinutes:30,maxMinutes:50,sampleSize:12},categories:[{id:'pizza',nameAr:'بيتزا',products:[{id:'pizza',nameAr:'بيتزا الجبنة',price:30,isAvailable:true,storeId:'qa-store',imageUrl:null}]}]};
 let activeQuery=false;
 await context.addInitScript(()=>localStorage.setItem('samou-go.language','ar'));
 await page.route('**/api/v1/**',route=>{const url=new URL(route.request().url());let data={};if(url.pathname.endsWith('/stores/qa-store'))data=store;else if(url.pathname.endsWith('/orders')){activeQuery=url.searchParams.get('activeOnly')==='true';data={items:[{id:'active-123',orderNumber:'SQ-123',storeNameAr:store.nameAr,status:'PREPARING'},{id:'done',orderNumber:'SQ-DONE',storeNameAr:store.nameAr,status:'DELIVERED'}],total:2};}return route.fulfill({json:{success:true,data}});});
 const fixture='http://127.0.0.1:5173/tests/journey-improvements.browser.html';
 await page.goto(fixture);await page.getByRole('link',{name:/SQ-123/}).waitFor();assert.equal(activeQuery,true);assert.equal(await page.getByRole('link',{name:/SQ-DONE/}).count(),0);
 await page.getByText('30–50',{exact:true}).waitFor();await page.getByText('يؤكد المطعم موعد جاهزية الاستلام بعد قبول الطلب').waitFor();
 await page.getByRole('button',{name:'إضافة المنتج'}).click();await page.getByRole('status').filter({hasText:'بيتزا الجبنة'}).waitFor();await page.screenshot({path:'artifacts/journey-improvements-mobile.png'});await page.getByRole('link',{name:'عرض السلة'}).click();await page.getByRole('heading',{name:'سلة المشتريات'}).waitFor();assert.equal(await page.getByRole('complementary').count(),0);
 await page.goto(fixture);await page.getByRole('button',{name:'إضافة المنتج'}).click();await page.getByRole('link',{name:'عرض السلة'}).waitFor();await page.mouse.move(0,0);await page.getByRole('link',{name:'عرض السلة'}).waitFor({state:'hidden',timeout:6500});
 await page.getByRole('link',{name:/SQ-123/}).click();assert.equal(new URL(page.url()).pathname,'/orders/active-123');
 store.deliveryEstimate=null;await page.goto(fixture);await page.getByText('وقت الوصول يتضح بعد تأكيد المطعم').waitFor();assert.equal(await page.getByText('30–50',{exact:true}).count(),0);
 assert.deepEqual(errors,[]);console.log('PASS: active-order filtering and exact link; historical range and unknown/pickup fallback; add notice, cart link, dismissal and timeout; no JS exceptions');
} finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
