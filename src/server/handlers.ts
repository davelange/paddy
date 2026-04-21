import type {
	AuthenticationResponseJSON,
	RegistrationResponseJSON,
} from "@simplewebauthn/server";
import { nameForAaguid } from "../auth/aaguid";
import { challenges } from "../auth/challenges";
import { getCredentialByUserId, insertCredential } from "../auth/credentials";
import {
	CLEAR_COOKIE,
	createSession,
	getSession,
	readSidFromCookie,
	revokeSession,
} from "../auth/session";
import {
	buildAuthenticationOptions,
	buildRegistrationOptions,
	verifyAuthentication,
	verifyRegistration,
} from "../auth/webauthn";
import {
	createKeyEvent,
	createScrollEvent,
	createZoomEvent,
	kVK_LeftArrow,
	kVK_RightArrow,
} from "./emit";
import { PORT } from "./network";

type WsData = { credentialId: string };

export function handleWsUpgrade(
	req: Request,
	server: Bun.Server<WsData>,
): Response | undefined {
	const sid = readSidFromCookie(req.headers.get("cookie"));
	const session = getSession(sid);

	if (!session) {
		return new Response("unauthorized", { status: 401 });
	}

	if (server.upgrade(req, { data: { credentialId: session.credentialId } })) {
		return;
	}

	return new Response("upgrade failed", { status: 400 });
}

export function handleWsMessage(
	_ws: Bun.ServerWebSocket<WsData>,
	raw: string | Buffer,
): void {
	try {
		const msg = JSON.parse(typeof raw === "string" ? raw : raw.toString());

		switch (msg.type) {
			case "scroll":
				createScrollEvent(msg.dy, msg.dx);
				break;

			case "pinch":
				createZoomEvent(msg.delta);
				break;

			case "scrub":
				createKeyEvent(
					msg.direction === "forward" ? kVK_RightArrow : kVK_LeftArrow,
				);
				break;

			default:
				console.log(msg);
				break;
		}
	} catch (e) {
		console.log("bad msg:", e);
	}
}

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
	const headers = new Headers(init.headers);
	headers.set("Content-Type", "application/json");

	return Response.json(body, {
		...init,
		headers,
	});
}

export async function createAuthOptions(): Promise<Response> {
	const registration = await buildRegistrationOptions();
	const authentication = await buildAuthenticationOptions(
		registration.challenge,
	);

	challenges.put(registration.user.id, {
		registrationChallenge: registration.challenge,
		authenticationChallenge: authentication.challenge,
	});

	return jsonResponse({
		registration,
		authentication,
		challengeId: registration.user.id,
	});
}

export async function handleRegisterVerication(req: Request) {
	const body = await req.json();

	const { payload, challengeId } = body as {
		challengeId: string;
		payload: RegistrationResponseJSON;
	};

	if (!payload || !challengeId) {
		return jsonResponse({ error: "bad request" }, { status: 400 });
	}

	const pendingChallenge = challenges.take(challengeId);

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

export function getUserStatus(req: Request) {
	const id = new URL(req.url).searchParams.get("id");

	if (!id) {
		return jsonResponse({ error: "missing id" }, { status: 400 });
	}

	const cred = getCredentialByUserId(id);

	if (!cred) {
		return jsonResponse({ error: "not found" }, { status: 404 });
	}

	return jsonResponse({ status: cred.status });
}

export async function handleLoginVerication(req: Request) {
	const body = await req.json();

	const { payload, challengeId } = body as {
		payload: AuthenticationResponseJSON;
		challengeId: string;
	};

	const pendingChallenge = challenges.take(challengeId);

	if (!pendingChallenge) {
		return jsonResponse({ error: "challenge not recognized" }, { status: 401 });
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
