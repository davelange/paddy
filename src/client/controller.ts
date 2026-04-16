import { GestureManager } from "./pointer";
import { WSConnection } from "./websocket";

function boot(): void {
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

	function bindScrub(id: string, direction: "back" | "forward") {
		const el = document.getElementById(id);
		if (!el) return;
		el.addEventListener("pointerdown", (e) => {
			e.preventDefault();
			e.stopPropagation();
			ws.push({ type: "scrub", direction });
		});
	}

	bindScrub("scrub-back", "back");
	bindScrub("scrub-forward", "forward");
}

window.addEventListener("auth-ready", boot, { once: true });
