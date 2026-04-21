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

function printRows(rows: CredentialRow[], numbered = false): void {
	if (rows.length === 0) {
		console.log("(no credentials)");
		return;
	}

	const header = numbered
		? ["#", "ID", "LABEL", "CREATED"]
		: ["ID", "STATUS", "LABEL", "CREATED"];
	console.log(header.join("\t"));
	for (let i = 0; i < rows.length; i++) {
		const r = rows[i];

		if (!r) continue;

		const cols = numbered
			? [String(i + 1), shortId(r.id), r.label, fmtTime(r.created_at)]
			: [shortId(r.id), r.status, r.label, fmtTime(r.created_at)];
		console.log(cols.join("\t"));
	}
}

function resolveId(prefix: string): string | null {
	const match = listCredentials().find((r) => r.id.startsWith(prefix));
	return match?.id ?? null;
}

function resolvePendingByIndex(index: number): string | null {
	const pending = listCredentials("pending");
	const row = pending[index - 1];
	return row?.id ?? null;
}

function usage(): never {
	console.log(
		`usage:
  admin list [--pending|--approved|--rejected]
  admin approve <id-prefix | #index>
  admin reject  <id-prefix>
  admin revoke  <id-prefix>
  admin clear-sessions --yes
  admin clear-all      --yes

approve supports #N to approve by position in the pending list:
  admin approve #1    approve the first pending credential`,
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
	case "approve": {
		const arg = args[0];
		if (!arg) usage();
		const indexMatch = arg.match(/^#(\d+)$/);
		let id: string | null;
		if (indexMatch) {
			id = resolvePendingByIndex(Number(indexMatch[1]));
			if (!id) {
				const pending = listCredentials("pending");
				if (pending.length === 0) {
					console.error("no pending credentials");
				} else {
					console.error(`index out of range (1-${pending.length})`);
					printRows(pending, true);
				}
				process.exit(1);
			}
		} else {
			id = resolveId(arg);
			if (!id) {
				console.error("no credential matching", arg);
				process.exit(1);
			}
		}
		const ok = setCredentialStatus(id, "approved");
		if (!ok) {
			console.error("update failed");
			process.exit(1);
		}
		console.log(`approved ${shortId(id)}`);
		break;
	}
	case "reject": {
		const prefix = args[0];
		if (!prefix) usage();
		const id = resolveId(prefix);
		if (!id) {
			console.error("no credential matching", prefix);
			process.exit(1);
		}
		const ok = setCredentialStatus(id, "rejected");
		if (!ok) {
			console.error("update failed");
			process.exit(1);
		}
		deleteSessionsForCredential(id);
		console.log(`rejected ${shortId(id)}`);
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
