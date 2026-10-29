import { MENU, mealDetails } from './meal-menu.mjs';
import { createMealWorkbook } from './meal-workbook.mjs';

const ROOT = 'https://tzzkgfehtnuizamzlbgr.supabase.co/';
const API_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR6emtnZmVodG51aXphbXpsYmdyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI0MzY5ODAsImV4cCI6MjA3ODAxMjk4MH0.2mf4RMbJJvPo0NApywlrDyHuqAMfMyEWxgOS2ZSP4KQ';
const $ = id => document.getElementById(id);
let people = [], pending = null, selected = null, revision = 0, busy = false, exporting = false;

async function api(body) {
  const response = await fetch(ROOT + 'functions/v1/presentation-meals', {
    method: 'POST', headers: { apikey: API_KEY, Authorization: 'Bearer ' + API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(body), cache: 'no-store', signal: AbortSignal.timeout(15000)
  });
  let data;
  try { data = await response.json(); } catch { throw new Error('The meal service is unavailable. Please try again.'); }
  if (!response.ok) {
    const error = new Error(data.error || 'The meal service is unavailable. Please try again.');
    error.status = response.status;
    throw error;
  }
  return data;
}
function message(id, value, error = false) {
  $(id).textContent = value;
  $(id).classList.toggle('error', error);
}
function lock(value) {
  busy = value;
  $('mealMember').disabled = value;
  $('mealForm').querySelectorAll('input,button').forEach(node => node.disabled = value);
}
function resetSelection() {
  selected = null; pending = null; revision = 0;
  $('mealForm').hidden = true;
  $('mealForm').reset();
  $('pieSides').hidden = true;
  message('mealSaveMessage', '');
}
function updateSide() {
  const pie = $('mealForm').elements.meal?.value === 'steak_pie';
  $('pieSides').hidden = !pie;
  document.querySelectorAll('[name="pieSide"]').forEach(input => {
    input.required = pie; input.disabled = !pie || busy;
    if (!pie) input.checked = false;
  });
}
for (const item of MENU) {
  const label = document.createElement('label'); label.className = 'menu-option';
  const input = document.createElement('input'); input.type = 'radio'; input.name = 'meal'; input.value = item.id; input.required = true;
  const copy = document.createElement('span');
  const title = document.createElement('strong'); title.textContent = item.name;
  const description = document.createElement('small'); description.textContent = item.description;
  copy.append(title, description); label.append(input, copy); $('mealOptions').append(label);
  input.addEventListener('change', () => { updateSide(); message('mealSaveMessage', 'Tap Save my food choice to confirm.'); });
}
async function loadNames() {
  $('mealMember').disabled = true; $('retryMeals').hidden = true;
  message('mealMessage', 'Loading the guest list…');
  try {
    const data = await api({ action: 'list' });
    if (!Array.isArray(data.attendees)) throw new Error('Could not load names. Please try again.');
    people = data.attendees;
    $('mealMember').replaceChildren(new Option('Select your name', ''));
    const normalise = value => String(value).trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-GB');
    const counts = new Map();
    for (const person of people) counts.set(normalise(person.name), (counts.get(normalise(person.name)) || 0) + 1);
    for (const person of people) {
      const duplicate = counts.get(normalise(person.name)) > 1;
      const option = new Option(person.name + (duplicate ? ' — please contact the committee' : ''), String(person.id));
      option.disabled = duplicate;
      $('mealMember').add(option);
    }
    $('mealMember').disabled = false;
    message('mealMessage', people.length ? "Already RSVP'd? Select your name above." : 'No attendees yet. Use the RSVP button below.');
  } catch (error) {
    $('mealMember').replaceChildren(new Option('Names temporarily unavailable', ''));
    message('mealMessage', error.message, true); $('retryMeals').hidden = false;
  }
}
$('retryMeals').addEventListener('click', loadNames);
$('mealMember').addEventListener('change', () => {
  resetSelection();
  pending = people.find(person => String(person.id) === $('mealMember').value) || null;
  if (!pending) return;
  $('confirmNameText').textContent = pending.name;
  $('confirmNameDialog').showModal();
});
$('cancelMealName').addEventListener('click', () => $('confirmNameDialog').close());
$('confirmNameDialog').addEventListener('close', () => {
  if (!selected) { pending = null; $('mealMember').value = ''; }
});
$('confirmMealName').addEventListener('click', async () => {
  if (!pending || busy) return;
  selected = pending; pending = null;
  const person = selected;
  $('confirmNameDialog').close(); lock(true);
  message('mealMessage', 'Loading your saved choice…');
  try {
    const data = await api({ action: 'get', rsvp_id: person.id, confirmed: true });
    revision = data.choice?.revision || 0;
    $('confirmedName').textContent = data.person.name;
    if (data.choice) {
      const radio = [...document.querySelectorAll('[name="meal"]')].find(input => input.value === data.choice.meal);
      if (radio) radio.checked = true;
      const side = [...document.querySelectorAll('[name="pieSide"]')].find(input => input.value === data.choice.side);
      if (side) side.checked = true;
    }
    $('mealForm').hidden = false;
    message('mealMessage', data.choice ? 'Your saved meal is shown below. You can change it and save again.' : 'Name confirmed. Choose your meal below.');
    $('mealOptions').scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  } catch (error) {
    resetSelection(); $('mealMember').value = '';
    message('mealMessage', error.message + ' Select your name to retry.', true);
  } finally { lock(false); updateSide(); }
});
$('mealForm').addEventListener('submit', async event => {
  event.preventDefault();
  if (busy || !selected || !$('mealForm').reportValidity()) return;
  const meal = $('mealForm').elements.meal.value;
  const side = meal === 'steak_pie' ? $('mealForm').elements.pieSide.value : null;
  const details = mealDetails(meal, side);
  if (!details) return message('mealSaveMessage', 'Please select a valid meal and side.', true);
  lock(true); message('mealSaveMessage', 'Saving your food choice…');
  try {
    const data = await api({ action: 'save', confirmed: true, rsvp_id: selected.id, meal, side, revision });
    if (!data.choice || !Number.isSafeInteger(data.choice.revision)) throw new Error('The save could not be confirmed. Select your name again to check.');
    revision = data.choice.revision;
    message('mealSaveMessage', `Saved for ${data.person.name}: ${details.meal}${meal === 'steak_pie' ? ' with ' + details.side.toLowerCase() : ''}.`);
  } catch (error) {
    if (error.status === 409) {
      resetSelection(); $('mealMember').value = '';
      message('mealMessage', error.message, true);
    } else message('mealSaveMessage', error.message, true);
  }
  finally { lock(false); updateSide(); }
});
$('toggleRsvp').addEventListener('click', () => {
  const opening = $('rsvpSection').hidden;
  $('rsvpSection').hidden = !opening; $('toggleRsvp').setAttribute('aria-expanded', String(opening));
  if (opening) $('rsvpSection').scrollIntoView({ block: 'start', behavior: 'smooth' });
  else if (!selected) void loadNames();
});
document.addEventListener('presentation-rsvp-updated', () => { if (!selected && !busy) void loadNames(); });
$('exportMeals').addEventListener('click', () => { message('exportMessage', ''); $('exportDialog').showModal(); });
$('cancelExport').addEventListener('click', () => { if (!exporting) $('exportDialog').close(); });
$('exportDialog').addEventListener('cancel', event => { if (exporting) event.preventDefault(); });
$('exportDialog').addEventListener('close', () => { $('exportPassword').value = ''; });
$('exportForm').addEventListener('submit', async event => {
  event.preventDefault();
  if (exporting) return;
  exporting = true;
  $('exportForm').querySelectorAll('input,button').forEach(node => node.disabled = true);
  message('exportMessage', 'Checking password and preparing the spreadsheet…');
  try {
    const data = await api({ action: 'export', password: $('exportPassword').value });
    if (!Array.isArray(data.rows)) throw new Error('Export failed. Please try again.');
    const bytes = createMealWorkbook(data.rows, data.exported_at);
    const url = URL.createObjectURL(new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
    const link = document.createElement('a'); link.href = url; link.download = 'Barford-Presentation-2026-Food-Choices.xlsx';
    document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 60000);
    message('exportMessage', 'Spreadsheet downloaded. It includes food choices, missing choices and kitchen totals.');
  } catch (error) { message('exportMessage', error.message, true); }
  finally {
    exporting = false; $('exportPassword').value = '';
    $('exportForm').querySelectorAll('input,button').forEach(node => node.disabled = false);
  }
});
void loadNames();
