// Glyphwake — procedural audio (WebAudio, no assets)
(function () {
  'use strict';
  const A = {
    ctx: null, master: null, sfxBus: null, musBus: null, ambBus: null,
    vol: 0.8, mus: 0.5, combat: 0, started: false,
  };

  function noiseBuffer(ctx, seconds, kind) {
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      if (kind === 'pink') {
        b0 = 0.99765 * b0 + w * 0.099046; b1 = 0.963 * b1 + w * 0.2965164; b2 = 0.57 * b2 + w * 1.0526913;
        d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.18;
      } else if (kind === 'brown') {
        last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5;
      } else d[i] = w;
    }
    return buf;
  }

  A.init = function () {
    if (A.ctx) { if (A.ctx.state === 'suspended') A.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = A.ctx = new AC();
    A.master = ctx.createGain(); A.master.gain.value = A.vol;
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4;
    A.master.connect(comp); comp.connect(ctx.destination);
    A.sfxBus = ctx.createGain(); A.sfxBus.connect(A.master);
    A.musBus = ctx.createGain(); A.musBus.gain.value = A.mus * 0.5; A.musBus.connect(A.master);
    A.ambBus = ctx.createGain(); A.ambBus.gain.value = 0.7; A.ambBus.connect(A.master);
    A.white = noiseBuffer(ctx, 2, 'white');
    A.pink = noiseBuffer(ctx, 4, 'pink');
    A.brown = noiseBuffer(ctx, 4, 'brown');
    // reverb (synthetic impulse)
    const ir = ctx.createBuffer(2, ctx.sampleRate * 2.2, ctx.sampleRate);
    for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 3); }
    A.verb = ctx.createConvolver(); A.verb.buffer = ir;
    const vg = ctx.createGain(); vg.gain.value = 0.35; A.verb.connect(vg); vg.connect(A.master);
    startAmbience(); startMusic();
    A.started = true;
  };

  function loop(buf, bus, gain, filterType, freq, q) {
    const ctx = A.ctx;
    const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true;
    const f = ctx.createBiquadFilter(); f.type = filterType; f.frequency.value = freq; f.Q.value = q || 0.7;
    const g = ctx.createGain(); g.gain.value = gain;
    s.connect(f); f.connect(g); g.connect(bus); s.start();
    return { src: s, f, g };
  }

  function startAmbience() {
    A.wind = loop(A.pink, A.ambBus, 0.12, 'lowpass', 500);
    A.river = loop(A.white, A.ambBus, 0.0, 'bandpass', 1400, 0.5);
    A.river2 = loop(A.brown, A.ambBus, 0.0, 'lowpass', 300);
    A.fire = loop(A.brown, A.ambBus, 0.0, 'lowpass', 900);
    A.nextCricket = 0; A.nextCrackle = 0;
  }

  // slow ambient pad + combat pulse
  const CHORDS = [[50, 57, 62, 65], [46, 53, 58, 62], [48, 55, 60, 63], [45, 52, 57, 60]];
  function mtof(m) { return 440 * Math.pow(2, (m - 69) / 12); }
  function startMusic() {
    const ctx = A.ctx;
    A.padF = ctx.createBiquadFilter(); A.padF.type = 'lowpass'; A.padF.frequency.value = 700; A.padF.connect(A.musBus); A.padF.connect(A.verb);
    A.voices = [];
    for (let i = 0; i < 4; i++) {
      const o1 = ctx.createOscillator(), o2 = ctx.createOscillator(), g = ctx.createGain();
      o1.type = 'triangle'; o2.type = 'sawtooth'; o2.detune.value = 7;
      const g2 = ctx.createGain(); g2.gain.value = 0.18;
      o1.connect(g); o2.connect(g2); g2.connect(g); g.gain.value = 0.0; g.connect(A.padF);
      o1.start(); o2.start();
      A.voices.push({ o1, o2, g });
    }
    A.chordIdx = 0; A.nextChord = ctx.currentTime + 0.5;
    A.nextBeat = ctx.currentTime + 1; A.beatN = 0;
  }

  A.update = function (dt, st) {
    if (!A.ctx) return;
    const t = A.ctx.currentTime;
    // ambience levels
    if (!isFinite(st.riverDist)) st.riverDist = 99; if (!isFinite(st.fireDist)) st.fireDist = 99;
    const rv = Math.max(0, 1 - st.riverDist / 30);
    A.river.g.gain.setTargetAtTime(rv * 0.09, t, 0.3);
    A.river2.g.gain.setTargetAtTime(rv * 0.25, t, 0.3);
    const fv = Math.max(0, 1 - st.fireDist / 14);
    A.fire.g.gain.setTargetAtTime(fv * 0.18, t, 0.3);
    A.wind.f.frequency.setTargetAtTime(380 + 260 * (0.5 + 0.5 * Math.sin(t * 0.13)), t, 1);
    if (t > A.nextCricket && !st.boss) { cricket(); A.nextCricket = t + 0.4 + Math.random() * 1.6; }
    if (fv > 0.05 && t > A.nextCrackle) { crackle(fv); A.nextCrackle = t + 0.05 + Math.random() * 0.3; }
    // music
    A.combat += ((st.combat ? 1 : 0) - A.combat) * Math.min(1, dt * 1.5);
    A.musBus.gain.setTargetAtTime(A.mus * (0.4 + 0.3 * A.combat), t, 0.5);
    if (t > A.nextChord) {
      const ch = CHORDS[A.chordIdx++ % CHORDS.length];
      A.voices.forEach((v, i) => {
        const f = mtof(ch[i] - (i === 0 ? 12 : 0));
        v.o1.frequency.setTargetAtTime(f, t, 0.6); v.o2.frequency.setTargetAtTime(f, t, 0.6);
        v.g.gain.setTargetAtTime(0.05 + (i === 0 ? 0.03 : 0), t, 1.2);
      });
      A.padF.frequency.setTargetAtTime(500 + 900 * A.combat, t, 1);
      A.nextChord = t + (st.boss ? 4 : 8);
    }
    if (A.combat > 0.3 && t > A.nextBeat) {
      const step = st.boss ? 0.32 : 0.42;
      drum(A.beatN % 4 === 0 ? 1 : 0.55, A.beatN % 2 === 1);
      A.beatN++; A.nextBeat = t + step;
    } else if (A.combat <= 0.3) A.nextBeat = t + 0.1;
  };

  function env(g, t, a, peak, d) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  }
  function osc(type, f0, f1, dur, peak, dest, delay) {
    const ctx = A.ctx, t = ctx.currentTime + (delay || 0);
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t); if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    o.connect(g); g.connect(dest || A.sfxBus); env(g, t, 0.005, peak, dur); o.start(t); o.stop(t + dur + 0.05);
  }
  function noise(dur, peak, type, f0, f1, q, dest, delay) {
    const ctx = A.ctx, t = ctx.currentTime + (delay || 0);
    const s = ctx.createBufferSource(); s.buffer = A.white;
    s.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = ctx.createBiquadFilter(); f.type = type; f.Q.value = q || 1; f.frequency.setValueAtTime(f0, t); if (f1) f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = ctx.createGain(); s.connect(f); f.connect(g); g.connect(dest || A.sfxBus);
    env(g, t, 0.004, peak, dur); s.start(t, Math.random()); s.stop(t + dur + 0.05);
  }
  function cricket() {
    const f = 4200 + Math.random() * 800, n = 2 + (Math.random() * 3 | 0), pan = A.ctx.createStereoPanner ? A.ctx.createStereoPanner() : null;
    let dest = A.ambBus; if (pan) { pan.pan.value = Math.random() * 2 - 1; pan.connect(A.ambBus); dest = pan; }
    for (let i = 0; i < n; i++) osc('sine', f, 0, 0.035, 0.012, dest, i * 0.06);
  }
  function crackle(v) { noise(0.02, 0.05 * v, 'highpass', 2500, 0, 1, A.ambBus); }
  function drum(v, hat) {
    osc('sine', 110 * (hat ? 1.4 : 1), 40, 0.22, 0.25 * v, A.musBus);
    if (hat) noise(0.04, 0.03, 'highpass', 7000, 0, 1, A.musBus);
  }

  A.sfx = function (name, p) {
    if (!A.ctx || A.vol <= 0) return;
    p = p || 1;
    switch (name) {
      case 'swing': noise(0.18, 0.22 * p, 'bandpass', 900, 3500, 2); break;
      case 'heavy': noise(0.28, 0.3, 'bandpass', 500, 2400, 2); osc('sine', 120, 60, 0.2, 0.12); break;
      case 'hit': noise(0.08, 0.35 * p, 'lowpass', 2500, 400, 1); osc('square', 180, 60, 0.09, 0.12 * p); osc('triangle', 900 + Math.random() * 300, 300, 0.06, 0.08); break;
      case 'crit': noise(0.12, 0.4, 'lowpass', 4000, 300, 1); osc('square', 260, 50, 0.16, 0.16); osc('sine', 1600, 800, 0.2, 0.08, A.verb); break;
      case 'hurt': osc('sawtooth', 220, 80, 0.2, 0.16); noise(0.12, 0.25, 'lowpass', 1500, 200, 1); break;
      case 'roll': noise(0.3, 0.16, 'bandpass', 300, 1200, 1); break;
      case 'step': noise(0.05, 0.03 * p, 'lowpass', 700, 300, 1); break;
      case 'block': osc('square', 1300, 900, 0.08, 0.1); osc('sine', 2600, 2000, 0.25, 0.05, A.verb); break;
      case 'die': osc('sawtooth', 300, 40, 0.5, 0.12); noise(0.4, 0.2, 'lowpass', 1200, 100, 1); break;
      case 'howl': osc('sine', 400, 700, 0.5, 0.04, A.verb); osc('sine', 700, 450, 0.8, 0.04, A.verb, 0.45); break;
      case 'cast': osc('sine', 300, 1200, 0.25, 0.1, A.verb); noise(0.25, 0.1, 'highpass', 2000, 6000, 1); break;
      case 'boom': osc('sine', 90, 30, 0.6, 0.4); noise(0.5, 0.35, 'lowpass', 1800, 80, 1); break;
      case 'zap': osc('sawtooth', 1800, 200, 0.15, 0.08); noise(0.1, 0.15, 'highpass', 3000, 0, 1); break;
      case 'potion': osc('sine', 500, 900, 0.15, 0.1); osc('sine', 700, 1200, 0.2, 0.08, A.verb, 0.1); break;
      case 'pickup': osc('triangle', 880, 0, 0.08, 0.08); osc('triangle', 1320, 0, 0.12, 0.08, null, 0.07); break;
      case 'level': [0, 4, 7, 12].forEach((s, i) => osc('triangle', mtof(64 + s), 0, 0.5, 0.1, A.verb, i * 0.09)); break;
      case 'quest': [0, 7, 12].forEach((s, i) => osc('sine', mtof(69 + s), 0, 0.6, 0.09, A.verb, i * 0.12)); break;
      case 'ui': osc('square', 1200, 0, 0.03, 0.03); break;
      case 'socket': osc('triangle', 600, 1500, 0.1, 0.1); osc('sine', 2400, 0, 0.4, 0.04, A.verb, 0.05); break;
      case 'anvil': osc('square', 1900, 1700, 0.05, 0.12); osc('sine', 3200, 0, 0.9, 0.06, A.verb); noise(0.05, 0.2, 'highpass', 3000, 0, 1); break;
      case 'slam': osc('sine', 70, 25, 0.8, 0.5); noise(0.7, 0.4, 'lowpass', 900, 60, 1); break;
      case 'roar': osc('sawtooth', 90, 55, 1.2, 0.2, A.verb); noise(1.1, 0.25, 'bandpass', 400, 200, 2); break;
      case 'type': osc('square', 900 + Math.random() * 200, 0, 0.015, 0.012); break;
      case 'fire': noise(0.5, 0.25, 'lowpass', 600, 2000, 1); break;
    }
  };

  A.setVolume = function (v, m) {
    A.vol = v; A.mus = m;
    if (A.master) A.master.gain.value = v;
  };

  window.GWAudio = A;
})();
