// Neon Harbor — keyboard and mouse input, with edge-triggered presses.
export class Input {
  constructor(canvas) {
    this.keys = {};
    this.pressed = {};
    this.mouseX = 0;
    this.mouseY = 0;
    this.mouseDown = false;
    this.mouseClicked = false;
    this.canvas = canvas;
    window.addEventListener('keydown', (e) => {
      const k = e.key.toLowerCase();
      if (!this.keys[k]) this.pressed[k] = true;
      this.keys[k] = true;
      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => {
      this.keys[e.key.toLowerCase()] = false;
    });
    window.addEventListener('blur', () => {
      this.keys = {};
    });
    canvas.addEventListener('mousemove', (e) => {
      const r = canvas.getBoundingClientRect();
      this.mouseX = e.clientX - r.left;
      this.mouseY = e.clientY - r.top;
    });
    canvas.addEventListener('mousedown', (e) => {
      if (e.button === 0) {
        this.mouseDown = true;
        this.mouseClicked = true;
      }
    });
    window.addEventListener('mouseup', () => {
      this.mouseDown = false;
    });
  }

  down(...names) {
    return names.some((n) => this.keys[n]);
  }

  wasPressed(...names) {
    return names.some((n) => this.pressed[n]);
  }

  endFrame() {
    this.pressed = {};
    this.mouseClicked = false;
  }
}
