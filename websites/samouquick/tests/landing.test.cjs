const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
test('launch notice is centrally configured and rendered once',()=>{
 const config=JSON.parse(fs.readFileSync(root+'/content/launch.json','utf8').replace(/^\uFEFF/,''));
 const html=fs.readFileSync(root+'/index.html','utf8');
 assert.ok(Number.isFinite(Date.parse(config.opensAt)));
 assert.equal(html.includes('datetime="'+config.opensAt+'"'),config.prelaunch);
 assert.equal(html.split(config.label).length-1,config.prelaunch?1:0);
 assert.equal((html.match(/class="launch-notice"/g)||[]).length,config.prelaunch?1:0);
 assert.ok(!html.includes('واطلب السبت'));
});
test('hero downloads match platform destinations and journey uses genuine assets',()=>{
 const html=fs.readFileSync(root+'/index.html','utf8');
 const hero=html.match(/class="hero-actions">([\s\S]*?)<\/div>/)[1];
 assert.ok(hero.includes('https://apps.apple.com/app/id6812869733'));
 assert.ok(hero.includes('https://play.google.com/store/apps/details?id=com.samougo.customer'));
 const journey=html.match(/<ol class="journey-screens">([\s\S]*?)<\/ol>/)[1];
 assert.equal((journey.match(/<li(?: |\>)/g)||[]).length,3);
 for(const label of ['اختار المتجر','أكّد طلبك','تابع واستلم'])assert.ok(journey.includes(label));
 assert.ok(html.includes('preload="none"'));
 assert.ok(!html.includes('autoplay'));
});
