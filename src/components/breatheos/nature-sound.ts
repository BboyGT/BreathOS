// ─────────────────────────────────────────────────────────────────
//  WEB AUDIO — Nature sounds synthesizer
//  Generates ambient soundscapes using the Web Audio API
//  Supports multi-sound mixing for sleep mode
// ─────────────────────────────────────────────────────────────────

export interface NatureSoundResult {
  nodes: AudioNode[];
  master: GainNode;
  stop: () => void;
}

export interface SoundPreset {
  id: string;
  name: string;
  emoji: string;
  category: string;
}

// ── Utility helpers ──────────────────────────────────────────────

/** White noise buffer */
function noiseBuf(ctx: AudioContext, sec: number = 4): AudioBuffer {
  const b = ctx.createBuffer(1, ctx.sampleRate * sec, ctx.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return b;
}

/**
 * Pink noise (1/f spectrum) — much warmer and more natural than white noise.
 * Uses the Voss-McCartney algorithm (Paul Kellet refinement).
 */
function pinkNoiseBuf(ctx: AudioContext, sec: number = 4): AudioBuffer {
  const b = ctx.createBuffer(1, ctx.sampleRate * sec, ctx.sampleRate);
  const d = b.getChannelData(0);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  for (let i = 0; i < d.length; i++) {
    const w = Math.random() * 2 - 1;
    b0 = 0.99886 * b0 + w * 0.0555179;
    b1 = 0.99332 * b1 + w * 0.0750759;
    b2 = 0.96900 * b2 + w * 0.1538520;
    b3 = 0.86650 * b3 + w * 0.3104856;
    b4 = 0.55000 * b4 + w * 0.5329522;
    b5 = -0.7616 * b5 - w * 0.0168980;
    d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
    b6 = w * 0.115926;
  }
  return b;
}

/**
 * Brown noise (1/f^2 spectrum) — deep, low-frequency heavy rumble.
 * Great for thunder, deep ocean, and sub-bass presence.
 */
function brownNoiseBuf(ctx: AudioContext, sec: number = 4): AudioBuffer {
  const b = ctx.createBuffer(1, ctx.sampleRate * sec, ctx.sampleRate);
  const d = b.getChannelData(0);
  let last = 0;
  for (let i = 0; i < d.length; i++) {
    const w = Math.random() * 2 - 1;
    d[i] = (last + 0.02 * w) / 1.02;
    last = d[i];
    d[i] *= 3.5;
  }
  return b;
}

function biquad(
  ctx: AudioContext,
  type: BiquadFilterType,
  freq: number,
  Q: number = 1
): BiquadFilterNode {
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = Q;
  return f;
}

function gain(ctx: AudioContext, val: number): GainNode {
  const g = ctx.createGain();
  g.gain.value = val;
  return g;
}

/** Noise source -> optional filter -> optional gain -> destination. Returns source. */
function addNoise(
  ctx: AudioContext,
  nodes: AudioNode[],
  dest: AudioNode,
  opts: {
    bufSec?: number;
    filterType?: BiquadFilterType;
    filterFreq?: number;
    filterQ?: number;
    gainVal?: number;
    pink?: boolean;
    brown?: boolean;
  } = {}
): AudioBufferSourceNode {
  const { bufSec = 4, filterType, filterFreq, filterQ = 1, gainVal, pink, brown } = opts;
  const src = ctx.createBufferSource();
  src.buffer = brown
    ? brownNoiseBuf(ctx, bufSec)
    : pink
    ? pinkNoiseBuf(ctx, bufSec)
    : noiseBuf(ctx, bufSec);
  src.loop = true;

  let out: AudioNode = src;
  if (filterType && filterFreq !== undefined) {
    const f = biquad(ctx, filterType, filterFreq, filterQ);
    src.connect(f);
    out = f;
  }
  if (gainVal !== undefined) {
    const g = gain(ctx, gainVal);
    out.connect(g);
    out = g;
  }
  out.connect(dest);
  src.start();
  nodes.push(src);
  return src;
}

/** Oscillator with gain connected to destination. */
function addOsc(
  ctx: AudioContext,
  nodes: AudioNode[],
  dest: AudioNode,
  type: OscillatorType,
  freq: number,
  gainVal: number
): OscillatorNode {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.value = freq;
  const g = gain(ctx, gainVal);
  o.connect(g);
  g.connect(dest);
  o.start();
  nodes.push(o);
  return o;
}

/** Oscillator with amplitude LFO for rhythmic pulses. */
function addPulsedOsc(
  ctx: AudioContext,
  nodes: AudioNode[],
  dest: AudioNode,
  freq: number,
  pulseRate: number,
  peakGain: number
) {
  const o = ctx.createOscillator();
  o.type = "sine";
  o.frequency.value = freq;
  const g = gain(ctx, 0);
  const lfo = ctx.createOscillator();
  lfo.frequency.value = pulseRate;
  const lg = gain(ctx, peakGain);
  lfo.connect(lg);
  lg.connect(g.gain);
  o.connect(g);
  g.connect(dest);
  o.start();
  lfo.start();
  nodes.push(o, lfo);
}

function addModulatedNoise(
  ctx: AudioContext,
  nodes: AudioNode[],
  dest: AudioNode,
  opts: {
    filterType: BiquadFilterType;
    baseFreq: number;
    modDepth: number;
    modRate: number;
    gainVal: number;
    noiseSec?: number;
    filterQ?: number;
    pink?: boolean;
    brown?: boolean;
  }
) {
  const { filterType, baseFreq, modDepth, modRate, gainVal, noiseSec = 4, filterQ = 1, pink = false, brown = false } = opts;
  const filter = biquad(ctx, filterType, baseFreq, filterQ);
  const lfo = ctx.createOscillator();
  const lfoGain = gain(ctx, modDepth);
  const level = gain(ctx, gainVal);
  lfo.frequency.value = modRate;
  lfo.connect(lfoGain);
  lfoGain.connect(filter.frequency);
  filter.connect(level);
  level.connect(dest);
  lfo.start();
  nodes.push(lfo);
  addNoise(ctx, nodes, filter, { bufSec: noiseSec, pink, brown });
}

function addHum(
  ctx: AudioContext,
  nodes: AudioNode[],
  dest: AudioNode,
  baseFreq: number,
  gainVal: number,
  wobbleRate: number = 0.06,
  wobbleDepth: number = 8
) {
  const osc = ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.value = baseFreq;
  const oscGain = gain(ctx, gainVal);
  const lfo = ctx.createOscillator();
  const lfoGain = gain(ctx, wobbleDepth);
  lfo.frequency.value = wobbleRate;
  lfo.connect(lfoGain);
  lfoGain.connect(osc.frequency);
  osc.connect(oscGain);
  oscGain.connect(dest);
  osc.start();
  lfo.start();
  nodes.push(osc, lfo);
}

// ── RAIN HELPER ──────────────────────────────────────────────────
function buildRain(
  ctx: AudioContext,
  nodes: AudioNode[],
  dest: AudioNode,
  intensity: number = 0.5
) {
  // Layer 1: Rain body — pink noise through LFO-modulated lowpass
  const bodyFilt = biquad(ctx, "lowpass", 1200 + intensity * 1600, 0.65);
  const bodyLevel = gain(ctx, 0.3 + intensity * 0.35);
  const bodyLfo = ctx.createOscillator();
  bodyLfo.frequency.value = 0.04 + intensity * 0.05;
  const bodyLfoG = gain(ctx, 280 + intensity * 420);
  bodyLfo.connect(bodyLfoG);
  bodyLfoG.connect(bodyFilt.frequency);
  bodyFilt.connect(bodyLevel);
  bodyLevel.connect(dest);
  addNoise(ctx, nodes, bodyFilt, { bufSec: 6, pink: true });
  bodyLfo.start();
  nodes.push(bodyLfo);

  // Layer 2: Drop patter — bandpass with sawtooth AM for texture density
  const dropFilt = biquad(ctx, "bandpass", 2600 + intensity * 1800, 0.5);
  const dropLevel = gain(ctx, 0);
  const dropLfo = ctx.createOscillator();
  dropLfo.type = "sawtooth";
  dropLfo.frequency.value = 0.07 + intensity * 0.11;
  const dropLfoG = gain(ctx, 0.08 + intensity * 0.1);
  dropLfo.connect(dropLfoG);
  dropLfoG.connect(dropLevel.gain);
  dropFilt.connect(dropLevel);
  dropLevel.connect(dest);
  addNoise(ctx, nodes, dropFilt, { bufSec: 3, pink: true });
  dropLfo.start();
  nodes.push(dropLfo);

  // Layer 3: Splash/spray — highpass white noise
  const splashFilt = biquad(ctx, "highpass", 5000 + intensity * 1500, 0.4);
  const splashLevel = gain(ctx, 0.03 + intensity * 0.07);
  splashFilt.connect(splashLevel);
  splashLevel.connect(dest);
  addNoise(ctx, nodes, splashFilt, { bufSec: 2 });

  // Layer 4: Sub rumble — brown noise, only for heavier rain
  if (intensity > 0.5) {
    const rumbleFilt = biquad(ctx, "lowpass", 70 + intensity * 60, 1.4);
    const rumbleLevel = gain(ctx, (intensity - 0.5) * 0.45);
    rumbleFilt.connect(rumbleLevel);
    rumbleLevel.connect(dest);
    addNoise(ctx, nodes, rumbleFilt, { bufSec: 5, brown: true });
  }
}

// ── FIRE HELPER ──────────────────────────────────────────────────
function buildFire(
  ctx: AudioContext,
  nodes: AudioNode[],
  dest: AudioNode,
  intensity: number = 0.5
) {
  // Layer 1: Warm crackle bed
  const bedFilt = biquad(ctx, "lowpass", 500 + intensity * 350, 0.8);
  const bedLevel = gain(ctx, 0.1 + intensity * 0.1);
  bedFilt.connect(bedLevel);
  bedLevel.connect(dest);
  addNoise(ctx, nodes, bedFilt, { bufSec: 4, pink: true });

  // Layer 2: Active crackle — sawtooth AM creates irregular pop texture
  const crackFilt = biquad(ctx, "bandpass", 800 + intensity * 700, 1.1);
  const crackLevel = gain(ctx, 0);
  const crackLfo = ctx.createOscillator();
  crackLfo.type = "sawtooth";
  crackLfo.frequency.value = 5 + intensity * 12;
  const crackLfoG = gain(ctx, 0.07 + intensity * 0.06);
  crackLfo.connect(crackLfoG);
  crackLfoG.connect(crackLevel.gain);
  crackFilt.connect(crackLevel);
  crackLevel.connect(dest);
  addNoise(ctx, nodes, crackFilt, { bufSec: 2, pink: true });
  crackLfo.start();
  nodes.push(crackLfo);

  // Layer 3: Sharp pops — square wave AM, sporadic
  const popFilt = biquad(ctx, "bandpass", 2800 + intensity * 1000, 1.5);
  const popLevel = gain(ctx, 0);
  const popLfo = ctx.createOscillator();
  popLfo.type = "square";
  popLfo.frequency.value = 1.5 + intensity * 4;
  const popLfoG = gain(ctx, 0.025 + intensity * 0.02);
  popLfo.connect(popLfoG);
  popLfoG.connect(popLevel.gain);
  popFilt.connect(popLevel);
  popLevel.connect(dest);
  addNoise(ctx, nodes, popFilt, { bufSec: 1 });
  popLfo.start();
  nodes.push(popLfo);

  // Core warmth — low oscillator
  addHum(ctx, nodes, dest, 48 + intensity * 18, 0.007 + intensity * 0.005, 0.04, 4);
}

// ─────────────────────────────────────────────────────────────────
//  MAIN SOUND ENGINE
// ─────────────────────────────────────────────────────────────────

export function createNatureSound(
  ctx: AudioContext,
  preset: string
): NatureSoundResult {
  const nodes: AudioNode[] = [];
  const master = ctx.createGain();
  master.connect(ctx.destination);

  switch (preset) {

    // ══════════════════════════════════════════════
    //  RAIN SOUNDS
    // ══════════════════════════════════════════════

    case "Soft Rain": {
      buildRain(ctx, nodes, master, 0.22);
      addNoise(ctx, nodes, master, {
        bufSec: 5, filterType: "lowpass", filterFreq: 220, filterQ: 0.5, gainVal: 0.025, brown: true,
      });
      master.gain.value = 0.1;
      break;
    }

    case "Forest Rain": {
      buildRain(ctx, nodes, master, 0.45);
      addModulatedNoise(ctx, nodes, master, {
        filterType: "bandpass", baseFreq: 900, modDepth: 220, modRate: 0.1,
        gainVal: 0.07, noiseSec: 5, filterQ: 0.65, pink: true,
      });
      addNoise(ctx, nodes, master, {
        bufSec: 4, filterType: "lowpass", filterFreq: 800, gainVal: 0.04, pink: true,
      });
      master.gain.value = 0.09;
      break;
    }

    case "Heavy Rain": {
      buildRain(ctx, nodes, master, 0.92);
      master.gain.value = 0.08;
      break;
    }

    case "Rain on Roof": {
      buildRain(ctx, nodes, master, 0.56);
      addHum(ctx, nodes, master, 155, 0.014, 0.06, 9);
      addHum(ctx, nodes, master, 310, 0.006, 0.05, 6);
      addModulatedNoise(ctx, nodes, master, {
        filterType: "bandpass", baseFreq: 2900, modDepth: 900, modRate: 0.22,
        gainVal: 0.055, noiseSec: 2, filterQ: 1.6,
      });
      master.gain.value = 0.08;
      break;
    }

    case "Drizzle": {
      addModulatedNoise(ctx, nodes, master, {
        filterType: "highpass", baseFreq: 3800, modDepth: 900, modRate: 0.16,
        gainVal: 0.05, noiseSec: 2, pink: true,
      });
      addModulatedNoise(ctx, nodes, master, {
        filterType: "bandpass", baseFreq: 5200, modDepth: 1400, modRate: 0.25,
        gainVal: 0.028, noiseSec: 2, filterQ: 2.2,
      });
      addNoise(ctx, nodes, master, {
        bufSec: 5, filterType: "lowpass", filterFreq: 1000, filterQ: 0.5, gainVal: 0.025, pink: true,
      });
      master.gain.value = 0.13;
      break;
    }

    case "Monsoon Rain": {
      buildRain(ctx, nodes, master, 1.0);
      addModulatedNoise(ctx, nodes, master, {
        filterType: "lowpass", baseFreq: 720, modDepth: 580, modRate: 0.022,
        gainVal: 0.18, noiseSec: 6, pink: true,
      });
      addHum(ctx, nodes, master, 46, 0.016, 0.022, 6);
      master.gain.value = 0.07;
      break;
    }

    case "Rain + Thunder": {
      buildRain(ctx, nodes, master, 0.54);
      addModulatedNoise(ctx, nodes, master, {
        filterType: "lowpass", baseFreq: 95, modDepth: 65, modRate: 0.016,
        gainVal: 0.16, noiseSec: 8, filterQ: 1.6, brown: true,
      });
      addHum(ctx, nodes, master, 44, 0.015, 0.038, 12);
      master.gain.value = 0.08;
      break;
    }

    case "Rain on Window": {
      buildRain(ctx, nodes, master, 0.38);
      addOsc(ctx, nodes, master, "sine", 2700, 0.003);
      addOsc(ctx, nodes, master, "sine", 4100, 0.0015);
      addModulatedNoise(ctx, nodes, master, {
        filterType: "bandpass", baseFreq: 7800, modDepth: 2200, modRate: 0.27,
        gainVal: 0.05, noiseSec: 2, filterQ: 3.2,
      });
      master.gain.value = 0.09;
      break;
    }

    case "Thunderstorm": {
      buildRain(ctx, nodes, master, 0.87);
      addModulatedNoise(ctx, nodes, master, {
        filterType: "lowpass", baseFreq: 1050, modDepth: 750, modRate: 0.022,
        gainVal: 0.15, noiseSec: 6, pink: true,
      });
      addModulatedNoise(ctx, nodes, master, {
        filterType: "lowpass", baseFreq: 60, modDepth: 40, modRate: 0.011,
        gainVal: 0.22, noiseSec: 8, filterQ: 1.8, brown: true,
      });
      addHum(ctx, nodes, master, 42, 0.013, 0.028, 10);
      master.gain.value = 0.07;
      break;
    }

    // ══════════════════════════════════════════════
    //  WATER SOUNDS
    // ══════════════════════════════════════════════

    case "Ocean Waves": {
      const waveLayers = [
        { freq: 200, rate: 0.055, g: 0.28 },
        { freq: 340, rate: 0.08,  g: 0.14 },
        { freq: 140, rate: 0.042, g: 0.19 },
      ];
      waveLayers.forEach(({ freq, rate, g: gv }) => {
        const filt = biquad(ctx, "lowpass", freq, 0.7);
        const ampG = ctx.createGain();
        ampG.gain.value = gv;
        const lfo = ctx.createOscillator();
        lfo.type = "sine";
        lfo.frequency.value = rate;
        const lfoG = ctx.createGain();
        lfoG.gain.value = gv * 0.78;
        lfo.connect(lfoG);
        lfoG.connect(ampG.gain);
        filt.connect(ampG);
        ampG.connect(master);
        lfo.start();
        nodes.push(lfo);
        addNoise(ctx, nodes, filt, { bufSec: 6, pink: true });
      });
      addModulatedNoise(ctx, nodes, master, {
        filterType: "bandpass", baseFreq: 1800, modDepth: 620, modRate: 0.07,
        gainVal: 0.055, noiseSec: 4, filterQ: 0.6, pink: true,
      });
      addNoise(ctx, nodes, master, {
        bufSec: 5, filterType: "lowpass", filterFreq: 55, gainVal: 0.055, brown: true,
      });
      master.gain.value = 0.1;
      break;
    }

    case "Stream": {
      addModulatedNoise(ctx, nodes, master, {
        filterType: "bandpass", baseFreq: 780, modDepth: 480, modRate: 0.19,
        gainVal: 0.12, noiseSec: 3, filterQ: 0.6, pink: true,
      });
      addModulatedNoise(ctx, nodes, master, {
        filterType: "bandpass", baseFreq: 1500, modDepth: 720, modRate: 0.3,
        gainVal: 0.08, noiseSec: 2, filterQ: 0.8, pink: true,
      });
      addModulatedNoise(ctx, nodes, master, {
        filterType: "highpass", baseFreq: 2800, modDepth: 1300, modRate: 0.38,
        gainVal: 0.035, noiseSec: 2,
      });
      addNoise(ctx, nodes, master, {
        bufSec: 4, filterType: "bandpass", filterFreq: 240, filterQ: 0.4, gainVal: 0.04, brown: true,
      });
      master.gain.value = 0.07;
      break;
    }

    case "Waterfall": {
      addModulatedNoise(ctx, nodes, master, {
        filterType: "lowpass", baseFreq: 1100, modDepth: 240, modRate: 0.024,
        gainVal: 0.3, noiseSec: 5, pink: true,
      });
      addModulatedNoise(ctx, nodes, master, {
        filterType: "bandpass", baseFreq: 650, modDepth: 150, modRate: 0.032,
        gainVal: 0.15, noiseSec: 4, filterQ: 0.5, pink: true,
      });
      addModulatedNoise(ctx, nodes, master, {
        filterType: "highpass", baseFreq: 4000, modDepth: 800, modRate: 0.055,
        gainVal: 0.08, noiseSec: 3,
      });
      addNoise(ctx, nodes, master, {
        bufSec: 5, filterType: "lowpass", filterFreq: 110, gainVal: 0.1, brown: true,
      });
      master.gain.value = 0.07;
      break;
    }

    // ══════════════════════════════════════════════
    //  WIND SOUNDS
    // ══════════════════════════════════════════════

    case "Gentle Breeze": {
      addModulatedNoise(ctx, nodes, master, {
        filterType: "lowpass", baseFreq: 380, modDepth: 140, modRate: 0.05,
        gainVal: 0.07, noiseSec: 6, pink: true,
      });
      addModulatedNoise(ctx, nodes, master, {
        filterType: "bandpass", baseFreq: 1300, modDepth: 420, modRate: 0.13,
        gainVal: 0.022, noiseSec: 3, filterQ: 0.7, pink: true,
      });
      master.gain.value = 0.06;
      break;
    }

    case "Mountain Wind": {
      addModulatedNoise(ctx, nodes, master, {
        filterType: "bandpass", baseFreq: 700, modDepth: 460, modRate: 0.036,
        gainVal: 0.13, noiseSec: 5, filterQ: 0.85, pink: true,
      });
      addHum(ctx, nodes, master, 530, 0.004, 0.06, 45);
      addHum(ctx, nodes, master, 790, 0.002, 0.09, 35);
      addModulatedNoise(ctx, nodes, master, {
        filterType: "highpass", baseFreq: 2400, modDepth: 650, modRate: 0.075,
        gainVal: 0.045, noiseSec: 3, pink: true,
      });
      master.gain.value = 0.06;
      break;
    }

    case "Storm Wind": {
      addModulatedNoise(ctx, nodes, master, {
        filterType: "lowpass", baseFreq: 1500, modDepth: 1200, modRate: 0.02,
        gainVal: 0.22, noiseSec: 6, pink: true,
      });
      addModulatedNoise(ctx, nodes, master, {
        filterType: "bandpass", baseFreq: 580, modDepth: 380, modRate: 0.044,
        gainVal: 0.12, noiseSec: 5, filterQ: 0.7, pink: true,
      });
      addHum(ctx, nodes, master, 74, 0.013, 0.032, 12);
      master.gain.value = 0.06;
      break;
    }

    case "Fan": {
      addNoise(ctx, nodes, master, {
        bufSec: 6, filterType: "lowpass", filterFreq: 650, filterQ: 0.45, gainVal: 0.055, pink: true,
      });
      addHum(ctx, nodes, master, 118, 0.012, 0.16, 1.2);
      addHum(ctx, nodes, master, 236, 0.006, 0.16, 1.2);
      addHum(ctx, nodes, master, 354, 0.003, 0.16, 1.2);
      addModulatedNoise(ctx, nodes, master, {
        filterType: "bandpass", baseFreq: 340, modDepth: 45, modRate: 7.5,
        gainVal: 0.02, noiseSec: 3, filterQ: 2.2,
      });
      master.gain.value = 0.06;
      break;
    }

    // ══════════════════════════════════════════════
    //  ATMOSPHERIC
    // ══════════════════════════════════════════════

    case "Deep Cave": {
      addNoise(ctx, nodes, master, {
        bufSec: 5, filterType: "lowpass", filterFreq: 95, gainVal: 0.055, brown: true,
      });
      addModulatedNoise(ctx, nodes, master, {
        filterType: "bandpass", baseFreq: 280, modDepth: 75, modRate: 0.018,
        gainVal: 0.025, noiseSec: 6, filterQ: 0.5, pink: true,
      });
      ([
        { freq: 1650, rate: 0.2,  pitchDepth: 90 },
        { freq: 2100, rate: 0.14, pitchDepth: 60 },
        { freq: 1300, rate: 0.28, pitchDepth: 120 },
      ] as { freq: number; rate: number; pitchDepth: number }[]).forEach(({ freq, rate, pitchDepth }) => {
        const drip = ctx.createOscillator();
        drip.type = "sine";
        drip.frequency.value = freq;
        const dripGain = ctx.createGain();
        dripGain.gain.value = 0;
        const ampLfo = ctx.createOscillator();
        ampLfo.type = "sine";
        ampLfo.frequency.value = rate;
        const ampG = ctx.createGain();
        ampG.gain.value = 0.0042;
        ampLfo.connect(ampG);
        ampG.connect(dripGain.gain);
        const pitchLfo = ctx.createOscillator();
        pitchLfo.frequency.value = rate * 1.8;
        const pitchG = ctx.createGain();
        pitchG.gain.value = pitchDepth;
        pitchLfo.connect(pitchG);
        pitchG.connect(drip.frequency);
        drip.connect(dripGain);
        dripGain.connect(master);
        drip.start();
        ampLfo.start();
        pitchLfo.start();
        nodes.push(drip, ampLfo, pitchLfo);
      });
      master.gain.value = 0.15;
      break;
    }

    case "Night Ambience": {
      addModulatedNoise(ctx, nodes, master, {
        filterType: "lowpass", baseFreq: 190, modDepth: 70, modRate: 0.038,
        gainVal: 0.035, noiseSec: 6, pink: true,
      });
      ([
        { freq: 4200, rate: 5.3, gv: 0.0045 },
        { freq: 4620, rate: 4.9, gv: 0.005  },
        { freq: 5050, rate: 6.1, gv: 0.0045 },
        { freq: 4420, rate: 5.7, gv: 0.004  },
        { freq: 4840, rate: 6.8, gv: 0.005  },
      ] as { freq: number; rate: number; gv: number }[]).forEach(({ freq, rate, gv }) => {
        addPulsedOsc(ctx, nodes, master, freq, rate, gv);
      });
      addPulsedOsc(ctx, nodes, master, 275, 0.38, 0.005);
      addPulsedOsc(ctx, nodes, master, 340, 0.28, 0.004);
      master.gain.value = 0.07;
      break;
    }

    case "Space Ambient": {
      ([
        { freq: 55,  type: "sine"     as OscillatorType, lfoRate: 0.018, lfoDepth: 6 },
        { freq: 82,  type: "sine"     as OscillatorType, lfoRate: 0.025, lfoDepth: 5 },
        { freq: 110, type: "triangle" as OscillatorType, lfoRate: 0.031, lfoDepth: 9 },
        { freq: 165, type: "triangle" as OscillatorType, lfoRate: 0.042, lfoDepth: 14 },
        { freq: 220, type: "sine"     as OscillatorType, lfoRate: 0.055, lfoDepth: 18 },
      ]).forEach(({ freq, type, lfoRate, lfoDepth }, i) => {
        const o = ctx.createOscillator();
        o.type = type;
        o.frequency.value = freq;
        const g = ctx.createGain();
        g.gain.value = 0.018 - i * 0.002;
        const freqLfo = ctx.createOscillator();
        freqLfo.frequency.value = lfoRate;
        const freqLfoG = ctx.createGain();
        freqLfoG.gain.value = lfoDepth;
        freqLfo.connect(freqLfoG);
        freqLfoG.connect(o.frequency);
        o.connect(g);
        g.connect(master);
        o.start();
        freqLfo.start();
        nodes.push(o, freqLfo);
      });
      addNoise(ctx, nodes, master, {
        bufSec: 6, filterType: "bandpass", filterFreq: 480, filterQ: 0.22, gainVal: 0.035, pink: true,
      });
      addHum(ctx, nodes, master, 27, 0.014, 0.009, 3);
      master.gain.value = 0.12;
      break;
    }

    case "Distant City": {
      addModulatedNoise(ctx, nodes, master, {
        filterType: "lowpass", baseFreq: 370, modDepth: 95, modRate: 0.028,
        gainVal: 0.065, noiseSec: 6, pink: true,
      });
      addModulatedNoise(ctx, nodes, master, {
        filterType: "bandpass", baseFreq: 1350, modDepth: 780, modRate: 0.065,
        gainVal: 0.022, noiseSec: 4, filterQ: 0.8, pink: true,
      });
      addHum(ctx, nodes, master, 60, 0.007, 0.08, 0.8);
      addHum(ctx, nodes, master, 120, 0.0035, 0.08, 0.8);
      master.gain.value = 0.06;
      break;
    }

    // ══════════════════════════════════════════════
    //  FIRE / WARM
    // ══════════════════════════════════════════════

    case "Campfire": {
      buildFire(ctx, nodes, master, 0.68);
      addModulatedNoise(ctx, nodes, master, {
        filterType: "lowpass", baseFreq: 330, modDepth: 110, modRate: 0.07,
        gainVal: 0.022, noiseSec: 5, pink: true,
      });
      master.gain.value = 0.07;
      break;
    }

    case "Fireplace": {
      buildFire(ctx, nodes, master, 0.44);
      addHum(ctx, nodes, master, 56, 0.016, 0.042, 3.5);
      addModulatedNoise(ctx, nodes, master, {
        filterType: "lowpass", baseFreq: 310, modDepth: 75, modRate: 0.048,
        gainVal: 0.038, noiseSec: 4, pink: true,
      });
      master.gain.value = 0.07;
      break;
    }

    // ══════════════════════════════════════════════
    //  MELODIC / RESONANT
    // ══════════════════════════════════════════════

    case "Singing Bowls": {
      ([
        { freq: 220, g: 0.014 },
        { freq: 293, g: 0.011 },
        { freq: 330, g: 0.010 },
        { freq: 440, g: 0.009 },
        { freq: 587, g: 0.007 },
        { freq: 659, g: 0.006 },
      ] as { freq: number; g: number }[]).forEach(({ freq, g: gv }, i) => {
        const o = ctx.createOscillator();
        o.type = "sine";
        o.frequency.value = freq;
        const g = ctx.createGain();
        g.gain.value = gv;
        const breathLfo = ctx.createOscillator();
        breathLfo.frequency.value = 0.065 + i * 0.018;
        const breathG = ctx.createGain();
        breathG.gain.value = gv * 0.45;
        breathLfo.connect(breathG);
        breathG.connect(g.gain);
        o.connect(g);
        g.connect(master);
        o.start();
        breathLfo.start();
        nodes.push(o, breathLfo);
        if (i < 4) {
          addOsc(ctx, nodes, master, "sine", freq * 2.756, gv * 0.18);
        }
      });
      addNoise(ctx, nodes, master, {
        bufSec: 4, filterType: "bandpass", filterFreq: 380, filterQ: 0.28, gainVal: 0.007, pink: true,
      });
      master.gain.value = 0.1;
      break;
    }

    case "Wind Chimes": {
      ([1047, 1175, 1319, 1568, 1760, 2093, 2349] as number[]).forEach((freq, i) => {
        const o = ctx.createOscillator();
        o.type = "sine";
        o.frequency.value = freq;
        const g = ctx.createGain();
        g.gain.value = 0;
        const strikeLfo = ctx.createOscillator();
        strikeLfo.type = "sine";
        strikeLfo.frequency.value = 0.035 + i * 0.055 + (i % 3) * 0.028;
        const strikeG = ctx.createGain();
        strikeG.gain.value = 0.0065;
        strikeLfo.connect(strikeG);
        strikeG.connect(g.gain);
        o.connect(g);
        g.connect(master);
        o.start();
        strikeLfo.start();
        nodes.push(o, strikeLfo);
      });
      addModulatedNoise(ctx, nodes, master, {
        filterType: "lowpass", baseFreq: 270, modDepth: 95, modRate: 0.058,
        gainVal: 0.025, noiseSec: 5, pink: true,
      });
      master.gain.value = 0.09;
      break;
    }

    case "Tibetan Drone": {
      ([
        { harmonic: 1, type: "sawtooth" as OscillatorType, gv: 0.12 },
        { harmonic: 2, type: "sine"     as OscillatorType, gv: 0.06 },
        { harmonic: 3, type: "sine"     as OscillatorType, gv: 0.04 },
        { harmonic: 4, type: "sine"     as OscillatorType, gv: 0.026 },
        { harmonic: 5, type: "sine"     as OscillatorType, gv: 0.016 },
        { harmonic: 6, type: "sine"     as OscillatorType, gv: 0.01  },
      ]).forEach(({ harmonic, type, gv }, i) => {
        const freq = 55 * harmonic;
        const o = ctx.createOscillator();
        o.type = type;
        o.frequency.value = freq;
        const f = biquad(ctx, "lowpass", 180 + harmonic * 65, 1.4);
        const g = ctx.createGain();
        g.gain.value = gv;
        const breathLfo = ctx.createOscillator();
        breathLfo.frequency.value = 0.05 + i * 0.012;
        const breathG = ctx.createGain();
        breathG.gain.value = gv * 0.28;
        breathLfo.connect(breathG);
        breathG.connect(g.gain);
        o.connect(f);
        f.connect(g);
        g.connect(master);
        o.start();
        breathLfo.start();
        nodes.push(o, breathLfo);
      });
      addNoise(ctx, nodes, master, {
        bufSec: 5, filterType: "bandpass", filterFreq: 190, filterQ: 0.38, gainVal: 0.012, pink: true,
      });
      master.gain.value = 0.09;
      break;
    }

    // ══════════════════════════════════════════════
    //  ANIMALS / NATURE
    // ══════════════════════════════════════════════

    case "Crickets": {
      ([
        { freq: 4400, rate: 5.8, gv: 0.006 },
        { freq: 4760, rate: 6.4, gv: 0.005 },
        { freq: 5120, rate: 5.1, gv: 0.006 },
        { freq: 4600, rate: 7.1, gv: 0.004 },
        { freq: 4920, rate: 6.9, gv: 0.005 },
      ] as { freq: number; rate: number; gv: number }[]).forEach(({ freq, rate, gv }) => {
        addPulsedOsc(ctx, nodes, master, freq, rate, gv);
        addPulsedOsc(ctx, nodes, master, freq * 1.48, rate, gv * 0.18);
      });
      addNoise(ctx, nodes, master, {
        bufSec: 6, filterType: "lowpass", filterFreq: 280, gainVal: 0.018, pink: true,
      });
      master.gain.value = 0.09;
      break;
    }

    case "Whale Song": {
      ([
        { base: 82,  depth: 48, rate: 0.055, gv: 0.025 },
        { base: 138, depth: 32, rate: 0.038, gv: 0.012 },
        { base: 52,  depth: 22, rate: 0.028, gv: 0.018 },
      ] as { base: number; depth: number; rate: number; gv: number }[]).forEach(({ base, depth, rate, gv }) => {
        const o = ctx.createOscillator();
        o.type = "sine";
        o.frequency.value = base;
        const g = ctx.createGain();
        g.gain.value = gv;
        const freqLfo = ctx.createOscillator();
        freqLfo.frequency.value = rate;
        const freqLfoG = ctx.createGain();
        freqLfoG.gain.value = depth;
        freqLfo.connect(freqLfoG);
        freqLfoG.connect(o.frequency);
        const ampLfo = ctx.createOscillator();
        ampLfo.frequency.value = rate * 0.65;
        const ampG = ctx.createGain();
        ampG.gain.value = gv * 0.5;
        ampLfo.connect(ampG);
        ampG.connect(g.gain);
        o.connect(g);
        g.connect(master);
        o.start();
        freqLfo.start();
        ampLfo.start();
        nodes.push(o, freqLfo, ampLfo);
      });
      addModulatedNoise(ctx, nodes, master, {
        filterType: "lowpass", baseFreq: 210, modDepth: 75, modRate: 0.038,
        gainVal: 0.038, noiseSec: 6, pink: true,
      });
      addNoise(ctx, nodes, master, {
        bufSec: 5, filterType: "lowpass", filterFreq: 75, gainVal: 0.04, brown: true,
      });
      master.gain.value = 0.1;
      break;
    }

    case "Jungle": {
      addModulatedNoise(ctx, nodes, master, {
        filterType: "bandpass", baseFreq: 5200, modDepth: 1600, modRate: 0.32,
        gainVal: 0.038, noiseSec: 2, filterQ: 2.2,
      });
      addModulatedNoise(ctx, nodes, master, {
        filterType: "bandpass", baseFreq: 3600, modDepth: 850, modRate: 0.24,
        gainVal: 0.032, noiseSec: 3, filterQ: 1.6,
      });
      ([
        { freq: 2450, ampRate: 0.19, fRate: 0.58, fDepth: 260 },
        { freq: 3300, ampRate: 0.13, fRate: 0.45, fDepth: 180 },
        { freq: 2850, ampRate: 0.26, fRate: 0.72, fDepth: 200 },
      ] as { freq: number; ampRate: number; fRate: number; fDepth: number }[]).forEach(({ freq, ampRate, fRate, fDepth }) => {
        const o = ctx.createOscillator();
        o.type = "sine";
        o.frequency.value = freq;
        const g = ctx.createGain();
        g.gain.value = 0;
        const ampLfo = ctx.createOscillator();
        ampLfo.frequency.value = ampRate;
        const ampG = ctx.createGain();
        ampG.gain.value = 0.003;
        ampLfo.connect(ampG);
        ampG.connect(g.gain);
        const fLfo = ctx.createOscillator();
        fLfo.frequency.value = fRate;
        const fLfoG = ctx.createGain();
        fLfoG.gain.value = fDepth;
        fLfo.connect(fLfoG);
        fLfoG.connect(o.frequency);
        o.connect(g);
        g.connect(master);
        o.start();
        ampLfo.start();
        fLfo.start();
        nodes.push(o, ampLfo, fLfo);
      });
      addModulatedNoise(ctx, nodes, master, {
        filterType: "lowpass", baseFreq: 480, modDepth: 140, modRate: 0.055,
        gainVal: 0.038, noiseSec: 5, pink: true,
      });
      master.gain.value = 0.07;
      break;
    }

    case "Forest Birds": {
      ([
        { freq: 3200, chirpRate: 8.0,  trillRate: 0.2,  wanderRate: 0.12 },
        { freq: 2600, chirpRate: 5.5,  trillRate: 0.14, wanderRate: 0.09 },
        { freq: 3900, chirpRate: 10.0, trillRate: 0.28, wanderRate: 0.18 },
        { freq: 2200, chirpRate: 4.5,  trillRate: 0.11, wanderRate: 0.07 },
        { freq: 4300, chirpRate: 12.0, trillRate: 0.36, wanderRate: 0.22 },
        { freq: 2900, chirpRate: 7.0,  trillRate: 0.19, wanderRate: 0.14 },
      ] as { freq: number; chirpRate: number; trillRate: number; wanderRate: number }[]).forEach(({ freq, chirpRate, trillRate, wanderRate }) => {
        const o = ctx.createOscillator();
        o.type = "sine";
        o.frequency.value = freq;
        const g = ctx.createGain();
        g.gain.value = 0;
        const ampLfo = ctx.createOscillator();
        ampLfo.frequency.value = chirpRate;
        const ampG = ctx.createGain();
        ampG.gain.value = 0.0032;
        ampLfo.connect(ampG);
        ampG.connect(g.gain);
        const trillLfo = ctx.createOscillator();
        trillLfo.frequency.value = trillRate * 5;
        const trillG = ctx.createGain();
        trillG.gain.value = 160;
        trillLfo.connect(trillG);
        trillG.connect(o.frequency);
        const wanderLfo = ctx.createOscillator();
        wanderLfo.frequency.value = wanderRate;
        const wanderG = ctx.createGain();
        wanderG.gain.value = 240;
        wanderLfo.connect(wanderG);
        wanderG.connect(o.frequency);
        o.connect(g);
        g.connect(master);
        o.start();
        ampLfo.start();
        trillLfo.start();
        wanderLfo.start();
        nodes.push(o, ampLfo, trillLfo, wanderLfo);
      });
      addModulatedNoise(ctx, nodes, master, {
        filterType: "lowpass", baseFreq: 380, modDepth: 140, modRate: 0.068,
        gainVal: 0.028, noiseSec: 5, pink: true,
      });
      master.gain.value = 0.08;
      break;
    }

    // ══════════════════════════════════════════════
    //  URBAN / MECHANICAL
    // ══════════════════════════════════════════════

    case "Train Ride": {
      addModulatedNoise(ctx, nodes, master, {
        filterType: "lowpass", baseFreq: 310, modDepth: 75, modRate: 0.032,
        gainVal: 0.065, noiseSec: 5, pink: true,
      });
      const clackGain = ctx.createGain();
      clackGain.gain.value = 0;
      clackGain.connect(master);
      addNoise(ctx, nodes, clackGain, {
        bufSec: 2, filterType: "bandpass", filterFreq: 820, filterQ: 1.6, gainVal: 0.55,
      });
      const clackLfo = ctx.createOscillator();
      clackLfo.type = "square";
      clackLfo.frequency.value = 2.45;
      const clackLfoG = ctx.createGain();
      clackLfoG.gain.value = 0.048;
      clackLfo.connect(clackLfoG);
      clackLfoG.connect(clackGain.gain);
      clackLfo.start();
      nodes.push(clackLfo);
      addHum(ctx, nodes, master, 33, 0.017, 0.075, 3.2);
      addHum(ctx, nodes, master, 66, 0.009, 0.075, 3.2);
      addModulatedNoise(ctx, nodes, master, {
        filterType: "bandpass", baseFreq: 1600, modDepth: 450, modRate: 0.14,
        gainVal: 0.018, noiseSec: 3, filterQ: 2.2,
      });
      master.gain.value = 0.07;
      break;
    }

    case "Airplane Cabin": {
      addHum(ctx, nodes, master, 86, 0.014, 0.016, 1.8);
      addHum(ctx, nodes, master, 172, 0.007, 0.016, 1.8);
      addHum(ctx, nodes, master, 258, 0.004, 0.016, 1.8);
      addNoise(ctx, nodes, master, {
        bufSec: 6, filterType: "bandpass", filterFreq: 420, filterQ: 0.32, gainVal: 0.065, pink: true,
      });
      addModulatedNoise(ctx, nodes, master, {
        filterType: "bandpass", baseFreq: 3800, modDepth: 420, modRate: 0.018,
        gainVal: 0.022, noiseSec: 4, filterQ: 0.5, pink: true,
      });
      master.gain.value = 0.08;
      break;
    }

    case "Distant Highway": {
      addModulatedNoise(ctx, nodes, master, {
        filterType: "lowpass", baseFreq: 440, modDepth: 125, modRate: 0.038,
        gainVal: 0.062, noiseSec: 6, pink: true,
      });
      addModulatedNoise(ctx, nodes, master, {
        filterType: "lowpass", baseFreq: 175, modDepth: 90, modRate: 0.022,
        gainVal: 0.038, noiseSec: 5, brown: true,
      });
      addModulatedNoise(ctx, nodes, master, {
        filterType: "bandpass", baseFreq: 870, modDepth: 480, modRate: 0.085,
        gainVal: 0.018, noiseSec: 4, filterQ: 0.7, pink: true,
      });
      master.gain.value = 0.06;
      break;
    }

    // ══════════════════════════════════════════════
    //  SPECIAL
    // ══════════════════════════════════════════════

    case "Heartbeat": {
      // Lub (S1) — mitral/tricuspid closure — lower, heavier beat
      const lub = ctx.createOscillator();
      lub.type = "sine";
      lub.frequency.value = 52;
      const lubGain = ctx.createGain();
      lubGain.gain.value = 0;
      const lubLfo = ctx.createOscillator();
      lubLfo.type = "sine";
      lubLfo.frequency.value = 1.07;
      const lubLfoG = ctx.createGain();
      lubLfoG.gain.value = 0.055;
      lubLfo.connect(lubLfoG);
      lubLfoG.connect(lubGain.gain);
      lub.connect(lubGain);
      lubGain.connect(master);
      lub.start();
      lubLfo.start();
      nodes.push(lub, lubLfo);

      // Dub (S2) — aortic/pulmonary closure — slightly higher, softer
      const dub = ctx.createOscillator();
      dub.type = "sine";
      dub.frequency.value = 72;
      const dubGain = ctx.createGain();
      dubGain.gain.value = 0;
      const dubLfo = ctx.createOscillator();
      dubLfo.type = "sine";
      dubLfo.frequency.value = 1.07;
      const dubLfoG = ctx.createGain();
      dubLfoG.gain.value = 0.026;
      dubLfo.connect(dubLfoG);
      dubLfoG.connect(dubGain.gain);
      dub.connect(dubGain);
      dubGain.connect(master);
      dub.start();
      dubLfo.start();
      nodes.push(dub, dubLfo);

      // Sub-bass thump per beat
      addPulsedOsc(ctx, nodes, master, 36, 1.07, 0.042);

      // Body resonance
      addNoise(ctx, nodes, master, {
        bufSec: 3, filterType: "bandpass", filterFreq: 58, filterQ: 1.1, gainVal: 0.038, brown: true,
      });
      master.gain.value = 0.18;
      break;
    }

    default: {
      const f = biquad(ctx, "lowpass", 500, 1);
      f.connect(master);
      addNoise(ctx, nodes, f, { bufSec: 3, gainVal: 0.4 });
      master.gain.value = 0.05;
    }
  }

  return {
    nodes,
    master,
    stop: () => {
      nodes.forEach((n) => {
        try {
          (n as AudioScheduledSourceNode).stop();
        } catch {
          // already stopped
        }
      });
      master.disconnect();
    },
  };
}

// ─────────────────────────────────────────────────────────────────
//  SOUND PRESET CATALOG
// ─────────────────────────────────────────────────────────────────
export const SOUND_PRESETS: SoundPreset[] = [
  // Rain
  { id: "Soft Rain",       name: "Soft Rain",           emoji: "🌧️", category: "Rain" },
  { id: "Forest Rain",     name: "Forest Canopy Rain",  emoji: "🌧️", category: "Rain" },
  { id: "Drizzle",         name: "Light Drizzle",       emoji: "🌦️", category: "Rain" },
  { id: "Rain on Roof",    name: "Roof Rain Resonance", emoji: "🏠",  category: "Rain" },
  { id: "Rain on Window",  name: "Window Rain Taps",    emoji: "🪟",  category: "Rain" },
  { id: "Heavy Rain",      name: "Heavy Rain",          emoji: "🌧️", category: "Rain" },
  { id: "Monsoon Rain",    name: "Monsoon Downpour",    emoji: "🌊",  category: "Rain" },
  { id: "Rain + Thunder",  name: "Rain + Thunder",      emoji: "⛈️", category: "Rain" },
  { id: "Thunderstorm",    name: "Thunderstorm",        emoji: "⛈️", category: "Rain" },
  // Water
  { id: "Ocean Waves", name: "Ocean Waves", emoji: "🌊", category: "Water" },
  { id: "Stream",      name: "Stream",      emoji: "💧", category: "Water" },
  { id: "Waterfall",   name: "Waterfall",   emoji: "🏞️", category: "Water" },
  // Wind
  { id: "Gentle Breeze",  name: "Soft Breeze",       emoji: "🍃", category: "Wind" },
  { id: "Mountain Wind",  name: "High Mountain Wind", emoji: "🌬️", category: "Wind" },
  { id: "Storm Wind",     name: "Storm Wind Wash",    emoji: "🌪️", category: "Wind" },
  { id: "Fan",            name: "Fan Hum",            emoji: "🔄", category: "Wind" },
  // Atmosphere
  { id: "Deep Cave",      name: "Deep Cave Drips",  emoji: "🕳️", category: "Atmosphere" },
  { id: "Night Ambience", name: "Crickets at Night", emoji: "🌙", category: "Atmosphere" },
  { id: "Space Ambient",  name: "Cosmic Drone",      emoji: "✨", category: "Atmosphere" },
  { id: "Distant City",   name: "Distant City Hush", emoji: "🌃", category: "Atmosphere" },
  // Fire
  { id: "Campfire",   name: "Ember Crackle", emoji: "🔥", category: "Fire" },
  { id: "Fireplace",  name: "Hearth Hum",    emoji: "🪵", category: "Fire" },
  // Melodic
  { id: "Singing Bowls", name: "Singing Bowls", emoji: "🔔", category: "Melodic" },
  { id: "Wind Chimes",   name: "Wind Chimes",   emoji: "🎐", category: "Melodic" },
  { id: "Tibetan Drone", name: "Tibetan Drone", emoji: "🙏", category: "Melodic" },
  // Nature
  { id: "Crickets",     name: "Crickets",        emoji: "🦗", category: "Nature" },
  { id: "Whale Song",   name: "Whale-like Drone", emoji: "🐋", category: "Nature" },
  { id: "Jungle",       name: "Jungle Pulse",    emoji: "🌴", category: "Nature" },
  { id: "Forest Birds", name: "Forest Birds",    emoji: "🐦", category: "Nature" },
  // Urban
  { id: "Train Ride",       name: "Rail Car Hum",    emoji: "🚂", category: "Urban" },
  { id: "Airplane Cabin",   name: "Cabin Engine Hum", emoji: "✈️", category: "Urban" },
  { id: "Distant Highway",  name: "Highway Wash",    emoji: "🛣️", category: "Urban" },
  // Special
  { id: "Heartbeat", name: "Heartbeat", emoji: "💓", category: "Special" },
];

// Backward-compatible export
export const NATURES = ["Ocean Waves", "Forest Rain", "Mountain Wind", "Deep Cave"] as const;
export type NaturePreset = (typeof NATURES)[number];
