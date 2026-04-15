const statusEl = document.getElementById("status") as HTMLDivElement;

export class WSConnection {
  socket = new WebSocket(`ws://${location.host}/ws`)
  state: "idle" | "open" | "error" = "idle"

  constructor() {
    this.socket.onopen = () => this.state = "open"
    this.socket.onerror = () => this.handleError()
    this.socket.onclose = () => {
      if(this.state !== "open") this.handleError()
    }
  }

  handleError() {    
    this.state = "error"  
    statusEl.textContent = "connection failed";
  }

  push(payload: Record<string, string | number>) {
    this.socket.send(JSON.stringify(payload));
  }

  log(msg: string) {
    statusEl.textContent = msg
  }
}