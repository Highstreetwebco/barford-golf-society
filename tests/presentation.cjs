const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('playwright');
const root = path.resolve(__dirname,'..');
const types = {'.html':'text/html','.css':'text/css','.js':'text/javascript','.ico':'image/x-icon','.png':'image/png'};
const app=http.createServer((req,res)=>{
  const file=path.join(root, decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname).replace(/^\//,'') || 'index.html');
  if(!file.startsWith(root+path.sep)) { res.writeHead(403);res.end();return; }
  fs.readFile(file,(err,data)=>{if(err){res.writeHead(404);res.end();return;}res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream'});res.end(data);});
});
async function test(width) {
 const browser=await chromium.launch({headless:true});
 try {
  const context=await browser.newContext({viewport:{width,height:900},serviceWorkers:'block'});
  const page=await context.newPage();
  const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  const event={id:30,name:'Barford End Of Season Presentation Evening',date:'2026-11-07',location:'The Granville',cancelled:false};
  let data=[
   {id:1,event_id:30,name:'Jack Example',attending:true,reserve:false,created_at:'2026-10-01T12:00:00Z'},
   {id:2,event_id:30,name:'Gemma Example',attending:false,reserve:false,created_at:'2026-10-02T12:00:00Z'},
   {id:3,event_id:30,name:'Nick',attending:true,reserve:false,created_at:'2026-10-03T12:00:00Z'},
   {id:4,event_id:30,name:'Nick',attending:true,reserve:false,created_at:'2026-10-04T12:00:00Z'}
  ];
  let inserts=0,updates=0;
  await context.route('https://tzzkgfehtnuizamzlbgr.supabase.co/rest/v1/**', async route=>{
   const req=route.request(),url=new URL(req.url());
   if(url.pathname.endsWith('/events'))return route.fulfill({json:[event]});
   if(url.pathname.endsWith('/rsvps')){
    if(req.method()==='GET')return route.fulfill({json:data});
    const payload=req.postDataJSON();
    if(req.method()==='PATCH'){
     const id=Number(url.searchParams.get('id')?.replace('eq.',''));
     const row=data.find(x=>x.id===id);
     if(!row)return route.fulfill({json:[]});
     Object.assign(row,payload);updates++;
     return route.fulfill({json:[row]});
    }
    if(req.method()==='POST'){
     const row={...payload,id:Math.max(...data.map(x=>x.id))+1,created_at:new Date().toISOString()};
     data.push(row);inserts++;
     return route.fulfill({json:[row]});
    }
   }
   return route.fulfill({status:404,json:{message:'Unknown request'}});
  });
  await page.goto('http://127.0.0.1:8493/');
  await page.locator('#answerYes:not([disabled])').waitFor();
  assert.match((await page.locator('#pageTitle').innerText()).replace(/\s+/g,' '),/Presentation Evening/);
  assert.equal(await page.locator('#guestSection').isVisible(),false,'Guest list must start hidden');
  assert.equal(await page.locator('#showAttendees').innerText().then(s=>s.trim()),"See who's coming ↓");
  assert.equal(await page.locator('#presentationVenue').innerText(),'To be confirmed');
  await page.locator('#showAttendees').click();
  assert.equal(await page.locator('#guestSection').isVisible(),true);
  assert.equal(await page.locator('#showAttendees').getAttribute('aria-expanded'),'true');
  assert.equal(await page.locator('#guestCount').innerText(),'3');
  assert.equal(await page.locator('#attendees li').count(),3);
  assert.equal(await page.locator('.hero-buttons').count(),0);
  assert(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth+1),'Horizontal mobile overflow');
  await page.locator('#memberName').fill('New Person');
  await page.locator('#answerYes').click();
  await page.locator('#responseMessage').filter({hasText:/Thank you/}).waitFor();
  assert.equal(inserts,1);
  assert.equal(await page.locator('#guestCount').innerText(),'4');
  await page.locator('#answerNo').click();
  await page.locator('#responseMessage').getByText(/Thank you/).waitFor();
  assert.equal(inserts,1,'Repeated RSVP must update, not insert');
  assert.equal(updates,1);
  assert.equal(await page.locator('#guestCount').innerText(),'3');
  await page.locator('#memberName').fill('Nick');
  await page.locator('#answerNo').click();
  await page.locator('#responseMessage').filter({hasText:/More than one RSVP/}).waitFor();
  assert.equal(updates,1,'Ambiguous names must not update an existing RSVP');
  await page.locator('#showAttendees').click();
  assert.equal(await page.locator('#guestSection').isVisible(),false,'Guest list must collapse again');
  await page.screenshot({path:path.join(root,'presentation-'+width+'.png'),fullPage:true});
  assert.deepEqual(errors,[]);
  console.log('PASS '+width+'px: presentation details, RSVP insert/edit, duplicate-name guard, attendees and layout');
  await context.close();
 } finally {await browser.close();}
}
(async()=>{
 await new Promise(r=>app.listen(8493,'127.0.0.1',r));
 try{await test(390);await test(1280);}finally{app.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
