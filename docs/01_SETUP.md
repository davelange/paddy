# Paddy — local phone-as-scroll-remote

## Context

Empty project directory. The goal: a Bun-based JS app running locally on macOS that serves a page to a phone on the same LAN. The phone sends input over WebSocket; the host translates it into action events targeting whatever macOS app is currently focused. This plan validates the overall architecture; the control UI and actions are deferred.

## Architecture

Single Bun process, three concerns:

1. **HTTP + WS server** (`Bun.serve` with `websocket` handler) — serves the static phone page and upgrades `/ws` to a WebSocket. Binds `0.0.0.0` on a fixed port (e.g. `8080`).
2. **Phone page** (`public/index.html` + inline JS) — connects to `ws://<lan-ip>:8080/ws`, captures user input (impl TBD), sends JSON messages like `{type:"eventType", dx, dy}`.
3. **macOS event emitter** — on each incoming message, synthesize a scroll event via `bun:ffi` → CoreGraphics and post it to the frontmost app. For initial implementation, simply log message.

On startup the process:

- Detects the LAN IP (`os.networkInterfaces()`, pick first non-internal IPv4).
- Prints the URL and a terminal QR code (`qrcode-terminal` or similar) for the phone to scan.

## Message protocol (v0)

```
{ "type": "test" }
```

Server logs message.

## File layout

```
paddy/
  package.json
  server.ts        # Bun.serve + WS glue
  net.ts           # getLanIp(), printQr()
  public/
    index.html     # phone UI (stub for now)
```

## Critical files to create

- `/Users/davelange/Work/stroll/server.ts`
- `/Users/davelange/Work/stroll/net.ts`
- `/Users/davelange/Work/stroll/public/index.html`
- `/Users/davelange/Work/stroll/package.json`

## Dependencies

- Runtime: Bun (built-in HTTP/WS, `bun:ffi`).
- npm: `qrcode-terminal` (QR in stdout).
- System: none — CoreGraphics + CoreFoundation ship with macOS.

## Verification

1. `bun run server.ts` — prints LAN URL + QR, listens on `:8080`.
2. From desktop browser, open the URL — page loads, WS connects (check console).
3. From phone on same Wi-Fi, scan QR — page loads, WS connects.
4. Kill server, confirm clean shutdown (no orphaned sockets).
