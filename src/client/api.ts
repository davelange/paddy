import type {
	AuthenticationResponseJSON,
	PublicKeyCredentialCreationOptionsJSON,
	PublicKeyCredentialRequestOptionsJSON,
	RegistrationResponseJSON,
} from "@simplewebauthn/browser";
import type { CredentialStatus } from "../auth/credentials";

async function postJson<T>(path: string, body?: unknown): Promise<T> {
	const res = await fetch(path, {
		method: "POST",
		headers: body ? { "Content-Type": "application/json" } : undefined,
		body: body ? JSON.stringify(body) : undefined,
	});

	if (!res.ok) {
		throw new Error(`${path} failed`);
	}

	return res.json() as Promise<T>;
}

export type AuthOptions = {
	registration: PublicKeyCredentialCreationOptionsJSON;
	authentication: PublicKeyCredentialRequestOptionsJSON;
	challengeId: string;
};

export const api = {
	authOptions(): Promise<AuthOptions> {
		return postJson("/auth/options");
	},

	registerVerify({
		challengeId,
		payload,
	}: {
		challengeId: string;
		payload: RegistrationResponseJSON;
	}): Promise<{ id: string }> {
		return postJson("/register/verify", { challengeId, payload });
	},

	async getRegisterStatus(id: string): Promise<CredentialStatus | null> {
		const res = await fetch(`/auth/status?id=${encodeURIComponent(id)}`).catch(
			(err) => console.log(err),
		);

		if (!res?.ok) return null;

		const data = await res.json();

		return (await data).status;
	},

	loginVerify({
		challengeId,
		payload,
	}: {
		challengeId: string;
		payload: AuthenticationResponseJSON;
	}): Promise<unknown> {
		return postJson("/login/verify", { challengeId, payload });
	},
};
