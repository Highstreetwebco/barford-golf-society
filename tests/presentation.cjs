const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('playwright');
const { createHash } = require('node:crypto');
const root = path.resolve(__dirname, '..');
const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.mjs': 'text/javascript', '.ico': 'image/x-icon' };
const app = http.createServer((req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname);
  const file = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
  if (!file.startsWith(root + path.sep)) { res.writeHead(403); res.end(); return; }
  fs.readFile(file, (error, content) => { if (error) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' }); res.end(content); });
});
(async () => {
  const { createHandler, HttpError } = await import('../supabase/functions/presentation-meals/handler.mjs');
  await new Promise(resolve => app.listen(8493, '127.0.0.1', resolve));
  const browser = await chromium.launch({ headless: true });
  try {
    for (const [width, height] of [[320,568],[390,844],[750,900],[1280,900]]) {
      const context = await browser.newContext({ viewport: { width, height }, serviceWorkers: 'block' });
      const people = [{ id: 1, name: 'Jack Example' }, { id: 2, name: 'Gemma Example' }];
      const meals = new Map(); let writes = 0; let failSave = false; let failGet = false; let failList = false;
      const handler = createHandler({ passwordHash: createHash('sha256').update('test-only-password').digest('hex'), repository: {
        attendees: async () => { if (failList) throw new Error('Fixture list failure'); return people; },
        attendee: async id => people.find(person => person.id === id),
        meal: async id => { if (failGet) throw new Error('Fixture read failure'); return meals.get(id) || null; },
        allMeals: async () => [...meals.values()],
        save: async choice => {
          if (failSave) throw new Error('Fixture write failure');
          if ((meals.get(choice.rsvp_id)?.revision || 0) !== choice.revision) throw new HttpError(409, 'This meal choice changed on another device. Select your name again before saving.');
          const saved = { ...choice, revision: choice.revision + 1, updated_at: new Date().toISOString() };
          meals.set(choice.rsvp_id, saved); writes++; return saved;
        }
      } });
      await context.route('https://tzzkgfehtnuizamzlbgr.supabase.co/**', async route => {
        const request = route.request();
        if (request.url().includes('/functions/')) {
          const response = await handler(new Request(request.url(), { method: 'POST', body: request.postData() }));
          return route.fulfill({ status: response.status, contentType: 'application/json', body: await response.text() });
        }
        if (request.url().includes('/events')) return route.fulfill({ json: [{ id: 30, name: 'Barford End Of Season Presentation Evening', date: '2026-11-07', cancelled: false }] });
        return route.fulfill({ json: people.map(person => ({ ...person, attending: true, reserve: false, created_at: '2026-10-01T12:00:00Z' })) });
      });
      const page = await context.newPage(); const errors = []; page.on('pageerror', error => errors.push(error.message));
      await page.goto('http://127.0.0.1:8493/');
      await page.locator('#mealMember:not([disabled])').waitFor();
      assert.equal(await page.locator('#mealForm').isVisible(), false);
      await page.locator('#mealMember').selectOption('1');
      await page.locator('#confirmNameDialog[open]').waitFor();
      assert.equal(await page.locator('#mealForm').isVisible(), false, 'Menu must remain hidden before confirmation');
      await page.locator('#cancelMealName').click();
      assert.equal(await page.locator('#mealMember').inputValue(), '');
      assert.equal(writes, 0);
      await page.locator('#mealMember').selectOption('1');
      await page.locator('#confirmMealName').click();
      await page.locator('#mealForm').waitFor();
      assert.equal(await page.locator('[name=meal]').count(), 6);
      await page.locator('[name=meal][value=steak_pie]').check();
      await page.locator('#saveMeal').click();
      assert.equal(writes, 0, 'Steak pie requires a side');
      await page.locator('[name=pieSide][value=mash]').check();
      await page.locator('#saveMeal').click();
      await page.locator('#mealSaveMessage').filter({ hasText: 'Saved for Jack Example: Steak Pie with creamy mash.' }).waitFor();
      assert.equal(meals.get(1).side, 'mash'); assert.equal(meals.size, 1);
      await page.reload();
      await page.locator('#mealMember:not([disabled])').waitFor();
      assert.equal(await page.locator('#mealForm').isVisible(), false, 'Every visit requires name confirmation');
      await page.locator('#mealMember').selectOption('1'); await page.locator('#confirmMealName').click();
      await page.locator('#mealForm').waitFor();
      assert.equal(await page.locator('[name=meal][value=steak_pie]').isChecked(), true);
      assert.equal(await page.locator('[name=pieSide][value=mash]').isChecked(), true);
      await page.locator('[name=meal][value=vegan_burger]').check();
      assert.equal(await page.locator('#pieSides').isVisible(), false);
      failSave = true;
      await page.locator('#saveMeal').click();
      await page.locator('#mealSaveMessage.error').waitFor();
      assert.equal(meals.get(1).meal, 'steak_pie', 'Failed save must preserve prior choice');
      failSave = false;
      await page.locator('#saveMeal').click();
      await page.locator('#mealSaveMessage').filter({ hasText: 'Saved for Jack Example: Vegan Burger.' }).waitFor();
      assert.equal(meals.get(1).side, null); assert.equal(meals.size, 1);
      meals.get(1).revision++;
      await page.locator('[name=meal][value=cod]').check(); await page.locator('#saveMeal').click();
      await page.locator('#mealMessage').filter({ hasText: 'changed on another device' }).waitFor();
      assert.equal(meals.get(1).meal, 'vegan_burger');
      await page.locator('#exportMeals').click();
      await page.locator('#exportPassword').fill('wrong'); await page.locator('#downloadMeals').click();
      await page.locator('#exportMessage').filter({ hasText: 'Incorrect committee password' }).waitFor();
      assert.equal(await page.locator('#exportPassword').inputValue(), '');
      await page.locator('#exportPassword').fill('test-only-password');
      const downloadWait = page.waitForEvent('download'); await page.locator('#downloadMeals').click();
      const download = await downloadWait;
      assert.equal(download.suggestedFilename(), 'Barford-Presentation-2026-Food-Choices.xlsx');
      const bytes = fs.readFileSync(await download.path());
      assert.equal(bytes.readUInt32LE(0), 0x04034b50);
      await page.locator('#cancelExport').click();
      await page.locator('#toggleRsvp').click();
      await page.locator('#rsvpSection').waitFor();
      assert.equal(await page.locator('#answerYes').isEnabled(), true);
      await page.locator('#showAttendees').click();
      assert.equal(await page.locator('#guestCount').innerText(), '2');
      await page.locator('#attendees button').first().click();
      await page.locator('.rsvp-editor[open] #editPassword').waitFor();
      await page.locator('#editCancel').click();
      await page.locator('#toggleRsvp').click();
      failGet = true;
      await page.locator('#mealMember').selectOption('2'); await page.locator('#confirmMealName').click();
      await page.locator('#mealMessage.error').waitFor();
      assert.equal(await page.locator('#mealForm').isVisible(), false, 'Never save a guessed empty choice after a read failure');
      failGet = false;
      failList = true; await page.reload(); await page.locator('#retryMeals').waitFor();
      failList = false; await page.locator('#retryMeals').click(); await page.locator('#mealMember:not([disabled])').waitFor();
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'No horizontal overflow');
      assert.deepEqual(errors, []);
      console.log(`PASS ${width}x${height}: name confirmation, meals, sides, reload, failures, conflicts, protected XLSX export, RSVP management`);
      await context.close();
    }
  } finally { await browser.close(); app.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; app.close(); });
