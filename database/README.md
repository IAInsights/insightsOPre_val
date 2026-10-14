# Contacts Admin

The Admin tab uses a dedicated Supabase Auth session for reporting@globe-groupe.com.
The password is entered by the team and is never stored in this repository.
After signing in, users select their name from Contacts_Operations rows whose
jobtitle is Account Manager (case-insensitive). The actor is self-declared.
The assigned contact commercial is a separate foreign key, displayed as a name.

## Database installation

contacts-admin.sql was applied to ReportingDB on 14 October 2026. Do not rerun
this one-time setup. It creates the commercial and admin_version columns,
restricted RPCs and private audit/access tables. It does not alter contact values.
For another database, replace the allowed user UUID with that deployment's
shared account UUID before running the setup in the SQL editor.

Direct API access to C_contacts is revoked from anon/authenticated. Direct
contact_retailers insert/update/delete is revoked; use contacts_admin_save
to replace associations atomically. Existing service_role/database integrations
retain their access. Other existing reporting tables and authentication are unchanged.
RLS with no policies on the protected tables deliberately denies direct access.
The private implementations check auth.uid() against a server-owned allowlist.
The public RPC wrappers are security invoker, and anon cannot execute them.

## Validation

Run `node tests/admin.test.mjs` for search/filter, session refresh/expiry,
escaping, authenticated request headers and syntax/navigation checks.
Run database/test-contacts-admin.sql inside BEGIN / ROLLBACK to test authorization,
create/update, multi-retailer replacement, stale writes and audit details.
Fixtures must never be committed to the database.

For synthetic browser QA, run `node tests/create-preview.mjs` and serve the
repository locally. Open tests/preview.html. The preview uses fictitious data
and a mock password `preview-only`; it does not verify real Supabase credentials.
The generated preview is ignored by Git and is not shipped to GitHub Pages.

Before merging, the shared-account owner should verify the real password login.
No real password was provided to or used by the developer.
History covers writes made through Admin from activation onward. Existing
contacts start with no commercial assignment and no backfilled change history.
