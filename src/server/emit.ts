import { dlopen, FFIType, type Pointer } from "bun:ffi";

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

const NO_FLAGS = 0n;
const CMD_FLAG = BigInt(kCGEventFlagMaskCommand);

function withEvent(
	create: () => Pointer | null,
	configure: (event: Pointer) => void,
): void {
	const event = create();
	if (!event) {
		console.error("Failed to create CGEvent");
		return;
	}
	try {
		configure(event);
		lib.symbols.CGEventPost(kCGHIDEventTap, event);
	} finally {
		lib.symbols.CFRelease(event);
	}
}

/* 
	1. Create event
	2. Configure params
	3. Post event
	4. Release
*/

export function createScrollEvent(dy: number, dx: number) {
	withEvent(
		() =>
			lib.symbols.CGEventCreateScrollWheelEvent(
				null,
				kCGScrollEventUnitPixel,
				1,
				0,
			),
		(event) => {
			lib.symbols.CGEventSetIntegerValueField(
				event,
				kCGScrollWheelEventIsContinuous,
				1,
			);
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
			lib.symbols.CGEventSetFlags(event, NO_FLAGS);
		},
	);
}

export const kVK_LeftArrow = 0x7b;
export const kVK_RightArrow = 0x7c;

export function createKeyEvent(keyCode: number) {
	for (const isDown of [true, false]) {
		withEvent(
			() => lib.symbols.CGEventCreateKeyboardEvent(null, keyCode, isDown),
			(event) => {
				lib.symbols.CGEventSetFlags(event, NO_FLAGS);
			},
		);
	}
}

export function createZoomEvent(delta: number) {
	withEvent(
		() =>
			lib.symbols.CGEventCreateScrollWheelEvent(
				null,
				kCGScrollEventUnitPixel,
				1,
				0,
			),
		(event) => {
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
			lib.symbols.CGEventSetFlags(event, CMD_FLAG);
		},
	);
}

export function unloadFFI() {
	lib.close();
}
