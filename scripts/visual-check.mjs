import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';
// Mean SSIM over 8x8 windows on luminance (stride 4), optionally restricted to x >= left.
function ssim(a,b,width,height,left=0){
 const lum=(png,i)=>0.299*png.data[i]+0.587*png.data[i+1]+0.114*png.data[i+2];
 const C1=(0.01*255)**2,C2=(0.03*255)**2;let total=0,count=0;
 for(let y=0;y+8<=height;y+=4)for(let x=left;x+8<=width;x+=4){
  let ma=0,mb=0;const va=[],vb=[];
  for(let j=0;j<8;j++)for(let i=0;i<8;i++){const k=((y+j)*width+x+i)*4;const p=lum(a,k),q=lum(b,k);va.push(p);vb.push(q);ma+=p;mb+=q;}
  ma/=64;mb/=64;let sa=0,sb=0,sab=0;
  for(let n=0;n<64;n++){sa+=(va[n]-ma)**2;sb+=(vb[n]-mb)**2;sab+=(va[n]-ma)*(vb[n]-mb);}
  sa/=63;sb/=63;sab/=63;
  total+=((2*ma*mb+C1)*(2*sab+C2))/((ma*ma+mb*mb+C1)*(sa+sb+C2));count++;
 }
 return +(total/count).toFixed(4);
}
const manifest=JSON.parse(await fs.readFile('artifacts/visual/manifest.json','utf8'));
const selected=process.argv.slice(2);
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
const report=[];
await fs.mkdir('artifacts/visual/screens',{recursive:true});await fs.mkdir('artifacts/visual/diffs',{recursive:true});await fs.mkdir('artifacts/visual/overlays',{recursive:true});
try { for(const row of manifest.filter(r=>!selected.length||selected.some(s=>r.key.includes(s)))) {
 const page=await browser.newPage({viewport:{width:row.width,height:row.height},deviceScaleFactor:1,reducedMotion:'reduce'});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://localhost:3107'+row.url,{waitUntil:'networkidle',timeout:90000});await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(300);
 await page.addStyleTag({content:'nextjs-portal{display:none!important}*{animation:none!important;transition:none!important}'});
 const source=PNG.sync.read(await fs.readFile(row.file));
 const shot=PNG.sync.read(await page.screenshot({path:`artifacts/visual/screens/${row.key}.png`,animations:'disabled'}));
 const diff=new PNG({width:row.width,height:row.height});const overlay=new PNG({width:row.width,height:row.height});
 const total=row.width*row.height;const count=pixelmatch(source.data,shot.data,diff.data,row.width,row.height,{threshold:.1,includeAA:false});
 for(let i=0;i<overlay.data.length;i++)overlay.data[i]=i%4===3?255:Math.round((source.data[i]+shot.data[i])/2);
 await fs.writeFile(`artifacts/visual/diffs/${row.key}.png`,PNG.sync.write(diff));await fs.writeFile(`artifacts/visual/overlays/${row.key}.png`,PNG.sync.write(overlay));
 const geometry=await page.evaluate(()=>({scrollHeight:document.documentElement.scrollHeight,overflow:document.documentElement.scrollWidth>innerWidth,header:document.querySelector('.public-header')?.getBoundingClientRect().height,footerTop:document.querySelector('.public-footer')?.getBoundingClientRect().top}));
 const interfaceLeft=row.key.startsWith('auth-')?746:row.key.startsWith('preview-onboarding-')?(row.key.endsWith('experience')?581:466):0;
 let interfaceMismatchPercent;
 if(interfaceLeft){
  const regionWidth=row.width-interfaceLeft;
  const regionHeight=row.height;
  const crop=(png)=>{const bytes=Buffer.alloc(regionWidth*regionHeight*4);for(let y=0;y<regionHeight;y++)png.data.copy(bytes,y*regionWidth*4,(y*row.width+interfaceLeft)*4,(y*row.width+row.width)*4);return bytes;};
  interfaceMismatchPercent=+(100*pixelmatch(crop(source),crop(shot),null,regionWidth,regionHeight,{threshold:.1,includeAA:false})/(regionWidth*regionHeight)).toFixed(3);
 }
 const ssimFull=ssim(source,shot,row.width,row.height),ssimInterface=interfaceLeft?ssim(source,shot,row.width,row.height,interfaceLeft):undefined;
 const result={...row,mismatchPercent:+(100*count/total).toFixed(3),interfaceMismatchPercent,ssimFull,ssimInterface,geometry,errors};report.push(result);console.log(row.key,result.mismatchPercent+'%','ssim '+ssimFull+(ssimInterface?' / interface '+ssimInterface:''),interfaceMismatchPercent!==undefined?'native interface '+interfaceMismatchPercent+'%':'',JSON.stringify(geometry),errors.length?'ERRORS '+errors.join(';'):'');await page.close();
 }} finally {await browser.close();await fs.writeFile('artifacts/visual/report'+(selected.length?'-'+selected.join('-'):'')+'.json',JSON.stringify(report,null,2));}
