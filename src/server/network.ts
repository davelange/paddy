import { hostname, networkInterfaces } from "node:os";
import qrcode from "qrcode-terminal";

export const PORT = 8080;

export function getLanIp(): string {
	const ifaces = networkInterfaces();
	for (const list of Object.values(ifaces)) {
		if (!list) continue;
		for (const i of list) {
			if (i.family === "IPv4" && !i.internal) return i.address;
		}
	}
	return "127.0.0.1";
}

export function getRpId(): string {
	const name = hostname().toLowerCase();
	const base = name.endsWith(".local") ? name.slice(0, -".local".length) : name;
	return `${base}.local`;
}

export function getOrigin(port: number): string {
	return `https://${getRpId()}:${port}`;
}

export function printQr(url: string): void {
	qrcode.generate(url, { small: true });
}

export const cert = Bun.file(process.env.CERT_FILE_PATH as string);
export const key = Bun.file(process.env.CERT_KEY_FILE_PATH as string);
