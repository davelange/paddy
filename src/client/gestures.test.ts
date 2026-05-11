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
