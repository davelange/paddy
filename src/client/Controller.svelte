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
	<p class="status">{status}</p>
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
		position: fixed;
		inset: 0;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 8px;
		pointer-events: none;
	}
	h1 {
		margin: 0;
		font-size: 40px;
		font-weight: 500;
		letter-spacing: -0.03em;
	}
	.status {
		margin: 0;
		color: var(--muted);
		font-size: 12px;
		letter-spacing: 0.08em;
		min-height: 1em;
	}
	.scrub {
		position: fixed;
		left: 0;
		right: 0;
		bottom: 0;
		display: flex;
		gap: 8px;
		padding: 10px;
		padding-bottom: max(10px, env(safe-area-inset-bottom));
	}
	.scrub button {
		flex: 1;
		height: 64px;
		font-size: 28px;
		color: var(--text);
		background: transparent;
		border: 1px solid var(--line);
		border-radius: 6px;
		touch-action: manipulation;
		-webkit-tap-highlight-color: transparent;
	}
	.scrub button:active {
		background: rgba(255, 255, 255, 0.05);
	}
</style>
