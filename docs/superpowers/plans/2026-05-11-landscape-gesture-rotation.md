# Landscape Gesture Rotation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply a fixed CW 90° rotation to 2D gesture deltas (mouse-move + scroll, including momentum) on the client so the user can hold the phone in landscape (home button right) with the page rendered portrait. Server unchanged.

**Architecture:** Add a pure `rotateForLandscape({x, y}) → {x: y, y: -x}` helper at the top of `src/client/gestures.ts`. Wrap every existing `onMove`/`onScroll` emit site (3 sites) so the callbacks receive already-rotated, desktop-aligned deltas. Pinch and clicks are untouched. Momentum velocity stays stored in pre-rotation (browser) coords; the rotation is applied per emit, so live drag and momentum stay consistent.

**Tech Stack:** Bun, TypeScript, `bun:test`. Single file changes: `src/client/gestures.ts` plus a new test file `src/client/gestures.test.ts`.

**Spec:** `docs/superpowers/specs/2026-05-11-landscape-gesture-rotation-design.md`

---

## Pre-task: confirm test runner

- [ ] **Step 0.1: Verify `bun test` runs from the repo root**

Run:
```bash
bun test --bail
```
Expected: command resolves (likely "0 tests, 0 passes" since no tests exist yet). If `bun test` errors out due to a missing config, stop and surface the error — do not attempt to add `vitest`/`jest`. Per `CLAUDE.md`, use `bun test`.

---

## Task 1: Pure rotation helper, test-first

**Files:**
- Create: `src/client/gestures.test.ts`
- Modify: `src/client/gestures.ts` (add helper near the top of the file, before the `GestureManager` class)

The helper is a top-level export so it's directly testable without instantiating `GestureManager` (which subscribes to DOM events in its constructor — not test-friendly).

- [ ] **Step 1.1: Write the failing test**

Create `src/client/gestures.test.ts` with the full file contents:

```ts
import { expect, test } from "bun:test";
import { rotateForLandscape } from "./gestures";

// Phone is held in landscape, home button to the right.
// User's view "right" = phone's +clientY direction.
// User's view "up"    = phone's +clientX direction.
// We rotate the raw browser-frame delta by CW 90° so the
// emitted vector is aligned with desktop screen axes
// (desktop +x = right, desktop +y = down).

test("user-right swipe (rawDy > 0) maps to desktop right", () => {
	expect(rotateForLandscape({ x: 0, y: 5 })).toEqual({ x: 5, y: 0 });
});

test("user-left swipe (rawDy < 0) maps to desktop left", () => {
	expect(rotateForLandscape({ x: 0, y: -5 })).toEqual({ x: -5, y: 0 });
});

test("user-up swipe (rawDx > 0) maps to desktop up", () => {
	expect(rotateForLandscape({ x: 5, y: 0 })).toEqual({ x: 0, y: -5 });
});

test("user-down swipe (rawDx < 0) maps to desktop down", () => {
	expect(rotateForLandscape({ x: -5, y: 0 })).toEqual({ x: 0, y: 5 });
});

test("diagonal: user up-and-right (rawDx>0, rawDy>0) maps to desktop up-and-right", () => {
	expect(rotateForLandscape({ x: 3, y: 4 })).toEqual({ x: 4, y: -3 });
});

test("zero in, zero out", () => {
	expect(rotateForLandscape({ x: 0, y: 0 })).toEqual({ x: 0, y: 0 });
});

test("preserves fractional values (used by momentum velocity)", () => {
	expect(rotateForLandscape({ x: 0.5, y: -1.25 })).toEqual({
		x: -1.25,
		y: -0.5,
	});
});
```

- [ ] **Step 1.2: Run the test and verify it fails**

Run:
```bash
bun test src/client/gestures.test.ts
```
Expected: FAIL with "rotateForLandscape is not exported" (or a TS resolution error). The import target doesn't exist yet — that's the point.

- [ ] **Step 1.3: Add the helper to `gestures.ts`**

In `src/client/gestures.ts`, immediately after the `Options` type declaration (currently around line 19) and before the existing constants (`VELOCITY_SMOOTHING`, etc., around line 21), insert:

```ts
/**
 * CW 90° rotation of an input delta. Used because the user holds the phone in
 * landscape (home button to the right) while the page is rendered in portrait,
 * so raw pointer deltas live in the phone's portrait frame and need to be
 * mapped back to the user's landscape frame (= desktop screen axes).
 */
export function rotateForLandscape({ x, y }: Coord): Coord {
	return { x: y, y: -x };
}
```

Do not change `Coord`, `Options`, `TouchTrack`, or any existing constant. Do not yet wire the helper into `GestureManager` — that's Task 2.

- [ ] **Step 1.4: Run the test and verify it passes**

Run:
```bash
bun test src/client/gestures.test.ts
```
Expected: PASS, 7 tests.

- [ ] **Step 1.5: Lint and format**

Run:
```bash
bun run check
```
Expected: no errors. Biome may auto-format the new file/edits; that's fine.

- [ ] **Step 1.6: Commit**

```bash
git add src/client/gestures.ts src/client/gestures.test.ts
git commit -m "$(cat <<'EOF'
add rotateForLandscape helper

Pure function that CW-rotates a 2D delta 90° so phone-portrait pointer
deltas map to user-landscape (desktop screen) axes. Not yet wired into
GestureManager.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Apply the rotation at every `onMove` / `onScroll` emit site

**Files:**
- Modify: `src/client/gestures.ts`

There are exactly three emit sites today:

| Site | Method | Current line range (approx) | What it emits |
|------|--------|-----------------------------|---------------|
| A | `handleMove` (single-finger branch) | ~158–163 | `this.onMove({ x: dx * MOUSE_SENSITIVITY, y: dy * MOUSE_SENSITIVITY })` |
| B | `handleTwoFingerMove` (scroll branch) | ~203–207 | `this.onScroll({ x: dCx, y: dCy })` |
| C | `startMomentum` rAF step | ~228–231 | `this.onScroll({ x: this.velocity.x * FRAME_MS, y: this.velocity.y * FRAME_MS })` |

Velocity (`this.velocity`) continues to be stored in pre-rotation (browser) coords — do **not** rotate at storage time. Rotation happens once per emit so that smoothing/momentum math stays correct without a second inverse transform.

Pinch (`this.onPinch(...)`) and the velocity update at site B's tail (`this.velocity.x = s * (dCx / dt) + ...`) must remain in pre-rotation coords. Do not touch them.

- [ ] **Step 2.1: Wrap emit site A (single-finger move) in `handleMove`**

In `src/client/gestures.ts`, find the existing block inside `handleMove`:

```ts
		if (this.pointers.size === 1) {
			this.onMove({
				x: dx * MOUSE_SENSITIVITY,
				y: dy * MOUSE_SENSITIVITY,
			});
			return;
		}
```

Replace it with:

```ts
		if (this.pointers.size === 1) {
			this.onMove(
				rotateForLandscape({
					x: dx * MOUSE_SENSITIVITY,
					y: dy * MOUSE_SENSITIVITY,
				}),
			);
			return;
		}
```

- [ ] **Step 2.2: Wrap emit site B (live two-finger scroll) in `handleTwoFingerMove`**

Find the scroll branch:

```ts
		if (this.twoFingerMode === "scroll") {
			this.onScroll({ x: dCx, y: dCy });
			const s = VELOCITY_SMOOTHING;
			this.velocity.x = s * (dCx / dt) + (1 - s) * this.velocity.x;
			this.velocity.y = s * (dCy / dt) + (1 - s) * this.velocity.y;
		} else {
```

Replace **only the `onScroll` line** (leave the velocity smoothing lines exactly as they are — those operate in pre-rotation coords):

```ts
		if (this.twoFingerMode === "scroll") {
			this.onScroll(rotateForLandscape({ x: dCx, y: dCy }));
			const s = VELOCITY_SMOOTHING;
			this.velocity.x = s * (dCx / dt) + (1 - s) * this.velocity.x;
			this.velocity.y = s * (dCy / dt) + (1 - s) * this.velocity.y;
		} else {
```

- [ ] **Step 2.3: Wrap emit site C (momentum step) in `startMomentum`**

Find the rAF step:

```ts
			this.onScroll({
				x: this.velocity.x * FRAME_MS,
				y: this.velocity.y * FRAME_MS,
			});
```

Replace with:

```ts
			this.onScroll(
				rotateForLandscape({
					x: this.velocity.x * FRAME_MS,
					y: this.velocity.y * FRAME_MS,
				}),
			);
```

- [ ] **Step 2.4: Sanity grep — confirm there are no remaining un-rotated emit sites**

Run:
```bash
grep -nE "this\.(onMove|onScroll)\(" src/client/gestures.ts
```
Expected: every match should be wrapped in `rotateForLandscape(...)`. There should be three matches in total, all wrapped. If you see a bare `this.onMove({` or `this.onScroll({` without `rotateForLandscape`, you missed a site — fix it.

- [ ] **Step 2.5: Confirm pinch and clicks are untouched**

Run:
```bash
grep -nE "this\.(onPinch|onClick)\(" src/client/gestures.ts
```
Expected: `onPinch` invoked once inside `handleTwoFingerMove`, `onClick` invoked once inside `handleUp`. Neither should be wrapped.

- [ ] **Step 2.6: Re-run the helper tests (should still pass — we only modified callers)**

Run:
```bash
bun test src/client/gestures.test.ts
```
Expected: PASS, 7 tests.

- [ ] **Step 2.7: Lint and format**

Run:
```bash
bun run check
```
Expected: no errors.

- [ ] **Step 2.8: Commit**

```bash
git add src/client/gestures.ts
git commit -m "$(cat <<'EOF'
rotate gesture emits for landscape

Apply rotateForLandscape at the three onMove/onScroll emit sites
(live single-finger move, live two-finger scroll, scroll momentum).
Velocity remains stored in pre-rotation coords; rotation happens
per emit so smoothing/momentum math is unaffected. Pinch and clicks
unchanged.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Manual device verification

No automated test exercises the DOM. This task is human-in-the-loop only; do not mark complete based on type-checks alone.

**Files:** none changed.

- [ ] **Step 3.1: Start the dev server**

Run:
```bash
bun run dev
```
The server prints a LAN URL + QR code (see `src/server/network.ts`).

- [ ] **Step 3.2: Open the controller on a phone, held in landscape with home button to the right**

The phone's OS or app should keep the page rendered in portrait (browser auto-rotation off, or page locked to portrait at the device level). If the page rotates with the phone, the rotation in code will double-apply and gestures will feel wrong — report this back rather than "fixing" the rotation direction.

- [ ] **Step 3.3: Verify single-finger cursor mapping**

Drag one finger:
- right (user view) → cursor moves right
- up (user view) → cursor moves up
- left (user view) → cursor moves left
- down (user view) → cursor moves down

If any axis is inverted, the rotation direction is wrong — flag it.

- [ ] **Step 3.4: Verify two-finger scroll mapping**

Two-finger swipe:
- right (user view) → page scrolls in the same direction a desktop trackpad's right-swipe would
- up (user view) → page scrolls as a desktop up-swipe would
- (and the other two axes by symmetry)

- [ ] **Step 3.5: Verify scroll momentum keeps the user-perceived direction**

Two-finger flick up (user view) and lift fingers. The momentum tail should continue scrolling in the same direction the live swipe was scrolling — not rotate again at release.

- [ ] **Step 3.6: Verify pinch and clicks are unchanged**

- Pinch out → zoom in. Pinch in → zoom out.
- Quick tap → left click.
- Quick two-finger tap → right click.

- [ ] **Step 3.7: Tear down**

Stop the dev server (Ctrl-C). No commit on this task — verification only.

---

## Out of scope (do not implement)

- Orientation detection / portrait fallback / UI overlay.
- `screen.orientation.lock()` or CSS-based orientation locking.
- A user-configurable rotation direction (home button left vs right).
- Server-side changes in `src/server/handlers.ts` or `src/server/emit.ts`.
- Changes to `src/client/Controller.svelte`, `src/client/ws.ts`, or anywhere else outside `src/client/gestures.ts` and its test.
