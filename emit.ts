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
