import type {
	AuthenticationResponseJSON,
	RegistrationResponseJSON,
} from "@simplewebauthn/server";
import { PORT } from "../server/network";
import { nameForAaguid } from "./aaguid";
import { ChallengeStore } from "./challenges";
import {
	getCredentialById,
	getCredentialByUserId,
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

const challenges = new ChallengeStore();

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
	const headers = new Headers(init.headers);
	headers.set("Content-Type", "application/json");

	return Response.json(body, {
		...init,
		headers,
	});
}

export async function handleAuthOptions(): Promise<Response> {
	const registration = await buildRegistrationOptions();
	const authentication = await buildAuthenticationOptions(
		registration.challenge,
	);

	challenges.put(registration.user.id, {
		registrationChallenge: registration.challenge,
		authenticationChallenge: authentication.challenge,
	});

	console.log(challenges.store.entries());

	return jsonResponse({
		registration,
		authentication,
		id: registration.user.id,
	});
}

export async function handleRegisterVerify(req: Request) {
	const body = await req.json();

	const { payload, id } = body as {
		id: string;
		payload: RegistrationResponseJSON;
	};

	if (!payload || !id) {
		return jsonResponse({ error: "bad request" }, { status: 400 });
	}

	const pendingChallenge = challenges.take(id);

	if (!pendingChallenge) {
		return jsonResponse({ error: "bad challenge" }, { status: 400 });
	}

	const verification = await verifyRegistration(
		payload,
		pendingChallenge.registrationChallenge,
		PORT,
	);

	if (!verification?.verified || !verification.registrationInfo) {
		return jsonResponse({ error: "verification failed" }, { status: 400 });
	}

	const info = verification.registrationInfo;

	insertCredential({
		userId: payload.rawId,
		publicKey: info.credential.publicKey,
		label: nameForAaguid(info.aaguid),
		counter: info.credential.counter,
	});

	return jsonResponse(
		{ id: payload.rawId, status: "pending" },
		{ status: 202 },
	);
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

export async function handleLoginVerify(req: Request) {
	const body = await req.json();

	const { payload, id } = body as {
		payload: AuthenticationResponseJSON;
		id: string;
	};

	if (!payload || !id) {
		return jsonResponse({ error: "bad request" }, { status: 400 });
	}

	const pendingChallenge = challenges.take(id);

	if (!pendingChallenge) {
		return jsonResponse(
			{ error: "credential not recognized" },
			{ status: 401 },
		);
	}
	const cred = getCredentialByUserId(payload.rawId);

	if (!cred || cred.status !== "approved") {
		return jsonResponse(
			{ error: "credential not recognized" },
			{ status: 401 },
		);
	}

	const verification = await verifyAuthentication(
		body.payload,
		pendingChallenge.authenticationChallenge,
		{
			id: payload.id,
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
