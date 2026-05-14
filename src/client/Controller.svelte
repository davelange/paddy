<script lang="ts">
	import { onMount } from "svelte";
	import { GestureManager } from "./gestures";
	import { WSConnection } from "./ws";

	let status = $state("");
	let dragMode = $state(false);
	let pulseTok = $state(0);
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
			onClick(button, clickCount) {
				ws?.push({ type: "mouseclick", button, clickCount });
			},
			onMouseDown(button) {
				ws?.push({ type: "mousedown", button });
			},
			onMouseUp(button) {
				ws?.push({ type: "mouseup", button });
			},
			onDragModeChange(active) {
				dragMode = active;
				pulseTok++;
				navigator.vibrate?.(50);
			},
		});

		return () => {
			gestures.destroy();
			ws?.close();
			ws = undefined;
		};
	});
</script>

<div class="surface" class:drag={dragMode}>
	<p class="status">{status}</p>
</div>

{#if pulseTok > 0}
	{#key pulseTok}
		<div class="pulse" aria-hidden="true"></div>
	{/key}
{/if}

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
		transition: background-color 120ms ease-out;
	}
	.surface.drag {
		background-color: rgba(232, 230, 224, 0.04);
	}
	.status {
		margin: 0;
		color: var(--muted);
		font-size: 12px;
		letter-spacing: 0.08em;
		min-height: 1em;
	}
	.pulse {
		position: fixed;
		inset: 0;
		pointer-events: none;
		background-color: rgba(168, 85, 247, 0.35);
		animation: pulse-fade 400ms ease-out forwards;
	}
	@keyframes pulse-fade {
		from {
			opacity: 1;
		}
		to {
			opacity: 0;
		}
	}
</style>
