const {chromium}=require('C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict');
process.env.PW_TEST_SCREENSHOT_NO_FONTS_READY='1';
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.LOCALAPPDATA+'/ms-playwright/chromium-1243/chrome-win64/chrome.exe'});
 try {
 const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,reducedMotion:'reduce'});
 const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const product=(id,nameAr,extra={})=>({id,nameAr,price:5,isAvailable:true,storeId:'qa-store',categoryId:'sides',imageUrl:'/banners/grocery.jpg',...extra});
 const pizza=product('pizza','بيتزا الجبنة',{price:30});
 const juice=product('juice','عصير البرتقال',{optionsEnabled:true,optionGroups:[{id:'size',productId:'juice',name:'الحجم',required:true,minSelect:1,maxSelect:1,sortOrder:0,items:[{id:'large',groupId:'size',name:'كبير',priceDelta:2,sortOrder:0,isActive:true}]}]});
 const store={id:'qa-store',nameAr:'مطعم سموع',nameEn:'Samou Restaurant',storeType:'RESTAURANT',isActive:true,isAcceptingOrders:true,storeStatus:'OPEN',categories:[{id:'sides',nameAr:'مشروبات ومقبلات',products:[product('water','مياه'),juice,product('absent','غير متاح',{isAvailable:false}),product('foreign','متجر آخر',{storeId:'other'})]},{id:'main',nameAr:'رئيسية',products:[pizza,product('burger','برغر مع عصير')]}]};
 await context.addInitScript(pizza=>{localStorage.setItem('samou-go.language','ar');localStorage.setItem('samou-go.cart.v2',JSON.stringify({lines:[{productId:pizza.id,product:pizza,quantity:1,note:'',storeId:pizza.storeId,storeNameAr:'مطعم سموع'}]}));},pizza);
 let searched=false;
 await page.route('**/api/v1/**',route=>{const url=new URL(route.request().url());let data={};if(url.pathname.endsWith('/stores/qa-store'))data=store;else if(url.pathname.endsWith('/stores/search-products')){searched=url.searchParams.get('search')==='بيتزا';data={items:[{...pizza,storeNameAr:store.nameAr}],total:1,page:1,pageSize:12};}else if(url.pathname.endsWith('/stores'))data={items:[store],total:1,page:1,totalPages:1};else if(url.pathname.includes('/favorites'))data={items:[]};else if(url.pathname.includes('/zones'))data=[];else if(url.pathname.includes('/orders')||url.pathname.includes('/notifications'))data={items:[],total:0};return route.fulfill({json:{success:true,data}});});
 await page.goto('http://127.0.0.1:5173/tests/meal-discovery.browser.html');
 const section=page.getByRole('region',{name:'أكمل وجبتك'});
 await section.getByText('مياه',{exact:true}).waitFor();assert.equal(await page.getByLabel('cart-count').textContent(),'1');
 assert.equal(await section.getByText('غير متاح',{exact:true}).count(),0);assert.equal(await section.getByText('متجر آخر',{exact:true}).count(),0);assert.equal(await section.getByText('برغر مع عصير',{exact:true}).count(),0);assert.equal(await section.getByText('بيتزا الجبنة',{exact:true}).count(),0);
 await page.screenshot({path:'artifacts/meal-discovery-mobile.png'});
 await section.getByRole('button',{name:'إضافة مياه',exact:true}).click();await page.waitForFunction(()=>document.querySelector('output').textContent==='2');assert.equal(await section.getByText('مياه',{exact:true}).count(),0);
 await section.getByRole('button',{name:'إضافة عصير البرتقال',exact:true}).click();const dialog=page.getByRole('dialog');await dialog.waitFor();assert.equal(await dialog.getByRole('button',{name:/أضف إلى السلة/}).isDisabled(),true);
 await dialog.getByText('كبير',{exact:true}).click();await dialog.getByRole('button',{name:/أضف إلى السلة/}).click();await page.waitForFunction(()=>document.querySelector('output').textContent==='3');
 const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('samou-go.cart.v2')));assert.equal(saved.lines.find(x=>x.productId==='juice').selectedOptions[0].priceDelta,2);
 await page.getByRole('link',{name:'بيتزا',exact:true}).click();assert.equal(new URL(page.url()).searchParams.get('q'),'بيتزا');
 await page.reload({waitUntil:'domcontentloaded'});await page.getByRole('heading',{name:'المنتجات المطابقة'}).waitFor();assert.equal(searched,true);
 store.storeStatus='CLOSED';await page.goto('http://127.0.0.1:5173/tests/meal-discovery.browser.html');await page.getByText('ماذا تشتهي اليوم؟').waitFor();assert.equal(await page.getByRole('region',{name:'أكمل وجبتك'}).count(),0);
 assert.deepEqual(errors,[]);console.log('PASS: shortcuts and query search; manual same-store extras; exclusions; required options; persisted prices; closed store; no JS exceptions');
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
