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

export const api = {
	registerOptions(): Promise<PublicKeyCredentialCreationOptionsJSON> {
		return postJson("/register/options");
	},

	registerVerify(response: RegistrationResponseJSON): Promise<{ id: string }> {
		return postJson("/register/verify", { response });
	},

	async registerStatus(id: string): Promise<{ status: string } | null> {
		const res = await fetch(`/register/status?id=${encodeURIComponent(id)}`);
		if (!res.ok) return null;
		return res.json() as Promise<{ status: string }>;
	},

	loginOptions(): Promise<PublicKeyCredentialRequestOptionsJSON> {
		return postJson("/login/options");
	},

	loginVerify(response: AuthenticationResponseJSON): Promise<unknown> {
		return postJson("/login/verify", { response });
	},
};
