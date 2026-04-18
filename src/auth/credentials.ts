import { randomUUIDv7 } from "bun";
import { db } from "../db";

export type CredentialStatus = "pending" | "approved" | "rejected";

export type CredentialRow = {
	id: string;
	user_id: string;
	public_key: Uint8Array;
	counter: number;
	label: string;
	status: CredentialStatus;
	created_at: number;
	approved_at: number | null;
	last_used_at: number | null;
};

export function insertCredential(row: {
	userId: string;
	publicKey: Uint8Array;
	counter: number;
	label: string;
}) {
	const id = randomUUIDv7();
	db.query(
		`INSERT INTO credentials
			(id, user_id, public_key, counter, label, status, created_at)
			VALUES (?, ?, ?, ?, ?, 'pending', ?)`,
	).run(id, row.userId, row.publicKey, row.counter, row.label, Date.now());

	return id;
}

export function getCredentialById(id: string) {
	return (
		(db
			.query("SELECT * FROM credentials WHERE id = ?")
			.get(id) as CredentialRow | null) ?? null
	);
}

export function getCredentialByUserId(credentialId: string) {
	return (
		(db
			.query("SELECT * FROM credentials WHERE user_id = ?")
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

export function deleteCredential(id: string) {
	const res = db.query("DELETE FROM credentials WHERE id = ?").run(id);

	return res.changes > 0;
}

export function deleteAllCredentials() {
	const res = db.query("DELETE FROM credentials").run();

	return res.changes;
}
