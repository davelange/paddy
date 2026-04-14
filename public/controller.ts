const status = document.getElementById("status") as HTMLDivElement;
const ws = new WebSocket(`ws://${location.host}/ws`);
let opened = false;
ws.onopen = () => { opened = true; };
const fail = () => { if (!opened) status.textContent = "connection failed"; };
ws.onerror = fail;
ws.onclose = fail;

let down = false, lastX = 0, lastY = 0;
let accDx = 0, accDy = 0;

addEventListener("pointerdown", (e: MouseEvent) => {
  down = true;
  lastX = e.clientX;
  lastY = e.clientY;
});
const end = () => { down = false; };
addEventListener("pointerup", end);
addEventListener("pointercancel", end);

addEventListener("pointermove", (e: MouseEvent) => {
  if (!down) return;
  const rawDx = e.clientX - lastX;
  const rawDy = e.clientY - lastY;
  lastX = e.clientX;
  lastY = e.clientY;
  accDx += rawDy;
  accDy += -rawDx;
});

function flush() {
  if ((accDx || accDy) && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: "move", dx: accDx, dy: accDy }));
    accDx = 0;
    accDy = 0;
  }
  requestAnimationFrame(flush);
}
requestAnimationFrame(flush);
