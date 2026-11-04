/* Ctrl+Alt+Survive — synthesized sound effects and a tiny "MIDI" music sequencer (WebAudio) */
(function (C) {
  'use strict';
  let ac = null, master = null, sfxBus = null, musBus = null, noiseBuf = null;
  const last = {};

  const A = C.Audio = {
    ready: false,
    init() {
      if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ac = new AC();
      master = ac.createGain(); master.connect(ac.destination);
      const comp = ac.createDynamicsCompressor(); comp.connect(master);
      sfxBus = ac.createGain(); sfxBus.connect(comp);
      musBus = ac.createGain(); musBus.connect(comp);
      noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      A.ready = true;
      A.setVolumes();
    },
    setVolumes() {
      if (!ac) return;
      const s = C.Save.data.settings;
      sfxBus.gain.value = s.vol;
      musBus.gain.value = s.music * 0.5;
    },
    /* ---- sound effects ---- */
    sfx(name, opt) {
      if (!A.ready || C.Save.data.settings.vol <= 0) return;
      const now = ac.currentTime;
      const minGap = { hit: 0.045, xp: 0.03, kill: 0.04, shoot: 0.06, zap: 0.08, hurt: 0.15 }[name] || 0;
      if (minGap && last[name] && now - last[name] < minGap) return;
      last[name] = now;
      const f = SFX[name];
      if (f) f(now, opt || {});
    },
    /* ---- music ---- */
    music(track) {
      if (track === curTrack) return;
      curTrack = track;
      step = 0;
      if (!A.ready) return;
      nextTime = ac.currentTime + 0.1;
    }
  };

  function tone(t, freq, dur, type, vol, opts) {
    opts = opts || {};
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type || 'square';
    o.frequency.setValueAtTime(freq, t);
    if (opts.to) o.frequency.exponentialRampToValueAtTime(Math.max(20, opts.to), t + dur);
    if (opts.detune) o.detune.value = opts.detune;
    const a = opts.attack || 0.005;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(opts.bus || sfxBus);
    o.start(t); o.stop(t + dur + 0.02);
  }
  function noise(t, dur, vol, filt, freq, bus) {
    const s = ac.createBufferSource(); s.buffer = noiseBuf;
    const f = ac.createBiquadFilter(); f.type = filt || 'highpass'; f.frequency.value = freq || 3000;
    const g = ac.createGain();
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(bus || sfxBus);
    s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.02);
  }

  const SFX = {
    click: t => { tone(t, 1800, 0.03, 'square', 0.06); },
    open: t => { tone(t, 660, 0.06, 'triangle', 0.12); tone(t + 0.05, 990, 0.08, 'triangle', 0.1); },
    close: t => { tone(t, 880, 0.05, 'triangle', 0.1); tone(t + 0.04, 520, 0.08, 'triangle', 0.09); },
    ding: t => { tone(t, 1320, 0.5, 'sine', 0.2); tone(t, 1980, 0.35, 'sine', 0.06); },
    error: t => { tone(t, 440, 0.14, 'square', 0.12); tone(t + 0.13, 330, 0.25, 'square', 0.12); },
    balloon: t => { tone(t, 1046, 0.12, 'sine', 0.15); tone(t + 0.1, 1568, 0.3, 'sine', 0.13); },
    hit: t => { noise(t, 0.04, 0.12, 'bandpass', 2400); },
    kill: t => { tone(t, 520 + Math.random() * 200, 0.07, 'square', 0.05, { to: 180 }); },
    xp: (t, o) => { const p = o.p || 0; tone(t, 900 + p * 40, 0.06, 'sine', 0.07); },
    coin: t => { tone(t, 1400, 0.06, 'square', 0.06); tone(t + 0.06, 2100, 0.12, 'square', 0.06); },
    shoot: t => { tone(t, 900, 0.05, 'triangle', 0.04, { to: 500 }); },
    zap: t => { noise(t, 0.18, 0.18, 'highpass', 1500); tone(t, 120, 0.15, 'sawtooth', 0.08, { to: 60 }); },
    boom: t => { noise(t, 0.5, 0.35, 'lowpass', 900); tone(t, 90, 0.4, 'sine', 0.3, { to: 30 }); },
    hurt: t => { tone(t, 220, 0.12, 'square', 0.13, { to: 140 }); noise(t, 0.08, 0.1, 'lowpass', 1200); },
    levelup: t => { [523, 659, 784, 1046].forEach((f, i) => tone(t + i * 0.07, f, 0.25, 'square', 0.08)); tone(t + 0.28, 1568, 0.4, 'triangle', 0.1); },
    install: t => { tone(t, 784, 0.08, 'triangle', 0.12); tone(t + 0.08, 1175, 0.18, 'triangle', 0.12); },
    zip: t => { for (let i = 0; i < 10; i++) tone(t + i * 0.05, 400 + i * 90, 0.05, 'square', 0.05); },
    evolve: t => { [392, 523, 659, 784, 1046, 1318].forEach((f, i) => tone(t + i * 0.09, f, 0.5, 'sawtooth', 0.06)); },
    warning: t => { for (let i = 0; i < 3; i++) { tone(t + i * 0.45, 880, 0.2, 'square', 0.12); tone(t + i * 0.45 + 0.2, 660, 0.2, 'square', 0.12); } },
    dialup: t => {
      // a short, original "modem handshake"-ish screech
      tone(t, 1200, 0.25, 'sine', 0.12); tone(t + 0.25, 2100, 0.2, 'sine', 0.1);
      for (let i = 0; i < 6; i++) tone(t + 0.45 + i * 0.07, 900 + Math.random() * 1500, 0.07, 'sawtooth', 0.05);
      noise(t + 0.9, 0.5, 0.12, 'bandpass', 2500);
    },
    freeze: t => { tone(t, 2000, 0.6, 'sine', 0.12, { to: 400 }); },
    heal: t => { tone(t, 600, 0.1, 'sine', 0.12); tone(t + 0.08, 900, 0.18, 'sine', 0.12); },
    startup: t => {
      // original 4-note startup pad
      const chord = [[392, 523.3], [440, 587.3], [523.3, 659.3], [587.3, 784, 1174.7]];
      chord.forEach((ns, i) => ns.forEach(f => tone(t + i * 0.32, f, 1.6 - i * 0.2, 'triangle', 0.09, { attack: 0.08 })));
      tone(t + 1.0, 196, 1.8, 'sine', 0.15, { attack: 0.2 });
    },
    shutdown: t => { [784, 587.3, 523.3, 392].forEach((f, i) => tone(t + i * 0.25, f, 0.9, 'triangle', 0.09, { attack: 0.05 })); },
    victory: t => { [523, 659, 784, 659, 784, 1046].forEach((f, i) => tone(t + i * 0.12, f, 0.35, 'square', 0.08)); tone(t + 0.75, 1046, 0.9, 'triangle', 0.12); },
    gameover: t => { [392, 370, 349, 330].forEach((f, i) => tone(t + i * 0.28, f, 0.4, 'square', 0.09)); tone(t + 1.1, 98, 1.0, 'sawtooth', 0.12); }
  };

  /* ---------------- music sequencer ----------------
   * Each track: bpm, bars of [root midi, chord type]; lead arpeggio pattern; drums. */
  const N = m => 440 * Math.pow(2, (m - 69) / 12);
  const TRACKS = {
    menu: { bpm: 92, prog: [[57, 'm'], [53, 'M'], [48, 'M'], [55, 'M']], arp: [0, 2, 1, 2, 0, 2, 1, 3], lead: 'triangle', drums: false, lv: 0.05 },
    game: { bpm: 132, prog: [[57, 'm'], [57, 'm'], [53, 'M'], [55, 'M'], [57, 'm'], [57, 'm'], [52, 'm'], [55, 'M']], arp: [0, 1, 2, 3, 2, 1, 0, 2, 0, 1, 2, 3, 2, 3, 1, 2], lead: 'square', drums: true, lv: 0.035 },
    boss: { bpm: 150, prog: [[50, 'm'], [46, 'M'], [48, 'M'], [45, 'M']], arp: [0, 3, 2, 3, 1, 3, 2, 3, 0, 3, 2, 3, 1, 2, 3, 2], lead: 'sawtooth', drums: true, lv: 0.03 }
  };
  const CH = { m: [0, 3, 7, 12], M: [0, 4, 7, 12] };
  let curTrack = null, step = 0, nextTime = 0;
  function sched() {
    if (!A.ready || !curTrack) return;
    const tr = TRACKS[curTrack];
    const sp = 60 / tr.bpm / 4; // 16th note
    if (nextTime < ac.currentTime - 0.05) nextTime = ac.currentTime + 0.05; // resync after a stall
    while (nextTime < ac.currentTime + 0.15) {
      const bar = Math.floor(step / 16) % tr.prog.length;
      const s16 = step % 16;
      const [root, kind] = tr.prog[bar];
      const notes = CH[kind];
      const ai = tr.arp[s16 % tr.arp.length];
      // lead arpeggio (8ths for menu)
      if (curTrack !== 'menu' || s16 % 2 === 0) tone(nextTime, N(root + 12 + notes[ai]), sp * 1.8, tr.lead, tr.lv, { bus: musBus });
      // bass on quarters
      if (s16 % 4 === 0) tone(nextTime, N(root - 12), sp * 3.5, 'triangle', 0.12, { bus: musBus });
      // pad on bar start
      if (s16 === 0 && curTrack === 'menu') notes.slice(0, 3).forEach(n => tone(nextTime, N(root + n), sp * 15, 'sine', 0.04, { bus: musBus, attack: 0.3 }));
      if (tr.drums) {
        if (s16 % 4 === 0) tone(nextTime, 140, 0.12, 'sine', 0.22, { to: 45, bus: musBus });
        if (s16 % 8 === 4) noise(nextTime, 0.1, 0.12, 'bandpass', 1800, musBus);
        if (s16 % 2 === 1) noise(nextTime, 0.03, 0.05, 'highpass', 7000, musBus);
      }
      step++;
      nextTime += sp;
    }
  }
  setInterval(sched, 40);
})(window.CAS);
