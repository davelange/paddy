<script lang="ts">
  import {
    startAuthentication,
    startRegistration,
  } from "@simplewebauthn/browser";
  import { api } from "./api";

  type Props = { onAuthed: () => void };
  let { onAuthed }: Props = $props();

  let view = $state<"login" | "pending">("login");
  let error = $state<string | null>(null);
  let busy = $state(false);

  async function register() {
    error = null;
    busy = true;

    try {
      const options = await api.registerOptions();
      const attestation = await startRegistration({ optionsJSON: options });
      const { id } = await api.registerVerify(attestation);
      localStorage.setItem("paddy:credentialId", id);
      view = "pending";
      pollApproval(id);
    } catch (err) {
      console.error(err);
      error = err instanceof Error ? err.message : "registration failed";
    } finally {
      busy = false;
    }
  }

  async function pollApproval(id: string) {
    const result = await api.registerStatus(id);
    if (result?.status === "approved") view = "login";
  }

  async function login() {
    error = null;
    busy = true;

    try {
      const options = await api.loginOptions();
      const assertion = await startAuthentication({ optionsJSON: options });
      await api.loginVerify(assertion);
      onAuthed();
    } catch (err) {
      console.error(err);
      error = err instanceof Error ? err.message : "login failed";
    } finally {
      busy = false;
    }
  }

  function retry() {
    const id = localStorage.getItem("paddy:credentialId");
    if (id) pollApproval(id);
  }
</script>

<section>
  <h1>paddy</h1>
  {#if view === "login"}
    <button type="button" onclick={login} disabled={busy}>
      unlock with passkey
    </button>
    <button class="link" type="button" onclick={register} disabled={busy}>
      register this device
    </button>
  {:else}
    <p>waiting for approval on host Mac.</p>
    <button type="button" onclick={retry}>check again</button>
  {/if}
  <div class="error">{error ?? ""}</div>
</section>

<style>
  section {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 16px;
    min-width: 260px;
    max-width: 90vw;
    text-align: center;
  }
  h1 {
    margin: 0;
    font-weight: 500;
  }
  button {
    padding: 12px;
    font-size: 16px;
    color: #eee;
    background: rgba(255, 255, 255, 0.12);
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 8px;
    cursor: pointer;
  }
  button:disabled {
    opacity: 0.5;
  }
  button.link {
    background: transparent;
    border: none;
    color: #8ab;
    font-size: 13px;
  }
  .error {
    color: #f77;
    font-size: 13px;
    min-height: 1em;
  }
</style>
