import { isoBase64URL } from "@simplewebauthn/server/helpers";
import { db } from "../db";
import { getCredentialById } from "./credentials";

export type SessionRow = {
	id: string;
	credential_pk: string;
	created_at: number;
	expires_at: number;
};

export const SESSION_COOKIE = "sid";
const SESSION_TTL_MS = 60 * 60 * 1000;

export function createSession(credentialPk: string) {
	const bytes = new Uint8Array(32);
	crypto.getRandomValues(bytes);
	const id = isoBase64URL.fromBuffer(bytes);
	const now = Date.now();

	insertSession({
		id,
		credentialPk,
		createdAt: now,
		expiresAt: now + SESSION_TTL_MS,
	});

	const cookie = `${SESSION_COOKIE}=${id}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`;

	return { id, cookie };
}

export function getSession(sid: string | null) {
	if (!sid) {
		return null;
	}

	const row = getSessionRow(sid);

	if (!row) {
		return null;
	}

	if (row.expires_at < Date.now()) {
		deleteSession(sid);
		return null;
	}

	const cred = getCredentialById(row.credential_pk);

	if (!cred || cred.status !== "approved") {
		return null;
	}

	return { credentialId: cred.id };
}

export function revokeSession(sid: string): void {
	deleteSession(sid);
}

export function revokeSessionsForCredential(credentialPk: string): void {
	deleteSessionsForCredential(credentialPk);
}

export function insertSession(row: {
	id: string;
	credentialPk: string;
	createdAt: number;
	expiresAt: number;
}): void {
	db.query(
		`INSERT INTO sessions (id, credential_pk, created_at, expires_at) VALUES (?, ?, ?, ?)`,
	).run(row.id, row.credentialPk, row.createdAt, row.expiresAt);
}

export function getSessionRow(id: string): SessionRow | null {
	return (
		(db
			.query("SELECT * FROM sessions WHERE id = ?")
			.get(id) as SessionRow | null) ?? null
	);
}

export function deleteSession(sid: string): void {
	db.query("DELETE FROM sessions WHERE id = ?").run(sid);
}

export function deleteSessionsForCredential(credentialPk: string): void {
	db.query("DELETE FROM sessions WHERE credential_pk = ?").run(credentialPk);
}

export function deleteAllSessions(): number {
	const res = db.query("DELETE FROM sessions").run();
	return res.changes;
}

export function readSidFromCookie(header: string | null): string | null {
	if (!header) {
		return null;
	}

	for (const part of header.split(";")) {
		const [k, v] = part.trim().split("=");
		if (k === SESSION_COOKIE && v) return v;
	}

	return null;
}

export const CLEAR_COOKIE = `${SESSION_COOKIE}=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0`;
