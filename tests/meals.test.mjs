import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createHandler, HttpError } from '../supabase/functions/presentation-meals/handler.mjs';
import { MENU, mealDetails } from '../meal-menu.mjs';
import { createMealWorkbook } from '../meal-workbook.mjs';

function fixture() {
  const people = [{ id: 1, name: 'Jack Example' }, { id: 2, name: '=HYPERLINK("unsafe")' }];
  const meals = new Map(); let allReads = 0;
  const repository = {
    attendees: async () => people,
    attendee: async id => people.find(person => person.id === id),
    meal: async id => meals.get(id) || null,
    allMeals: async () => { allReads++; return [...meals.values()]; },
    save: async choice => {
      if ((meals.get(choice.rsvp_id)?.revision || 0) !== choice.revision) throw new HttpError(409, 'Changed on another device');
      const saved = { ...choice, revision: choice.revision + 1, updated_at: '2026-10-29T16:00:00Z' };
      meals.set(choice.rsvp_id, saved); return saved;
    }
  };
  const handler = createHandler({ repository, passwordHash: createHash('sha256').update('fixture-password').digest('hex') });
  const request = async data => {
    const response = await handler(new Request('https://example.test/', { method: 'POST', body: JSON.stringify(data) }));
    return { status: response.status, data: await response.json() };
  };
  const save = (values = {}) => request({ action: 'save', confirmed: true, rsvp_id: 1, meal: 'cod', side: null, revision: 0, ...values });
  return { people, meals, request, save, handler, get allReads() { return allReads; } };
}
test('all six menu choices and seven kitchen variants match the supplied menu', () => {
  assert.equal(MENU.length, 6);
  for (const item of MENU) for (const side of item.sides ? Object.keys(item.sides) : [null]) assert.ok(mealDetails(item.id, side));
  assert.equal(mealDetails('steak_pie', null), null);
  assert.equal(mealDetails('steak_pie', 'toString'), null);
  assert.equal(mealDetails('cod', 'mash'), null);
});
test('name list does not expose meal choices', async () => {
  const f = fixture(); await f.save();
  assert.deepEqual((await f.request({ action: 'list' })).data, { attendees: f.people });
  assert.equal(f.allReads, 0);
});
test('name confirmation and valid attending ID are required', async () => {
  const f = fixture();
  assert.equal((await f.save({ confirmed: false })).status, 400);
  assert.equal((await f.save({ rsvp_id: '1' })).status, 400);
  assert.equal((await f.save({ rsvp_id: 20 })).status, 404);
  assert.equal(f.meals.size, 0);
});
test('valid meals persist under the RSVP ID; updates replace instead of duplicate', async () => {
  const f = fixture();
  assert.equal((await f.save()).status, 200);
  const got = await f.request({ action: 'get', confirmed: true, rsvp_id: 1 });
  assert.equal(got.data.choice.meal, 'cod');
  assert.equal((await f.save({ meal: 'steak_pie', side: 'mash', revision: 1 })).status, 200);
  assert.equal(f.meals.size, 1);
  assert.equal(f.meals.get(1).revision, 2);
  assert.equal(f.meals.get(1).side, 'mash');
});
test('steak pie without a side and unexpected combinations never save', async () => {
  const f = fixture();
  for (const values of [{ meal: 'steak_pie' }, { meal: 'steak_pie', side: 'salad' }, { meal: 'cod', side: 'mash' }, { meal: 'invented' }, { revision: -1 }]) assert.equal((await f.save(values)).status, 400);
  assert.equal(f.meals.size, 0);
});
test('two devices cannot silently overwrite each other', async () => {
  const f = fixture();
  await f.save();
  assert.equal((await f.save({ meal: 'vegan_burger' })).status, 409);
  assert.equal(f.meals.get(1).meal, 'cod');
});
test('removed attendees cannot read or alter their former order', async () => {
  const f = fixture(); await f.save(); f.people.splice(0, 1);
  assert.equal((await f.save({ revision: 1 })).status, 404);
  assert.equal((await f.request({ action: 'get', confirmed: true, rsvp_id: 1 })).status, 404);
  const result = await f.request({ action: 'export', password: 'fixture-password' });
  assert.equal(result.data.rows.length, 1);
  assert.equal(result.data.rows[0].status, 'Not yet selected');
});
test('export checks password on the server before reading any meals', async () => {
  const f = fixture(); await f.save();
  for (const password of [undefined, '', 'wrong', 'fixture-password ', createHash('sha256').update('fixture-password').digest('hex')]) assert.equal((await f.request({ action: 'export', password })).status, 403);
  assert.equal(f.allReads, 0);
  const result = await f.request({ action: 'export', password: 'fixture-password' });
  assert.equal(result.status, 200); assert.equal(f.allReads, 1);
  assert.equal(result.data.rows[0].meal, 'Freshly Beer Battered Cod');
  assert.equal(result.data.rows[1].status, 'Not yet selected');
});
test('missing admin configuration fails closed', async () => {
  const handler = createHandler({ repository: {} });
  const response = await handler(new Request('https://example.test/', { method: 'POST', body: '{"action":"export","password":"anything"}' }));
  assert.equal(response.status, 503);
});
test('bad requests and service failures produce errors without leaking internals', async () => {
  const f = fixture();
  assert.equal((await f.handler(new Request('https://example.test/'))).status, 405);
  assert.equal((await f.handler(new Request('https://example.test/', { method: 'POST', body: 'bad' }))).status, 400);
  const handler = createHandler({ repository: { attendees: async () => { throw new Error('SECRET DATABASE DETAIL'); } } });
  const response = await handler(new Request('https://example.test/', { method: 'POST', body: '{"action":"list"}' }));
  assert.equal(response.status, 503); assert.doesNotMatch(await response.text(), /SECRET/);
});
function unzipStored(bytes) {
  const files = new Map(); const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength); let offset = 0;
  while (view.getUint32(offset, true) === 0x04034b50) {
    const size = view.getUint32(offset + 18, true), nameLength = view.getUint16(offset + 26, true), extraLength = view.getUint16(offset + 28, true);
    const name = new TextDecoder().decode(bytes.slice(offset + 30, offset + 30 + nameLength));
    const start = offset + 30 + nameLength + extraLength;
    files.set(name, new TextDecoder().decode(bytes.slice(start, start + size))); offset = start + size;
  }
  return files;
}
test('real XLSX export includes per-person rows, kitchen totals and safe string cells', () => {
  const bytes = createMealWorkbook([
    { name: '=HYPERLINK("unsafe")', meal: 'Steak Pie', side: 'Creamy mash', status: 'Selected', updated_at: '2026-10-29T16:00:00Z' },
    { name: 'Jack & Gemma <test>', meal: '', side: '', status: 'Not yet selected', updated_at: '' }
  ], '2026-10-29T17:00:00Z');
  const files = unzipStored(bytes);
  assert.ok(files.has('[Content_Types].xml'));
  assert.match(files.get('xl/workbook.xml'), /Food choices/); assert.match(files.get('xl/workbook.xml'), /Kitchen totals/);
  const orders = files.get('xl/worksheets/sheet1.xml');
  assert.match(orders, /t="inlineStr"/); assert.match(orders, /=HYPERLINK\(&quot;unsafe&quot;\)/); assert.doesNotMatch(orders, /<f[ >]/);
  assert.match(orders, /Jack &amp; Gemma &lt;test&gt;/); assert.match(orders, /Not yet selected/);
  const totals = files.get('xl/worksheets/sheet2.xml');
  assert.match(totals, /<c r="C6" s="0"><v>1<\/v><\/c>/); // Steak pie / mash.
  assert.match(totals, /<c r="C9" s="0"><v>1<\/v><\/c>/); // Missing choice.
  assert.match(totals, /<c r="C10" s="0"><v>2<\/v><\/c>/); // Total attendees.
});
