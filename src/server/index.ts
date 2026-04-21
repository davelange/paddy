import index from "../client/index.html";
import {
	createAuthOptions,
	getUserStatus,
	handleLoginVerication,
	handleLogout,
	handleRegisterVerication,
	handleWsMessage,
	handleWsUpgrade,
} from "./handlers";
import { cert, getOrigin, getRpId, key, PORT, printQr } from "./network";

const server = Bun.serve({
	port: PORT,
	hostname: "0.0.0.0",
	tls: { cert, key },
	routes: {
		"/": index,
		"/auth/options": { POST: createAuthOptions },
		"/auth/status": { GET: getUserStatus },
		"/register/verify": { POST: handleRegisterVerication },
		"/login/verify": { POST: handleLoginVerication },
		"/logout": { POST: handleLogout },
		"/ws": handleWsUpgrade,
	},
	websocket: {
		open: (ws: Bun.ServerWebSocket<{ credentialId: string }>) => {
			console.log(`[ws] open ${ws.data.credentialId}`);
		},
		close: () => {
			console.log("[ws] close");
		},
		message: handleWsMessage,
	},
});

const url = getOrigin(PORT);
console.log(`Paddy listening on ${url} (rpID=${getRpId()})`);
console.log(`Open the URL above from the phone`);
printQr(url);

const shutdown = () => {
	console.log("\nShutting down");
	server.stop(true);
	process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
