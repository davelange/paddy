import {
	type CredentialRow,
	type CredentialStatus,
	deleteAllCredentials,
	deleteCredential,
	listCredentials,
	setCredentialStatus,
} from "../auth/credentials";
import {
	deleteAllSessions,
	deleteSessionsForCredential,
} from "../auth/session";

function fmtTime(ts: number | null): string {
	if (!ts) return "-";
	return new Date(ts).toISOString().replace("T", " ").slice(0, 19);
}

function shortId(id: string): string {
	return id.slice(0, 8);
}

function printRows(rows: CredentialRow[]): void {
	if (rows.length === 0) {
		console.log("(no credentials)");
		return;
	}
	console.log(["ID", "STATUS", "LABEL", "UA", "IP", "CREATED"].join("\t"));
	for (const r of rows) {
		console.log(
			[
				shortId(r.id),
				r.status,
				r.label ?? "-",
				(r.user_agent ?? "-").slice(0, 40),
				r.ip ?? "-",
				fmtTime(r.created_at),
			].join("\t"),
		);
	}
}

function resolveId(prefix: string): string | null {
	const match = listCredentials().find((r) => r.id.startsWith(prefix));
	return match?.id ?? null;
}

function usage(): never {
	console.log(
		`usage:
  admin list [--pending|--approved|--rejected]
  admin approve <id-prefix>
  admin reject  <id-prefix>
  admin revoke  <id-prefix>
  admin clear-sessions --yes
  admin clear-all      --yes`,
	);
	process.exit(1);
}

const [cmd, ...args] = process.argv.slice(2);

switch (cmd) {
	case "list": {
		const flag = args[0];
		const filter: CredentialStatus | undefined =
			flag === "--pending"
				? "pending"
				: flag === "--approved"
					? "approved"
					: flag === "--rejected"
						? "rejected"
						: undefined;
		printRows(listCredentials(filter));
		break;
	}
	case "approve":
	case "reject": {
		const prefix = args[0];
		if (!prefix) usage();
		const id = resolveId(prefix);
		if (!id) {
			console.error("no credential matching", prefix);
			process.exit(1);
		}
		const ok = setCredentialStatus(
			id,
			cmd === "approve" ? "approved" : "rejected",
		);
		if (!ok) {
			console.error("update failed");
			process.exit(1);
		}
		if (cmd === "reject") deleteSessionsForCredential(id);
		console.log(`${cmd}d ${shortId(id)}`);
		break;
	}
	case "revoke": {
		const prefix = args[0];
		if (!prefix) usage();
		const id = resolveId(prefix);
		if (!id) {
			console.error("no credential matching", prefix);
			process.exit(1);
		}
		deleteSessionsForCredential(id);
		deleteCredential(id);
		console.log(`revoked ${shortId(id)}`);
		break;
	}
	case "clear-sessions": {
		if (args[0] !== "--yes") {
			console.error("refusing to clear all sessions without --yes");
			process.exit(1);
		}
		const n = deleteAllSessions();
		console.log(`cleared ${n} session(s)`);
		break;
	}
	case "clear-all": {
		if (args[0] !== "--yes") {
			console.error("refusing to clear all records without --yes");
			process.exit(1);
		}
		const sessions = deleteAllSessions();
		const creds = deleteAllCredentials();
		console.log(`cleared ${creds} credential(s), ${sessions} session(s)`);
		break;
	}
	default:
		usage();
}
