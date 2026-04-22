# paddy

Your phone as a trackpad for your Mac.

Paddy serves a small controller page to a phone on your LAN. Touches on the phone become real scroll, zoom, and arrow-key events on whichever app is frontmost on the Mac — synthesized through CoreGraphics via `bun:ffi`.

Access is gated by a WebAuthn passkey. New devices register once, then an admin CLI on the host approves them before they can connect.

## How it works

```
[phone]  ──(HTTPS)──►  [Bun server on Mac]  ──(CGEventPost)──►  frontmost macOS app
           gestures          auth + WS                            scroll / zoom / keys
```

- **Server** (`src/server`) — `Bun.serve` with TLS, WebAuthn routes, and a WS endpoint gated by an HttpOnly session cookie. On startup it prints the LAN URL and a terminal QR code.
- **Client** (`src/client`) — Svelte controller page with a gesture layer. One-finger drag = scroll, two-finger pinch = zoom, on-screen buttons send arrow keys.
- **Emit** (`src/server/emit.ts`) — `bun:ffi` bindings to `CoreGraphics` for scroll, keyboard, and cmd-scroll (zoom) events.
- **Auth** (`src/auth`) — `@simplewebauthn/server` + `bun:sqlite`. Credentials land as `pending` until the admin CLI approves them.

## Setup

### 1. Install

```bash
bun install
```

### 2. Local TLS cert

WebAuthn requires HTTPS and a stable RP ID. Paddy uses `<your-hostname>.local` (mDNS) as both the URL host and RP ID. Generate a cert that includes that name in its SANs — [`mkcert`](https://github.com/FiloSottile/mkcert) is the easy path:

```bash
mkcert -install
mkcert -cert-file .certs/local.pem -key-file .certs/local-key.pem "$(scutil --get LocalHostName).local"
```

Then trust the mkcert root CA on your phone (mkcert prints the root location).

### 3. Env

`.env` already points at `.certs/local.pem` and `.certs/local-key.pem`. Bun auto-loads it.

### 4. Accessibility permission

macOS silently drops synthesized events from apps without Accessibility access. Grant it to whichever app runs `bun` (Terminal, iTerm, your editor) under **System Settings → Privacy & Security → Accessibility**, then restart that app.

## Run

```bash
bun run dev    # hot reload
bun run start  # no hot reload
```

The server prints the URL (e.g. `https://davids-mac.local:8080`) and a QR code. Scan it from a phone on the same Wi-Fi.

## Register a device

1. On the phone, tap **Register this device** → complete the biometric prompt.
2. The phone shows "waiting for approval".
3. On the Mac, list pending credentials and approve:

   ```bash
   bun run admin list --pending
   bun run admin approve #1       # or: bun run admin approve <id-prefix>
   ```

4. The phone polls once and flips to login. Tap **Login**, complete biometrics, and the controller UI mounts.

## Admin CLI

```
bun run admin list [--pending|--approved|--rejected]
bun run admin approve <id-prefix | #index>
bun run admin reject  <id-prefix>
bun run admin revoke  <id-prefix>
bun run admin clear-sessions --yes
bun run admin clear-all      --yes
```

`approve` accepts `#N` for approving by position in the pending list.

## Protocol

WS messages (phone → server):

```jsonc
{ "type": "scroll", "dx": <number>, "dy": <number> }
{ "type": "pinch",  "delta": <number> }
{ "type": "key",    "key": "RightArrow" | "LeftArrow" }
```

## Scripts

| Command          | What it does                             |
| ---------------- | ---------------------------------------- |
| `bun run dev`    | Start server with `--hot` reload         |
| `bun run start`  | Start server                             |
| `bun run admin`  | Admin CLI (credentials + sessions)       |
| `bun run check`  | Biome lint + format with fixes           |
| `bun run lint`   | Biome lint only                          |
| `bun run format` | Biome format only                        |

## Stack

Bun · TypeScript · Svelte 5 · SQLite (`bun:sqlite`) · `bun:ffi` → CoreGraphics · `@simplewebauthn/*` · Biome.
