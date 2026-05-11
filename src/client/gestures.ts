type Coord = {
	x: number;
	y: number;
};

type TouchTrack = {
	x: number;
	y: number;
	time: number;
};

export type Mode = "trackpad" | "mouse";

type Options = {
	getMode: () => Mode;
	onScroll: (delta: Coord) => void;
	onPinch: (delta: number) => void;
	onMove: (delta: Coord) => void;
	onClick: (button: "left" | "right") => void;
	onMouseDown: (button: "left" | "right") => void;
	onMouseUp: (button: "left" | "right") => void;
};

const PINCH_SMOOTHING = 0.35;
const PINCH_DEAD_ZONE = 0.1;
const VELOCITY_SMOOTHING = 0.25;
const MOMENTUM_FRICTION = 0.93;
const MOMENTUM_MIN_SPEED = 0.02;
const FRAME_MS = 16;

const TAP_MAX_MS = 250;
const TAP_MAX_TRAVEL = 5;
const LONG_PRESS_MS = 400;
const MOUSE_SENSITIVITY = 1.5;

export class GestureManager {
	private pointers = new Map<number, TouchTrack>();
	private getMode: Options["getMode"];
	private onScroll: Options["onScroll"];
	private onPinch: Options["onPinch"];
	private onMove: Options["onMove"];
	private onClick: Options["onClick"];
	private onMouseDown: Options["onMouseDown"];
	private onMouseUp: Options["onMouseUp"];

	private prevPinchDistance: number | null = null;
	private smoothedPinch = 0;

	private velocity: Coord = { x: 0, y: 0 };
	private momentumRAF: number | null = null;

	private gestureStartTime = 0;
	private gestureTravel = 0;
	private hadTwoFingers = false;
	private longPressTimer: ReturnType<typeof setTimeout> | null = null;
	private dragClickActive = false;

	private down = (e: PointerEvent) => this.handleDown(e);
	private up = (e: PointerEvent) => this.handleUp(e);
	private move = (e: PointerEvent) => this.handleMove(e);

	constructor(options: Options) {
		this.getMode = options.getMode;
		this.onScroll = options.onScroll;
		this.onPinch = options.onPinch;
		this.onMove = options.onMove;
		this.onClick = options.onClick;
		this.onMouseDown = options.onMouseDown;
		this.onMouseUp = options.onMouseUp;

		addEventListener("pointerdown", this.down);
		addEventListener("pointerup", this.up);
		addEventListener("pointercancel", this.up);
		addEventListener("pointermove", this.move);
	}

	destroy() {
		removeEventListener("pointerdown", this.down);
		removeEventListener("pointerup", this.up);
		removeEventListener("pointercancel", this.up);
		removeEventListener("pointermove", this.move);
		this.pointers.clear();
		this.stopMomentum();
		this.cancelLongPress();
	}

	private handleDown(ev: PointerEvent) {
		this.stopMomentum();
		this.velocity = { x: 0, y: 0 };

		const isFirstFinger = this.pointers.size === 0;

		this.pointers.set(ev.pointerId, {
			x: ev.clientX,
			y: ev.clientY,
			time: performance.now(),
		});

		if (isFirstFinger) {
			this.gestureStartTime = performance.now();
			this.gestureTravel = 0;
			this.hadTwoFingers = false;
			this.dragClickActive = false;
			if (this.getMode() === "mouse") {
				this.armLongPress();
			}
		}

		if (this.pointers.size === 2) {
			this.hadTwoFingers = true;
			this.cancelLongPress();
			this.prevPinchDistance = this.pinchDistance();
			this.smoothedPinch = 0;
		}
	}

	private handleUp(ev: PointerEvent) {
		this.pointers.delete(ev.pointerId);

		if (this.pointers.size < 2) {
			this.prevPinchDistance = null;
			this.smoothedPinch = 0;
		}

		if (this.pointers.size > 0) return;

		this.cancelLongPress();

		const mode = this.getMode();

		if (mode === "mouse") {
			if (this.dragClickActive) {
				this.onMouseUp("left");
				this.dragClickActive = false;
				return;
			}

			const elapsed = performance.now() - this.gestureStartTime;
			if (elapsed <= TAP_MAX_MS && this.gestureTravel <= TAP_MAX_TRAVEL) {
				this.onClick(this.hadTwoFingers ? "right" : "left");
			}
			return;
		}

		// trackpad: momentum
		const { x, y } = this.velocity;
		if (Math.hypot(x, y) > MOMENTUM_MIN_SPEED) {
			this.startMomentum();
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
		if (this.gestureTravel > TAP_MAX_TRAVEL) {
			this.cancelLongPress();
		}

		if (this.pointers.size === 1) {
			if (this.getMode() === "mouse") {
				this.onMove({
					x: dx * MOUSE_SENSITIVITY,
					y: dy * MOUSE_SENSITIVITY,
				});
				return;
			}

			this.onScroll({ x: dx, y: dy });
			const a = VELOCITY_SMOOTHING;
			this.velocity.x = a * (dx / dt) + (1 - a) * this.velocity.x;
			this.velocity.y = a * (dy / dt) + (1 - a) * this.velocity.y;
			return;
		}

		if (this.pointers.size === 2 && this.getMode() === "trackpad") {
			this.emitPinch();
		}
	}

	private armLongPress() {
		this.cancelLongPress();
		this.longPressTimer = setTimeout(() => {
			this.longPressTimer = null;
			if (this.pointers.size !== 1) return;
			if (this.gestureTravel > TAP_MAX_TRAVEL) return;
			this.dragClickActive = true;
			this.onMouseDown("left");
		}, LONG_PRESS_MS);
	}

	private cancelLongPress() {
		if (this.longPressTimer !== null) {
			clearTimeout(this.longPressTimer);
			this.longPressTimer = null;
		}
	}

	private pinchDistance(): number {
		const [a, b] = [...this.pointers.values()];
		if (!a || !b) return 0;
		return Math.hypot(a.x - b.x, a.y - b.y);
	}

	private emitPinch() {
		const dist = this.pinchDistance();
		if (this.prevPinchDistance === null) {
			this.prevPinchDistance = dist;
			return;
		}
		const delta = dist - this.prevPinchDistance;
		this.prevPinchDistance = dist;
		const a = PINCH_SMOOTHING;
		this.smoothedPinch = a * delta + (1 - a) * this.smoothedPinch;

		if (Math.abs(this.smoothedPinch) > PINCH_DEAD_ZONE) {
			this.onPinch(this.smoothedPinch);
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

			this.onScroll({
				x: this.velocity.x * FRAME_MS,
				y: this.velocity.y * FRAME_MS,
			});
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
