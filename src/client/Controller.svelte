<script lang="ts">
	import { onMount } from "svelte";
	import { GestureManager } from "./gestures";
	import { WSConnection } from "./ws";

	let status = $state("");
	let ws: WSConnection | undefined;

	onMount(() => {
		ws = new WSConnection({
			onStatus: (s) => {
				if (s === "error") status = "connection failed";
			},
		});

		const gestures = new GestureManager({
			onPinch({ x, y }) {
				ws?.push({ type: "pinch", x, y });
			},
			onScroll({ x, y }) {
				ws?.push({ type: "scroll", dx: x, dy: y });
			},
		});

		return () => {
			gestures.destroy();
			ws?.close();
			ws = undefined;
		};
	});

	function scrub(direction: "back" | "forward") {
		return (e: PointerEvent) => {
			e.preventDefault();
			e.stopPropagation();
			ws?.push({ type: "scrub", direction });
		};
	}
</script>

<div class="surface">
	<h1>paddy</h1>
	<div class="status">{status}</div>
</div>

<div class="scrub">
	<button type="button" aria-label="Scrub back" onpointerdown={scrub("back")}>
		‹
	</button>
	<button
		type="button"
		aria-label="Scrub forward"
		onpointerdown={scrub("forward")}
	>
		›
	</button>
</div>

<style>
	.surface {
		text-align: center;
	}
	h1 {
		margin: 0;
		font-weight: 500;
	}
	.status {
		margin-top: 8px;
		opacity: 0.5;
		font-size: 13px;
		min-height: 1em;
	}
	.scrub {
		position: fixed;
		left: 0;
		right: 0;
		bottom: 0;
		display: flex;
		gap: 2px;
		padding: 8px;
		padding-bottom: max(8px, env(safe-area-inset-bottom));
		box-sizing: border-box;
	}
	.scrub button {
		flex: 1;
		height: 64px;
		font-size: 32px;
		color: #eee;
		background: rgba(255, 255, 255, 0.08);
		border: 1px solid rgba(255, 255, 255, 0.12);
		border-radius: 12px;
		touch-action: manipulation;
		-webkit-tap-highlight-color: transparent;
	}
	.scrub button:active {
		background: rgba(255, 255, 255, 0.2);
	}
</style>
