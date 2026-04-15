import { dlopen, FFIType } from "bun:ffi";

const lib = dlopen("/System/Library/Frameworks/CoreGraphics.framework/CoreGraphics", {
  // Constructor
  CGEventCreateScrollWheelEvent: {
    args: [FFIType.ptr, FFIType.u32, FFIType.u32, FFIType.i32],
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
  CFRelease: {
    args: [FFIType.ptr],
    returns: FFIType.void,
  }
});

/**
 * Constants for CGEventField
 */
const kCGScrollWheelEventIsContinuous = 91;
const kCGScrollWheelEventDeltaAxis1   = 96; // Vertical integer delta
const kCGScrollWheelEventDeltaAxis2   = 97; // Horizontal integer delta
const kCGScrollWheelEventFixedPtDeltaAxis1 = 93; // Vertical high-precision
const kCGScrollWheelEventFixedPtDeltaAxis2 = 94; // Horizontal high-precision

const kCGScrollEventUnitPixel = 0;
const kCGHIDEventTap = 0;

export function createScrollEvent(dy: number, dx: number) {
  // 1. Create a base scroll event (we use 0 for the initial delta)
  const event = lib.symbols.CGEventCreateScrollWheelEvent(
    null, 
    kCGScrollEventUnitPixel, 
    1, // We'll manually add the second axis via fields
    0
  );

  if (!event) {
    console.error("Failed to create scroll event")
  }

  // 2. Mark the event as continuous (trackpad-style)
  lib.symbols.CGEventSetIntegerValueField(event, kCGScrollWheelEventIsContinuous, 1);

  // 3. Set the integer deltas (The system still expects these as "rough" guides)
  lib.symbols.CGEventSetIntegerValueField(event, kCGScrollWheelEventDeltaAxis1, Math.round(dy));
  lib.symbols.CGEventSetIntegerValueField(event, kCGScrollWheelEventDeltaAxis2, Math.round(dx));

  // 4. Set high-precision "Fixed Point" deltas
  // These allow for fractional movement (e.g., 0.25 pixels)
  lib.symbols.CGEventSetDoubleValueField(event, kCGScrollWheelEventFixedPtDeltaAxis1, dy);
  lib.symbols.CGEventSetDoubleValueField(event, kCGScrollWheelEventFixedPtDeltaAxis2, dx);

  // 5. Post and Release
  lib.symbols.CGEventPost(kCGHIDEventTap, event);
  lib.symbols.CFRelease(event);
}