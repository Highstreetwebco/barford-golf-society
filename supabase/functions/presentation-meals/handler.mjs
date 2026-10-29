import { mealDetails } from '../../../meal-menu.mjs';

export const EVENT_ID = 30;
export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
export function createHandler({ repository, passwordHash, cryptoApi = crypto }) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json', 'Cache-Control': 'no-store'
  };
  return async request => {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    try {
      if (request.method !== 'POST') throw new HttpError(405, 'Use POST.');
      const raw = await request.text();
      if (raw.length > 4096) throw new HttpError(413, 'Request too large.');
      let body;
      try { body = JSON.parse(raw); } catch { throw new HttpError(400, 'Invalid request.'); }
      if (!body || typeof body !== 'object' || Array.isArray(body)) throw new HttpError(400, 'Invalid request.');
      const respond = data => new Response(JSON.stringify(data), { headers });
      if (body.action === 'export') {
        if (!passwordHash) throw new HttpError(503, 'Admin export has not been configured.');
        if (typeof body.password !== 'string' || !body.password || body.password.length > 200)
          throw new HttpError(403, 'Incorrect committee password.');
        const bytes = new Uint8Array(await cryptoApi.subtle.digest('SHA-256', new TextEncoder().encode(body.password)));
        const actual = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
        let diff = actual.length ^ passwordHash.length;
        for (let i = 0; i < actual.length; i++) diff |= actual.charCodeAt(i) ^ (passwordHash.charCodeAt(i) || 0);
        if (diff !== 0) throw new HttpError(403, 'Incorrect committee password.');
        const people = await repository.attendees();
        const choices = await repository.allMeals();
        const byId = new Map(choices.map(choice => [choice.rsvp_id, choice]));
        return respond({ rows: people.map(person => {
          const saved = byId.get(person.id);
          const details = saved && mealDetails(saved.meal, saved.side);
          return { name: person.name, meal: details?.meal || '', side: details?.side || '', status: details ? 'Selected' : 'Not yet selected', updated_at: saved?.updated_at || '' };
        }), exported_at: new Date().toISOString() });
      }
      if (body.action === 'list') return respond({ attendees: await repository.attendees() });
      if (!['get', 'save'].includes(body.action)) throw new HttpError(400, 'Unknown action.');
      if (!Number.isSafeInteger(body.rsvp_id) || body.rsvp_id < 1 || body.confirmed !== true)
        throw new HttpError(400, 'Please confirm your name first.');
      const person = await repository.attendee(body.rsvp_id);
      if (!person) throw new HttpError(404, 'This person is no longer on the attending list. Please contact the committee.');
      if (body.action === 'get') return respond({ person, choice: await repository.meal(person.id) });
      if (!mealDetails(body.meal, body.side ?? null)) throw new HttpError(400, 'Choose a meal and, for steak pie, chips or mash.');
      if (!Number.isSafeInteger(body.revision) || body.revision < 0) throw new HttpError(400, 'Reload your saved choice before trying again.');
      const saved = await repository.save({ rsvp_id: person.id, meal: body.meal, side: body.side ?? null, revision: body.revision });
      return respond({ person, choice: saved });
    } catch (error) {
      const status = error instanceof HttpError ? error.status : 503;
      return new Response(JSON.stringify({ error: status === 503 ? 'The meal service is unavailable. Please try again shortly.' : error.message }), { status, headers });
    }
  };
}
