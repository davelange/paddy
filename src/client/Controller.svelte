<script lang="ts">
	import { onMount } from "svelte";
	import { GestureManager } from "./gestures";
	import { WSConnection } from "./ws";

	let status = $state("");
	let ws: WSConnection | undefined;

	onMount(() => {
		ws = new WSConnection({
			onStatus: (s) => {
				if (s === "open") status = "";
				else if (s === "error") status = "connection failed";
			},
		});

		const gestures = new GestureManager({
			onScroll({ x, y }) {
				ws?.push({ type: "scroll", dx: x, dy: y });
			},
			onPinch(delta) {
				ws?.push({ type: "pinch", delta });
			},
			onMove({ x, y }) {
				ws?.push({ type: "mousemove", dx: x, dy: y });
			},
			onClick(button) {
				ws?.push({ type: "mouseclick", button });
			},
		});

		return () => {
			gestures.destroy();
			ws?.close();
			ws = undefined;
		};
	});
</script>

<div class="surface">
	<p class="status">{status}</p>
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
	.status {
		margin: 0;
		color: var(--muted);
		font-size: 12px;
		letter-spacing: 0.08em;
		min-height: 1em;
	}
</style>
