<script lang="ts">
  import {
    base64URLStringToBuffer,
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
    api
      .authOptions()
      .then((res) => {
        options = res;
        conditionalLogin();
      })
      .catch((err) => {
        error = err;
      });
  }

  async function conditionalLogin() {
    if (!options) {
      return;
    }

    view = "login";

    const { rpId, challenge } = options.authentication;

    const assertion = await startAuthentication({
      optionsJSON: {
        challenge,
        rpId,
        userVerification: "required",
      },
    }).catch((err) => {
      // User rejected autofill
      console.log(err);
      view = "register";
    });

    if (!assertion) {
      return;
    }

    api
      .loginVerify({
        payload: assertion,
        challengeId: options.challengeId,
      })
      .then(() => onAuthed())
      .catch((err) => {
        error = err;
      });
  }

  async function register() {
    if (!options) {
      return;
    }

    const attestation = await startRegistration({
      optionsJSON: options.registration,
    });

    api
      .registerVerify({
        payload: attestation,
        challengeId: options.challengeId,
      })
      .then(({ id }) => {
        userId = id;
        view = undefined;
        getStatus();
      })
      .catch((err) => {
        error = err;
      });
  }

  async function getStatus() {
    if (!userId) {
      return;
    }

    const status = await api.getRegisterStatus(userId);

    if (status) {
      userStatus = status;
    }

    if (status === "pending") {
      setTimeout(getStatus, 5000);
    } else if (status === "approved") {
      getOptionsAndTryLogin();
    }
  }
</script>

<section>
  <h1>paddy</h1>

  {#if view === "login"}
    <button type="button" onclick={conditionalLogin}> Login </button>
  {:else if view === "register"}
    <button type="button" onclick={register}> Register </button>
  {/if}

  {#if userStatus === "pending"}
    <p>pending approval by admin</p>
  {:else if userStatus === "rejected"}
    <p>bitter rejection</p>
  {:else if userStatus === "approved"}
    <p>you're in</p>
  {/if}

  {#if error}
    <p>{error}</p>
  {/if}
</section>
