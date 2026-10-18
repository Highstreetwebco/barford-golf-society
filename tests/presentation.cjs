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
async function test(width,height=900) {
 const browser=await chromium.launch({headless:true});
 try {
  const context=await browser.newContext({viewport:{width,height},serviceWorkers:'block'});
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
  if (width <= 750) {
    const bounds=await page.evaluate(()=>{
      const box=id=>{const r=document.querySelector(id).getBoundingClientRect();return {top:r.top,bottom:r.bottom,height:r.height};};
      return {header:box('.site-head'),hero:box('.invitation'),card:box('.response-card'),title:box('#pageTitle'),name:box('#memberName'),yes:box('#answerYes'),no:box('#answerNo'),confirm:box('#confirmRsvp'),list:box('#showAttendees'),bodyHeight:document.body.scrollHeight,documentHeight:document.documentElement.scrollHeight,viewHeight:innerHeight,viewWidth:innerWidth};
    });
    console.log('FIRST SCREEN',width,height,JSON.stringify(bounds));
    assert(bounds.bodyHeight<=height+2 && bounds.documentHeight<=height+2, 'Collapsed RSVP page should not scroll on '+width+'x'+height+': '+JSON.stringify(bounds));
    assert(bounds.card.bottom>=height-18 && bounds.card.bottom<=height+2, 'RSVP should fill to the bottom of the screen, rather than sit squashed at the top: '+JSON.stringify(bounds));
    assert(bounds.hero.height>=height*.26, 'Invitation should use meaningful space while leaving room for the confirmation button: '+JSON.stringify(bounds));
    await page.screenshot({path:path.join(root,'presentation-first-screen-'+width+'x'+height+'.png')});
    const legacyBounds=await page.evaluate(()=>{
      const area=id=>{const r=document.querySelector(id).getBoundingClientRect();return {top:r.top,bottom:r.bottom};};
      return {header:area('.site-head'),title:area('#pageTitle'),date:area('#presentationDate'),venue:area('#presentationVenue'),name:area('#memberName'),yes:area('#answerYes'),no:area('#answerNo'),confirm:area('#confirmRsvp'),list:area('#showAttendees'),width:document.documentElement.scrollWidth,viewWidth:innerWidth,viewHeight:innerHeight};
    });
    assert(legacyBounds.width<=legacyBounds.viewWidth+1,'Phone must have no horizontal overflow');
    for(const control of ['name','yes','no','confirm','list']) {
      assert(legacyBounds[control].top>=0 && legacyBounds[control].bottom<=legacyBounds.viewHeight-6,
        control+' must be fully visible without scrolling on '+width+'x'+height+': '+JSON.stringify(legacyBounds));
    }
    assert.equal(await page.evaluate(()=>scrollY),0,'Phone must not scroll to display the form');
  }

  assert.match((await page.locator('#pageTitle').innerText()).replace(/\s+/g,' '),/Presentation Evening/);
  assert.equal(await page.locator('#guestSection').isVisible(),false,'Guest list must start hidden');
  assert.match((await page.locator('#showAttendees').innerText()).replace(/\s+/g,' '),/See who's coming/);
  assert.equal(await page.locator('#presentationVenue').innerText(),'To be confirmed');
  await page.locator('#showAttendees').click();
  assert.equal(await page.locator('#guestSection').isVisible(),true);
  assert.equal(await page.locator('#showAttendees').getAttribute('aria-expanded'),'true');
  assert.equal(await page.locator('#guestCount').innerText(),'3');
  assert.equal(await page.locator('#attendees li').count(),3);
  await page.locator('#showAttendees').click();
  assert.equal(await page.locator('#guestSection').isVisible(),false,'Collapse optional guest list before checking the no-scroll RSVP flow');
  assert.equal(await page.locator('.hero-buttons').count(),0);
  assert(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth+1),'Horizontal mobile overflow');
  await page.locator('#memberName').fill('New Person');
  assert.equal(await page.locator('#confirmRsvp').isDisabled(),true,'Must pick Yes or No first');
  await page.locator('#answerYes').click();
  assert.equal(inserts,0,'Choosing Yes should not save');
  assert.equal(updates,0);
  assert.equal(await page.locator('#answerYes').getAttribute('aria-pressed'),'true');
  assert.equal(await page.locator('#answerNo').getAttribute('aria-pressed'),'false');
  assert.equal(await page.locator('#confirmRsvp').isEnabled(),true);
  if(width<=750) {
    const beforeConfirm=await page.locator('#confirmRsvp').boundingBox();
    assert(beforeConfirm.y+beforeConfirm.height<=height-5,'Confirm button should remain visible after selecting Yes');
    const afterSelection=await page.evaluate(()=>{
      const card=document.querySelector('.response-card').getBoundingClientRect(), status=document.querySelector('#responseMessage').getBoundingClientRect();
      const confirm=document.querySelector('#confirmRsvp').getBoundingClientRect();
      return {scrollHeight:document.documentElement.scrollHeight,bodyHeight:document.body.scrollHeight,viewport:innerHeight,cardBottom:card.bottom,statusHeight:status.height,statusText:document.querySelector('#responseMessage').textContent,confirmBottom:confirm.bottom};
    });
    console.log('AFTER ANSWER SELECTION',width,height,JSON.stringify(afterSelection));
    assert(afterSelection.confirmBottom<=height-5,'Confirm RSVP must remain visible without scrolling');
    assert(afterSelection.scrollHeight<=height+2 && afterSelection.bodyHeight<=height+2,'Collapsed RSVP must not need scrolling after selection: '+JSON.stringify(afterSelection));
  }
  await page.locator('#confirmRsvp').click();
  await page.locator('#responseMessage').filter({hasText:/Thank you/}).waitFor();
  assert.equal(inserts,1);
  assert.equal(await page.locator('#guestCount').innerText(),'4');
  await page.locator('#answerNo').click();
  assert.equal(inserts,1,'Selecting No must not create another RSVP');
  assert.equal(updates,0,'Selecting No must not update the response before confirmation');
  assert.equal(await page.locator('#answerNo').getAttribute('aria-pressed'),'true');
  await page.locator('#confirmRsvp').click();
  await page.locator('#responseMessage').filter({hasText:/Thank you/}).waitFor();
  assert.equal(inserts,1,'Repeated RSVP must update, not insert');
  assert.equal(updates,1);
  assert.equal(await page.locator('#guestCount').innerText(),'3');
  await page.locator('#memberName').fill('Nick');
  await page.locator('#answerNo').click();
  await page.locator('#confirmRsvp').click();
  await page.locator('#responseMessage').filter({hasText:/More than one RSVP/}).waitFor();
  assert.equal(updates,1,'Ambiguous names must not update an existing RSVP');
  await page.locator('#showAttendees').click();
  assert.equal(await page.locator('#guestSection').isVisible(),true,'Guest list should open after a saved RSVP');
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
 try{await test(320,568);await test(360,640);await test(375,667);await test(390,844);await test(430,932);await test(1280,900);}finally{app.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
