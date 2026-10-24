/* 2026 presentation evening. Only event 30 is shown; no existing RSVPs are removed. */
(() => {
  'use strict';
  const EVENT_ID = 30;
  const ROOT = 'https://tzzkgfehtnuizamzlbgr.supabase.co/rest/v1/';
  const API_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR6emtnZmVodG51aXphbXpsYmdyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI0MzY5ODAsImV4cCI6MjA3ODAxMjk4MH0.2mf4RMbJJvPo0NApywlrDyHuqAMfMyEWxgOS2ZSP4KQ'; // Existing public Supabase anon key (not a service key).
  const LAST_REPLY_KEY = 'barford-presentation-2026-name';
  const el = id => document.getElementById(id);
  const nameInput = el('memberName'), yesButton = el('answerYes'), noButton = el('answerNo');
  const confirmButton = el('confirmRsvp');
  let selectedAnswer = null;
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
    confirmButton.disabled = value || !ready || selectedAnswer === null;
  }

  function selectAnswer(answer) {
    if (busy || !ready) return;
    selectedAnswer = answer;
    yesButton.classList.toggle('is-selected', answer === true);
    noButton.classList.toggle('is-selected', answer === false);
    yesButton.setAttribute('aria-pressed',String(answer === true));
    noButton.setAttribute('aria-pressed',String(answer === false));
    confirmButton.disabled = false;
    showMessage(answer ? "Yes selected — tap Confirm RSVP." : "No selected — tap Confirm RSVP.");
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
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'guest-edit';
      button.textContent = String(row.name || '').trim() || 'Member';
      button.setAttribute('aria-label', 'Edit RSVP for ' + button.textContent);
      button.addEventListener('click', () => openEditor(row));
      item.append(button);
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
      showMessage('Please enter your full name before confirming.', true);
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
        openEditor(matches[0], attending);
        return;

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


  // This confirmation guards accidental UI changes, not direct API access.
  const editor = document.createElement('dialog');
  editor.className = 'rsvp-editor';
  editor.setAttribute('aria-labelledby', 'editTitle');
  editor.innerHTML = `<form id="editRsvpForm">
    <h2 id="editTitle">Manage RSVP</h2>
    <p id="editPerson"></p>
    <label for="editName">Name</label>
    <input id="editName" maxlength="80" required autocomplete="off">
    <label for="editAnswer">RSVP</label>
    <select id="editAnswer"><option value="yes">Yes, coming</option><option value="no">No, not attending</option></select>
    <label for="editPassword">Confirmation password</label>
    <input id="editPassword" type="password" required autocomplete="off">
    <p id="editMessage" role="status" aria-live="polite">Enter the committee password to confirm a change.</p>
    <div class="edit-actions">
      <button type="submit" id="editSave">Save changes</button>
      <button type="button" id="editDelete" class="danger">Remove person</button>
      <button type="button" id="editCancel">Cancel</button>
    </div>
  </form>`;
  document.body.append(editor);
  let editing = null, editorBusy = false, deleting = false;
  function openEditor(row, answer = row.attending) {
    if (editorBusy) return;
    editing = { ...row };
    deleting = false;
    el('editPerson').textContent = row.name;
    el('editName').value = row.name;
    el('editAnswer').value = answer ? 'yes' : 'no';
    el('editPassword').value = '';
    el('editDelete').textContent = 'Remove person';
    el('editMessage').textContent = 'Enter the committee password to confirm a change.';
    if (!editor.open) editor.showModal();
  }
  editor.addEventListener('cancel', event => { if (editorBusy) event.preventDefault(); });
  editor.addEventListener('close', () => { el('editPassword').value = ''; editing = null; });
  el('editCancel').addEventListener('click', () => { if (!editorBusy) editor.close(); });
  async function commitEdit(remove) {
    if (editorBusy || !editing) return;
    const name = el('editName').value.trim().replace(/\s+/g, ' ');
    if (!remove && (name.length < 2 || name.length > 80)) {
      el('editMessage').textContent = 'Please enter a name between 2 and 80 characters.';
      return;
    }
    editorBusy = true;
    editor.querySelectorAll('button,input,select').forEach(node => node.disabled = true);
    try {
      const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(el('editPassword').value));
      const hash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
      if (hash !== '4f984359f32c66b7c8a0f39eaf5a9c81bf045817f850c0804976a0770b5f2b8b') {
        throw new Error('Incorrect password. No changes have been made.');
      }
      await refreshGuests();
      const current = rows.find(row => row.id === editing.id);
      if (!current) throw new Error('This RSVP has already been removed. Close this window and refresh.');
      if (current.name !== editing.name || current.attending !== editing.attending || current.reserve !== editing.reserve)
        throw new Error('This RSVP has changed. Close this window and select the name again.');
      if (!remove && rows.some(row => row.id !== editing.id && normalise(row.name) === normalise(name)))
        throw new Error('Another RSVP already uses that name.');
      const result = await query('rsvps?id=eq.' + encodeURIComponent(editing.id) + '&event_id=eq.' + EVENT_ID, {
        method: remove ? 'DELETE' : 'PATCH',
        headers: { Prefer: 'return=representation' },
        ...(remove ? {} : { body: JSON.stringify({ name, attending: el('editAnswer').value === 'yes', reserve: false }) })
      });
      if (!Array.isArray(result) || result.length !== 1) throw new Error('The change could not be confirmed. Refresh the list before trying again.');
      editor.close();
      showMessage(remove ? 'Person removed from the presentation evening list.' : 'RSVP updated.');
      await refreshGuests().catch(() => showMessage('Change saved. Reload the page to refresh the list.'));
    } catch (error) {
      el('editMessage').textContent = error.message || 'Unable to save. Please try again.';
      el('editPassword').value = '';
    } finally {
      editorBusy = false;
      editor.querySelectorAll('button,input,select').forEach(node => node.disabled = false);
    }
  }
  el('editRsvpForm').addEventListener('submit', event => { event.preventDefault(); void commitEdit(false); });
  el('editDelete').addEventListener('click', () => {
    if (!deleting) {
      deleting = true;
      el('editDelete').textContent = 'Confirm removal';
      el('editMessage').textContent = 'Remove this person completely? Enter the password, then tap Confirm removal.';
      el('editPassword').focus();
      return;
    }
    void commitEdit(true);
  });

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
  yesButton.setAttribute('aria-pressed','false');
  noButton.setAttribute('aria-pressed','false');
  yesButton.addEventListener('click', () => selectAnswer(true));
  noButton.addEventListener('click', () => selectAnswer(false));
  el('presentationForm').addEventListener('submit', event => {
    event.preventDefault();
    if (selectedAnswer !== null && !busy) void save(selectedAnswer);
  });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && !busy && ready) refreshGuests().catch(() => {});
  });
  void init();
})();
