let ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

function tone(freq: number, start: number, dur: number, type: OscillatorType = "sine", gain = 0.12) {
  const ac = getCtx();
  if (!ac) return;
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, ac.currentTime + start);
  g.gain.setValueAtTime(0, ac.currentTime + start);
  g.gain.linearRampToValueAtTime(gain, ac.currentTime + start + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + start + dur);
  osc.connect(g).connect(ac.destination);
  osc.start(ac.currentTime + start);
  osc.stop(ac.currentTime + start + dur + 0.05);
}

export const sfx = {
  play() {
    tone(520, 0, 0.07, "triangle", 0.08);
    tone(260, 0.01, 0.05, "square", 0.03);
  },
  thulla() {
    tone(220, 0, 0.18, "sawtooth", 0.1);
    tone(160, 0.15, 0.25, "sawtooth", 0.1);
    tone(110, 0.32, 0.4, "sawtooth", 0.1);
  },
  trick() {
    tone(660, 0, 0.12, "sine");
    tone(880, 0.1, 0.18, "sine");
  },
  getaway() {
    [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.09, 0.2, "triangle", 0.1));
  },
  win() {
    [523, 659, 784, 1047, 784, 1047, 1319].forEach((f, i) => tone(f, i * 0.11, 0.3, "triangle", 0.12));
  },
  lose() {
    [392, 349, 311, 262].forEach((f, i) => tone(f, i * 0.2, 0.4, "sawtooth", 0.08));
  },
  pop() {
    tone(900, 0, 0.08, "sine", 0.08);
    tone(1300, 0.05, 0.1, "sine", 0.06);
  },
  toss() {
    tone(300, 0, 0.25, "sine", 0.06);
    tone(90, 0.55, 0.15, "square", 0.08);
  },
  chat() {
    tone(1100, 0, 0.05, "triangle", 0.05);
  },
};
