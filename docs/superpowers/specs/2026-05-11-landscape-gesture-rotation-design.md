# Landscape gesture rotation

## Context

The controller page (`src/client/Controller.svelte` + `src/client/gestures.ts`) is held by the user in **landscape**, but the page itself does not rotate — the browser viewport stays in portrait. That means pointer events deliver `clientX`/`clientY` in the phone's portrait coordinate system, while the user expects gestures to map to the desktop as if they were drawing in landscape.

The original spec (`docs/02_Controller.md`) called for this 90° rotation, but the current code emits raw pointer deltas straight through to the server. Everything works on a phone whose browser auto-rotates with the device, but breaks for the intended use case (portrait-locked page / OS-locked portrait).

## Goal

Apply a fixed 90° rotation to gesture deltas on the **client** so the server continues to receive plain desktop-aligned `dx`/`dy`. No server changes. No orientation detection — we always assume landscape, home button to the right.

## Mapping

```
outDx =  rawDy
outDy = -rawDx
```

This is a CW 90° rotation of the input vector, which inverts the user's CCW 90° rotation of the phone (home button to the right). Net effect: the user's gesture in their landscape view maps to the desktop cursor moving in the matching direction.

- finger right (user view) → cursor right
- finger up (user view) → cursor up
- finger left (user view) → cursor left
- finger down (user view) → cursor down

Worked example, user swipes up: phone's top edge is now on the user's *left*, so a finger going toward the user's top moves toward `+clientX` (`rawDx > 0`). Formula gives `outDy = -rawDx < 0`, i.e. negative desktop Y, i.e. cursor up. ✓

## Scope of the rotation

Applies to anything carrying a 2D delta in user-perceived axes:

- `onMove` — single-finger pointer drag (cursor move).
- `onScroll` — two-finger scroll, including the momentum frames produced after release.

Does **not** apply to:

- `onPinch` — scalar distance delta, direction-invariant.
- `onClick` — buttons have no spatial axis.
- Server (`handlers.ts`, `emit.ts`) — receives already-rotated values; treats them as desktop axes.

## Where the change lives

Inside `GestureManager` (`src/client/gestures.ts`). The class already owns gesture semantics (single-finger vs two-finger vs pinch decision) and runs the momentum loop, so the rotation belongs at the emit points there. Putting it in `Controller.svelte` or `ws.ts` would force those layers to know which message types carry coords and to re-rotate the momentum velocity separately.

Concretely:

- Add two private helpers on `GestureManager`:
  - `emitMove({ x, y })` → calls `this.onMove({ x: y, y: -x })`
  - `emitScroll({ x, y })` → calls `this.onScroll({ x: y, y: -x })`
- Replace the three current emit sites with the helpers:
  - `handleMove` (single-finger branch) — currently calls `this.onMove({ x: dx * MOUSE_SENSITIVITY, y: dy * MOUSE_SENSITIVITY })`.
  - `handleTwoFingerMove` (scroll branch) — currently calls `this.onScroll({ x: dCx, y: dCy })`.
  - `startMomentum`'s rAF step — currently calls `this.onScroll({ x: this.velocity.x * FRAME_MS, y: this.velocity.y * FRAME_MS })`.

Velocity stays stored in pre-rotation (browser) coords. Rotating once per emit keeps live drag and momentum consistent and avoids rotating accumulators twice.

## Non-goals

- Detecting orientation or supporting portrait use.
- Locking the page orientation via `screen.orientation.lock` or CSS.
- Making the rotation direction user-configurable (home button left vs right). Hardcoded to home-button-right; revisit if needed.
- Any sensitivity or unit changes — `MOUSE_SENSITIVITY` and smoothing constants stay as they are.

## Verification

1. With the controller page open on a phone held in landscape, home button to the right:
   - Single finger swipe right → desktop cursor moves right; up → up; etc. (each axis on the phone maps to the matching axis on the desktop).
   - Two finger swipe up (user view) → page scrolls in the same direction it would if the user had scrolled up on a desktop trackpad.
   - Pinch in/out → zoom in/out (unchanged).
   - Tap → left click; two-finger tap → right click (unchanged).
2. After releasing a fast two-finger scroll, momentum continues in the same user-perceived direction (not the pre-rotation direction).
3. Server logs/behavior unchanged: `handlers.ts` still receives `{ type, dx, dy }` and `emit.ts` still treats them as desktop axes.
