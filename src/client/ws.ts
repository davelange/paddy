type Status = "idle" | "open" | "error";

type Options = {
	onStatus?: (status: Status) => void;
};

export class WSConnection {
	socket = new WebSocket(`wss://${location.host}/ws`);
	state: Status = "idle";
	private onStatus?: Options["onStatus"];

	constructor(options: Options = {}) {
		this.onStatus = options.onStatus;
		this.socket.onopen = () => this.setState("open");
		this.socket.onerror = () => this.setState("error");
		this.socket.onclose = () => {
			if (this.state !== "open") this.setState("error");
		};
	}

	private setState(state: Status) {
		this.state = state;
		this.onStatus?.(state);
	}

	close() {
		this.socket.close();
	}

	push(payload: Record<string, string | number>) {
		this.socket.send(JSON.stringify(payload));
	}
}
