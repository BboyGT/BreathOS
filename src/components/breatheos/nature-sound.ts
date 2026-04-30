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

function noiseBuf(ctx: AudioContext, sec: number = 4): AudioBuffer {
  const b = ctx.createBuffer(1, ctx.sampleRate * sec, ctx.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
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

/** Noise source → optional filter → optional gain → destination. Returns source. */
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
  } = {}
): AudioBufferSourceNode {
  const { bufSec = 4, filterType, filterFreq, filterQ = 1, gainVal } = opts;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf(ctx, bufSec);
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

/** LFO-modulated filter connected to destination. Returns the filter. */
function modFilter(
  ctx: AudioContext,
  nodes: AudioNode[],
  dest: AudioNode,
  type: BiquadFilterType,
  baseFreq: number,
  modDepth: number,
  modRate: number
): BiquadFilterNode {
  const f = biquad(ctx, type, baseFreq);
  const lfo = ctx.createOscillator();
  lfo.frequency.value = modRate;
  const lg = gain(ctx, modDepth);
  lfo.connect(lg);
  lg.connect(f.frequency);
  f.connect(dest);
  lfo.start();
  nodes.push(lfo);
  return f;
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
  }
) {
  const { filterType, baseFreq, modDepth, modRate, gainVal, noiseSec = 4, filterQ = 1 } = opts;
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
  addNoise(ctx, nodes, filter, { bufSec: noiseSec });
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

/**
 * Builds a realistic rain sound with 3 layers:
 *  1. Continuous "shhh" — lowpass-filtered noise (the steady rain)
 *  2. Droplets — bandpass noise around 2–5 kHz (individual drops pattering)
 *  3. Splashes — highpass noise around 6–10 kHz (sharp impact sounds)
 *
 * `intensity` 0–1 controls volume & brightness.
 */
function buildRain(
  ctx: AudioContext,
  nodes: AudioNode[],
  dest: AudioNode,
  intensity: number = 0.5
) {
  // Layer 1: Steady rain hiss
  const hiss = modFilter(ctx, nodes, dest, "lowpass", 1800 + intensity * 1200, 400, 0.07);
  addNoise(ctx, nodes, hiss, { bufSec: 5, gainVal: 0.35 + intensity * 0.25 });

  // Layer 2: Droplets — pattering in the 2–5 kHz range
  const drops = biquad(ctx, "bandpass", 3000 + intensity * 1500, 0.4);
  const dropsMod = modFilter(ctx, nodes, dest, "lowpass", 3500 + intensity * 1500, 600, 0.12);
  addNoise(ctx, nodes, drops, { bufSec: 3, gainVal: 0.2 + intensity * 0.2 });
  drops.connect(dropsMod);

  // Layer 3: Sharp splashes
  const splash = biquad(ctx, "highpass", 6000, 0.3);
  splash.connect(dest);
  addNoise(ctx, nodes, splash, { bufSec: 2, gainVal: 0.05 + intensity * 0.1 });
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

    case "Forest Rain": {
      // Rain softened by a tree canopy with leafy midrange rustle
      buildRain(ctx, nodes, master, 0.45);
      addModulatedNoise(ctx, nodes, master, {
        filterType: "bandpass",
        baseFreq: 900,
        modDepth: 180,
        modRate: 0.11,
        gainVal: 0.1,
        noiseSec: 5,
        filterQ: 0.7,
      });
      master.gain.value = 0.08;
      break;
    }

    case "Soft Rain": {
      // Soft, even rainfall without many sharp droplets
      buildRain(ctx, nodes, master, 0.2);
      addModulatedNoise(ctx, nodes, master, {
        filterType: "lowpass",
        baseFreq: 1100,
        modDepth: 160,
        modRate: 0.05,
        gainVal: 0.08,
        noiseSec: 5,
      });
      master.gain.value = 0.09;
      break;
    }

    case "Heavy Rain": {
      // Intense, immersive downpour
      buildRain(ctx, nodes, master, 0.85);
      // Extra low rumble for weight
      const rumble = biquad(ctx, "lowpass", 150, 1);
      rumble.connect(master);
      addNoise(ctx, nodes, rumble, { bufSec: 4, gainVal: 0.3 });
      master.gain.value = 0.08;
      break;
    }

    case "Rain on Roof": {
      // Harder, boxier roof patter with resonant enclosure
      buildRain(ctx, nodes, master, 0.55);
      addHum(ctx, nodes, master, 190, 0.012, 0.09, 6);
      addOsc(ctx, nodes, master, "triangle", 980, 0.004);
      addOsc(ctx, nodes, master, "triangle", 1480, 0.0025);
      addModulatedNoise(ctx, nodes, master, {
        filterType: "bandpass",
        baseFreq: 2300,
        modDepth: 500,
        modRate: 0.16,
        gainVal: 0.07,
        noiseSec: 3,
        filterQ: 1.1,
      });
      master.gain.value = 0.08;
      break;
    }

    case "Drizzle": {
      // Sparse, airy drizzle with almost no low-end wash
      addModulatedNoise(ctx, nodes, master, {
        filterType: "highpass",
        baseFreq: 4200,
        modDepth: 700,
        modRate: 0.18,
        gainVal: 0.06,
        noiseSec: 2,
      });
      addModulatedNoise(ctx, nodes, master, {
        filterType: "bandpass",
        baseFreq: 5200,
        modDepth: 1200,
        modRate: 0.27,
        gainVal: 0.035,
        noiseSec: 2,
        filterQ: 2.5,
      });
      master.gain.value = 0.11;
      break;
    }

    case "Monsoon Rain": {
      // Dense tropical sheet rain with heavy wind and low pressure rumble
      buildRain(ctx, nodes, master, 0.95);
      addModulatedNoise(ctx, nodes, master, {
        filterType: "lowpass",
        baseFreq: 650,
        modDepth: 500,
        modRate: 0.035,
        gainVal: 0.22,
        noiseSec: 6,
      });
      addHum(ctx, nodes, master, 58, 0.02, 0.03, 4);
      master.gain.value = 0.07;
      break;
    }

    case "Rain + Thunder": {
      // Mid rain body with clearer thunder rumble and less wind than a full storm
      buildRain(ctx, nodes, master, 0.5);
      addHum(ctx, nodes, master, 52, 0.018, 0.045, 8);
      addModulatedNoise(ctx, nodes, master, {
        filterType: "lowpass",
        baseFreq: 110,
        modDepth: 80,
        modRate: 0.02,
        gainVal: 0.13,
        noiseSec: 6,
      });
      master.gain.value = 0.07;
      break;
    }

    case "Rain on Window": {
      // Thin glass taps with bright, close-up droplets
      buildRain(ctx, nodes, master, 0.4);
      addOsc(ctx, nodes, master, "sine", 2500, 0.004);
      addOsc(ctx, nodes, master, "sine", 3800, 0.002);
      addModulatedNoise(ctx, nodes, master, {
        filterType: "bandpass",
        baseFreq: 7200,
        modDepth: 1600,
        modRate: 0.23,
        gainVal: 0.07,
        noiseSec: 2,
        filterQ: 3,
      });
      master.gain.value = 0.08;
      break;
    }

    case "Thunderstorm": {
      // Full storm: heavy rain, broad wind wash, and deep thunder bed
      buildRain(ctx, nodes, master, 0.8);
      addModulatedNoise(ctx, nodes, master, {
        filterType: "lowpass",
        baseFreq: 900,
        modDepth: 650,
        modRate: 0.03,
        gainVal: 0.2,
        noiseSec: 6,
      });
      addModulatedNoise(ctx, nodes, master, {
        filterType: "lowpass",
        baseFreq: 75,
        modDepth: 50,
        modRate: 0.016,
        gainVal: 0.18,
        noiseSec: 7,
      });
      master.gain.value = 0.07;
      break;
    }

    // ══════════════════════════════════════════════
    //  WATER SOUNDS
    // ══════════════════════════════════════════════

    case "Ocean Waves": {
      addModulatedNoise(ctx, nodes, master, {
        filterType: "lowpass",
        baseFreq: 280,
        modDepth: 170,
        modRate: 0.045,
        gainVal: 0.3,
        noiseSec: 6,
      });
      addModulatedNoise(ctx, nodes, master, {
        filterType: "bandpass",
        baseFreq: 760,
        modDepth: 240,
        modRate: 0.07,
        gainVal: 0.09,
        noiseSec: 4,
        filterQ: 0.8,
      });
      addHum(ctx, nodes, master, 72, 0.008, 0.05, 5);
      master.gain.value = 0.1;
      break;
    }

    case "Stream": {
      addModulatedNoise(ctx, nodes, master, {
        filterType: "bandpass",
        baseFreq: 950,
        modDepth: 450,
        modRate: 0.16,
        gainVal: 0.13,
        noiseSec: 3,
        filterQ: 0.7,
      });
      addModulatedNoise(ctx, nodes, master, {
        filterType: "highpass",
        baseFreq: 1500,
        modDepth: 900,
        modRate: 0.22,
        gainVal: 0.06,
        noiseSec: 2,
      });
      master.gain.value = 0.06;
      break;
    }

    case "Waterfall": {
      addModulatedNoise(ctx, nodes, master, {
        filterType: "lowpass",
        baseFreq: 950,
        modDepth: 220,
        modRate: 0.03,
        gainVal: 0.28,
        noiseSec: 5,
      });
      addModulatedNoise(ctx, nodes, master, {
        filterType: "highpass",
        baseFreq: 2400,
        modDepth: 550,
        modRate: 0.08,
        gainVal: 0.12,
        noiseSec: 3,
      });
      master.gain.value = 0.06;
      break;
    }

    // ══════════════════════════════════════════════
    //  WIND SOUNDS
    // ══════════════════════════════════════════════

    case "Mountain Wind": {
      addModulatedNoise(ctx, nodes, master, {
        filterType: "bandpass",
        baseFreq: 780,
        modDepth: 420,
        modRate: 0.04,
        gainVal: 0.12,
        noiseSec: 5,
        filterQ: 0.9,
      });
      addOsc(ctx, nodes, master, "sine", 540, 0.003);
      master.gain.value = 0.05;
      break;
    }

    case "Gentle Breeze": {
      addModulatedNoise(ctx, nodes, master, {
        filterType: "lowpass",
        baseFreq: 260,
        modDepth: 120,
        modRate: 0.07,
        gainVal: 0.08,
        noiseSec: 5,
      });
      master.gain.value = 0.04;
      break;
    }

    case "Storm Wind": {
      addModulatedNoise(ctx, nodes, master, {
        filterType: "lowpass",
        baseFreq: 1200,
        modDepth: 900,
        modRate: 0.03,
        gainVal: 0.18,
        noiseSec: 5,
      });
      addHum(ctx, nodes, master, 90, 0.012, 0.04, 7);
      master.gain.value = 0.05;
      break;
    }

    case "Fan": {
      addModulatedNoise(ctx, nodes, master, {
        filterType: "lowpass",
        baseFreq: 450,
        modDepth: 60,
        modRate: 0.12,
        gainVal: 0.08,
        noiseSec: 5,
      });
      addHum(ctx, nodes, master, 120, 0.01, 0.2, 2);
      addHum(ctx, nodes, master, 240, 0.004, 0.2, 3);
      master.gain.value = 0.05;
      break;
    }

    // ══════════════════════════════════════════════
    //  ATMOSPHERIC
    // ══════════════════════════════════════════════

    case "Deep Cave": {
      const f = biquad(ctx, "lowpass", 120, 1);
      f.connect(master);
      addNoise(ctx, nodes, f, { bufSec: 4, gainVal: 0.8 });
      // Dripping water — pitch-modulated ping with amplitude pulse
      const drip = ctx.createOscillator();
      drip.type = "sine";
      drip.frequency.value = 1800;
      const dripGain = gain(ctx, 0);
      drip.connect(dripGain);
      dripGain.connect(master);
      // Pitch modulation — slowly wobble the drip frequency
      const dripLfo = ctx.createOscillator();
      dripLfo.frequency.value = 0.3;
      const dripLfoG = gain(ctx, 300);
      dripLfo.connect(dripLfoG);
      dripLfoG.connect(drip.frequency);
      // Amplitude modulation — periodic drip pulse
      const dripAmpLfo = ctx.createOscillator();
      dripAmpLfo.frequency.value = 0.3;
      const dripAmpG = gain(ctx, 0.004);
      dripAmpLfo.connect(dripAmpG);
      dripAmpG.connect(dripGain.gain);
      drip.start();
      dripLfo.start();
      dripAmpLfo.start();
      nodes.push(drip, dripLfo, dripAmpLfo);
      master.gain.value = 0.12;
      break;
    }

    case "Night Ambience": {
      // Crickets with a soft nocturnal bed
      addModulatedNoise(ctx, nodes, master, {
        filterType: "lowpass",
        baseFreq: 180,
        modDepth: 80,
        modRate: 0.05,
        gainVal: 0.05,
        noiseSec: 6,
      });
      for (let i = 0; i < 3; i++) {
        addPulsedOsc(ctx, nodes, master, 4300 + i * 850, 4 + i * 1.5, 0.004);
      }
      master.gain.value = 0.06;
      break;
    }

    case "Space Ambient": {
      const osc1 = ctx.createOscillator();
      osc1.type = "sine";
      osc1.frequency.value = 150;
      const g1 = gain(ctx, 0.015);
      const lfo1 = ctx.createOscillator();
      lfo1.frequency.value = 0.03;
      const lfo1G = gain(ctx, 80);
      lfo1.connect(lfo1G);
      lfo1G.connect(osc1.frequency);
      osc1.connect(g1);
      g1.connect(master);
      osc1.start();
      lfo1.start();
      nodes.push(osc1, lfo1);

      const osc2 = ctx.createOscillator();
      osc2.type = "triangle";
      osc2.frequency.value = 300;
      const g2 = gain(ctx, 0.008);
      const lfo2 = ctx.createOscillator();
      lfo2.frequency.value = 0.05;
      const lfo2G = gain(ctx, 50);
      lfo2.connect(lfo2G);
      lfo2G.connect(osc2.frequency);
      osc2.connect(g2);
      g2.connect(master);
      osc2.start();
      lfo2.start();
      nodes.push(osc2, lfo2);

      const f = biquad(ctx, "bandpass", 600, 0.3);
      f.connect(master);
      addNoise(ctx, nodes, f, { bufSec: 5, gainVal: 0.15 });
      master.gain.value = 0.1;
      break;
    }

    case "Distant City": {
      addModulatedNoise(ctx, nodes, master, {
        filterType: "lowpass",
        baseFreq: 420,
        modDepth: 120,
        modRate: 0.035,
        gainVal: 0.08,
        noiseSec: 6,
      });
      addModulatedNoise(ctx, nodes, master, {
        filterType: "bandpass",
        baseFreq: 1700,
        modDepth: 900,
        modRate: 0.08,
        gainVal: 0.03,
        noiseSec: 4,
        filterQ: 0.9,
      });
      master.gain.value = 0.05;
      break;
    }

    // ══════════════════════════════════════════════
    //  FIRE / WARM
    // ══════════════════════════════════════════════

    case "Campfire": {
      addModulatedNoise(ctx, nodes, master, {
        filterType: "bandpass",
        baseFreq: 950,
        modDepth: 220,
        modRate: 0.17,
        gainVal: 0.09,
        noiseSec: 2,
        filterQ: 1.2,
      });
      addModulatedNoise(ctx, nodes, master, {
        filterType: "highpass",
        baseFreq: 3400,
        modDepth: 1500,
        modRate: 0.3,
        gainVal: 0.05,
        noiseSec: 1,
      });
      addHum(ctx, nodes, master, 88, 0.014, 0.08, 5);
      master.gain.value = 0.06;
      break;
    }

    case "Fireplace": {
      addModulatedNoise(ctx, nodes, master, {
        filterType: "lowpass",
        baseFreq: 520,
        modDepth: 160,
        modRate: 0.08,
        gainVal: 0.08,
        noiseSec: 4,
      });
      addHum(ctx, nodes, master, 62, 0.02, 0.05, 3);
      master.gain.value = 0.06;
      break;
    }

    // ══════════════════════════════════════════════
    //  MELODIC / RESONANT
    // ══════════════════════════════════════════════

    case "Singing Bowls": {
      const freqs = [220, 330, 440, 554];
      freqs.forEach((f, i) => {
        const o = ctx.createOscillator();
        o.type = "sine";
        o.frequency.value = f;
        const g = gain(ctx, 0.012 - i * 0.002);
        const lfo = ctx.createOscillator();
        lfo.frequency.value = 0.1 + i * 0.03;
        const lg = gain(ctx, 0.006);
        lfo.connect(lg);
        lg.connect(g.gain);
        o.connect(g);
        g.connect(master);
        o.start();
        lfo.start();
        nodes.push(o, lfo);
      });
      master.gain.value = 0.1;
      break;
    }

    case "Wind Chimes": {
      const freqs = [1200, 1500, 1800, 2200, 2600];
      freqs.forEach((f, i) => {
        const o = ctx.createOscillator();
        o.type = "sine";
        o.frequency.value = f;
        const g = gain(ctx, 0);
        const lfo = ctx.createOscillator();
        lfo.frequency.value = 0.05 + i * 0.07;
        const lg = gain(ctx, 0.008);
        lfo.connect(lg);
        lg.connect(g.gain);
        o.connect(g);
        g.connect(master);
        o.start();
        lfo.start();
        nodes.push(o, lfo);
      });
      // Background whisper
      const bg = biquad(ctx, "lowpass", 300, 0.5);
      bg.connect(master);
      addNoise(ctx, nodes, bg, { bufSec: 4, gainVal: 0.15 });
      master.gain.value = 0.08;
      break;
    }

    case "Tibetan Drone": {
      const base = ctx.createOscillator();
      base.type = "sawtooth";
      base.frequency.value = 55;
      const bf = biquad(ctx, "lowpass", 200, 2);
      const bg = gain(ctx, 0.15);
      base.connect(bf);
      bf.connect(bg);
      bg.connect(master);
      base.start();
      nodes.push(base);
      // Harmonic
      addOsc(ctx, nodes, master, "sine", 110, 0.03);
      // Sub modulation
      const mod = ctx.createOscillator();
      mod.frequency.value = 0.1;
      const modG = gain(ctx, 5);
      mod.connect(modG);
      modG.connect(base.frequency);
      mod.start();
      nodes.push(mod);
      master.gain.value = 0.08;
      break;
    }

    // ══════════════════════════════════════════════
    //  ANIMALS / NATURE
    // ══════════════════════════════════════════════

    case "Crickets": {
      for (let i = 0; i < 3; i++) {
        addPulsedOsc(ctx, nodes, master, 4600 + i * 950, 6 + i * 2.5, 0.005);
      }
      master.gain.value = 0.08;
      break;
    }

    case "Whale Song": {
      // Deep whale tones with LFO frequency modulation
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = 100;
      const g = gain(ctx, 0.03);
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.08;
      const lg = gain(ctx, 60);
      lfo.connect(lg);
      lg.connect(osc.frequency);
      osc.connect(g);
      g.connect(master);
      osc.start();
      lfo.start();
      nodes.push(osc, lfo);

      const osc2 = ctx.createOscillator();
      osc2.type = "sine";
      osc2.frequency.value = 200;
      const g2 = gain(ctx, 0.01);
      const lfo2 = ctx.createOscillator();
      lfo2.frequency.value = 0.08;
      const lg2 = gain(ctx, 30);
      lfo2.connect(lg2);
      lg2.connect(osc2.frequency);
      osc2.connect(g2);
      g2.connect(master);
      osc2.start();
      lfo2.start();
      nodes.push(osc2, lfo2);

      // Water ambience
      const f = modFilter(ctx, nodes, master, "lowpass", 300, 100, 0.06);
      const pre = biquad(ctx, "lowpass", 300, 1);
      pre.connect(f);
      addNoise(ctx, nodes, pre, { bufSec: 4, gainVal: 0.25 });
      master.gain.value = 0.08;
      break;
    }

    case "Jungle": {
      addModulatedNoise(ctx, nodes, master, {
        filterType: "bandpass",
        baseFreq: 700,
        modDepth: 240,
        modRate: 0.08,
        gainVal: 0.05,
        noiseSec: 5,
        filterQ: 0.8,
      });
      const bird = ctx.createOscillator();
      bird.type = "sine";
      bird.frequency.value = 2800;
      const birdG = gain(ctx, 0.003);
      const birdLfo = ctx.createOscillator();
      birdLfo.frequency.value = 6;
      const birdLfoG = gain(ctx, 0.003);
      birdLfo.connect(birdLfoG);
      birdLfoG.connect(birdG.gain);
      const birdMod = ctx.createOscillator();
      birdMod.frequency.value = 0.15;
      const birdModG = gain(ctx, 400);
      birdMod.connect(birdModG);
      birdModG.connect(bird.frequency);
      bird.connect(birdG);
      birdG.connect(master);
      bird.start();
      birdLfo.start();
      birdMod.start();
      nodes.push(bird, birdLfo, birdMod);
      addPulsedOsc(ctx, nodes, master, 620, 0.6, 0.006);
      master.gain.value = 0.06;
      break;
    }

    case "Forest Birds": {
      // Multiple bird chirps at different frequencies
      const birdConfigs = [
        { baseFreq: 3200, chirpRate: 8, modRate: 0.2 },
        { baseFreq: 2600, chirpRate: 6, modRate: 0.15 },
        { baseFreq: 3800, chirpRate: 10, modRate: 0.25 },
        { baseFreq: 2200, chirpRate: 5, modRate: 0.12 },
      ];
      birdConfigs.forEach(({ baseFreq, chirpRate, modRate }) => {
        const o = ctx.createOscillator();
        o.type = "sine";
        o.frequency.value = baseFreq;
        const g = gain(ctx, 0);
        const ampLfo = ctx.createOscillator();
        ampLfo.frequency.value = chirpRate;
        const ampG = gain(ctx, 0.004);
        ampLfo.connect(ampG);
        ampG.connect(g.gain);
        const freqMod = ctx.createOscillator();
        freqMod.frequency.value = modRate;
        const fmG = gain(ctx, 300);
        freqMod.connect(fmG);
        fmG.connect(o.frequency);
        o.connect(g);
        g.connect(master);
        o.start();
        ampLfo.start();
        freqMod.start();
        nodes.push(o, ampLfo, freqMod);
      });
      // Background forest hum
      const bg = modFilter(ctx, nodes, master, "lowpass", 350, 150, 0.06);
      const bgPre = biquad(ctx, "lowpass", 350, 0.5);
      bgPre.connect(bg);
      addNoise(ctx, nodes, bgPre, { bufSec: 5, gainVal: 0.2 });
      master.gain.value = 0.07;
      break;
    }

    // ══════════════════════════════════════════════
    //  URBAN / MECHANICAL
    // ══════════════════════════════════════════════

    case "Train Ride": {
      addModulatedNoise(ctx, nodes, master, {
        filterType: "lowpass",
        baseFreq: 240,
        modDepth: 70,
        modRate: 0.04,
        gainVal: 0.08,
        noiseSec: 5,
      });
      const vib = ctx.createOscillator();
      vib.type = "triangle";
      vib.frequency.value = 25;
      const vibG = gain(ctx, 0);
      const vibLfo = ctx.createOscillator();
      vibLfo.frequency.value = 1.2;
      const vibLfoG = gain(ctx, 0.02);
      vibLfo.connect(vibLfoG);
      vibLfoG.connect(vibG.gain);
      vib.connect(vibG);
      vibG.connect(master);
      vib.start();
      vibLfo.start();
      nodes.push(vib, vibLfo);
      addPulsedOsc(ctx, nodes, master, 880, 1.2, 0.006);
      master.gain.value = 0.06;
      break;
    }

    case "Airplane Cabin": {
      addModulatedNoise(ctx, nodes, master, {
        filterType: "lowpass",
        baseFreq: 340,
        modDepth: 70,
        modRate: 0.02,
        gainVal: 0.1,
        noiseSec: 6,
      });
      addHum(ctx, nodes, master, 92, 0.012, 0.02, 2);
      addHum(ctx, nodes, master, 184, 0.005, 0.02, 2);
      master.gain.value = 0.07;
      break;
    }

    case "Distant Highway": {
      addModulatedNoise(ctx, nodes, master, {
        filterType: "lowpass",
        baseFreq: 520,
        modDepth: 140,
        modRate: 0.05,
        gainVal: 0.07,
        noiseSec: 6,
      });
      addModulatedNoise(ctx, nodes, master, {
        filterType: "bandpass",
        baseFreq: 1150,
        modDepth: 700,
        modRate: 0.12,
        gainVal: 0.035,
        noiseSec: 4,
        filterQ: 0.8,
      });
      master.gain.value = 0.05;
      break;
    }

    // ══════════════════════════════════════════════
    //  SPECIAL
    // ══════════════════════════════════════════════

    case "Heartbeat": {
      addPulsedOsc(ctx, nodes, master, 40, 1.1, 0.04);
      // Slightly sharper second beat (lub-dub)
      addPulsedOsc(ctx, nodes, master, 55, 1.1, 0.015);
      master.gain.value = 0.15;
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
  { id: "Soft Rain", name: "Soft Rain", emoji: "🌧️", category: "Rain" },
  { id: "Forest Rain", name: "Forest Canopy Rain", emoji: "🌧️", category: "Rain" },
  { id: "Drizzle", name: "Light Drizzle", emoji: "🌦️", category: "Rain" },
  { id: "Rain on Roof", name: "Roof Rain Resonance", emoji: "🏠", category: "Rain" },
  { id: "Rain on Window", name: "Window Rain Taps", emoji: "🪟", category: "Rain" },
  { id: "Heavy Rain", name: "Heavy Rain", emoji: "🌧️", category: "Rain" },
  { id: "Monsoon Rain", name: "Monsoon Downpour", emoji: "🌊", category: "Rain" },
  { id: "Rain + Thunder", name: "Rain + Thunder", emoji: "⛈️", category: "Rain" },
  { id: "Thunderstorm", name: "Thunderstorm", emoji: "⛈️", category: "Rain" },
  // Water
  { id: "Ocean Waves", name: "Ocean Waves", emoji: "🌊", category: "Water" },
  { id: "Stream", name: "Stream", emoji: "💧", category: "Water" },
  { id: "Waterfall", name: "Waterfall", emoji: "🏞️", category: "Water" },
  // Wind
  { id: "Gentle Breeze", name: "Soft Breeze", emoji: "🍃", category: "Wind" },
  { id: "Mountain Wind", name: "High Mountain Wind", emoji: "🌬️", category: "Wind" },
  { id: "Storm Wind", name: "Storm Wind Wash", emoji: "🌪️", category: "Wind" },
  { id: "Fan", name: "Fan Hum", emoji: "🔄", category: "Wind" },
  // Atmosphere
  { id: "Deep Cave", name: "Deep Cave Drips", emoji: "🕳️", category: "Atmosphere" },
  { id: "Night Ambience", name: "Crickets at Night", emoji: "🌙", category: "Atmosphere" },
  { id: "Space Ambient", name: "Cosmic Drone", emoji: "✨", category: "Atmosphere" },
  { id: "Distant City", name: "Distant City Hush", emoji: "🌃", category: "Atmosphere" },
  // Fire
  { id: "Campfire", name: "Ember Crackle", emoji: "🔥", category: "Fire" },
  { id: "Fireplace", name: "Hearth Hum", emoji: "🪵", category: "Fire" },
  // Melodic
  { id: "Singing Bowls", name: "Singing Bowls", emoji: "🔔", category: "Melodic" },
  { id: "Wind Chimes", name: "Wind Chimes", emoji: "🎐", category: "Melodic" },
  { id: "Tibetan Drone", name: "Tibetan Drone", emoji: "🙏", category: "Melodic" },
  // Nature
  { id: "Crickets", name: "Crickets", emoji: "🦗", category: "Nature" },
  { id: "Whale Song", name: "Whale-like Drone", emoji: "🐋", category: "Nature" },
  { id: "Jungle", name: "Jungle Pulse", emoji: "🌴", category: "Nature" },
  { id: "Forest Birds", name: "Forest Birds", emoji: "🐦", category: "Nature" },
  // Urban
  { id: "Train Ride", name: "Rail Car Hum", emoji: "🚂", category: "Urban" },
  { id: "Airplane Cabin", name: "Cabin Engine Hum", emoji: "✈️", category: "Urban" },
  { id: "Distant Highway", name: "Highway Wash", emoji: "🛣️", category: "Urban" },
  // Special
  { id: "Heartbeat", name: "Heartbeat", emoji: "💓", category: "Special" },
];

// Backward-compatible export
export const NATURES = ["Ocean Waves", "Forest Rain", "Mountain Wind", "Deep Cave"] as const;
export type NaturePreset = (typeof NATURES)[number];
