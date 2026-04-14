import { getLanIp, printQr } from "./net";
import index from "./public/index.html";
import { postScroll } from "./emit";

const PORT = 8080;
const ip = getLanIp();
const url = `http://${ip}:${PORT}`;

const server = Bun.serve({
  port: PORT,
  hostname: "0.0.0.0",
  routes: {
    "/": index,
  },
  fetch(req, server) {
    const { pathname } = new URL(req.url);
    if (pathname === "/ws") {
      if (server.upgrade(req)) return;
      return new Response("upgrade failed", { status: 400 });
    }
    return new Response("not found", { status: 404 });
  },
  websocket: {
    open(ws) {
      console.log("ws open");
    },
    message(ws, raw) {
      try {
        const msg = JSON.parse(typeof raw === "string" ? raw : raw.toString());
        if (msg.type === "scroll") {
          const dx = Number.isFinite(msg.dx) ? (msg.dx | 0) : 0;
          const dy = Number.isFinite(msg.dy) ? (msg.dy | 0) : 0;
          if (dx || dy) postScroll(dy, dx);
        }
      } catch (e) {
        console.log("bad msg:", e);
      }
    },
    close() {
      console.log("ws close");
    },
  },
});

console.log(`Stroll listening on ${url}`);
printQr(url);

const shutdown = () => {
  console.log("\nshutting down");
  server.stop(true);
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
