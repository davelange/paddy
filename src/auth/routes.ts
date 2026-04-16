import {
	decodeClientDataJSON,
	generateUserID,
	isoBase64URL,
} from "@simplewebauthn/server/helpers";
import { PORT } from "../server/network";
import { nameForAaguid } from "./aaguid";
import { ChallengeStore } from "./challenges";
import {
	bumpCredentialCounter,
	getCredentialById,
	getCredentialByRawId,
	insertCredential,
} from "./credentials";
import {
	CLEAR_COOKIE,
	createSession,
	readSidFromCookie,
	revokeSession,
} from "./session";
import {
	buildAuthenticationOptions,
	buildRegistrationOptions,
	verifyAuthentication,
	verifyRegistration,
} from "./webauthn";

const registrationChallenges = new ChallengeStore<{
	userHandle: Uint8Array;
}>();
const authenticationChallenges = new ChallengeStore<true>();

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
	const headers = new Headers(init.headers);
	headers.set("Content-Type", "application/json");

	return Response.json(body, {
		...init,
		headers,
	});
}

function readChallengeFromClientData(b64url: string): string | null {
	try {
		return decodeClientDataJSON(b64url).challenge ?? null;
	} catch {
		return null;
	}
}

export async function handleRegisterOptions(): Promise<Response> {
	const userHandle = await generateUserID();
	const options = await buildRegistrationOptions(userHandle, "paddy user");
	registrationChallenges.put(options.challenge, { userHandle });

	return jsonResponse(options);
}

export async function handleRegisterVerify(req: Request) {
	const body = await req.json();

	if (!body?.response) {
		return jsonResponse({ error: "bad request" }, { status: 400 });
	}

	const clientChallenge = readChallengeFromClientData(
		body.response.response.clientDataJSON,
	);

	if (!clientChallenge) {
		return jsonResponse({ error: "bad challenge" }, { status: 400 });
	}

	const pending = registrationChallenges.take(clientChallenge);

	if (!pending) {
		return jsonResponse({ error: "bad challenge" }, { status: 400 });
	}

	const verification = await verifyRegistration(
		body.response,
		clientChallenge,
		PORT,
	);

	if (!verification?.verified || !verification.registrationInfo) {
		return jsonResponse({ error: "verification failed" }, { status: 400 });
	}

	const info = verification.registrationInfo;
	const id = insertCredential({
		credentialId: isoBase64URL.toBuffer(info.credential.id),
		publicKey: info.credential.publicKey,
		counter: info.credential.counter,
		userHandle: pending.userHandle,
		label: nameForAaguid(info.aaguid),
	});

	return jsonResponse({ id, status: "pending" }, { status: 202 });
}

export function handleRegisterStatus(req: Request) {
	const id = new URL(req.url).searchParams.get("id");

	if (!id) {
		return jsonResponse({ error: "missing id" }, { status: 400 });
	}

	const cred = getCredentialById(id);

	if (!cred) {
		return jsonResponse({ error: "not found" }, { status: 404 });
	}

	return jsonResponse({ status: cred.status });
}

export async function handleLoginOptions() {
	const options = await buildAuthenticationOptions();
	authenticationChallenges.put(options.challenge, true);

	return jsonResponse(options);
}

export async function handleLoginVerify(req: Request) {
	const body = await req.json();

	if (!body?.response) {
		return jsonResponse({ error: "bad request" }, { status: 400 });
	}

	const clientChallenge = readChallengeFromClientData(
		body.response.response.clientDataJSON,
	);

	if (!clientChallenge) {
		return jsonResponse(
			{ error: "credential not recognized" },
			{ status: 401 },
		);
	}
	const pending = authenticationChallenges.take(clientChallenge);

	if (!pending) {
		return jsonResponse(
			{ error: "credential not recognized" },
			{ status: 401 },
		);
	}
	const rawId = isoBase64URL.toBuffer(body.response.id);
	const cred = getCredentialByRawId(rawId);

	if (!cred || cred.status !== "approved") {
		return jsonResponse(
			{ error: "credential not recognized" },
			{ status: 401 },
		);
	}

	const verification = await verifyAuthentication(
		body.response,
		clientChallenge,
		{
			id: body.response.id,
			publicKey: cred.public_key,
			counter: cred.counter,
		},
		PORT,
	);

	if (!verification?.verified) {
		return jsonResponse(
			{ error: "credential not recognized" },
			{ status: 401 },
		);
	}

	bumpCredentialCounter(cred.id, verification.authenticationInfo.newCounter);
	const { cookie } = createSession(cred.id);

	return jsonResponse({ ok: true }, { headers: { "Set-Cookie": cookie } });
}

export function handleLogout(req: Request) {
	const sid = readSidFromCookie(req.headers.get("cookie"));

	if (sid) {
		revokeSession(sid);
	}

	return jsonResponse(
		{ ok: true },
		{ headers: { "Set-Cookie": CLEAR_COOKIE } },
	);
}
