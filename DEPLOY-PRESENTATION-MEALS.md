# Presentation evening meals (2026)

The frontend and backend changes are prepared together. Do not merge the frontend until the backend below is deployed and checked. The live page currently remains on the existing RSVP flow.

## Target

- Website: https://barfordgolf.co.uk/
- GitHub: `Highstreetwebco/barford-golf-society`
- Live Supabase project: `tzzkgfehtnuizamzlbgr`
- Event: `30`, Barford End Of Season Presentation Evening, 7 November 2026

The currently connected Supabase account exposes only `xspzmthygrajzktydvvj`, the **2027 development project**. No changes have been applied to that project. Reconnect Supabase with access to the live project before deployment.

## Deploy in order

1. Inspect the live `rsvps.id` type and existing tables/policies. Apply `supabase/schema/presentation-meals.sql` to the live project using `apply_migration` with name `presentation_evening_meals`. It adds a new table with one meal per RSVP, validates sides, enables RLS and grants access only to the service role. It does not modify existing RSVP records. Run Supabase security advisors after applying.
2. Set `PRESENTATION_ADMIN_PASSWORD_SHA256` in the live project's Edge Function secrets to the SHA-256 digest of the existing committee password. The existing digest is in `presentation.js`'s RSVP edit check. Never put the password or a service key in frontend code. An unset secret disables the export.
3. Deploy `supabase/functions/presentation-meals/index.ts` as `presentation-meals`, including `handler.mjs` and the root `meal-menu.mjs` dependency. Keep JWT verification enabled. The function deliberately refuses to run on any other project. It reads `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` from the server environment.
4. Check the deployed list endpoint against the live attending RSVP count. Verify public direct reads/writes to `presentation_meals` are rejected and export without the password returns 403. Verify a temporary test RSVP's complete save/read/update/export flow, then remove only the test records. Do not use a real person's RSVP as a test record.
5. Run the tests and merge this branch to `main`. Check GitHub Pages deployment and the live page on mobile. No changes are needed to 2027.

## Behaviour and limits

- Attending names come from event 30, excluding reserves. Existing RSVP registration and committee editing remain available below the meal form.
- Guests explicitly confirm their selected name before reading or saving. This prevents accidental selection; it is not proof of identity. As requested, this remains a shared, trust-based guest list without individual sign-in.
- A stale revision returns 409 rather than silently overwriting a choice saved on another device. Reload the name to see the latest choice.
- The server checks the committee password before fetching bulk meal data. Passwords are sent in an HTTPS POST body, never stored in browser storage, and cleared after every export attempt. Shared-password strength still depends on the existing committee password; this is not an individual admin account system.
- `.xlsx` export has `Food choices` and `Kitchen totals` tabs, includes attendees without orders, excludes non-attendees and reserves, and treats names as text to prevent spreadsheet formula injection. The burger name is retained as supplied: **8oz Steam Burger**.
- Existing RSVP edit/remove protection is unchanged and still client-side. This change does not claim to secure the pre-existing RSVP API.

## Checks

`node --test tests/meals.test.mjs` checks menu validation, persistence semantics, stale writes, missing names, export authorization, errors and workbook content. `node tests/presentation.cjs` runs mobile/desktop browser scenarios in CI with isolated API fixtures, never production writes.

Actual live database constraints, deployed API calls and live deployment remain unverified until the live Supabase connection is available.
