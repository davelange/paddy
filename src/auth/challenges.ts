const TTL_MS = 5 * 60 * 1000;

type Entry = {
	authenticationChallenge: string;
	registrationChallenge: string;
	expires: number;
};

class ChallengeStore {
	store = new Map<string, Entry>();

	private sweep(now: number): void {
		for (const [key, entry] of this.store) {
			if (entry.expires < now) this.store.delete(key);
		}
	}

	put(id: string, data: Omit<Entry, "expires">) {
		const now = Date.now();
		this.sweep(now);
		this.store.set(id, { ...data, expires: now + TTL_MS });
	}
	take(challenge?: string): Entry | null {
		if (!challenge) {
			return null;
		}

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

		return entry;
	}
}

export const challenges = new ChallengeStore();
