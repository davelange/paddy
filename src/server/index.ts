import {
	handleLoginOptions,
	handleLoginVerify,
	handleLogout,
	handleRegisterOptions,
	handleRegisterStatus,
	handleRegisterVerify,
} from "../auth/routes";
import { getSession, readSidFromCookie } from "../auth/session";
import index from "../client/index.html";
import {
	createKeyEvent,
	createScrollEvent,
	createZoomEvent,
	kVK_LeftArrow,
	kVK_RightArrow,
} from "./emit";
import { cert, getOrigin, getRpId, key, PORT, printQr } from "./network";

type WsData = { credentialId: string };

function handleWsUpgrade(
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

function handleWsMessage(
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
				createZoomEvent(-msg.y);
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

const server = Bun.serve<WsData, never>({
	port: PORT,
	hostname: "0.0.0.0",
	tls: { cert, key },
	routes: {
		"/": index,
		"/register/options": { POST: handleRegisterOptions },
		"/register/verify": { POST: handleRegisterVerify },
		"/register/status": { GET: handleRegisterStatus },
		"/login/options": { POST: handleLoginOptions },
		"/login/verify": { POST: handleLoginVerify },
		"/logout": { POST: handleLogout },
		"/ws": handleWsUpgrade,
	},
	websocket: {
		open: (ws: Bun.ServerWebSocket<WsData>) => {
			console.log(`[ws] open ${ws.data.credentialId}`);
		},
		close: () => {
			console.log("[ws] close");
		},
		message: handleWsMessage,
	},
});

const url = getOrigin(PORT);
console.log(`Stroll listening on ${url} (rpID=${getRpId()})`);
console.log(`Open the URL above from the phone`);
printQr(url);

const shutdown = () => {
	console.log("\nShutting down");
	server.stop(true);
	process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
