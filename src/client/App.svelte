<script lang="ts">
	import AuthScreen from "./AuthScreen.svelte";
	import Controller from "./Controller.svelte";

	let authed = $state(false);
</script>

{#if authed}
	<Controller />
{:else}
	<AuthScreen onAuthed={() => (authed = true)} />
{/if}
