<script lang="ts">
  import {
    base64URLStringToBuffer,
    startAuthentication,
    startRegistration,
  } from "@simplewebauthn/browser";
  import { onMount } from "svelte";
  import { type AuthOptions, api } from "./api";

  type Props = { onAuthed: () => void };
  let { onAuthed }: Props = $props();

  let id = $state("");
  let view = $state<"login" | "pending">("login");
  let error = $state<string | null>(null);
  let busy = $state(false);
  let options = $state<AuthOptions | null>(null);
  let conditional = $state(false);
  let pendingId = $state<string | null>(null);

  onMount(async () => {
    try {
      conditional =
        typeof PublicKeyCredential !== "undefined" &&
        typeof PublicKeyCredential.isConditionalMediationAvailable ===
          "function" &&
        (await PublicKeyCredential.isConditionalMediationAvailable());

      let res = await api.authOptions();
      options = res;
      id = res.id;

      console.log({
        conditional,
        options,
      });

      if (conditional && options) {
        waitForConditionalPasskey(res);
      }
    } catch (err) {
      console.error(err);
      error = err instanceof Error ? err.message : "initialization failed";
    }
  });

  async function waitForConditionalPasskey(opts: AuthOptions) {
    console.log("waitForConditionalPasskey");

    if (!opts.authentication) return;

    const { allowCredentials, rpId, challenge, ...options } =
      opts.authentication;

    const assertion = await startAuthentication({
      optionsJSON: {
        challenge,
        rpId,
        userVerification: "required",
      },

      //useBrowserAutofill: true,
    }).catch((err) => {
      console.log(err);
    });
    console.log(assertion);

    if (!assertion) {
      return;
    }

    await api.loginVerify({ payload: assertion, id });
    onAuthed();

    /* 

    const assertion = await navigator.credentials
      .get({
        publicKey: {
          challenge: base64URLStringToBuffer(challenge),
          rpId,
          userVerification: "required",
        },
        mediation: "optional",
      })
      .catch((err) => {
        console.log(err);
      });

    if(!assertion) {
      return
    }

    await api.loginVerify(assertion);
      onAuthed();

    return; */
    /* try {
      const assertion = await startAuthentication({
        optionsJSON: opts.authentication,
        useBrowserAutofill: true,
      });
      console.log(assertion);
      await api.loginVerify(assertion);
      onAuthed();
    } catch (err) {
      const name = (err as { name?: string })?.name;
      if (name === "AbortError" || name === "NotAllowedError") return;
      console.error(err);
      error = err instanceof Error ? err.message : "login failed";
    } */
  }

  async function unlock() {
    if (!options) return;
    error = null;
    busy = true;
    try {
      const assertion = await startAuthentication({
        optionsJSON: options.authentication,
      });
      await api.loginVerify({ payload: assertion, id });
      onAuthed();
    } catch (err) {
      console.error(err);
      error = err instanceof Error ? err.message : "login failed";
    } finally {
      busy = false;
    }
  }

  async function register() {
    if (!options) return;
    error = null;
    busy = true;
    const attestation = await startRegistration({
      optionsJSON: options.registration,
    });
    await api.registerVerify({
      payload: attestation,
      id,
    });
  }

  /* async function pollApproval(id: string) {
    const result = await api.registerStatus(id);
    if (result?.status !== "approved") return;
    view = "login";
    try {
      options = await api.authOptions();
      if (conditional && options) waitForConditionalPasskey(options);
    } catch (err) {
      console.error(err);
    }
  } */

  /* function retry() {
    if (pendingId) pollApproval(pendingId);
  } */
</script>

<section>
  <h1>paddy</h1>
  {#if view === "login"}
    <!-- <input type="text" autocomplete="username webauthn" /> -->
    <input type="text" name="passkey" autocomplete="username webauthn" />
    {#if !conditional}
      <button type="button" onclick={unlock} disabled={busy || !options}>
        unlock with passkey
      </button>
    {/if}
    <button
      class="link"
      type="button"
      onclick={register}
      disabled={busy || !options}
    >
      register this device
    </button>
  {:else}
    <p>waiting for approval on host Mac.</p>
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
  .autofill-target {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    border: 0;
  }
</style>
