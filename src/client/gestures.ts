type Coord = {
	x: number;
	y: number;
};

type TouchTrack = {
	x: number;
	y: number;
	time: number;
	startX: number;
	startY: number;
};

type Options = {
	onScroll: (delta: Coord) => void;
	onPinch: (delta: number) => void;
	onMove: (delta: Coord) => void;
	onClick: (button: "left" | "right") => void;
};

/**
 * CW 90° rotation of an input delta. Used because the user holds the phone in
 * landscape (home button to the right) while the page is rendered in portrait,
 * so raw pointer deltas live in the phone's portrait frame and need to be
 * mapped back to the user's landscape frame (= desktop screen axes).
 */
export function rotateForLandscape({ x, y }: Coord): Coord {
	return { x: y || 0, y: -x || 0 }; // || 0 coerces -0 to +0
}

const VELOCITY_SMOOTHING = 0.25;
const MOMENTUM_FRICTION = 0.93;
const MOMENTUM_MIN_SPEED = 0.02;
const FRAME_MS = 16;

const TAP_MAX_MS = 250;
const TAP_MAX_TRAVEL = 5;
const MOUSE_SENSITIVITY = 1.5;

const PINCH_SMOOTHING = 0.35;
const PINCH_DEAD_ZONE = 0.5;

// Once both fingers have travelled at least COMMIT_THRESHOLD px from where the
// 2-finger gesture began, we commit by sign(a·b): aligned vectors = scroll,
// opposed vectors = pinch.
const COMMIT_THRESHOLD = 5;

type TwoFingerMode = "undecided" | "scroll" | "pinch";

export class GestureManager {
	private pointers = new Map<number, TouchTrack>();
	private onScroll: Options["onScroll"];
	private onPinch: Options["onPinch"];
	private onMove: Options["onMove"];
	private onClick: Options["onClick"];

	private velocity: Coord = { x: 0, y: 0 };
	private momentumRAF: number | null = null;

	private gestureStartTime = 0;
	private gestureTravel = 0;
	private hadTwoFingers = false;

	private centroidX = 0;
	private centroidY = 0;
	private prevPinchDistance = 0;
	private smoothedPinch = 0;
	private twoFingerMode: TwoFingerMode = "undecided";

	private isLandscape = false;
	private orientationMQL: MediaQueryList = window.matchMedia(
		"(orientation: landscape)",
	);
	private onOrientationChange = (e: MediaQueryListEvent) => {
		this.isLandscape = e.matches;
	};

	private down = (e: PointerEvent) => this.handleDown(e);
	private up = (e: PointerEvent) => this.handleUp(e);
	private move = (e: PointerEvent) => this.handleMove(e);

	constructor(options: Options) {
		this.onScroll = options.onScroll;
		this.onPinch = options.onPinch;
		this.onMove = options.onMove;
		this.onClick = options.onClick;

		this.orientationMQL = window.matchMedia("(orientation: landscape)");
		this.isLandscape = this.orientationMQL.matches;
		this.orientationMQL.addEventListener("change", this.onOrientationChange);

		addEventListener("pointerdown", this.down);
		addEventListener("pointerup", this.up);
		addEventListener("pointercancel", this.up);
		addEventListener("pointermove", this.move);
	}

	destroy() {
		this.orientationMQL.removeEventListener("change", this.onOrientationChange);
		removeEventListener("pointerdown", this.down);
		removeEventListener("pointerup", this.up);
		removeEventListener("pointercancel", this.up);
		removeEventListener("pointermove", this.move);
		this.pointers.clear();
		this.stopMomentum();
	}

	private alignDelta(d: Coord): Coord {
		return this.isLandscape ? d : rotateForLandscape(d);
	}

	private handleDown(ev: PointerEvent) {
		this.stopMomentum();
		this.velocity = { x: 0, y: 0 };

		const isFirstFinger = this.pointers.size === 0;

		this.pointers.set(ev.pointerId, {
			x: ev.clientX,
			y: ev.clientY,
			time: performance.now(),
			startX: ev.clientX,
			startY: ev.clientY,
		});

		if (isFirstFinger) {
			this.gestureStartTime = performance.now();
			this.gestureTravel = 0;
			this.hadTwoFingers = false;
		}

		if (this.pointers.size === 2) {
			this.hadTwoFingers = true;
			const [a, b] = [...this.pointers.values()];
			if (a && b) {
				// Anchor each finger's "start" to the moment the 2-finger gesture
				// began — direction is measured from here.
				a.startX = a.x;
				a.startY = a.y;
				b.startX = b.x;
				b.startY = b.y;
				this.centroidX = (a.x + b.x) / 2;
				this.centroidY = (a.y + b.y) / 2;
				this.prevPinchDistance = Math.hypot(a.x - b.x, a.y - b.y);
			}
			this.smoothedPinch = 0;
			this.twoFingerMode = "undecided";
		}
	}

	private handleUp(ev: PointerEvent) {
		this.pointers.delete(ev.pointerId);

		if (this.pointers.size > 0) return;

		const elapsed = performance.now() - this.gestureStartTime;
		if (elapsed <= TAP_MAX_MS && this.gestureTravel <= TAP_MAX_TRAVEL) {
			this.onClick(this.hadTwoFingers ? "right" : "left");
			return;
		}

		if (this.hadTwoFingers) {
			const { x, y } = this.velocity;
			if (Math.hypot(x, y) > MOMENTUM_MIN_SPEED) {
				this.startMomentum();
			}
		}
	}

	private handleMove(ev: PointerEvent) {
		const pointer = this.pointers.get(ev.pointerId);
		if (!pointer) return;

		const now = performance.now();
		const dt = Math.max(1, now - pointer.time);
		const dx = ev.clientX - pointer.x;
		const dy = ev.clientY - pointer.y;

		pointer.x = ev.clientX;
		pointer.y = ev.clientY;
		pointer.time = now;

		this.gestureTravel += Math.hypot(dx, dy);

		if (this.pointers.size === 1) {
			this.onMove(
				this.alignDelta({
					x: dx * MOUSE_SENSITIVITY,
					y: dy * MOUSE_SENSITIVITY,
				}),
			);
			return;
		}

		if (this.pointers.size === 2) {
			this.handleTwoFingerMove(dt);
		}
	}

	private handleTwoFingerMove(dt: number) {
		const [a, b] = [...this.pointers.values()];
		if (!a || !b) return;

		const newCentroidX = (a.x + b.x) / 2;
		const newCentroidY = (a.y + b.y) / 2;
		const dCx = newCentroidX - this.centroidX;
		const dCy = newCentroidY - this.centroidY;
		this.centroidX = newCentroidX;
		this.centroidY = newCentroidY;

		const newDist = Math.hypot(a.x - b.x, a.y - b.y);
		const dPinch = newDist - this.prevPinchDistance;
		this.prevPinchDistance = newDist;

		if (this.twoFingerMode === "undecided") {
			const ax = a.x - a.startX;
			const ay = a.y - a.startY;
			const bx = b.x - b.startX;
			const by = b.y - b.startY;
			const aMag = Math.hypot(ax, ay);
			const bMag = Math.hypot(bx, by);

			// Wait until both fingers have a reliable direction vector. Falling
			// back to scroll when only one has moved would lock us in before a
			// pinch's slower finger could register.
			if (aMag < COMMIT_THRESHOLD || bMag < COMMIT_THRESHOLD) return;

			const dot = ax * bx + ay * by;
			this.twoFingerMode = dot >= 0 ? "scroll" : "pinch";
		}

		if (this.twoFingerMode === "scroll") {
			this.onScroll(this.alignDelta({ x: dCx, y: dCy }));
			const s = VELOCITY_SMOOTHING;
			this.velocity.x = s * (dCx / dt) + (1 - s) * this.velocity.x;
			this.velocity.y = s * (dCy / dt) + (1 - s) * this.velocity.y;
		} else {
			this.smoothedPinch =
				PINCH_SMOOTHING * dPinch + (1 - PINCH_SMOOTHING) * this.smoothedPinch;
			if (Math.abs(this.smoothedPinch) > PINCH_DEAD_ZONE) {
				this.onPinch(this.smoothedPinch);
			}
		}
	}

	private startMomentum() {
		const step = () => {
			this.velocity.x *= MOMENTUM_FRICTION;
			this.velocity.y *= MOMENTUM_FRICTION;

			if (Math.hypot(this.velocity.x, this.velocity.y) < MOMENTUM_MIN_SPEED) {
				this.momentumRAF = null;
				this.velocity = { x: 0, y: 0 };
				return;
			}

			this.onScroll(
				this.alignDelta({
					x: this.velocity.x * FRAME_MS,
					y: this.velocity.y * FRAME_MS,
				}),
			);
			this.momentumRAF = requestAnimationFrame(step);
		};
		this.momentumRAF = requestAnimationFrame(step);
	}

	private stopMomentum() {
		if (this.momentumRAF !== null) {
			cancelAnimationFrame(this.momentumRAF);
			this.momentumRAF = null;
		}
	}
}
