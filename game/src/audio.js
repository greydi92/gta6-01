// All sound is synthesized live with the Web Audio API — no audio files.
// Engine hum, tyre skid, gunshots, crashes, pickups, sirens and an original
// 112 BPM music loop. Safe to call before any user gesture: the context is
// created lazily on the first gesture and every method no-ops until then.
export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.engineOsc = null;
    this.engineGain = null;
    this.skidSrc = null;
    this.skidGain = null;
    this.sirenOsc = null;
    this.sirenGain = null;
    this.musicTimer = null;
    this.musicStep = 0;
    this.muted = false;
  }

  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return true;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
      // Engine: two detuned sawtooths through a low-pass filter.
      this.engineOsc = this.ctx.createOscillator();
      this.engineOsc.type = 'sawtooth';
      this.engineOsc.frequency.value = 55;
      const engineOsc2 = this.ctx.createOscillator();
      engineOsc2.type = 'sawtooth';
      engineOsc2.frequency.value = 55.7;
      const engineFilter = this.ctx.createBiquadFilter();
      engineFilter.type = 'lowpass';
      engineFilter.frequency.value = 420;
      this.engineGain = this.ctx.createGain();
      this.engineGain.gain.value = 0;
      this.engineOsc.connect(engineFilter);
      engineOsc2.connect(engineFilter);
      engineFilter.connect(this.engineGain);
      this.engineGain.connect(this.master);
      this.engineOsc.start();
      engineOsc2.start();
      this.engineOsc2 = engineOsc2;
      // Skid: looping white noise through a band-pass filter.
      const len = this.ctx.sampleRate;
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i += 1) data[i] = Math.random() * 2 - 1;
      this.skidSrc = this.ctx.createBufferSource();
      this.skidSrc.buffer = buf;
      this.skidSrc.loop = true;
      const skidFilter = this.ctx.createBiquadFilter();
      skidFilter.type = 'bandpass';
      skidFilter.frequency.value = 900;
      skidFilter.Q.value = 0.8;
      this.skidGain = this.ctx.createGain();
      this.skidGain.gain.value = 0;
      this.skidSrc.connect(skidFilter);
      skidFilter.connect(this.skidGain);
      this.skidGain.connect(this.master);
      this.skidSrc.start();
      this.startMusic();
      return true;
    } catch (e) {
      this.ctx = null;
      return false;
    }
  }

  setEngine(speedNorm, on) {
    if (!this.ctx || !this.engineGain) return;
    const t = this.ctx.currentTime;
    const freq = 48 + speedNorm * 130;
    this.engineOsc.frequency.setTargetAtTime(freq, t, 0.05);
    this.engineOsc2.frequency.setTargetAtTime(freq * 1.012, t, 0.05);
    this.engineGain.gain.setTargetAtTime(on && !this.muted ? 0.05 + speedNorm * 0.05 : 0, t, 0.1);
  }

  setSkid(amount) {
    if (!this.ctx || !this.skidGain) return;
    this.skidGain.gain.setTargetAtTime(this.muted ? 0 : Math.min(0.14, amount * 0.14), this.ctx.currentTime, 0.05);
  }

  setSiren(on) {
    if (!this.ctx) return;
    if (on && !this.sirenOsc) {
      this.sirenOsc = this.ctx.createOscillator();
      this.sirenOsc.type = 'triangle';
      this.sirenOsc.frequency.value = 700;
      const lfo = this.ctx.createOscillator();
      lfo.frequency.value = 0.7;
      const lfoGain = this.ctx.createGain();
      lfoGain.gain.value = 180;
      lfo.connect(lfoGain);
      lfoGain.connect(this.sirenOsc.frequency);
      this.sirenGain = this.ctx.createGain();
      this.sirenGain.gain.value = this.muted ? 0 : 0.045;
      this.sirenOsc.connect(this.sirenGain);
      this.sirenGain.connect(this.master);
      this.sirenOsc.start();
      lfo.start();
      this.sirenLfo = lfo;
    } else if (!on && this.sirenOsc) {
      try { this.sirenOsc.stop(); this.sirenLfo.stop(); } catch (e) { /* already stopped */ }
      this.sirenOsc = null;
      this.sirenLfo = null;
    }
  }

  // Mute toggle (N key). The flag alone would not silence the continuous
  // engine and siren loops, so duck their gains here as well.
  setMuted(m) {
    this.muted = !!m;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    if (this.engineGain) this.engineGain.gain.setTargetAtTime(this.muted ? 0 : 0.05, t, 0.05);
    if (this.sirenGain) this.sirenGain.gain.setTargetAtTime(this.muted ? 0 : 0.045, t, 0.05);
  }

  blip(freq, dur, type, vol) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = type || 'sine';
    o.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol || 0.18, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g);
    g.connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  noiseBurst(dur, filterFreq, vol) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const len = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i += 1) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = filterFreq;
    const g = this.ctx.createGain();
    g.gain.value = vol;
    src.connect(f);
    f.connect(g);
    g.connect(this.master);
    src.start(t);
  }

  gunshot() { this.noiseBurst(0.14, 2600, 0.5); this.blip(160, 0.09, 'square', 0.2); }
  crash() { this.noiseBurst(0.3, 500, 0.5); this.blip(70, 0.25, 'sine', 0.3); }
  punch() { this.noiseBurst(0.08, 900, 0.35); }
  pickup() { this.blip(660, 0.09, 'sine', 0.2); this.blip(990, 0.12, 'sine', 0.2); }
  coin() { this.blip(880, 0.07, 'triangle', 0.18); this.blip(1318, 0.14, 'triangle', 0.18); }
  missionDone() { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => this.blip(f, 0.22, 'triangle', 0.22), i * 110)); }
  horn() { this.blip(370, 0.28, 'square', 0.12); this.blip(466, 0.28, 'square', 0.1); }

  // Original 112 BPM loop: a minor-key bassline with a hat tick.
  // Bass notes (Hz): A1, A1, C2, E2, G1, G1, D2, E2.
  startMusic() {
    if (!this.ctx || this.musicTimer) return;
    const bass = [55, 55, 65.41, 82.41, 49, 49, 73.42, 82.41];
    const stepMs = 60000 / 112 / 2; // eighth notes at 112 BPM
    this.musicTimer = setInterval(() => {
      if (this.muted || !this.ctx) return;
      const n = bass[this.musicStep % bass.length];
      this.blip(n, 0.22, 'triangle', 0.11);
      if (this.musicStep % 2 === 0) this.noiseBurst(0.03, 8000, 0.03);
      this.musicStep += 1;
    }, stepMs);
  }
}
