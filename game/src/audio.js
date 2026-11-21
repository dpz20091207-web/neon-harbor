// Neon Harbor — all sound is synthesized with WebAudio. No audio files.
export class SoundEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.engineOsc = null;
    this.engineGain = null;
    this.engineFilter = null;
    this.sirenOsc = null;
    this.sirenGain = null;
    this.sirenOn = false;
    this.sirenPhase = 0;
    this.noiseBuf = null;
  }

  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(this.ctx.destination);
    // Shared noise buffer for shots, skids and explosions.
    const len = this.ctx.sampleRate * 1;
    this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    // Engine hum: a sawtooth through a lowpass, pitch follows speed.
    this.engineOsc = this.ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 50;
    this.engineFilter = this.ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.value = 420;
    this.engineGain = this.ctx.createGain();
    this.engineGain.gain.value = 0;
    this.engineOsc.connect(this.engineFilter);
    this.engineFilter.connect(this.engineGain);
    this.engineGain.connect(this.master);
    this.engineOsc.start();
    // Police siren: two alternating tones.
    this.sirenOsc = this.ctx.createOscillator();
    this.sirenOsc.type = 'triangle';
    this.sirenOsc.frequency.value = 700;
    this.sirenGain = this.ctx.createGain();
    this.sirenGain.gain.value = 0;
    this.sirenOsc.connect(this.sirenGain);
    this.sirenGain.connect(this.master);
    this.sirenOsc.start();
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.5;
  }

  setEngine(speedFrac, driving) {
    if (!this.ctx || !this.engineOsc) return;
    const target = driving ? 0.045 + speedFrac * 0.075 : 0;
    this.engineGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.08);
    this.engineOsc.frequency.setTargetAtTime(46 + speedFrac * 130, this.ctx.currentTime, 0.08);
    this.engineFilter.frequency.setTargetAtTime(320 + speedFrac * 900, this.ctx.currentTime, 0.1);
  }

  setSiren(on, dt) {
    if (!this.ctx || !this.sirenOsc) return;
    this.sirenOn = on;
    if (on) {
      this.sirenPhase += dt * 2.2;
      const f = (Math.floor(this.sirenPhase) % 2 === 0) ? 660 : 880;
      this.sirenOsc.frequency.setTargetAtTime(f, this.ctx.currentTime, 0.05);
      this.sirenGain.gain.setTargetAtTime(0.035, this.ctx.currentTime, 0.1);
    } else {
      this.sirenGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.1);
    }
  }

  blip(freq, dur, type, vol, slideTo) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type || 'square';
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(vol || 0.15, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(g);
    g.connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  noise(dur, vol, filterFreq, type) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const filter = this.ctx.createBiquadFilter();
    filter.type = type || 'lowpass';
    filter.frequency.value = filterFreq || 1200;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol || 0.2, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(filter);
    filter.connect(g);
    g.connect(this.master);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  shot() {
    this.noise(0.14, 0.5, 2600, 'highpass');
    this.blip(180, 0.09, 'square', 0.22, 60);
  }

  punch() {
    this.noise(0.08, 0.25, 500);
  }

  pickup() {
    this.blip(660, 0.09, 'sine', 0.2);
    setTimeout(() => this.blip(990, 0.14, 'sine', 0.2), 90);
  }

  cash() {
    this.blip(880, 0.08, 'sine', 0.18);
    setTimeout(() => this.blip(1174, 0.1, 'sine', 0.18), 80);
    setTimeout(() => this.blip(1568, 0.18, 'sine', 0.18), 160);
  }

  crash() {
    this.noise(0.25, 0.4, 700);
    this.blip(90, 0.2, 'sawtooth', 0.2, 40);
  }

  explosion() {
    this.noise(0.9, 0.6, 300);
    this.blip(70, 0.8, 'sawtooth', 0.3, 28);
  }

  sirenBlip() {
    this.blip(920, 0.12, 'square', 0.12, 700);
  }

  missionDone() {
    const notes = [523, 659, 784, 1046];
    notes.forEach((n, i) => setTimeout(() => this.blip(n, 0.16, 'triangle', 0.2), i * 110));
  }

  busted() {
    const notes = [392, 330, 262, 196];
    notes.forEach((n, i) => setTimeout(() => this.blip(n, 0.3, 'sawtooth', 0.16), i * 180));
  }
}
