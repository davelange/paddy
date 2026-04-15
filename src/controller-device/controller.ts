import { WSConnection } from "./websocket";

const ws = new WSConnection()

const state = {
  dx: 0,
  dy: 0,
  prevX: 0,
  prevY: 0,
  down: false,
}

function handleMove(x: number, y: number) {
  if (!state.down) {
    return
  };

  const rawDx = x - state.prevX;
  const rawDy = y - state.prevY;
  state.prevX = x;
  state.prevY = y;
  state.dx += rawDx;
  state.dy += rawDy;

  ws.push({ type: "scroll", dx: state.dx, dy: state.dy })

  state.dx = 0
  state.dy = 0
}

addEventListener("pointerdown", (e: MouseEvent) => {
  state.down = true;
  state.prevX = e.clientX;
  state.prevY = e.clientY;
});
addEventListener("pointerup", () => { 
  state.down = false; 
});
addEventListener("pointercancel", () => {
  state.down = false; 
});
addEventListener("pointermove", (e: MouseEvent) => {
 handleMove(e.clientX, e.clientY) 
});
