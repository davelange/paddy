# Controller device page

## Context

`public/index.html` is currently a stub ("Stroll" title + bare WS connect that sends one `{type:"test"}`). We're replacing it with the real phone-side controller: auto-connect to the WS server, capture finger drags, rotate them 90° (phone used in portrait but scrolls a landscape target), throttle, and ship as motion messages. Server-side message handling and event synthesis are out of scope — `server.ts` already logs whatever arrives.

## Approach

Rewrite `public/index.html` as a single self-contained page. Keep it plain — one `<h1>paddy</h1>` centered, plus a tiny status line that only surfaces when the WS connection fails. No frameworks, no build step; inline `<script>` is fine.

### Connection

- On load, open `ws://${location.host}/ws`.
- `onerror` / `onclose` before `onopen` → show "connection failed" (small, muted, under the title). Otherwise show nothing.
- No reconnect loop — user asked for "no frills". They can refresh.

### Input capture

- Listen for `pointermove` on the document (covers touch + mouse; works in desktop browser for testing).
- Track only while a pointer is down: `pointerdown` sets a flag + last x/y, `pointerup`/`pointercancel` clears it.
- On each move while down: compute raw `dx = e.clientX - lastX`, `dy = e.clientY - lastY`, update last x/y.

### Portrait → landscape rotation

Mapping requested: finger-up = scroll-left, finger-right = scroll-up, finger-down = scroll-right, finger-left = scroll-down. That's a 90° rotation:

```
outDx =  rawDy
outDy = -rawDx
```

Quick check: finger up (rawDy < 0) → outDx < 0 (left) ✓. Finger right (rawDx > 0) → outDy < 0 (up) ✓.

### Throttling

Accumulate `outDx`/`outDy` between flushes. Flush on `requestAnimationFrame` — at most one WS send per frame (~16ms @ 60Hz). Skip the send if both accumulators are 0. Reset accumulators after send. rAF naturally pauses when the tab is hidden, which is the behavior we want.

### Wire format

Extend v0 protocol with a move message (server already JSON-parses + logs, so no server change needed):

```json
{ "type": "move", "dx": <number>, "dy": <number> }
```

Only send when the socket is `OPEN`; drop silently otherwise.

## Files

- **Modify:** `public/index.html` — full rewrite of body + script, keep the viewport meta and dark styling.

No other files change. `server.ts` already handles arbitrary JSON messages (server.ts:28-33).

## Verification

1. `bun run server.ts` — server prints LAN URL + QR.
2. Desktop browser at that URL: shows "paddy" centered; DevTools Network → WS frame inspector shows `{type:"move", dx, dy}` messages flowing while dragging the mouse with button held, at most one per frame. Server terminal logs them.
3. Drag check (desktop): drag right → `dy` negative; drag up → `dx` negative; drag down → `dx` positive; drag left → `dy` positive.
4. Phone on same Wi-Fi (portrait): scan QR, drag finger, confirm server logs show motion.
5. Failure path: stop the server before loading the page → "connection failed" text appears; no other UI noise.
