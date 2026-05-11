import { dlopen, FFIType, type Pointer, ptr } from "bun:ffi";

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
		// CGPoint (2 doubles) passes in d0/d1 (ARM64 HFA) or xmm0/xmm1 (x86_64
		// SysV) — declaring it as two f64 args matches the ABI on both archs.
		CGEventCreateMouseEvent: {
			args: [FFIType.ptr, FFIType.u32, FFIType.f64, FFIType.f64, FFIType.u32],
			returns: FFIType.ptr,
		},
		CGMainDisplayID: {
			args: [],
			returns: FFIType.u32,
		},
		CGDisplayPixelsWide: {
			args: [FFIType.u32],
			returns: FFIType.u64,
		},
		CGDisplayPixelsHigh: {
			args: [FFIType.u32],
			returns: FFIType.u64,
		},
		CGGetActiveDisplayList: {
			args: [FFIType.u32, FFIType.ptr, FFIType.ptr],
			returns: FFIType.u32,
		},
		CGWarpMouseCursorPosition: {
			args: [FFIType.f64, FFIType.f64],
			returns: FFIType.u32,
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

const kCGEventLeftMouseDown = 1;
const kCGEventLeftMouseUp = 2;
const kCGEventRightMouseDown = 3;
const kCGEventRightMouseUp = 4;
const kCGEventMouseMoved = 5;
const kCGEventLeftMouseDragged = 6;
const kCGEventRightMouseDragged = 7;

const kCGMouseButtonLeft = 0;
const kCGMouseButtonRight = 1;
const kCGMouseEventClickState = 14;

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

let cursorX: number | null = null;
let cursorY: number | null = null;
// Generous bounding box covering all plausible display arrangements (external
// monitors to the left at negative x, above at negative y, etc). Computed from
// the union of display sizes — we can't read display origins via bun:ffi
// because CGDisplayBounds returns a CGRect by value.
let minX = 0;
let minY = 0;
let maxX = 0;
let maxY = 0;
let leftDown = false;
let rightDown = false;

function ensureCursorInit() {
	if (cursorX !== null) return;

	const ids = new Uint32Array(16);
	const countBuf = new Uint32Array(1);
	lib.symbols.CGGetActiveDisplayList(ids.length, ptr(ids), ptr(countBuf));

	let totalW = 0;
	let maxDisplayH = 0;
	const count = countBuf[0] ?? 0;
	for (let i = 0; i < count; i++) {
		const id = ids[i] as number;
		totalW += Number(lib.symbols.CGDisplayPixelsWide(id));
		maxDisplayH = Math.max(
			maxDisplayH,
			Number(lib.symbols.CGDisplayPixelsHigh(id)),
		);
	}

	minX = -totalW;
	maxX = 2 * totalW;
	minY = -maxDisplayH;
	maxY = 2 * maxDisplayH;

	const mainId = lib.symbols.CGMainDisplayID();
	const mainW = Number(lib.symbols.CGDisplayPixelsWide(mainId));
	const mainH = Number(lib.symbols.CGDisplayPixelsHigh(mainId));
	cursorX = mainW / 2;
	cursorY = mainH / 2;
	// Anchor the OS cursor to our tracker so subsequent moves are consistent.
	lib.symbols.CGWarpMouseCursorPosition(cursorX, cursorY);
}

function clamp(v: number, lo: number, hi: number): number {
	return v < lo ? lo : v > hi ? hi : v;
}

export function createMouseMoveEvent(dx: number, dy: number) {
	ensureCursorInit();
	cursorX = clamp((cursorX as number) + dx, minX, maxX);
	cursorY = clamp((cursorY as number) + dy, minY, maxY);

	const type = leftDown
		? kCGEventLeftMouseDragged
		: rightDown
			? kCGEventRightMouseDragged
			: kCGEventMouseMoved;
	const button = rightDown ? kCGMouseButtonRight : kCGMouseButtonLeft;

	withEvent(
		() =>
			lib.symbols.CGEventCreateMouseEvent(
				null,
				type,
				cursorX as number,
				cursorY as number,
				button,
			),
		(event) => {
			lib.symbols.CGEventSetFlags(event, NO_FLAGS);
		},
	);
}

export function createMouseButtonEvent(
	button: "left" | "right",
	action: "down" | "up",
) {
	ensureCursorInit();
	const isLeft = button === "left";
	const type =
		action === "down"
			? isLeft
				? kCGEventLeftMouseDown
				: kCGEventRightMouseDown
			: isLeft
				? kCGEventLeftMouseUp
				: kCGEventRightMouseUp;
	const btn = isLeft ? kCGMouseButtonLeft : kCGMouseButtonRight;

	withEvent(
		() =>
			lib.symbols.CGEventCreateMouseEvent(
				null,
				type,
				cursorX as number,
				cursorY as number,
				btn,
			),
		(event) => {
			lib.symbols.CGEventSetIntegerValueField(
				event,
				kCGMouseEventClickState,
				1,
			);
			lib.symbols.CGEventSetFlags(event, NO_FLAGS);
		},
	);

	if (isLeft) leftDown = action === "down";
	else rightDown = action === "down";
}

export function createMouseClickEvent(button: "left" | "right") {
	createMouseButtonEvent(button, "down");
	createMouseButtonEvent(button, "up");
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
