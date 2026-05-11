<script lang="ts">
	import { onMount } from "svelte";
	import AuthScreen from "./AuthScreen.svelte";
	import { api } from "./api.ts";
	import Controller from "./Controller.svelte";

	let authed = $state<boolean>();

	onMount(async () => {
		authed = await api.me();
	});
</script>

{#if authed === true}
	<Controller />
{:else if authed === false}
	<AuthScreen onAuthed={() => (authed = true)} />
{/if}
