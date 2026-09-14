import assert from 'node:assert/strict';
import {chromium} from 'playwright';

const url=process.env.APP_URL||'https://hiroakiaa.github.io/kouryu-voice-app/';
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:390,height:844}});
await page.goto(url,{waitUntil:'domcontentloaded',timeout:60000});
await page.waitForSelector('#phoneTab-dial',{state:'visible',timeout:60000});
for(const selector of ['#phoneTab-notices','#phoneTab-dial','.phone-dial-shortcuts [data-phone-tab="history"]','.phone-dial-shortcuts [data-phone-tab="contacts"]','.phone-dial-shortcuts [data-phone-tab="groups"]','[data-phone-key="1"]','#appInfoToggleBtn','#appRecovery']) assert.equal(await page.locator(selector).count(),1,selector);
const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
assert.ok(overflow<=1,`horizontal overflow: ${overflow}px`);
await browser.close();
