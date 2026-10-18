/* 2026 presentation evening. Only event 30 is shown; no existing RSVPs are removed. */
(() => {
  'use strict';
  const EVENT_ID = 30;
  const ROOT = 'https://tzzkgfehtnuizamzlbgr.supabase.co/rest/v1/';
  const API_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR6emtnZmVodG51aXphbXpsYmdyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI0MzY5ODAsImV4cCI6MjA3ODAxMjk4MH0.2mf4RMbJJvPo0NApywlrDyHuqAMfMyEWxgOS2ZSP4KQ'; // Existing public Supabase anon key (not a service key).
  const LAST_REPLY_KEY = 'barford-presentation-2026-name';
  const el = id => document.getElementById(id);
  const nameInput = el('memberName'), yesButton = el('answerYes'), noButton = el('answerNo');
  const message = el('responseMessage'), attendeeList = el('attendees'), guestCount = el('guestCount');
  let rows = [];
  let busy = false;
  let ready = false;

  async function query(path, options = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 14000);
    const headers = { apikey: API_KEY, Authorization: 'Bearer ' + API_KEY, Accept: 'application/json', ...options.headers };
    if (options.body) headers['Content-Type'] = 'application/json';
    try {
      const response = await fetch(ROOT + path, { ...options, headers, cache: 'no-store', signal: controller.signal });
      const raw = await response.text();
      let value;
      try { value = raw ? JSON.parse(raw) : null; } catch { value = null; }
      if (!response.ok) throw new Error(value?.message || 'The booking service could not save your response.');
      return value;
    } finally { clearTimeout(timeout); }
  }

  function normalise(value) {
    return String(value || '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-GB');
  }
  function showMessage(value, error = false) {
    message.textContent = value;
    message.classList.toggle('error', error);
  }
  function setBusy(value) {
    busy = value;
    nameInput.disabled = value || !ready;
    yesButton.disabled = value || !ready;
    noButton.disabled = value || !ready;
  }
  function renderGuests() {
    const confirmed = rows.filter(row => row.attending === true && row.reserve !== true)
      .sort((a, b) => String(a.name).localeCompare(String(b.name), 'en-GB', { sensitivity:'base' }));
    guestCount.textContent = String(confirmed.length);
    attendeeList.replaceChildren();
    if (!confirmed.length) {
      const empty = document.createElement('li');
      empty.className = 'guest-placeholder';
      empty.textContent = 'No confirmations yet. Be the first to reply.';
      attendeeList.append(empty);
      return;
    }
    for (const row of confirmed) {
      const item = document.createElement('li');
      item.textContent = String(row.name || '').trim() || 'Member';
      attendeeList.append(item);
    }
  }
  async function refreshGuests() {
    const data = await query('rsvps?event_id=eq.' + EVENT_ID + '&select=id,name,attending,reserve,created_at&order=created_at.asc&limit=1000');
    if (!Array.isArray(data)) throw new Error('Could not read the attendance list.');
    rows = data;
    renderGuests();
  }

  async function save(attending) {
    if (busy || !ready) return;
    const name = nameInput.value.trim().replace(/\s+/g, ' ');
    if (name.length < 2 || name.length > 80) {
      showMessage('Please enter your name before choosing Yes or No.', true);
      nameInput.focus();
      return;
    }
    setBusy(true);
    showMessage('Saving your response…');
    try {
      // Read fresh rows just before a save to avoid overwriting an older snapshot.
      await refreshGuests();
      const matches = rows.filter(row => normalise(row.name) === normalise(name));
      if (matches.length > 1) {
        showMessage('More than one RSVP uses that name. Please enter your full name or contact the committee.', true);
        return;
      }
      if (matches.length === 1) {
        const id = matches[0].id;
        const saved = await query('rsvps?id=eq.' + encodeURIComponent(id) + '&event_id=eq.' + EVENT_ID, {
          method: 'PATCH',
          headers: { Prefer:'return=representation' },
          body: JSON.stringify({ attending, reserve:false })
        });
        if (!Array.isArray(saved) || saved.length !== 1) throw new Error('Your existing response could not be updated. Please contact the committee.');
      } else {
        const saved = await query('rsvps', {
          method: 'POST',
          headers: { Prefer:'return=representation' },
          body: JSON.stringify({
            event_id: EVENT_ID, name, attending, reserve:false,
            buggy:false, flexibility:null, phone:'', preferred_time:null, whatsapp_opt_in:false
          })
        });
        if (!Array.isArray(saved) || saved.length !== 1) throw new Error('Your response could not be confirmed. Please try again.');
      }
      try { localStorage.setItem(LAST_REPLY_KEY, name); } catch {}
      showMessage(attending ? "Thank you. You're on the list for the presentation evening." : 'Thank you. Your reply has been saved as not attending.');
      await refreshGuests().catch(() => {
        showMessage('Your response was saved, but the guest list could not refresh. Please reload the page.');
      });
    } catch (error) {
      showMessage(error?.message || 'Unable to save your response. Please try again.', true);
    } finally { setBusy(false); }
  }

  async function init() {
    try {
      const event = await query('events?id=eq.' + EVENT_ID + '&select=id,name,date,location,cancelled&limit=1');
      if (!Array.isArray(event) || event.length !== 1 || !/presentation/i.test(event[0].name) || event[0].cancelled) {
        throw new Error('The presentation evening is not available for RSVP.');
      }
      const details = event[0];
      const date = new Date(details.date + 'T12:00:00');
      el('presentationDate').textContent = date.toLocaleDateString('en-GB', {weekday:'long',day:'numeric',month:'long',year:'numeric'});
      el('presentationVenue').textContent = 'To be confirmed';
      await refreshGuests();
      try { nameInput.value = localStorage.getItem(LAST_REPLY_KEY) || ''; } catch {}
      ready = true;
      setBusy(false);
      showMessage('Enter your name and select Yes or No.');
    } catch (error) {
      showMessage('Unable to load the RSVP form right now. Please refresh and try again.', true);
      attendeeList.replaceChildren();
      const note = document.createElement('li');
      note.className = 'guest-placeholder';
      note.textContent = 'Guest list temporarily unavailable.';
      attendeeList.append(note);
    }
  }
  const guestTrigger = el('showAttendees'), guestPanel = el('guestSection');
  guestTrigger.addEventListener('click', () => {
    const opening = guestPanel.hidden;
    guestPanel.hidden = !opening;
    guestTrigger.setAttribute('aria-expanded',String(opening));
    guestTrigger.innerHTML = opening ? "Hide who's coming <span aria-hidden=\"true\">↑</span>" : "See who's coming <span aria-hidden=\"true\">↓</span>";
    if (opening && ready) refreshGuests().catch(() => {});
  });
  yesButton.addEventListener('click', () => save(true));
  noButton.addEventListener('click', () => save(false));
  el('presentationForm').addEventListener('submit', event => event.preventDefault());
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && !busy && ready) refreshGuests().catch(() => {});
  });
  void init();
})();
