# Auth — WebAuthn + admin-approved registration

## Context

Currently any device on the LAN that scans the QR can open the controller page and start driving the Mac — the WS server at `/ws` accepts every connection and dispatches every gesture as a CoreGraphics event. We want to gate that with a passkey-style flow:

- **Register once**: client does a WebAuthn ceremony → POSTs the credential to `/register` → row sits as `pending` until the admin approves it from a terminal CLI on the host Mac.
- **Login every connect**: client does a WebAuthn assertion → server verifies against the approved credential → issues an HttpOnly session cookie → WS upgrade is allowed only with a valid session.

Decided constraints:

- RP ID = mDNS hostname (`paddy.local`-style). macOS already advertises `<hostname>.local` via Bonjour, so server reads `os.hostname()` and uses `<hostname>.local` as both URL host and RP ID. TLS cert needs that name in its SANs.
- WS auth = HttpOnly cookie read during upgrade.
- No typed label: server derives a label from the AAGUID in the attestation (e.g. "iCloud Keychain", "Chrome on Mac", fallback "passkey"). Admin distinguishes duplicates by `created_at`.

## Architecture

```
[phone]                                 [Mac: bun server]               [Mac: admin terminal]
  │                                          │                                  │
  │ GET /                                    │                                  │
  │ POST /register/options ──────────────►   │ store challenge (in-mem)         │
  │ navigator.credentials.create()           │                                  │
  │ POST /register/verify   ──────────────►  │ insert credential (status=pending)
  │ ◄── 202 pending                          │                                  │
  │                                          │                                  │
  │                                          │  ◄── `bun admin list`            │
  │                                          │  ◄── `bun admin approve <id>`    │
  │                                          │                                  │
  │ POST /login/options    ───────────────►  │ store challenge                  │
  │ navigator.credentials.get()              │                                  │
  │ POST /login/verify     ───────────────►  │ verify, bump counter,            │
  │ ◄── Set-Cookie: sid=...                  │ insert session row               │
  │ WS upgrade /ws (Cookie: sid=...) ─────►  │ lookup session, attach to ws.data│
  │ ◄── upgraded                             │                                  │
```

## Files to add

- `src/auth/db.ts` — `bun:sqlite` connection (`paddy.db` next to server), schema migration on boot, query helpers.
- `src/auth/webauthn.ts` — thin wrapper around `@simplewebauthn/server`: `generateRegistration`, `verifyRegistration`, `generateAuthentication`, `verifyAuthentication`. Reads RP ID + origin from `network.ts`.
- `src/auth/aaguid.ts` — static map of known passkey-provider AAGUIDs → human names, with `"passkey"` fallback.
- `src/auth/challenges.ts` — `Map<string, { challenge: string; expires: number }>` with 5-min TTL, swept lazily on read.
- `src/auth/session.ts` — `createSession(credentialId)`, `getSession(sid)`, `revokeSession(sid)`. Cookies: `sid=<32 bytes base64url>; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=3600`.
- `src/auth/routes.ts` — exports a function that takes a `Request` and returns a `Response | null` for `/register/options`, `/register/verify`, `/login/options`, `/login/verify`, `/logout`. Returns `null` when path doesn't match so `server.ts` can fall through.
- `src/admin-cli.ts` — separate entrypoint (`bun run src/admin-cli.ts <cmd>`). Subcommands: `list [--pending|--approved]`, `approve <id>`, `reject <id>`, `revoke <id>`. Opens the same SQLite file. Pretty-prints rows with label, created_at, last_used_at.
- `src/controller-device/auth.ts` — client logic: detects unauth state, renders register/login UI, drives `@simplewebauthn/browser` ceremonies, polls `/register/status` once after register so user gets a "waiting for approval" message.

## Files to modify

- `src/server.ts`
  - Wire `auth/routes.ts` before the `/ws` branch.
  - In the `/ws` branch, parse the `Cookie` header, look up session, and pass `{ credentialId }` as `data` in `server.upgrade(req, { data })`. Reject with 401 on no/bad session.
  - `websocket.open(ws)` can now log `ws.data.credentialId`.
- `src/network.ts`
  - Add `getRpId()` returning `${os.hostname()}.local` (strip any `.local.local` if hostname already ends in `.local`).
  - Add `getOrigin(port)` returning `https://${rpId}:${port}` — used for both the QR and WebAuthn `expectedOrigin`.
  - Update QR + console log to use the hostname URL, not the IP.
- `src/controller-device/index.html`
  - Add `<section id="auth">` with a login button, a "register this device" button, and a "pending approval" message. Hide the gesture surface until authed.
  - Import `auth.ts` before `controller.ts`; `controller.ts` waits for an `auth-ready` event before instantiating `WSConnection`.
- `src/controller-device/controller.ts`
  - Defer `new WSConnection()` and gesture binding until auth resolves.
- `package.json`
  - Add deps: `@simplewebauthn/server`, `@simplewebauthn/browser`.
  - Add scripts: `"admin": "bun run src/admin-cli.ts"`.

## SQLite schema

```sql
CREATE TABLE credentials (
  id              TEXT PRIMARY KEY,       -- uuid
  credential_id   BLOB NOT NULL UNIQUE,   -- raw credentialID
  public_key      BLOB NOT NULL,          -- COSE
  counter         INTEGER NOT NULL,
  user_handle     BLOB NOT NULL,          -- random 16 bytes per credential
  label           TEXT NOT NULL,
  status          TEXT NOT NULL CHECK (status IN ('pending','approved','rejected')),
  created_at      INTEGER NOT NULL,
  approved_at     INTEGER,
  last_used_at    INTEGER
);

CREATE TABLE sessions (
  id              TEXT PRIMARY KEY,       -- cookie value
  credential_pk   TEXT NOT NULL REFERENCES credentials(id),
  created_at      INTEGER NOT NULL,
  expires_at      INTEGER NOT NULL
);
```

Discoverable credentials (resident keys, `residentKey: 'required'`) so login doesn't need the client to remember a username — assertion's credentialId identifies the row.

## Authorization rules

- `/register/*`: open to anyone on the LAN (gated by being on the network + having TLS).
- `/login/*`: only verifies against `status='approved'` rows; pending/rejected rows fail with a generic "credential not recognized" so we don't leak admin state.
- `/ws` upgrade: cookie session must exist, not be expired, and reference an approved credential. On any failure → 401, no upgrade.

## Verification

1. **Hostname + cert**
   - `scutil --get LocalHostName` to confirm the name; `ping paddy.local` from the phone.
   - Regenerate the dev cert with `paddy.local` in SANs (the existing TLS setup already takes cert/key from env, just regenerate). Trust it on the phone.
2. **Boot**
   - `bun run dev`. Verify QR/log shows `https://<host>.local:8080`.
   - Confirm `paddy.db` is created with both tables.
3. **Register**
   - Phone scans QR → tap "register this device" → biometric prompt → "waiting for approval" message.
   - On Mac: `bun run admin list` shows one pending row with the auto-derived label (e.g. "iCloud Keychain") and created_at.
4. **Approve**
   - `bun run admin approve <id>` → row flips to approved.
   - Phone (which is polling `/register/status` once or on retry) progresses to login.
5. **Login + use**
   - Phone shows login button → tap → biometric → cookie set → controller UI mounts → WS connects → scroll/pinch/arrow-keys all drive the Mac.
   - In server log, `[ws] open` line includes the credential ID.
6. **Negative checks**
   - Open `wss://paddy.local:8080/ws` directly with no cookie (e.g. `bunx wscat`) → 401.
   - `bun run admin reject <id>` then try to login on that device → fails with generic error.
   - Clear cookies on phone → forced back through login (registration not repeated, since the credential is still on the device).
7. **Second device**
   - Repeat register on a second phone; confirm admin list shows two rows; approve only one; confirm the other still can't log in.

## Out of scope

- Passkey sync across the user's iCloud devices "just works" because credentials live on the device — no server change needed.
- Rate limiting, lockout after N failed assertions, audit log of WS commands.
- Web UI for admin approval — CLI only.
- Revocation propagation to live WS connections (current design: existing sockets stay open until close; revoking only blocks new logins). If we want kick-on-revoke, server can hold `Map<credentialId, Set<ServerWebSocket>>` and close on revoke — easy follow-up.
