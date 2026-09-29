/* GameHub core: save data, audio, canvas stage, UI helpers. */
(function () {
  'use strict';

  // ---------------------------------------------------------------- Save
  const SAVE_KEY = 'gamehub_save_v1';

  function defaults() {
    return {
      coins: 150,          // shown as Gold
      gems: 10,
      food: 40,
      troops: 20,
      noAds: false,
      lastDaily: 0,
      levels: { pin: 1, gate: 1, frost: 1 },
      town: { hall: 1, barracks: 0, forge: 0, lodge: 0, kitchen: 0, vault: 0, tower: 0, walls: 0 },
      prod: {},            // building id -> timestamp production was last collected
      chests: [null, null, null, null],
      items: { hint: 1, reinforce: 1, hotgrill: 1 },
      settings: { sound: true, vibe: true },
      stats: { levelsSinceInterstitial: 0, lastFreeCoinsAd: 0 },
      frostCamp: null,     // the continuous Frost Survival camp
    };
  }

  const Save = {
    data: defaults(),
    load() {
      let raw = {};
      try { raw = JSON.parse(localStorage.getItem(SAVE_KEY) || '{}'); } catch (e) { raw = {}; }
      const d = defaults();
      for (const k of Object.keys(raw)) {
        if (d[k] && typeof d[k] === 'object' && !Array.isArray(d[k])) Object.assign(d[k], raw[k]);
        else d[k] = raw[k];
      }
      // v0.1 saves had "Barracks" upgrades; carry them over to town buildings.
      if (raw.upgrades && !raw.town) {
        const u = raw.upgrades;
        d.town.barracks = u.gateStart || 0;
        d.town.forge = u.frostDmg || 0;
        d.town.walls = u.frostWall || 0;
        d.town.hall = Math.max(1, d.town.barracks, d.town.forge, d.town.walls);
      }
      delete d.upgrades;
      this.data = d;
    },
    save() {
      try { localStorage.setItem(SAVE_KEY, JSON.stringify(this.data)); } catch (e) { /* private mode */ }
      document.dispatchEvent(new CustomEvent('save-changed'));
    },
    reset() { this.data = defaults(); this.save(); },
    addCoins(n) { this.data.coins = Math.max(0, this.data.coins + Math.round(n)); this.save(); },
    addGems(n) { this.data.gems = Math.max(0, this.data.gems + Math.round(n)); this.save(); },
    /** Add several resources at once, e.g. { coins: 50, food: 10 }. */
    grant(res) {
      for (const [k, v] of Object.entries(res || {})) {
        if (k === 'items') for (const [id, n] of Object.entries(v)) this.data.items[id] = (this.data.items[id] || 0) + n;
        else if (typeof this.data[k] === 'number') this.data[k] = Math.max(0, this.data[k] + Math.round(v));
      }
      this.save();
    },
    canAfford(cost) { return Object.entries(cost).every(([k, v]) => (this.data[k] || 0) >= v); },
    useItem(id) {
      if (!this.data.items[id]) return false;
      this.data.items[id]--;
      this.save();
      return true;
    },
  };

  // ---------------------------------------------------------------- Audio (tiny synth, no assets)
  let actx = null;
  function audio() {
    if (!actx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      actx = new AC();
    }
    if (actx.state === 'suspended') actx.resume();
    return actx;
  }
  const SFX = {
    tap:  [[520, 0.05, 'square', 0.05]],
    pin:  [[300, 0.06, 'triangle', 0.15], [600, 0.08, 'triangle', 0.12]],
    coin: [[880, 0.05, 'square', 0.06], [1320, 0.08, 'square', 0.06]],
    hit:  [[180, 0.05, 'sawtooth', 0.05]],
    pop:  [[660, 0.04, 'sine', 0.1]],
    bad:  [[200, 0.12, 'sawtooth', 0.1], [120, 0.15, 'sawtooth', 0.1]],
    win:  [[523, 0.1, 'triangle', 0.15], [659, 0.1, 'triangle', 0.15], [784, 0.1, 'triangle', 0.15], [1046, 0.25, 'triangle', 0.15]],
    lose: [[392, 0.15, 'triangle', 0.15], [330, 0.15, 'triangle', 0.15], [262, 0.3, 'triangle', 0.15]],
    level:[[440, 0.08, 'square', 0.08], [660, 0.08, 'square', 0.08], [880, 0.12, 'square', 0.08]],
  };
  const lastPlayed = {};
  function sfx(name) {
    if (!Save.data.settings.sound) return;
    const now = performance.now();
    if (lastPlayed[name] && now - lastPlayed[name] < 45) return; // avoid machine-gun stacking
    lastPlayed[name] = now;
    const ctx = audio();
    if (!ctx) return;
    let t = ctx.currentTime;
    for (const [freq, dur, type, vol] of SFX[name] || []) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = type; o.frequency.value = freq;
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(ctx.destination);
      o.start(t); o.stop(t + dur + 0.02);
      t += dur * 0.8;
    }
  }
  function vibrate(ms) {
    if (Save.data.settings.vibe && navigator.vibrate) navigator.vibrate(ms);
  }

  // ---------------------------------------------------------------- Stage
  // Fixed logical resolution (portrait 360x640), letterboxed to fit any phone.
  class Stage {
    constructor(canvas, W = 360, H = 640) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.W = W; this.H = H;
      this.scale = 1; this.cssScale = 1;
      this.resize = this.resize.bind(this);
      window.addEventListener('resize', this.resize);
    }
    resize() {
      const r = this.canvas.parentElement.getBoundingClientRect();
      if (!r.width || !r.height) return;
      const s = Math.min(r.width / this.W, r.height / this.H);
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      this.cssScale = s;
      this.scale = s * dpr;
      this.canvas.style.width = Math.floor(this.W * s) + 'px';
      this.canvas.style.height = Math.floor(this.H * s) + 'px';
      this.canvas.width = Math.floor(this.W * s * dpr);
      this.canvas.height = Math.floor(this.H * s * dpr);
    }
    begin() {
      this.ctx.setTransform(this.scale, 0, 0, this.scale, 0, 0);
      this.ctx.imageSmoothingEnabled = true;
    }
    toLocal(e) {
      const r = this.canvas.getBoundingClientRect();
      return { x: (e.clientX - r.left) / this.cssScale, y: (e.clientY - r.top) / this.cssScale };
    }
  }

  // ---------------------------------------------------------------- Helpers
  function rng(seed) { // mulberry32
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;

  function roundRect(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function outlinedText(ctx, text, x, y, size, fill = '#fff', stroke = 'rgba(0,0,0,.7)', align = 'center') {
    ctx.font = `900 ${size}px system-ui, -apple-system, Segoe UI, Roboto, sans-serif`;
    ctx.textAlign = align;
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(3, size / 5);
    ctx.strokeStyle = stroke;
    ctx.strokeText(text, x, y);
    ctx.fillStyle = fill;
    ctx.fillText(text, x, y);
  }

  function fmt(n) {
    n = Math.floor(n);
    if (n >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
    if (n >= 1e4) return (n / 1e3).toFixed(1).replace(/\.0$/, '') + 'K';
    return String(n);
  }

  // ---------------------------------------------------------------- UI
  const UI = {
    modalCount: 0,
    /**
     * opts: { title, sub, body (html), cls, buttons: [{label, cls, onClick, keepOpen}], dismissable }
     * Returns { close, el }.
     */
    modal(opts) {
      const root = document.getElementById('modal-root');
      const back = document.createElement('div');
      back.className = 'modal-backdrop';
      const m = document.createElement('div');
      m.className = 'modal ' + (opts.cls || '');
      m.innerHTML =
        (opts.icon ? `<div class="big">${opts.icon}</div>` : '') +
        (opts.title ? `<h2>${opts.title}</h2>` : '') +
        (opts.sub ? `<p class="sub">${opts.sub}</p>` : '') +
        (opts.body || '') +
        '<div class="actions"></div>';
      const actions = m.querySelector('.actions');
      let closed = false;
      const api = {
        el: m,
        close() {
          if (closed) return;
          closed = true;
          back.remove();
          UI.modalCount--;
          if (opts.onClose) opts.onClose();
        },
      };
      for (const b of opts.buttons || []) {
        const btn = document.createElement('button');
        btn.className = 'btn block ' + (b.cls || '');
        btn.innerHTML = b.label;
        if (b.disabled) btn.disabled = true;
        btn.addEventListener('click', () => {
          sfx('tap');
          if (!b.keepOpen) api.close();
          if (b.onClick) b.onClick(api, btn);
        });
        actions.appendChild(btn);
      }
      if (opts.dismissable) back.addEventListener('click', (e) => { if (e.target === back) api.close(); });
      back.appendChild(m);
      root.appendChild(back);
      UI.modalCount++;
      if (opts.onOpen) opts.onOpen(api);
      return api;
    },
    toast(msg, ms = 1600) {
      const t = document.getElementById('toast');
      t.textContent = msg;
      t.classList.add('show');
      clearTimeout(UI._toastT);
      UI._toastT = setTimeout(() => t.classList.remove('show'), ms);
    },
  };

  window.GH = { Save, Stage, UI, sfx, vibrate, rng, clamp, lerp, roundRect, outlinedText, fmt, Games: {} };
})();
