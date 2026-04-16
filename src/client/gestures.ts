type Coord = {
	x: number;
	y: number;
};

type TouchTrack = {
	down: boolean;
	prev: Coord;
	current: Coord;
	movement: Coord;
	delta: Coord;
};

type Options = {
	onScroll: (delta: Coord) => void;
	onPinch: (delta: Coord) => void;
};

export class GestureManager {
	pointers = new Map<number, TouchTrack>();
	onScroll: Options["onScroll"];
	onPinch: Options["onPinch"];

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
	}

	handleDown(ev: PointerEvent) {
		this.pointers.set(ev.pointerId, {
			current: { x: ev.clientX, y: ev.clientY },
			prev: { x: ev.clientX, y: ev.clientY },
			delta: { x: 0, y: 0 },
			movement: { x: 0, y: 0 },
			down: true,
		});
	}

	handleUp(ev: PointerEvent) {
		this.pointers.delete(ev.pointerId);
	}

	handleMove(ev: PointerEvent) {
		const { clientX: x, clientY: y, movementX, movementY, pointerId } = ev;
		const pointer = this.pointers.get(pointerId);

		if (!pointer?.down) {
			return;
		}

		const rawDx = x - pointer.prev.x;
		const rawDy = y - pointer.prev.y;
		pointer.prev.x = x;
		pointer.prev.y = y;
		pointer.delta.x += rawDx;
		pointer.delta.y += rawDy;
		pointer.movement.x = movementX;
		pointer.movement.y = movementY;

		if (this.pointers.size === 1) {
			this.onScroll(pointer.delta);

			pointer.delta.x = 0;
			pointer.delta.y = 0;
			this.pointers.set(pointerId, pointer);

			return;
		}

		if (this.pointers.size === 2) {
			this.processDualGesture();
		}
	}

	processDualGesture() {
		const pointers = this.pointers.values().toArray();

		if (!pointers.length || pointers.length !== 2) {
			return;
		}

		const [upper, lower] = pointers.toSorted(
			(a, b) => a.current.y - b.current.y,
		) as [TouchTrack, TouchTrack];

		if (upper.movement.y < 0 && lower.movement.y > 0) {
			this.onPinch(upper.movement);
		} else if (upper.movement.y > 0 && lower.movement.y < 0) {
			this.onPinch(upper.movement);
		}
	}
}
