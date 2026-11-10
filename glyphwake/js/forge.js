// Glyphwake: metals, runes, weapon stats, and the anvil (3D blade preview + panel).
(function () {
  'use strict';
  const GW = window.GW, ID = GW.ID;

  const METALS = {
    iron: { name: 'Iron', glyph: '#%', color: 0x9aa0a8, glow: 0x6a7080, dmg: 14, desc: 'Honest, heavy, forgiving.' },
    bronze: { name: 'Bronze', glyph: '&o', color: 0xc8884a, glow: 0xff9a4a, dmg: 16, speed: 0.1, desc: '+10% attack speed.' },
    steel: { name: 'Steel', glyph: '@%', color: 0xc8d4e8, glow: 0xa8c8ff, dmg: 18, crit: 0.06, desc: '+6% critical chance.' },
    silver: { name: 'Silver', glyph: '$s', color: 0xf0f0ff, glow: 0xe0e8ff, dmg: 17, undead: 0.45, desc: '+45% damage to Hollows and Wisps.' },
    gold: { name: 'Gold', glyph: '0o', color: 0xffd060, glow: 0xffc040, dmg: 15, xp: 0.3, desc: '+30% experience and drop chance.' },
    duskglass: { name: 'Duskglass', glyph: 'N/', color: 0x6a4aff, glow: 0x8a6aff, dmg: 21, focus: 0.7, desc: '+70% focus regeneration.' },
    starfall: { name: 'Starfall', glyph: '*+', color: 0x9ae8ff, glow: 0x6ae0ff, dmg: 27, crit: 0.08, speed: 0.05, desc: 'Metal from a fallen star. +8% crit, +5% speed.' },
  };
  const RUNES = {
    ember: { name: 'Ember', g: '^', color: 0xff7a2a, adj: 'Searing', of: 'of Cinders', desc: 'Hits set foes burning (25% of hit over 3s).' },
    frost: { name: 'Frost', g: '*', color: 0x8ae0ff, adj: 'Rimed', of: 'of Ice', desc: 'Hits chill: foes move 40% slower for 2s.' },
    storm: { name: 'Storm', g: '!', color: 0xc08aff, adj: 'Crackling', of: 'of Storms', desc: '22% chance to arc lightning to 2 nearby foes.' },
    venom: { name: 'Venom', g: '~', color: 0x7aff5a, adj: 'Weeping', of: 'of Thorns', desc: 'Stacking poison: 8% of hit per tick for 4s.' },
    keen: { name: 'Keen', g: '/', color: 0xfff0a0, adj: 'Keen', of: 'of Edges', desc: '+10% critical chance.' },
    swift: { name: 'Swift', g: '>', color: 0x5affd0, adj: 'Quick', of: 'of Wind', desc: '+10% attack speed.' },
    ward: { name: 'Ward', g: '0', color: 0x5a8aff, adj: 'Warded', of: 'of the Wall', desc: 'Take 10% less damage.' },
    vigor: { name: 'Vigor', g: '+', color: 0xff6a6a, adj: 'Hale', of: 'of the Heart', desc: '+20 maximum health.' },
    thirst: { name: 'Thirst', g: '&', color: 0xd02040, adj: 'Thirsting', of: 'of the Leech', desc: 'Heal 3% of damage dealt.' },
  };
  const F = GW.Forge = { METALS, RUNES };

  F.weaponStats = function (w, level) {
    const m = METALS[w.metal];
    const s = { dmg: m.dmg * (1 + 0.08 * (level - 1)), crit: 0.05 + (m.crit || 0), speed: 1 + (m.speed || 0), undead: m.undead || 0, xp: m.xp || 0,
      focusRegen: 1 + (m.focus || 0), burn: 0, slow: 0, chain: 0, poison: 0, ward: 0, vigor: 0, steal: 0 };
    const cols = [];
    for (const r of w.runes) {
      if (!r) continue; cols.push(RUNES[r].color);
      if (r === 'ember') s.burn += 0.25; if (r === 'frost') s.slow += 1; if (r === 'storm') s.chain += 0.22; if (r === 'venom') s.poison += 0.08;
      if (r === 'keen') s.crit += 0.1; if (r === 'swift') s.speed += 0.1; if (r === 'ward') s.ward += 0.1; if (r === 'vigor') s.vigor += 20; if (r === 'thirst') s.steal += 0.03;
    }
    const c = new THREE.Color(m.glow);
    if (cols.length) { c.setRGB(0, 0, 0); cols.forEach(h => c.add(new THREE.Color(h))); c.multiplyScalar(1 / cols.length); }
    s.trail = c.getHex(); s.glow = c.getHex(); s.trailParticles = cols.length > 0;
    return s;
  };
  F.weaponName = function (w) {
    const rs = w.runes.filter(Boolean);
    const m = METALS[w.metal].name;
    if (!rs.length) return 'Plain ' + m + ' Blade';
    const adj = RUNES[rs[0]].adj;
    const of = rs.length > 1 ? ' ' + RUNES[rs[rs.length - 1]].of : '';
    return adj + ' ' + m + ' Blade' + of;
  };

  // ---------------- 3D preview ----------------
  function View() {
    const sc = this.scene = new THREE.Scene();
    this.cam = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
    this.rotY = 0.6; this.rotX = 0.2; this.zoom = 9.5; this.t = 0;
    const g = this.sword = new THREE.Group(); sc.add(g);
    this.mBlade = GW.mat({ id: ID.METAL, color: 0xc0c8d0, rim: 1.2 });
    this.mEdge = GW.mat({ id: ID.METAL, color: 0xffffff, rim: 1.5 });
    const mGrip = GW.mat({ id: ID.WOOD, color: 0x4a2a18, rim: 0.3 });
    this.mGuard = GW.mat({ id: ID.METAL, color: 0x8a7040, rim: 0.8 });
    // tapered blade
    const bg = new THREE.BoxGeometry(0.34, 3.2, 0.07, 1, 16, 1);
    const p = bg.attributes.position;
    for (let i = 0; i < p.count; i++) { const y = p.getY(i), k = (y + 1.6) / 3.2; let w = 1 - Math.pow(k, 3) * 0.95; p.setX(i, p.getX(i) * w); p.setZ(i, p.getZ(i) * (1 - k * 0.5)); if (k > 0.98) p.setX(i, 0); }
    bg.computeVertexNormals(); bg.translate(0, 1.9, 0);
    this.blade = new THREE.Mesh(bg, this.mBlade); g.add(this.blade);
    const fuller = new THREE.Mesh(new THREE.BoxGeometry(0.06, 2.2, 0.09), this.mEdge); fuller.position.y = 1.45; g.add(fuller);
    const guard = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.14, 0.18), this.mGuard); guard.position.y = 0.3; g.add(guard);
    for (const sx of [-1, 1]) { const tip = new THREE.Mesh(new THREE.OctahedronGeometry(0.11, 0), this.mGuard); tip.position.set(sx * 0.58, 0.3, 0); g.add(tip); }
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.8, 8), mGrip); grip.position.y = -0.15; g.add(grip);
    const pommel = new THREE.Mesh(new THREE.IcosahedronGeometry(0.14, 0), this.mGuard); pommel.position.y = -0.62; g.add(pommel);
    g.position.y = -1.1;
    // orbiting rune glyphs
    this.orbit = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.06, 0), GW.mat({ id: ID.RUNE, color: 0xffffff, unlit: true }), 90);
    this.orbit.frustumCulled = false; sc.add(this.orbit);
    // backdrop: anvil glow floor
    const floor = new THREE.Mesh(new THREE.CircleGeometry(4, 32).rotateX(-Math.PI / 2), GW.mat({ id: ID.GROUND, color: 0x3a2a20 }));
    floor.position.y = -2.0; sc.add(floor);
    this.lights = [
      { p: new THREE.Vector4(2.5, 1.5, 3, 12), c: new THREE.Color(1.0, 0.55, 0.25).multiplyScalar(1.4) },
      { p: new THREE.Vector4(-3, 3, -1, 12), c: new THREE.Color(0.35, 0.45, 0.8) },
      { p: new THREE.Vector4(0, -1.5, 1.5, 6), c: new THREE.Color(1.0, 0.35, 0.1) },
    ];
    this.runes = []; this.metal = 'iron';
  }
  View.prototype.set = function (metal, runes) {
    this.metal = metal; this.runes = runes.filter(Boolean);
    const m = METALS[metal];
    this.mBlade.uniforms.uColor.value.set(m.color);
    const s = F.weaponStats({ metal, runes }, 1);
    this.glow = new THREE.Color(s.glow);
    this.mBlade.uniforms.uEmissive.value.copy(this.glow).multiplyScalar(this.runes.length ? 0.18 : 0.04);
    this.mEdge.uniforms.uEmissive.value.copy(this.glow).multiplyScalar(this.runes.length ? 0.6 : 0.1);
  };
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _v = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Color();
  View.prototype.update = function (dt, w, h, rect) {
    this.t += dt;
    if (!this.dragging) this.rotY += dt * 0.35;
    this.sword.rotation.set(this.rotX, this.rotY, 0.35, 'XYZ');
    this.cam.aspect = w / h; this.cam.fov = w < h ? 48 : 35; this.cam.updateProjectionMatrix();
    this.cam.position.set(0, 0.6, this.zoom); this.cam.lookAt(0, 0.6, 0);
    if (rect) this.cam.setViewOffset(w, h, w / 2 - rect.cx, h / 2 - rect.cy, w, h); else this.cam.clearViewOffset();
    // orbiting glyphs: rune count * 30
    const n = this.runes.length * 30;
    for (let i = 0; i < 90; i++) {
      if (i >= n) { _m.makeScale(0, 0, 0); this.orbit.setMatrixAt(i, _m); continue; }
      const r = this.runes[Math.floor(i / 30)], k = i % 30;
      const yy = -0.4 + (k / 30) * 3.6, a = this.t * (1.6 + (i % 3) * 0.3) + k * 2.4 + Math.floor(i / 30) * 2.1;
      const rad = 0.42 + 0.12 * Math.sin(k * 1.7 + this.t);
      _v.set(Math.cos(a) * rad, yy, Math.sin(a) * rad).applyEuler(this.sword.rotation).add(this.sword.position);
      _m.compose(_v, _q, _s.setScalar(0.9 + 0.6 * Math.sin(this.t * 4 + k)));
      this.orbit.setMatrixAt(i, _m); this.orbit.setColorAt(i, _c.set(RUNES[r].color));
    }
    this.orbit.instanceMatrix.needsUpdate = true; if (this.orbit.instanceColor) this.orbit.instanceColor.needsUpdate = true;
    // lights into the shared uniforms
    const LU = GW.LU;
    this.lights.forEach((l, i) => { LU.uLP.value[i].copy(l.p); LU.uLC.value[i].copy(l.c); });
    let n2 = this.lights.length;
    if (this.runes.length) { LU.uLP.value[n2].set(0, 0.6, 0.8, 5); LU.uLC.value[n2].copy(this.glow).multiplyScalar(0.8 + 0.3 * Math.sin(this.t * 3)); n2++; }
    LU.uLN.value = n2;
  };

  // ---------------- forge panel ----------------
  const UIF = F.UI = {};
  let G = null, view = null, sel = null;
  UIF.open = function (game) {
    G = game; view = view || new View();
    sel = G.player.weapon.metal;
    document.getElementById('forge').classList.remove('hidden');
    F.render();
    GWAudio.sfx('anvil');
  };
  UIF.close = function () { document.getElementById('forge').classList.add('hidden'); if (G) G.closeForge(); };
  UIF.view = () => view;
  UIF.isOpen = () => !document.getElementById('forge').classList.contains('hidden');
  F.freeRect = function () {
    const W = window.innerWidth, H = window.innerHeight;
    const side = document.getElementById('f-side').getBoundingClientRect();
    const top = document.getElementById('f-metals').getBoundingClientRect().bottom;
    if (W <= 640) return { cx: W / 2, cy: (top + side.top) / 2 };
    return { cx: side.left / 2, cy: (top + H - 26) / 2 };
  };

  F.render = function () {
    const P = G.player, w = P.weapon;
    document.getElementById('f-name').textContent = F.weaponName({ metal: sel, runes: w.runes });
    // runes
    const rr = document.getElementById('f-runes'); rr.innerHTML = '';
    Object.keys(RUNES).forEach(k => {
      const R = RUNES[k], n = P.inv.runes[k] || 0;
      const b = document.createElement('button'); b.className = 'chip rune' + (n ? '' : ' off');
      b.innerHTML = `<span style="color:#${R.color.toString(16).padStart(6, '0')}">${R.g}</span>` + (n ? `<span class="n">${n}</span>` : '');
      b.onclick = () => { if (!n) { G.ui.toast('You have no ' + R.name + ' rune yet', 1.2); return; } const i = w.runes.indexOf(null); if (i < 0) { G.ui.toast('All three slots are full: tap a slot to free it', 1.4); return; }
        w.runes[i] = k; P.inv.runes[k]--; GWAudio.sfx('socket'); P.recalc(); G.onSocket(); F.render(); };
      tip(b, R.name + ' rune  ' + R.g + '\n' + R.desc + '\nowned: ' + n);
      rr.appendChild(b);
    });
    // metals
    const mm = document.getElementById('f-metals'); mm.innerHTML = '';
    Object.keys(METALS).forEach(k => {
      const M = METALS[k], n = k === 'iron' ? '∞' : (P.inv.ingots[k] || 0);
      const owned = k === 'iron' || n > 0 || k === w.metal;
      const b = document.createElement('button'); b.className = 'chip' + (k === sel ? ' sel' : '') + (owned ? '' : ' off');
      b.innerHTML = `<span style="color:#${M.color.toString(16).padStart(6, '0')}">${M.glyph}</span> ${k === w.metal ? 'as forged' : M.name}` + (k !== w.metal && k !== 'iron' ? `<span class="n">${n}</span>` : '');
      b.onclick = () => { sel = k; GWAudio.sfx('ui'); F.render(); };
      tip(b, M.name + '\nbase damage ' + M.dmg + '\n' + M.desc + (k === 'iron' ? '' : '\ningots: ' + n));
      mm.appendChild(b);
    });
    // slots
    const ss = document.getElementById('f-slots'); ss.innerHTML = '';
    w.runes.forEach((r, i) => {
      const d = document.createElement('div'); d.className = 'slot' + (r ? ' full' : '');
      if (r) { d.textContent = RUNES[r].g; d.style.color = '#' + RUNES[r].color.toString(16).padStart(6, '0'); d.style.borderColor = d.style.color; }
      else d.textContent = '+';
      d.onclick = () => { if (!r) return; P.inv.runes[r] = (P.inv.runes[r] || 0) + 1; w.runes[i] = null; GWAudio.sfx('ui'); P.recalc(); F.render(); };
      if (r) tip(d, RUNES[r].name + '\n' + RUNES[r].desc + '\ntap: take out');
      ss.appendChild(d);
    });
    // stats
    const s = F.weaponStats({ metal: sel, runes: w.runes }, P.level), cur = P.ws;
    const diff = (a, b, f) => a === b ? '' : (a > b ? ` <span style="color:#7fcf6a">▲${f(a - b)}</span>` : ` <span style="color:#e0484a">▼${f(b - a)}</span>`);
    const pct = v => Math.round(v * 100) + '%';
    const lines = [
      `Metal: <b>${METALS[sel].name}</b>`,
      `Damage: <b>${s.dmg.toFixed(1)}</b>${diff(+s.dmg.toFixed(1), +cur.dmg.toFixed(1), v => v.toFixed(1))}`,
      `Critical: <b>${pct(s.crit)}</b>   Speed: <b>${pct(s.speed)}</b>`,
      `Runes: ${w.runes.filter(Boolean).length} / 3`,
    ];
    if (s.burn) lines.push('Burn ' + pct(s.burn) + ' of each hit over 3s');
    if (s.slow) lines.push('Chill: slows 40% for 2s');
    if (s.chain) lines.push('Arc lightning ' + pct(s.chain) + ' chance');
    if (s.poison) lines.push('Poison ' + pct(s.poison) + ' per tick, stacks');
    if (s.ward) lines.push('Damage taken -' + pct(s.ward));
    if (s.vigor) lines.push('Max health +' + s.vigor);
    if (s.steal) lines.push('Life steal ' + pct(s.steal));
    if (s.undead) lines.push('+' + pct(s.undead) + ' vs undead');
    if (s.xp) lines.push('+' + pct(s.xp) + ' xp & drops');
    if (s.focusRegen > 1) lines.push('Focus regen +' + pct(s.focusRegen - 1));
    document.getElementById('f-stats').innerHTML = lines.join('\n');
    const tb = document.getElementById('f-temper');
    const can = sel !== w.metal && (sel === 'iron' || (P.inv.ingots[sel] || 0) > 0);
    tb.disabled = !can;
    tb.textContent = sel === w.metal ? 'Blade is tempered' : can ? 'Reforge in ' + METALS[sel].name + (sel === 'iron' ? '' : ' (1 ingot)') : 'Need a ' + METALS[sel].name + ' ingot';
    view.set(sel, w.runes);
  };
  function tip(el, text) {
    const t = document.getElementById('f-tip');
    el.onmouseenter = (e) => { t.textContent = text; t.classList.remove('hidden'); const r = el.getBoundingClientRect(); t.style.left = Math.min(window.innerWidth - 210, r.left) + 'px'; t.style.top = (r.bottom + 4) + 'px'; };
    el.onmouseleave = () => t.classList.add('hidden');
  }

  UIF.init = function () {
    document.getElementById('f-close').onclick = () => UIF.close();
    document.getElementById('f-temper').onclick = () => {
      const P = G.player, w = P.weapon;
      if (sel === w.metal) return;
      if (sel !== 'iron') { if (!(P.inv.ingots[sel] > 0)) return; P.inv.ingots[sel]--; }
      w.metal = sel; P.recalc();
      GWAudio.sfx('anvil'); setTimeout(() => GWAudio.sfx('anvil'), 180); setTimeout(() => GWAudio.sfx('socket'), 420);
      G.flashWhite = 0.6; G.onTemper(); F.render();
    };
    // drag/zoom the preview on the canvas
    const cv = document.getElementById('gl');
    let last = null, pinch = null;
    cv.addEventListener('pointerdown', e => { if (!UIF.isOpen()) return; last = { x: e.clientX, y: e.clientY }; view.dragging = true; });
    window.addEventListener('pointermove', e => { if (!last || !UIF.isOpen()) return; view.rotY += (e.clientX - last.x) * 0.01; view.rotX = GW.clamp(view.rotX + (e.clientY - last.y) * 0.01, -1.2, 1.2); last = { x: e.clientX, y: e.clientY }; });
    window.addEventListener('pointerup', () => { last = null; if (view) view.dragging = false; });
    cv.addEventListener('wheel', e => { if (!UIF.isOpen()) return; view.zoom = GW.clamp(view.zoom + e.deltaY * 0.005, 4, 12); }, { passive: true });
    cv.addEventListener('touchmove', e => { if (!UIF.isOpen() || e.touches.length !== 2) return; const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY); if (pinch) view.zoom = GW.clamp(view.zoom - (d - pinch) * 0.02, 4, 12); pinch = d; }, { passive: true });
    cv.addEventListener('touchend', () => { pinch = null; });
  };
})();
