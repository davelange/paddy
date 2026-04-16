import {
	startAuthentication,
	startRegistration,
} from "@simplewebauthn/browser";

type State = "login" | "pending" | "authed";

const authSection = document.getElementById("auth") as HTMLElement;
const gestureSurface = document.getElementById(
	"gesture-surface",
) as HTMLElement;
const scrubControls = document.getElementById("scrub-controls") as HTMLElement;
const loginView = document.getElementById("auth-login") as HTMLElement;
const pendingView = document.getElementById("auth-pending") as HTMLElement;
const errorEl = document.getElementById("auth-error") as HTMLElement;
const loginBtn = document.getElementById("auth-login-btn") as HTMLButtonElement;
const registerBtn = document.getElementById(
	"auth-register-btn",
) as HTMLButtonElement;
const retryBtn = document.getElementById("auth-retry") as HTMLButtonElement;

function setState(state: State): void {
	loginView.hidden = state !== "login";
	pendingView.hidden = state !== "pending";
	if (state === "authed") {
		authSection.hidden = true;
		gestureSurface.hidden = false;
		scrubControls.hidden = false;
		window.dispatchEvent(new CustomEvent("auth-ready"));
		return;
	}
	authSection.hidden = false;
	gestureSurface.hidden = true;
	scrubControls.hidden = true;
}

function setError(msg: string | null): void {
	errorEl.textContent = msg ?? "";
}

async function register(): Promise<void> {
	setError(null);
	registerBtn.disabled = true;
	try {
		const optionsRes = await fetch("/register/options", { method: "POST" });
		if (!optionsRes.ok) throw new Error("options failed");
		const options = await optionsRes.json();
		const attestation = await startRegistration({ optionsJSON: options });
		const verifyRes = await fetch("/register/verify", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ response: attestation }),
		});
		if (!verifyRes.ok) throw new Error("verify failed");
		const data = (await verifyRes.json()) as { id: string };
		localStorage.setItem("paddy:credentialId", data.id);
		setState("pending");
		pollApproval(data.id);
	} catch (err) {
		console.error(err);
		setError(err instanceof Error ? err.message : "registration failed");
	} finally {
		registerBtn.disabled = false;
	}
}

async function pollApproval(id: string): Promise<void> {
	try {
		const res = await fetch(`/register/status?id=${encodeURIComponent(id)}`);
		if (!res.ok) return;
		const data = (await res.json()) as { status: string };
		if (data.status === "approved") {
			setState("login");
		}
	} catch {}
}

async function login(): Promise<void> {
	setError(null);
	loginBtn.disabled = true;
	try {
		const optionsRes = await fetch("/login/options", { method: "POST" });
		if (!optionsRes.ok) throw new Error("options failed");
		const options = await optionsRes.json();
		const assertion = await startAuthentication({ optionsJSON: options });
		const verifyRes = await fetch("/login/verify", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ response: assertion }),
		});
		if (!verifyRes.ok) throw new Error("credential not recognized");
		setState("authed");
	} catch (err) {
		console.error(err);
		setError(err instanceof Error ? err.message : "login failed");
	} finally {
		loginBtn.disabled = false;
	}
}

loginBtn.addEventListener("click", login);
registerBtn.addEventListener("click", register);
retryBtn.addEventListener("click", () => {
	const id = localStorage.getItem("paddy:credentialId");
	if (id) pollApproval(id);
});

setState("login");
