<script lang="ts">
	import Auth from "./Auth.svelte";
	import Controller from "./Controller.svelte";

	let authed = $state(false);
</script>

{#if authed}
	<Controller />
{:else}
	<Auth onAuthed={() => (authed = true)} />
{/if}
