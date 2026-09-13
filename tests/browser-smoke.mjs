import assert from 'node:assert/strict';
import {chromium} from 'playwright';

const url=process.env.APP_URL||'https://hiroakiaa.github.io/kouryu-voice-app/';
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:390,height:844}});
await page.goto(url,{waitUntil:'domcontentloaded',timeout:60000});
await page.waitForSelector('#phoneTab-dial',{state:'visible',timeout:60000});
for(const name of ['notices','history','contacts','dial','groups','settings']){
 await page.click(`[data-phone-tab="${name}"]`,{force:true});
 assert.equal(await page.getAttribute(`[data-phone-tab="${name}"]`,'aria-selected'),'true');
}
await page.click('[data-phone-tab="dial"]',{force:true});
await page.click('[data-phone-key="1"]',{force:true});
assert.equal((await page.textContent('#phoneDialNumber')).trim(),'1');
await page.click('#appInfoToggleBtn',{force:true});
assert.equal(await page.isVisible('#appInfoTooltip'),true);
await browser.close();
