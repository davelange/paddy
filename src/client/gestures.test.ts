import { expect, test } from "bun:test";
import {
	MULTI_TAP_MAX_DIST,
	MULTI_TAP_MAX_MS,
	nextClickCount,
	rotateForLandscape,
} from "./gestures";

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

test("nextClickCount: no prior tap → 1", () => {
	expect(nextClickCount(null, { time: 100, x: 0, y: 0 })).toBe(1);
});

test("nextClickCount: within time + distance → prev.count + 1", () => {
	const prev = { time: 0, x: 100, y: 100, count: 1 };
	expect(nextClickCount(prev, { time: 200, x: 103, y: 98 })).toBe(2);
});

test("nextClickCount: outside time window → 1", () => {
	const prev = { time: 0, x: 100, y: 100, count: 1 };
	expect(
		nextClickCount(prev, { time: MULTI_TAP_MAX_MS + 1, x: 100, y: 100 }),
	).toBe(1);
});

test("nextClickCount: outside distance → 1", () => {
	const prev = { time: 0, x: 100, y: 100, count: 1 };
	expect(
		nextClickCount(prev, {
			time: 100,
			x: 100 + MULTI_TAP_MAX_DIST + 1,
			y: 100,
		}),
	).toBe(1);
});

test("nextClickCount: thresholds are inclusive", () => {
	const prev = { time: 0, x: 100, y: 100, count: 1 };
	expect(
		nextClickCount(prev, { time: MULTI_TAP_MAX_MS, x: 100, y: 100 }),
	).toBe(2);
	expect(
		nextClickCount(prev, { time: 0, x: 100 + MULTI_TAP_MAX_DIST, y: 100 }),
	).toBe(2);
});

test("nextClickCount: chain climbs past 2 (triple click)", () => {
	let count = nextClickCount(null, { time: 0, x: 100, y: 100 });
	expect(count).toBe(1);
	count = nextClickCount(
		{ time: 0, x: 100, y: 100, count },
		{ time: 200, x: 100, y: 100 },
	);
	expect(count).toBe(2);
	count = nextClickCount(
		{ time: 200, x: 100, y: 100, count },
		{ time: 400, x: 100, y: 100 },
	);
	expect(count).toBe(3);
});
