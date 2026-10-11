import {chromium} from '@playwright/test';
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
try{for(const url of ['/', '/preview/app/customer','/preview/app/organizer','/preview/app/provider']){
const page=await browser.newPage({viewport:{width:390,height:844}});
await page.goto('http://localhost:3107'+url,{waitUntil:'networkidle'});
console.log(url,await page.evaluate(()=>[...document.querySelectorAll('body *')].filter(e=>{const r=e.getBoundingClientRect();if(r.right<=innerWidth+2||r.width<=20||getComputedStyle(e).position==='fixed')return false;for(let p=e.parentElement;p&&p!==document.body;p=p.parentElement)if(['hidden','clip','auto','scroll'].includes(getComputedStyle(p).overflowX))return false;return true;}).map(e=>({tag:e.tagName,class:e.className,width:e.getBoundingClientRect().width,right:e.getBoundingClientRect().right})).slice(0,22)));
await page.close();}}finally{await browser.close();}
