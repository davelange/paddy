const TTL_MS = 5 * 60 * 1000;

type Entry<T> = { challenge: string; data: T; expires: number };

export class ChallengeStore<T> {
	private store = new Map<string, Entry<T>>();

	private sweep(now: number): void {
		for (const [key, entry] of this.store) {
			if (entry.expires < now) this.store.delete(key);
		}
	}

	put(challenge: string, data: T) {
		const now = Date.now();
		this.sweep(now);
		this.store.set(challenge, { challenge, data, expires: now + TTL_MS });
	}

	take(challenge: string): T | null {
		const now = Date.now();
		this.sweep(now);
		const entry = this.store.get(challenge);

		if (!entry) {
			return null;
		}

		this.store.delete(challenge);

		if (entry.expires < now) {
			return null;
		}

		return entry.data;
	}
}
