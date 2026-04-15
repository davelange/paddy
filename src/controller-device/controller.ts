import { GestureManager } from "./pointer";
import { WSConnection } from "./websocket";

const ws = new WSConnection();

new GestureManager({
	onPinch({ x, y }) {
		ws.push({ type: "pinch", x, y });
	},
	onScroll({ x, y }) {
		ws.push({ type: "scroll", dx: x, dy: y });
	},
	onLog() {},
});
