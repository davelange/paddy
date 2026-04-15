import { dlopen, FFIType } from "bun:ffi";

const lib = dlopen(
	"/System/Library/Frameworks/CoreGraphics.framework/CoreGraphics",
	{
		// Constructor
		CGEventCreateScrollWheelEvent: {
			args: [FFIType.ptr, FFIType.u32, FFIType.u32, FFIType.i32],
			returns: FFIType.ptr,
		},
		CGEventCreateKeyboardEvent: {
			args: [FFIType.ptr, FFIType.u16, FFIType.bool],
			returns: FFIType.ptr,
		},
		// Set Integer Fields (e.g., for the "Continuous" flag)
		CGEventSetIntegerValueField: {
			args: [FFIType.ptr, FFIType.u32, FFIType.i64],
			returns: FFIType.void,
		},
		// Set Double Fields (e.g., for high-precision fractional deltas)
		CGEventSetDoubleValueField: {
			args: [FFIType.ptr, FFIType.u32, FFIType.f64],
			returns: FFIType.void,
		},
		CGEventPost: {
			args: [FFIType.u32, FFIType.ptr],
			returns: FFIType.void,
		},
		CGEventSetFlags: {
			args: [FFIType.ptr, FFIType.u64],
			returns: FFIType.void,
		},
		CFRelease: {
			args: [FFIType.ptr],
			returns: FFIType.void,
		},
	},
);

/**
 * Constants for CGEventField
 */
const kCGScrollWheelEventIsContinuous = 91;
const kCGScrollWheelEventDeltaAxis1 = 96; // Vertical integer delta
const kCGScrollWheelEventDeltaAxis2 = 97; // Horizontal integer delta
const kCGScrollWheelEventFixedPtDeltaAxis1 = 93; // Vertical high-precision
const kCGScrollWheelEventFixedPtDeltaAxis2 = 94; // Horizontal high-precision

const kCGScrollEventUnitPixel = 0;
const kCGHIDEventTap = 0;
const kCGEventFlagMaskCommand = 0x100000;

export function createScrollEvent(dy: number, dx: number) {
	// 1. Create a base scroll event (we use 0 for the initial delta)
	const event = lib.symbols.CGEventCreateScrollWheelEvent(
		null,
		kCGScrollEventUnitPixel,
		1, // We'll manually add the second axis via fields
		0,
	);

	if (!event) {
		console.error("Failed to create scroll event");
	}

	// 2. Mark the event as continuous (trackpad-style)
	lib.symbols.CGEventSetIntegerValueField(
		event,
		kCGScrollWheelEventIsContinuous,
		1,
	);

	// 3. Set the integer deltas (The system still expects these as "rough" guides)
	lib.symbols.CGEventSetIntegerValueField(
		event,
		kCGScrollWheelEventDeltaAxis1,
		Math.round(dy),
	);
	lib.symbols.CGEventSetIntegerValueField(
		event,
		kCGScrollWheelEventDeltaAxis2,
		Math.round(dx),
	);

	// 4. Set high-precision "Fixed Point" deltas
	// These allow for fractional movement (e.g., 0.25 pixels)
	lib.symbols.CGEventSetDoubleValueField(
		event,
		kCGScrollWheelEventFixedPtDeltaAxis1,
		dy,
	);
	lib.symbols.CGEventSetDoubleValueField(
		event,
		kCGScrollWheelEventFixedPtDeltaAxis2,
		dx,
	);

	// 5. Ensure no modifier flags leak in from current keyboard state
	lib.symbols.CGEventSetFlags(event, 0n);

	// 6. Post and Release
	lib.symbols.CGEventPost(kCGHIDEventTap, event);
	lib.symbols.CFRelease(event);
}

export const kVK_LeftArrow = 0x7b;
export const kVK_RightArrow = 0x7c;

export function createKeyEvent(keyCode: number) {
	for (const isDown of [true, false]) {
		const event = lib.symbols.CGEventCreateKeyboardEvent(null, keyCode, isDown);
		if (!event) {
			console.error("Failed to create key event");
			return;
		}
		lib.symbols.CGEventSetFlags(event, 0n);
		lib.symbols.CGEventPost(kCGHIDEventTap, event);
		lib.symbols.CFRelease(event);
	}
}

export function createZoomEvent(delta: number) {
	const event = lib.symbols.CGEventCreateScrollWheelEvent(
		null,
		kCGScrollEventUnitPixel,
		1,
		0,
	);

	if (!event) {
		console.error("Failed to create zoom event");
		return;
	}

	lib.symbols.CGEventSetIntegerValueField(
		event,
		kCGScrollWheelEventIsContinuous,
		1,
	);
	lib.symbols.CGEventSetIntegerValueField(
		event,
		kCGScrollWheelEventDeltaAxis1,
		Math.round(delta),
	);
	lib.symbols.CGEventSetDoubleValueField(
		event,
		kCGScrollWheelEventFixedPtDeltaAxis1,
		delta,
	);
	lib.symbols.CGEventSetFlags(event, BigInt(kCGEventFlagMaskCommand));
	lib.symbols.CGEventPost(kCGHIDEventTap, event);
	lib.symbols.CFRelease(event);
}
