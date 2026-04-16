import { randomUUIDv7 } from "bun";
import { db } from "../db";

export type CredentialStatus = "pending" | "approved" | "rejected";

export type CredentialRow = {
	id: string;
	credential_id: Uint8Array;
	public_key: Uint8Array;
	counter: number;
	transports: string | null;
	user_handle: Uint8Array;
	label: string | null;
	user_agent: string | null;
	ip: string | null;
	status: CredentialStatus;
	created_at: number;
	approved_at: number | null;
	last_used_at: number | null;
};

export function insertCredential(row: {
	credentialId: Uint8Array;
	publicKey: Uint8Array;
	counter: number;
	transports: string[] | undefined;
	userHandle: Uint8Array;
	label: string | null;
	userAgent: string | null;
	ip: string | null;
}) {
	const id = randomUUIDv7();
	db.query(
		`INSERT INTO credentials
			(id, credential_id, public_key, counter, transports, user_handle, label, user_agent, ip, status, created_at)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)`,
	).run(
		id,
		row.credentialId,
		row.publicKey,
		row.counter,
		row.transports ? JSON.stringify(row.transports) : null,
		row.userHandle,
		row.label,
		row.userAgent,
		row.ip,
		Date.now(),
	);

	return id;
}

export function getCredentialById(id: string) {
	return (
		(db
			.query("SELECT * FROM credentials WHERE id = ?")
			.get(id) as CredentialRow | null) ?? null
	);
}

export function getCredentialByRawId(credentialId: Uint8Array) {
	return (
		(db
			.query("SELECT * FROM credentials WHERE credential_id = ?")
			.get(credentialId) as CredentialRow | null) ?? null
	);
}

export function listCredentials(filter?: CredentialStatus) {
	if (filter) {
		return db
			.query(
				"SELECT * FROM credentials WHERE status = ? ORDER BY created_at DESC",
			)
			.all(filter) as CredentialRow[];
	}

	return db
		.query("SELECT * FROM credentials ORDER BY created_at DESC")
		.all() as CredentialRow[];
}

export function setCredentialStatus(id: string, status: CredentialStatus) {
	const approvedAt = status === "approved" ? Date.now() : null;
	const res = db
		.query(
			`UPDATE credentials SET status = ?, approved_at = COALESCE(?, approved_at) WHERE id = ?`,
		)
		.run(status, approvedAt, id);

	return res.changes > 0;
}

export function bumpCredentialCounter(id: string, counter: number) {
	db.query(
		`UPDATE credentials SET counter = ?, last_used_at = ? WHERE id = ?`,
	).run(counter, Date.now(), id);
}

export function deleteCredential(id: string) {
	const res = db.query("DELETE FROM credentials WHERE id = ?").run(id);

	return res.changes > 0;
}

export function deleteAllCredentials() {
	const res = db.query("DELETE FROM credentials").run();

	return res.changes;
}
