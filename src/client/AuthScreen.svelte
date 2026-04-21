<script lang="ts">
	import {
		startAuthentication,
		startRegistration,
	} from "@simplewebauthn/browser";
	import { onMount } from "svelte";
	import type { CredentialStatus } from "../auth/credentials.ts";
	import { type AuthOptions, api } from "./api.ts";

	type Props = { onAuthed: () => void };
	let { onAuthed }: Props = $props();

	let view = $state<"login" | "register">();
	let error = $state<string>();
	let options = $state<AuthOptions>();
	let userId = $state<string>();
	let userStatus = $state<CredentialStatus>();

	onMount(getOptionsAndTryLogin);

	async function getOptionsAndTryLogin() {
		error = undefined;
		api.authOptions()
			.then((res) => {
				options = res;
				conditionalLogin();
			})
			.catch((err) => {
				error = String(err);
			});
	}

	async function conditionalLogin() {
		if (!options) return;
		view = "login";

		const { rpId, challenge } = options.authentication;

		const assertion = await startAuthentication({
			optionsJSON: {
				challenge,
				rpId,
				userVerification: "required",
			},
		}).catch((err) => {
			console.log(err);
			view = "register";
		});

		if (!assertion) return;

		api.loginVerify({
			payload: assertion,
			challengeId: options.challengeId,
		})
			.then(() => onAuthed())
			.catch((err) => {
				error = String(err);
			});
	}

	async function register() {
		if (!options) return;

		const attestation = await startRegistration({
			optionsJSON: options.registration,
		}).catch((err) => {
			error = String(err);
		});

		if (!attestation) return;

		api.registerVerify({
			payload: attestation,
			challengeId: options.challengeId,
		})
			.then(({ id }) => {
				userId = id;
				view = undefined;
				getStatus();
			})
			.catch((err) => {
				error = String(err);
			});
	}

	async function getStatus() {
		if (!userId) return;

		const status = await api.getRegisterStatus(userId);
		if (status) userStatus = status;

		if (status === "pending") {
			setTimeout(getStatus, 5000);
		} else if (status === "approved") {
			getOptionsAndTryLogin();
		}
	}
</script>

<section>
	<h1>paddy</h1>

	{#if error}
		<p class="status">{error}</p>
		<button type="button" onclick={getOptionsAndTryLogin}>retry</button>
	{:else if userStatus === "pending"}
		<p class="status">awaiting approval</p>
	{:else if userStatus === "rejected"}
		<p class="status">rejected</p>
	{:else if userStatus === "approved"}
		<p class="status">approved</p>
	{:else if view === "login"}
		<button type="button" onclick={conditionalLogin}>login</button>
	{:else if view === "register"}
		<button type="button" onclick={register}>register</button>
	{/if}
</section>

<style>
	section {
		position: fixed;
		inset: 0;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 20px;
		padding: env(safe-area-inset-top) 24px env(safe-area-inset-bottom);
	}
	h1 {
		margin: 0 0 8px;
		font-size: 40px;
		font-weight: 500;
		letter-spacing: -0.03em;
	}
	.status {
		margin: 0;
		color: var(--muted);
		font-size: 12px;
		letter-spacing: 0.08em;
	}
	button {
		appearance: none;
		font: inherit;
		font-size: 12px;
		letter-spacing: 0.16em;
		text-transform: uppercase;
		color: var(--text);
		background: transparent;
		border: 1px solid var(--line);
		border-radius: 4px;
		padding: 12px 28px;
		cursor: pointer;
		touch-action: manipulation;
		-webkit-tap-highlight-color: transparent;
	}
	button:active {
		background: rgba(255, 255, 255, 0.04);
	}
</style>
