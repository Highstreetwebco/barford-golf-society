import { createHandler, EVENT_ID, HttpError } from './handler.mjs';

const projectUrl = Deno.env.get('SUPABASE_URL')!;
if (new URL(projectUrl).hostname !== 'tzzkgfehtnuizamzlbgr.supabase.co') {
  throw new Error('Deploy this function only to the live 2026 project.');
}
const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
async function db(path: string, options: RequestInit = {}) {
  const response = await fetch(projectUrl + '/rest/v1/' + path, {
    ...options,
    headers: { apikey: key, Authorization: 'Bearer ' + key, 'Content-Type': 'application/json', Prefer: 'return=representation', ...options.headers },
    signal: AbortSignal.timeout(10000)
  });
  const result = await response.json();
  if (response.status === 409) throw new HttpError(409, 'This meal choice changed on another device. Select your name again before saving.');
  if (!response.ok) throw new Error('Database request failed');
  return result;
}
const attendeeFilter = `event_id=eq.${EVENT_ID}&attending=eq.true&or=(reserve.is.null,reserve.eq.false)`;
async function allRows(path: string) {
  const all = [];
  for (let offset = 0; ; offset += 500) {
    const rows = await db(`${path}&limit=500&offset=${offset}`);
    all.push(...rows);
    if (rows.length < 500) return all;
  }
}
const repository = {
  attendees: () => allRows(`rsvps?${attendeeFilter}&select=id,name&order=name.asc,id.asc`),
  attendee: async (id: number) => (await db(`rsvps?${attendeeFilter}&id=eq.${id}&select=id,name`))[0] || null,
  meal: async (id: number) => (await db(`presentation_meals?rsvp_id=eq.${id}&select=meal,side,revision,updated_at`))[0] || null,
  allMeals: () => allRows('presentation_meals?select=rsvp_id,meal,side,updated_at&order=rsvp_id.asc'),
  save: async (choice: { rsvp_id: number; meal: string; side: string | null; revision: number }) => {
    const payload = { ...choice, revision: choice.revision + 1, updated_at: new Date().toISOString() };
    const result = await db(choice.revision === 0 ? 'presentation_meals' : `presentation_meals?rsvp_id=eq.${choice.rsvp_id}&revision=eq.${choice.revision}`, {
      method: choice.revision === 0 ? 'POST' : 'PATCH', body: JSON.stringify(payload)
    });
    if (!Array.isArray(result) || result.length !== 1) throw new HttpError(409, 'This meal choice changed on another device. Select your name again before saving.');
    return result[0];
  }
};
Deno.serve(createHandler({ repository, passwordHash: Deno.env.get('PRESENTATION_ADMIN_PASSWORD_SHA256') }));
