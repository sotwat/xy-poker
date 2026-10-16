# Account security audit — 2026-10-16

## Confirmed exposure and correction

A read-only anonymous request to the deployed players API returned one row containing browser_id, coins and is_premium in addition to ranking fields. Values were not logged. game_records returned no anonymous rows; contact_messages denied anonymous reads.

supa_schema_v11_account_privacy.sql removes permissive players SELECT policies, restricts account reads to auth.uid(), and exposes only id/username/rating through public_players. MyPage's ranking query uses that view; account/store queries continue reading only the authenticated account via RLS.

The socket previously authenticated only at connection establishment. The new session middleware denies packets and disconnects at the verified token's expiry. The existing client reconnects when Supabase refreshes its token. Early administrative revocation is not claimed to propagate instantly.

engine.io and proxy-addr production dependency advisories were fixed in both root and server lockfiles. All inspected historical .env keys were public anon keys, not service_role credentials; this audit did not find a leaked privileged credential and did not rotate public client keys.

## Validation

npm run check: 114 tests, 113 passed, 1 pre-existing private-font integration skip; lint/typecheck/build passed with the updated installed dependency tree. Production dependency audits for root and server report zero known advisories. No customer data was modified.

## Deployment dependency

The database migration and matching ranking frontend MUST be deployed together. Supabase dashboard currently requires the owner to log in. Do not deploy the ranking client before the view exists. After SQL application verify: anonymous players read denied; public_players exposes exactly three fields; authenticated account reads only its own row; store and account page work.

Backend expiry/dependency patch may ship independently. The local server env uses an anon fallback, but production privileged-key configuration was not available for inspection; do not silently replace it or infer that production also uses that fallback.

## Remaining boundary

Contact submission has a per-socket rate limit, not a distributed account/IP abuse control. This does not expose contact records, but reconnect-based spam protection remains incomplete. Check the production proxy trust boundary before introducing an IP-based limit.
