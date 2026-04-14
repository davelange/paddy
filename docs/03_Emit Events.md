# Plan: emit scroll FFI events from WS messages

## Context

The WS server in `server.ts` currently parses incoming JSON messages and logs them. The spec (`docs/01_SETUP.md`) calls for the server to synthesize real macOS scroll events and post them to the frontmost app when the phone sends scroll intent over WebSocket. This plan wires that path end-to-end via `bun:ffi` → CoreGraphics.

No FFI code exists yet. The phone page only sends a handshake `{type:"test"}`.

## Approach

### 1. New file: `emit.ts`

Loads CoreGraphics + CoreFoundation via `bun:ffi` and exposes `postScroll(dy, dx)`.

Key decisions:

- `CGEventCreateScrollWheelEvent` is varargs in C. Declare a **fixed 2-wheel signature** `(source: ptr, units: u32, wheelCount: u32, wheel1: i32, wheel2: i32) → ptr`. Empirically reliable on arm64/x86_64.
- **Units: `kCGScrollEventUnitLine` (1)** — line deltas map to app scrolling cleanly without calibration; pixels need much larger magnitudes.
- **Tap: `kCGHIDEventTap` (0)** — system-wide, frontmost app receives naturally. No need to detect frontmost.
- Pass `null` for event source.
- `CFRelease` the event after `CGEventPost` to avoid leaks.
- Sign convention: `+dy` = scroll up (natural).

```ts
import { dlopen, FFIType } from "bun:ffi";

const CG_PATH =
  "/System/Library/Frameworks/CoreGraphics.framework/CoreGraphics";
const CF_PATH =
  "/System/Library/Frameworks/CoreFoundation.framework/CoreFoundation";

const { symbols: cg } = dlopen(CG_PATH, {
  CGEventCreateScrollWheelEvent: {
    args: [FFIType.ptr, FFIType.u32, FFIType.u32, FFIType.i32, FFIType.i32],
    returns: FFIType.ptr,
  },
  CGEventPost: { args: [FFIType.u32, FFIType.ptr], returns: FFIType.void },
});
const { symbols: cf } = dlopen(CF_PATH, {
  CFRelease: { args: [FFIType.ptr], returns: FFIType.void },
});

export function postScroll(dy: number, dx: number) {
  const ev = cg.CGEventCreateScrollWheelEvent(null, 1, 2, dy | 0, dx | 0);
  if (!ev) return;
  cg.CGEventPost(0, ev);
  cf.CFRelease(ev);
}
```

### 2. Modify `server.ts` message handler (lines 27-34)

Extend protocol: `{type: "scroll", dx: number, dy: number}`. Validate, coerce to int32, drop zero-delta no-ops.

```ts
import { postScroll } from "./emit";
// ...
message(ws, raw) {
  try {
    const msg = JSON.parse(typeof raw === "string" ? raw : raw.toString());
    if (msg.type === "scroll") {
      const dx = Number.isFinite(msg.dx) ? (msg.dx | 0) : 0;
      const dy = Number.isFinite(msg.dy) ? (msg.dy | 0) : 0;
      if (dx || dy) postScroll(dy, dx);
    }
  } catch (e) { console.log("bad msg:", e); }
},
```

### 3. Document accessibility permission in `docs/01_SETUP.md`

macOS silently drops synthesized events from processes lacking Accessibility permission. Add a note: grant Terminal (or whichever app runs `bun`) Accessibility access in System Settings → Privacy & Security → Accessibility, then relaunch.

## Critical files

- `/Users/davelange/Work/paddy/.worktrees/emit-events/emit.ts` (new)
- `/Users/davelange/Work/paddy/.worktrees/emit-events/server.ts` (modify message handler + import)
- `/Users/davelange/Work/paddy/.worktrees/emit-events/public/index.html` (touch pad)
- `/Users/davelange/Work/paddy/.worktrees/emit-events/docs/01_SETUP.md` (accessibility note)

## Risks

- **Accessibility permission**: first run will appear broken if not granted. Document clearly.
- **Fixed-arity varargs binding**: relies on Cocoa ABI stability. Empirically stable, but note as fragility. Fallback: tiny Swift helper invoked via `Bun.spawn` (heavier, deferred).
- **No throttle on touchmove**: fine on LAN; add rAF coalescing later if needed.

## Verification

1. `bun run server.ts` — prints LAN URL + QR, listens on :8080.
2. Grant Accessibility permission to Terminal/Bun; relaunch server.
3. Open a scrollable app (Safari, Finder list view) and keep it frontmost.
4. On phone, scan QR → swipe on pad → frontmost app scrolls in real time.
5. Sanity-check with a WS client: send `{"type":"scroll","dx":0,"dy":3}` → frontmost app scrolls up 3 lines.
6. Ctrl-C server — clean shutdown, no orphaned sockets.
