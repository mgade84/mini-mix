import { audioOut } from '../../engine/audio';

export interface EngineProfile {
  cylinders: number;
  idle: number;
  redline: number;
}

function softClip(k: number) {
  const n = 1024;
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = Math.tanh(k * x) / Math.tanh(k);
  }
  return curve;
}

/**
 * Synthesized combustion engine: a stack of oscillators at the firing
 * frequency (rpm/60 × cylinders/2), saturated and low-pass filtered, with the
 * filter opening up under load. Plus wind, tyre squeal and gravel rumble from
 * a shared noise source.
 */
export class EngineSound {
  private ac: AudioContext | null = null;
  private out: GainNode | null = null;
  private oscs: OscillatorNode[] = [];
  private mults: number[] = [];
  private sources: AudioScheduledSourceNode[] = [];
  private lfo!: OscillatorNode;
  private engGain!: GainNode;
  private filter!: BiquadFilterNode;
  private wind!: GainNode;
  private skid!: GainNode;
  private rumble!: GainNode;

  constructor(private p: EngineProfile) {
    const g = audioOut();
    if (!g) return;
    const ac = (this.ac = g.ac);
    const t = ac.currentTime;

    this.out = ac.createGain();
    this.out.gain.setValueAtTime(0, t);
    this.out.gain.linearRampToValueAtTime(1, t + 0.5);
    this.out.connect(g.out);

    const mix = ac.createGain();
    mix.gain.value = 0.5;
    const shaper = ac.createWaveShaper();
    shaper.curve = softClip(2.4);
    shaper.oversample = '2x';
    this.filter = ac.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.filter.Q.value = 1.4;
    this.engGain = ac.createGain();
    this.engGain.gain.value = 0.18;
    mix.connect(shaper);
    shaper.connect(this.filter);
    this.filter.connect(this.engGain);
    this.engGain.connect(this.out);

    const f0 = this.fire(p.idle);
    const layers: [OscillatorType, number, number][] = [
      ['sawtooth', 1, 0.5],
      ['square', 0.5, 0.35], // sub-harmonic body
      ['sawtooth', 2.006, 0.14], // slightly detuned upper harmonic
    ];
    for (const [type, mul, vol] of layers) {
      const o = ac.createOscillator();
      o.type = type;
      o.frequency.value = f0 * mul;
      const og = ac.createGain();
      og.gain.value = vol;
      o.connect(og);
      og.connect(mix);
      o.start(t);
      this.oscs.push(o);
      this.mults.push(mul);
      this.sources.push(o);
    }

    // Crank-rate wobble gives the lumpy idle character.
    this.lfo = ac.createOscillator();
    this.lfo.frequency.value = p.idle / 60;
    const lfoGain = ac.createGain();
    lfoGain.gain.value = 0.06;
    this.lfo.connect(lfoGain);
    lfoGain.connect(this.engGain.gain);
    this.lfo.start(t);
    this.sources.push(this.lfo);

    const buf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const noise = ac.createBufferSource();
    noise.buffer = buf;
    noise.loop = true;
    noise.start(t);
    this.sources.push(noise);

    const branch = (type: BiquadFilterType, freq: number, q: number) => {
      const f = ac.createBiquadFilter();
      f.type = type;
      f.frequency.value = freq;
      f.Q.value = q;
      const gn = ac.createGain();
      gn.gain.value = 0;
      noise.connect(f);
      f.connect(gn);
      gn.connect(this.out!);
      return gn;
    };
    this.wind = branch('bandpass', 600, 0.6);
    this.skid = branch('bandpass', 2300, 9);
    this.rumble = branch('lowpass', 90, 0.8);
  }

  private fire(rpm: number) {
    return (rpm / 60) * (this.p.cylinders / 2);
  }

  /** rpm, load 0..1 (throttle), speed m/s, skid 0..1, rough 0..1 (curbs/grass). */
  update(rpm: number, load: number, speed: number, skid: number, rough: number) {
    if (!this.ac) return;
    const t = this.ac.currentTime;
    const f = this.fire(rpm);
    for (let i = 0; i < this.oscs.length; i++) this.oscs[i].frequency.setTargetAtTime(f * this.mults[i], t, 0.015);
    this.lfo.frequency.setTargetAtTime(rpm / 60, t, 0.05);
    const r = rpm / this.p.redline;
    this.filter.frequency.setTargetAtTime(250 + r * 2600 * (0.35 + 0.65 * load), t, 0.03);
    this.engGain.gain.setTargetAtTime(0.12 + 0.14 * load + 0.06 * r, t, 0.04);
    this.wind.gain.setTargetAtTime(Math.min(0.3, (speed / 75) ** 2 * 0.35), t, 0.1);
    this.skid.gain.setTargetAtTime(skid * 0.2, t, 0.05);
    this.rumble.gain.setTargetAtTime(rough * 0.5, t, 0.05);
  }

  setMuted(m: boolean) {
    if (!this.ac || !this.out) return;
    this.out.gain.setTargetAtTime(m ? 0 : 1, this.ac.currentTime, 0.05);
  }

  stop() {
    if (!this.ac || !this.out) return;
    const t = this.ac.currentTime;
    this.out.gain.cancelScheduledValues(t);
    this.out.gain.setValueAtTime(this.out.gain.value, t);
    this.out.gain.linearRampToValueAtTime(0, t + 0.3);
    for (const s of this.sources) s.stop(t + 0.35);
    const out = this.out;
    setTimeout(() => out.disconnect(), 500);
    this.ac = null;
  }
}
