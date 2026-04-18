import type {
	AuthenticationResponseJSON,
	PublicKeyCredentialCreationOptionsJSON,
	PublicKeyCredentialRequestOptionsJSON,
	RegistrationResponseJSON,
} from "@simplewebauthn/browser";

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
	id: string;
};

export const api = {
	authOptions(): Promise<AuthOptions> {
		return postJson("/auth/options");
	},

	registerVerify({
		id,
		payload,
	}: {
		id: string;
		payload: RegistrationResponseJSON;
	}): Promise<{ id: string }> {
		return postJson("/register/verify", { id, payload });
	},

	async registerStatus(id: string): Promise<{ status: string } | null> {
		const res = await fetch(`/register/status?id=${encodeURIComponent(id)}`);
		if (!res.ok) return null;
		return res.json() as Promise<{ status: string }>;
	},

	loginVerify({
		id,
		payload,
	}: {
		id: string;
		payload: AuthenticationResponseJSON;
	}): Promise<unknown> {
		return postJson("/login/verify", { id, payload });
	},
};
