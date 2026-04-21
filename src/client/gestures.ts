type Coord = {
	x: number;
	y: number;
};

type TouchTrack = {
	x: number;
	y: number;
	time: number;
};

type Options = {
	onScroll: (delta: Coord) => void;
	onPinch: (delta: number) => void;
};

const PINCH_SMOOTHING = 0.35;
const PINCH_DEAD_ZONE = 0.1;
const VELOCITY_SMOOTHING = 0.25;
const MOMENTUM_FRICTION = 0.93;
const MOMENTUM_MIN_SPEED = 0.02;
const FRAME_MS = 16;

export class GestureManager {
	private pointers = new Map<number, TouchTrack>();
	private onScroll: Options["onScroll"];
	private onPinch: Options["onPinch"];

	private prevPinchDistance: number | null = null;
	private smoothedPinch = 0;

	private velocity: Coord = { x: 0, y: 0 };
	private momentumRAF: number | null = null;

	private down = (e: PointerEvent) => this.handleDown(e);
	private up = (e: PointerEvent) => this.handleUp(e);
	private move = (e: PointerEvent) => this.handleMove(e);

	constructor(options: Options) {
		this.onScroll = options.onScroll;
		this.onPinch = options.onPinch;

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
	}

	private handleDown(ev: PointerEvent) {
		this.stopMomentum();
		this.velocity = { x: 0, y: 0 };

		this.pointers.set(ev.pointerId, {
			x: ev.clientX,
			y: ev.clientY,
			time: performance.now(),
		});

		if (this.pointers.size === 2) {
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

		if (this.pointers.size === 0) {
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

		if (this.pointers.size === 1) {
			this.onScroll({ x: dx, y: dy });
			const a = VELOCITY_SMOOTHING;
			this.velocity.x = a * (dx / dt) + (1 - a) * this.velocity.x;
			this.velocity.y = a * (dy / dt) + (1 - a) * this.velocity.y;
			return;
		}

		if (this.pointers.size === 2) {
			this.emitPinch();
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
