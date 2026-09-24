const assert=require('node:assert/strict');
const {test}=require('node:test');
const {projectStore,selectSample,fetchCatalogue,storeMarkup}=require('../lib/catalogue.cjs');
test('public projection never includes identity, contact, private tracking or ratings',()=>{
 const s=projectStore({id:'real-store',nameAr:'متجر',storeType:'CAFE',latitude:31.39,longitude:35.07,logoUrl:'https://samou-go.onrender.com/uploads/store/real-store/logo.webp',managerId:'private',phone:'secret',captainLocation:[1,2],rating:5});
 assert.deepEqual(Object.keys(s).sort(),['category','id','logo','name']);assert.equal(s.position,undefined);
});
test('coordinates are omitted and unsafe media is rejected',()=>{
 for(const position of [[null,null],[0,0],[31.39,1],[NaN,35.07],['31.39','35.07']])assert.equal(projectStore({id:'store',nameAr:'متجر',latitude:position[0],longitude:position[1],logoUrl:'javascript:alert(1)'}).position,undefined);
 assert.equal(projectStore({id:'store',nameAr:'متجر',logoUrl:'https://example.com/user/photo'}).logo,null);
 assert.equal(projectStore({id:'<script>',nameAr:'متجر'}),null);
});
test('small sample includes categories without inventing stores',()=>{
 const input=Array.from({length:20},(_,i)=>({id:String(i),category:i<18?'مطاعم':'كافيهات'}));
 const sample=selectSample(input);assert.equal(sample.length,6);assert.equal(sample[1].category,'كافيهات');assert.ok(sample.every(s=>input.includes(s)));assert.equal(input.length,20);
 assert.deepEqual(selectSample([]),[]);
});
test('HTML rendering escapes catalogue strings',()=>{
 const html=storeMarkup({id:'store',name:'<img onerror="bad">',category:'" onclick="bad',href:'https://example.com',logo:null});
 assert.ok(!html.includes('<img onerror'));assert.ok(html.includes('&lt;img'));
});
test('anonymous catalogue pagination does not forward credentials',async()=>{
 const calls=[];const result=await fetchCatalogue(async(url,options)=>{calls.push([url,options]);return {ok:true,json:async()=>({data:{totalPages:2,items:[{id:'store'+calls.length,nameAr:'متجر'}]}})}});
 assert.equal(calls.length,2);assert.ok(calls[1][0].includes('page=2'));assert.equal(calls[0][1].headers.Authorization,undefined);assert.equal(result.stores.length,2);
});
test('upstream failure does not masquerade as an empty live catalogue',async()=>{
 await assert.rejects(fetchCatalogue(async()=>({ok:false})),/unavailable/);
});
test('homepage has closed download gate, real routes and no fabricated stores',()=>{
 const fs=require('node:fs');const path=require('node:path');const root=path.resolve(__dirname,'..');
 const html=fs.readFileSync(root+'/index.html','utf8');const config=JSON.parse(fs.readFileSync(root+'/vercel.json','utf8'));
 assert.ok(!/href="[^"]*\.(apk|aab)"/.test(html));assert.ok(config.redirects.some(r=>r.source==='/downloads/:path*'));
 for(const name of ['privacy','terms','delete-account','support'])assert.ok(fs.existsSync(root+'/'+name+'.html'));
 const stores=JSON.parse(fs.readFileSync(root+'/content/stores.json','utf8')).stores;
 assert.ok(stores.length<=6);for(const s of stores)assert.ok(html.includes(`data-store="${s.id}"`));
 const schema=html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1];
 const hash=require('node:crypto').createHash('sha256').update(schema).digest('base64');
 assert.ok(config.headers[0].headers.find(h=>h.key==='Content-Security-Policy').value.includes(hash));
});

test('public website never exposes internal deployment destinations',()=>{
 const fs=require('node:fs');const path=require('node:path');const root=path.resolve(__dirname,'..');
 for(const name of ['index.html','site.js','delete-account.html','content/stores.json','lib/catalogue.cjs'])assert.ok(!fs.readFileSync(path.join(root,name),'utf8').includes('vercel.app'),name);
 const projected=projectStore({id:'real',nameAr:'متجر',href:'https://private.example',url:'https://private.example'});
 assert.equal(projected.href,undefined);assert.equal(projected.url,undefined);
 assert.ok(!storeMarkup({...projected,href:'https://private.example'}).includes('href='));
});

test('discovery and pickup keep public destinations and omit location data',()=>{
 const fs=require('node:fs');const path=require('node:path');const root=path.resolve(__dirname,'..');
 const html=fs.readFileSync(root+'/index.html','utf8');
 const snapshot=JSON.parse(fs.readFileSync(root+'/content/stores.json','utf8'));
 for(const store of snapshot.stores) for(const key of ['position','latitude','longitude']) assert.equal(store[key],undefined);
 const pickup=html.match(/<section id="pickup"[\s\S]*?<\/section>/)[0];
 assert.ok(pickup.includes('استلام من المتجر'));assert.ok(!/كابتن|رسوم التوصيل|خريطة/.test(pickup));
 const join=html.match(/<div class="join-grid">[\s\S]*?<\/section>/)[0];
 const destinations=[...join.matchAll(/href="([^"]+)"/g)].map(m=>new URL(m[1]));
 assert.equal(destinations.length,2);
 assert.ok(destinations.every(url=>url.hostname==='wa.me'&&url.pathname==='/970569189337'));
 assert.notEqual(destinations[0].searchParams.get('text'),destinations[1].searchParams.get('text'));
});
