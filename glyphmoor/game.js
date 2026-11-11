/* Glyphmoor: rules, input, fishing, loot and interface. */
(function () {
  'use strict';
  const W = GM, H = W.H, $ = (id) => document.getElementById(id);
  const rnd = (a, b) => a + Math.random() * (b - a), irnd = (a, b) => Math.floor(rnd(a, b + 1)), pick = (a) => a[Math.floor(Math.random() * a.length)];
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const SAVE_KEY = 'glyphmoor.v1';

  // ---------------- items ----------------
  const MATS = [
    { n: 'Iron', m: 1, blade: 0xdde3ee, glow: 0, w: 50 },
    { n: 'Steel', m: 1.25, blade: 0xf2f6ff, glow: 0, w: 30 },
    { n: 'Moonsilver', m: 1.6, blade: 0xbfe4ff, glow: 0x4aa0ff, w: 13 },
    { n: 'Emberglass', m: 1.95, blade: 0xffb866, glow: 0xff6a20, w: 6 },
    { n: 'Voidiron', m: 2.35, blade: 0xb48cff, glow: 0x8a40ff, w: 2 },
  ];
  const RUNES = [
    { n: 'Embers', k: 'burn', v: [3, 8], t: '+# burn damage' },
    { n: 'Thirst', k: 'leech', v: [2, 6], t: '#% life leech' },
    { n: 'Gale', k: 'haste', v: [6, 18], t: '+#% strike speed' },
    { n: 'Thorn', k: 'crit', v: [4, 12], t: '+#% crit' },
    { n: 'Oak', k: 'hp', v: [14, 40], t: '+# life' },
  ];
  const RAR = ['common', 'fine', 'rare', 'mythic'];
  const BASES = {
    weapon: [['Longsword', 7, 11, 0.6], ['Falchion', 5, 9, 0.48], ['War Blade', 10, 15, 0.78]],
    helm: [['Great Helm', 16], ['Sallet', 12]], chest: [['Cuirass', 30], ['Hauberk', 24]],
    gloves: [['Gauntlets', 9]], boots: [['Sabatons', 11], ['Greaves', 9]], amulet: [['Sigil', 0], ['Torc', 0]],
  };
  const SLOTS = ['weapon', 'helm', 'chest', 'gloves', 'boots', 'amulet'];
  const ICON = {
    weapon: '     /\n    / \n   /  \n\\ /   \n X    \n/ \\   ', helm: ' .--. \n/    \\\n|=--=|\n| :: |\n \\__/ ', chest: '__  __\n\\ \\/ /\n |##| \n |##| \n \\__/ ',
    gloves: ' ||||\n ||||\n/    |\n\\   / \n |_|  ', boots: '  __  \n |  | \n |  | \n |  \\_\n |____)', amulet: ' .--. \n(    )\n \\  / \n  \\/  \n  <>  ',
    fish: '      \n  __/|\n><  o>\n  ``\\|\n      ',
  };
  const FISH = [
    { n: 'Reed Minnow', r: 0, heal: 18, w: 46, kg: [0.1, 0.4] }, { n: 'Dusk Perch', r: 0, heal: 28, w: 28, kg: [0.4, 1.2] },
    { n: 'Lantern Eel', r: 1, heal: 45, w: 15, kg: [0.8, 2.1] }, { n: 'Moon Carp', r: 2, heal: 80, w: 8, kg: [2, 5.5] }, { n: 'Old King Pike', r: 3, heal: 160, w: 3, kg: [6, 14] },
  ];
  function weighted(list) { let t = 0; for (const e of list) t += e.w; let r = Math.random() * t; for (const e of list) { r -= e.w; if (r <= 0) return e; } return list[0]; }
  function rollItem(ilvl, minRar) {
    const slot = Math.random() < 0.34 ? 'weapon' : pick(SLOTS.slice(1));
    let r = Math.random(), rar = r < 0.55 ? 0 : r < 0.85 ? 1 : r < 0.97 ? 2 : 3;
    rar = Math.max(rar, minRar || 0);
    let mat = weighted(MATS); if (rar >= 2 && mat.m < 1.25) mat = MATS[1 + irnd(0, 1)]; if (rar === 3 && mat.m < 1.6) mat = MATS[2 + irnd(0, 2)];
    const b = pick(BASES[slot]), k = mat.m * (1 + (ilvl - 1) * 0.14) * (1 + rar * 0.08);
    const it = { slot, rar, mat: MATS.indexOf(mat), runes: [] };
    if (slot === 'weapon') { it.min = Math.round(b[1] * k); it.max = Math.round(b[2] * k); it.spd = b[3]; }
    else if (slot === 'amulet') { it.hp = Math.round(12 * k); }
    else it.arm = Math.round(b[1] * k);
    const nr = rar === 0 ? 0 : rar === 3 ? 2 : 1, pool = RUNES.slice();
    for (let i = 0; i < nr; i++) { const ru = pool.splice(irnd(0, pool.length - 1), 1)[0]; it.runes.push({ r: RUNES.indexOf(ru), v: Math.round(rnd(ru.v[0], ru.v[1]) * (0.7 + rar * 0.2)) }); }
    it.name = mat.n + ' ' + b[0] + (it.runes.length ? ' · Rune of ' + it.runes.map((x) => RUNES[x.r].n).join(' & ') : '');
    return it;
  }
  function itemLines(it) {
    const out = [];
    if (it.slot === 'fish') { out.push(it.kg + ' kg · restores ' + it.heal + ' life'); return out; }
    if (it.min) out.push('damage ' + it.min + '–' + it.max + ' · ' + it.spd.toFixed(2) + 's · ' + (((it.min + it.max) / 2) / it.spd).toFixed(1) + ' dps');
    if (it.arm) out.push('armour ' + it.arm);
    if (it.hp) out.push('+' + it.hp + ' life');
    for (const x of it.runes) out.push('ᚱ ' + RUNES[x.r].t.replace('#', x.v));
    return out;
  }

  // ---------------- state ----------------
  let S;
  function fresh() {
    return { name: 'Wayfarer', lvl: 1, xp: 0, hp: 110, gold: 0, quest: 0, kills: 0, x: 2, z: 7, bag: [],
      eq: { weapon: { slot: 'weapon', rar: 0, mat: 0, runes: [], min: 6, max: 10, spd: 0.6, name: 'Iron Longsword' }, helm: null, chest: null, gloves: null, boots: null, amulet: null } };
  }
  function load() { try { const s = JSON.parse(localStorage.getItem(SAVE_KEY)); if (s && s.eq && s.bag) return s; } catch (e) { /* no save */ } return null; }
  function save() { try { S.x = P.x; S.z = P.z; localStorage.setItem(SAVE_KEY, JSON.stringify(S)); } catch (e) { /* storage off */ } }
  const BAG_MAX = 30;
  let stats = {};
  function recalc() {
    const st = { arm: 0, hp: 96 + S.lvl * 14, crit: 5, leech: 0, haste: 0, burn: 0, min: 2 + S.lvl, max: 4 + S.lvl, spd: 0.6 };
    for (const s of SLOTS) { const it = S.eq[s]; if (!it) continue; st.arm += it.arm || 0; st.hp += it.hp || 0; if (it.min) { st.min += it.min; st.max += it.max; st.spd = it.spd; } for (const x of it.runes) st[RUNES[x.r].k] += x.v; }
    st.spd = st.spd / (1 + st.haste / 100);
    stats = st; S.hp = Math.min(S.hp, st.hp);
    const w = S.eq.weapon, m = MATS[w ? w.mat : 0];
    if (P.k) { P.k.bladeMat.color.setHex(m.blade); P.k.bladeMat.emissive.setHex(m.glow).multiplyScalar(0.55); P.k.glow.color.setHex(m.glow || 0xffffff); P.k.glow.intensity = m.glow ? 1.6 : 0; P.k.sword.visible = !!w && !fish.on; }
  }
  const xpNeed = () => Math.round(60 * Math.pow(S.lvl, 1.5));

  // ---------------- world objects ----------------
  const P = { x: 0, y: 0, z: 0, rot: 0, speed: 0, atk: -1, atkHit: false, dead: 0, hurtT: 9, k: null };
  const foes = [], loot = [], tags = [];
  let maren, camp, beacon, jetty = { x: W.LAKE.x, z0: 0, z1: 0 }, bobber, line, boss = null, time = 0, started = false;

  function ground(x, z) { const h = H(x, z); if (Math.abs(x - jetty.x) < 0.75 && z < jetty.z0 + 0.6 && z > jetty.z1) return Math.max(h, 0.46); return h; }
  function walkable(x, z) { return ground(x, z) > -0.3 && Math.abs(x) < 170 && Math.abs(z) < 170; }

  function tag(cls, text) { const el = document.createElement('div'); el.className = 'tag ' + cls; el.innerHTML = text; $('labels').appendChild(el); return el; }
  function putTag(el, x, y, z) { const p = W.project(x, y, z); if (!p.on) { el.style.display = 'none'; return; } el.style.display = ''; el.style.left = p.x + 'px'; el.style.top = p.y + 'px'; }
  function floatText(x, y, z, text, cls) { const p = W.project(x, y, z); if (!p.on) return; const el = document.createElement('div'); el.className = 'dmg ' + (cls || ''); el.textContent = text; el.style.left = p.x + rnd(-14, 14) + 'px'; el.style.top = p.y + 'px'; $('labels').appendChild(el); setTimeout(() => el.remove(), 800); }
  function toast(html) { const d = document.createElement('div'); d.innerHTML = html; $('toast').appendChild(d); $('toast').appendChild(document.createElement('br')); setTimeout(() => { if (d.nextSibling) d.nextSibling.remove(); d.remove(); }, 3200); }
  function banner(h, p) { const b = $('banner'); b.querySelector('h2').textContent = h; b.querySelector('p').textContent = p; b.classList.remove('hidden'); b.style.animation = 'none'; void b.offsetWidth; b.style.animation = ''; setTimeout(() => b.classList.add('hidden'), 6000); }

  const FOE_SPOTS = [[-26, 16, 1], [-44, 2, 1], [-20, 40, 1], [14, 38, 1], [34, 26, 2], [-58, 30, 2], [-48, -78, 2], [8, -84, 3], [40, -52, 3], [-80, -30, 3]];
  function spawnFoe(x, z, lvl, isBoss) {
    const m = W.makeHusk(isBoss); W.scene.add(m.root);
    const f = { m, x, z, hx: x, hz: z, lvl, boss: !!isBoss, hp: 0, max: isBoss ? 460 : 30 + lvl * 14, dmg: isBoss ? 24 : 6 + lvl * 3, state: 'idle', t: rnd(0, 3), cd: 0, lunge: 0, rot: rnd(0, 6), wx: x, wz: z, sp: 0,
      tag: tag('foe', (isBoss ? 'Barrow Warden' : 'husk · ' + lvl) + '<i><b></b></i>') };
    f.hp = f.max; foes.push(f); return f;
  }

  function buildWorld() {
    P.k = W.makeKnight('knight'); W.scene.add(P.k.root);
    P.tag = tag('me', '');
    // shoreline for the jetty
    let z = -18; while (H(jetty.x, z) > 0.32 && z > -44) z -= 0.25;
    jetty.z0 = z; jetty.z1 = z - 7.2;
    const jt = W.makeJetty(15); jt.position.set(jetty.x, 0, z + 0.5); W.scene.add(jt);
    maren = { k: W.makeKnight('angler'), x: jetty.x + 3.4, z: z + 2.2 };
    W.scene.add(maren.k.root); maren.k.root.position.set(maren.x, H(maren.x, maren.z), maren.z); maren.k.root.rotation.y = Math.PI * 0.9;
    maren.tag = tag('npc', 'Maren · angler');
    camp = W.makeFire(false); W.place(camp.g, 4, 4); camp.set(true); camp.x = 4; camp.z = 4;
    beacon = W.makeFire(true); W.place(beacon.g, W.RIDGE.x, W.RIDGE.z); beacon.x = W.RIDGE.x; beacon.z = W.RIDGE.z;
    for (let i = 0; i < 9; i++) { const a = i / 9 * 6.283 + 0.3; W.place(W.makeStone(2.4 + (i % 3) * 0.7), W.RIDGE.x + Math.cos(a) * 9, W.RIDGE.z + Math.sin(a) * 9); }
    let seed = 7; const sr = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (let i = 0; i < 46; i++) {
      const x = (sr() - 0.5) * 300, zz = (sr() - 0.5) * 300; if (H(x, zz) < 1 || Math.hypot(x, zz) < 9 || Math.hypot(x - W.RIDGE.x, zz - W.RIDGE.z) < 13) continue;
      const o = W.place(i % 3 ? W.makeRock(0.5 + sr() * 1.1) : W.makeTree(), x, zz); o.rotation.y = sr() * 6;
    }
    bobber = W.makeBobber(); bobber.visible = false; W.scene.add(bobber);
    line = W.makeLine(); line.visible = false; W.scene.add(line);
    W.initSparks();
    for (const s of FOE_SPOTS) spawnFoe(s[0], s[1], s[2]);
  }

  // ---------------- audio ----------------
  let ac = null, wind = null;
  function audioOn() {
    if (ac) return; try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return; }
    const buf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate), d = buf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    wind = { buf }; const src = ac.createBufferSource(); src.buffer = buf; src.loop = true;
    const f = ac.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 380; f.Q.value = 0.6; const g = ac.createGain(); g.gain.value = 0.05;
    const lfo = ac.createOscillator(), lg = ac.createGain(); lfo.frequency.value = 0.13; lg.gain.value = 160; lfo.connect(lg); lg.connect(f.frequency); lfo.start();
    src.connect(f); f.connect(g); g.connect(ac.destination); src.start();
  }
  function tone(fr, dur, type, vol, to) { if (!ac) return; const o = ac.createOscillator(), g = ac.createGain(), t = ac.currentTime; o.type = type || 'sine'; o.frequency.setValueAtTime(fr, t); if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur); g.gain.setValueAtTime(vol || 0.1, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); o.connect(g); g.connect(ac.destination); o.start(t); o.stop(t + dur); }
  function hiss(dur, vol, fr) { if (!ac) return; const s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain(), t = ac.currentTime; s.buffer = wind.buf; f.type = 'bandpass'; f.frequency.value = fr; g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); s.connect(f); f.connect(g); g.connect(ac.destination); s.start(t, Math.random()); s.stop(t + dur); }
  const sfx = {
    swing: () => hiss(0.18, 0.22, 1800), hit: () => { tone(140, 0.12, 'square', 0.12, 60); hiss(0.1, 0.25, 900); }, hurt: () => tone(90, 0.25, 'sawtooth', 0.14, 45),
    pick: () => { tone(660, 0.09, 'triangle', 0.1); setTimeout(() => tone(990, 0.14, 'triangle', 0.1), 70); }, splash: () => hiss(0.35, 0.3, 600), bite: () => tone(880, 0.1, 'square', 0.1),
    lvl: () => [392, 494, 587, 784].forEach((f, i) => setTimeout(() => tone(f, 0.3, 'triangle', 0.12), i * 110)), fire: () => { hiss(0.9, 0.35, 300); tone(70, 0.9, 'sawtooth', 0.12, 220); }, ui: () => tone(520, 0.05, 'square', 0.05),
  };

  // ---------------- input ----------------
  const keys = {}, inp = { x: 0, z: 0, actHeld: false };
  let stickId = null;
  function bindInput() {
    addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT') return; const k = e.key.toLowerCase(); if (keys[k]) return; keys[k] = true;
      if (!started) return;
      if (k === ' ' || k === 'j') { e.preventDefault(); attack(); }
      if (k === 'e' || k === 'f') { inp.actHeld = true; act(); }
      if (k === 'i' || k === 'b') toggleBag();
      if (k === 'escape') { $('bag').classList.add('hidden'); }
    });
    addEventListener('keyup', (e) => { const k = e.key.toLowerCase(); keys[k] = false; if (k === 'e' || k === 'f') inp.actHeld = false; });
    const st = $('stick'), nub = st.firstElementChild;
    const mv = (e) => { const r = st.getBoundingClientRect(); let dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2); const l = Math.hypot(dx, dy), m = r.width / 2; if (l > m) { dx *= m / l; dy *= m / l; } nub.style.transform = `translate(${dx}px,${dy}px)`; inp.x = dx / m; inp.z = dy / m; };
    st.addEventListener('pointerdown', (e) => { stickId = e.pointerId; st.setPointerCapture(e.pointerId); mv(e); });
    st.addEventListener('pointermove', (e) => { if (e.pointerId === stickId) mv(e); });
    const up = (e) => { if (e.pointerId !== stickId) return; stickId = null; inp.x = inp.z = 0; nub.style.transform = ''; };
    st.addEventListener('pointerup', up); st.addEventListener('pointercancel', up);
    $('b-atk').addEventListener('pointerdown', (e) => { e.preventDefault(); attack(); });
    const ba = $('b-act');
    ba.addEventListener('pointerdown', (e) => { e.preventDefault(); inp.actHeld = true; act(); });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach((n) => ba.addEventListener(n, () => { inp.actHeld = false; }));
    $('b-bag').addEventListener('click', toggleBag); $('bg-close').addEventListener('click', toggleBag);
    $('dialog').addEventListener('click', nextLine);
    addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('visibilitychange', () => { if (document.hidden && started) save(); });
  }

  // ---------------- quest ----------------
  const QUEST = [
    () => 'Speak with Maren at the jetty', () => 'Catch a fish in Stillmere', () => 'Thin the husks  ' + Math.min(S.kills, 4) + ' / 4',
    () => 'Light the beacon on Cairn Ridge', () => 'Put down the Barrow Warden', () => 'The moor is quiet. Wander as you like.',
  ];
  function questTarget() {
    if (S.quest === 0) return maren; if (S.quest === 1) return { x: jetty.x, z: jetty.z0 - 3 };
    if (S.quest === 2) { let b = null, bd = 1e9; for (const f of foes) { if (f.state === 'dead') continue; const d = Math.hypot(f.x - P.x, f.z - P.z); if (d < bd) { bd = d; b = f; } } return b; }
    if (S.quest === 3) return beacon; if (S.quest === 4) return boss; return null;
  }
  function setQuest(n) { S.quest = n; $('q-text').textContent = QUEST[n](); save(); }
  const TALK = [
    ['You have the look of someone who walked a long way to stand in the dark.', 'The husks came up out of the barrows when the ridge beacon went cold. Nobody has climbed to relight it.', 'First things first. You cannot think on an empty stomach. Take the rod from your pack and pull something out of Stillmere.'],
    ['Stand at the end of the jetty, face the water, and cast. When the float dips, set the hook, then keep the line tight but not too tight.'],
    ['Eat what you catch when you are hurt. Now, the husks: put four of them down, so I know you can reach the ridge alive.'],
    ['East, where the land climbs. The beacon stands in the ring of stones. Something sleeps under it. Light it anyway.'],
    ['You lit it? Then finish what woke up.'], ['Quiet nights again. The pike in this lake is older than I am, if you want a real fight.'],
  ];
  let dlg = null;
  function talk() { dlg = { lines: TALK[S.quest].slice(), i: 0 }; $('d-who').textContent = 'MAREN'; $('dialog').classList.remove('hidden'); nextLine(); }
  function nextLine() {
    if (!dlg) return; sfx.ui();
    if (dlg.i >= dlg.lines.length) { $('dialog').classList.add('hidden'); dlg = null; if (S.quest === 0) setQuest(1); return; }
    $('d-text').textContent = dlg.lines[dlg.i++];
  }

  // ---------------- combat ----------------
  function attack() {
    if (!started || P.dead || P.atk >= 0 || dlg || !$('bag').classList.contains('hidden')) return;
    if (fish.on) { if (fish.st === 'wait') endFish('You reel the line in.'); else return; }
    let b = null, bd = 4.5; for (const f of foes) { if (f.state === 'dead') continue; const d = Math.hypot(f.x - P.x, f.z - P.z) - (f.boss ? 1 : 0); if (d < bd) { bd = d; b = f; } }
    if (b) P.rot = Math.atan2(b.x - P.x, b.z - P.z);
    P.atk = 0; P.atkHit = false; sfx.swing();
  }
  function strike() {
    const fx = Math.sin(P.rot), fz = Math.cos(P.rot); let any = false;
    for (const f of foes) {
      if (f.state === 'dead') continue; const dx = f.x - P.x, dz = f.z - P.z, d = Math.hypot(dx, dz), reach = 2.6 + (f.boss ? 1.2 : 0);
      if (d > reach || (dx * fx + dz * fz) / (d + 0.001) < 0.2) continue;
      let dmg = rnd(stats.min, stats.max); const crit = Math.random() * 100 < stats.crit; if (crit) dmg *= 1.8; dmg = Math.round(dmg + stats.burn);
      f.hp -= dmg; any = true; if (f.state === 'idle') f.state = 'chase';
      if (!f.boss) { f.x += dx / d * 0.7; f.z += dz / d * 0.7; }
      floatText(f.x, P.y + 2.2, f.z, dmg + (crit ? '!' : ''), crit ? 'crit' : '');
      W.burst(f.x, ground(f.x, f.z) + 1.2, f.z, stats.burn ? 0xff8a30 : 0xfff0c0, crit ? 12 : 6, 5);
      if (stats.leech) heal(Math.max(1, Math.round(dmg * stats.leech / 100)), true);
      if (f.hp <= 0) kill(f);
    }
    if (any) { sfx.hit(); W.cam.shake = 0.35; }
  }
  function kill(f) {
    f.state = 'dead'; f.t = 0; f.tag.style.display = 'none';
    gainXp(f.boss ? 400 : 18 + f.lvl * 10);
    const g = f.boss ? irnd(120, 200) : irnd(3, 9) * f.lvl; dropLoot(f.x + rnd(-0.6, 0.6), f.z + rnd(-0.6, 0.6), { gold: g });
    if (f.boss) { for (let i = 0; i < 3; i++) dropLoot(f.x + rnd(-2, 2), f.z + rnd(-2, 2), { item: rollItem(S.lvl + 2, i ? 1 : 3) }); }
    else if (Math.random() < 0.42) dropLoot(f.x + rnd(-0.8, 0.8), f.z + rnd(-0.8, 0.8), { item: rollItem(f.lvl + (Math.random() < 0.3 ? 1 : 0)) });
    if (!f.boss) { S.kills++; if (S.quest === 2) { $('q-text').textContent = QUEST[2](); if (S.kills >= 4) { setQuest(3); toast('The way to the ridge is open. Head east.'); } } }
    else if (S.quest === 4) { setQuest(5); banner('The moor is quiet', 'The Barrow Warden is ash. This slice of Glyphmoor is complete, and the lake, the husks and your loot are yours to keep playing with.'); sfx.lvl(); }
    save();
  }
  const RARCOL = [0xcfd3da, 0x7fd6a0, 0x7fb4ff, 0xffae5c];
  function dropLoot(x, z, what) { if (!walkable(x, z)) { x = P.x; z = P.z; } const o = W.makeLoot(what.gold ? 0xe0a94a : RARCOL[what.item.rar]); o.position.set(x, ground(x, z), z); W.scene.add(o); loot.push(Object.assign({ o, x, z, t: 0 }, what)); }
  function gainXp(n) {
    S.xp += n; while (S.xp >= xpNeed()) { S.xp -= xpNeed(); S.lvl++; recalc(); S.hp = stats.hp; toast('<b style="color:var(--gold)">Level ' + S.lvl + '</b> · life restored'); sfx.lvl(); W.burst(P.x, P.y + 1, P.z, 0xe0a94a, 24, 6, 1.6); }
  }
  function heal(n, quiet) { const b = S.hp; S.hp = Math.min(stats.hp, S.hp + n); if (!quiet && S.hp > b) floatText(P.x, P.y + 2.3, P.z, '+' + Math.round(S.hp - b), 'heal'); }
  function hurt(n) {
    if (P.dead) return; const d = Math.max(1, Math.round(n * 100 / (100 + stats.arm)));
    S.hp -= d; P.hurtT = 0; floatText(P.x, P.y + 2.2, P.z, '-' + d, 'hurt'); sfx.hurt(); W.cam.shake = 0.5; W.post.uniforms.uFlash.value = 1;
    if (fish.on) endFish('The line goes slack.');
    if (S.hp <= 0) { S.hp = 0; P.dead = 0.001; P.atk = -1; toast('You fall. The campfire calls you back.'); }
  }

  function tickFoes(dt) {
    for (const f of foes) {
      const dx = P.x - f.x, dz = P.z - f.z, d = Math.hypot(dx, dz), reach = f.boss ? 3.1 : 1.7; let sp = 0;
      f.cd -= dt;
      if (f.state === 'dead') {
        f.t += dt; if (f.t > 2.2) f.m.root.position.y -= dt * 0.6;
        if (f.t > 4 && f.m.root.visible) f.m.root.visible = false;
        if (!f.boss && f.t > 32 && Math.hypot(f.hx - P.x, f.hz - P.z) > 24) { f.state = 'idle'; f.x = f.hx; f.z = f.hz; f.hp = f.max; f.m.root.visible = true; }
        W.animHusk(f.m, dt, 0, 0, true); continue;
      }
      let tx = f.x, tz = f.z;
      if (f.state === 'idle') {
        f.t -= dt; if (f.t < 0) { f.t = rnd(2, 6); f.wx = f.hx + rnd(-6, 6); f.wz = f.hz + rnd(-6, 6); }
        tx = f.wx; tz = f.wz; sp = Math.hypot(tx - f.x, tz - f.z) > 0.5 ? 1.0 : 0;
        if (d < (f.boss ? 30 : 12) && !P.dead) f.state = 'chase';
      } else if (f.state === 'chase') {
        tx = P.x; tz = P.z; sp = d > reach ? (f.boss ? 3.0 : 3.3 + f.lvl * 0.15) : 0;
        if (P.dead || Math.hypot(f.x - f.hx, f.z - f.hz) > (f.boss ? 60 : 42) || d > 26) { f.state = 'idle'; f.t = 0; }
        else if (d <= reach + 0.2 && f.cd <= 0) { f.state = 'wind'; f.t = 0; }
      } else if (f.state === 'wind') {
        f.t += dt; f.lunge = f.t / 0.6; tx = P.x; tz = P.z;
        if (f.t >= 0.6) { if (d < reach + 0.9) hurt(f.dmg * rnd(0.85, 1.15)); f.state = 'chase'; f.cd = f.boss ? 1.4 : 1.1; f.lunge = 0; }
      }
      if (sp > 0) {
        const l = Math.hypot(tx - f.x, tz - f.z) || 1, nx = f.x + (tx - f.x) / l * sp * dt, nz = f.z + (tz - f.z) / l * sp * dt;
        if (H(nx, nz) > 0.3) { f.x = nx; f.z = nz; }
      }
      if (Math.hypot(tx - f.x, tz - f.z) > 0.2) { const want = Math.atan2(tx - f.x, tz - f.z); let dr = want - f.rot; dr = Math.atan2(Math.sin(dr), Math.cos(dr)); f.rot += dr * Math.min(1, dt * 7); }
      for (const o of foes) { if (o === f || o.state === 'dead') continue; const ex = f.x - o.x, ez = f.z - o.z, ed = Math.hypot(ex, ez); if (ed < 1.3 && ed > 0.001) { f.x += ex / ed * dt * 2; f.z += ez / ed * dt * 2; } }
      f.sp += (Math.min(1, sp / 3) - f.sp) * Math.min(1, dt * 8);
      const gy = H(f.x, f.z); f.m.root.position.set(f.x, gy, f.z); f.m.root.rotation.y = f.rot;
      W.animHusk(f.m, dt, f.sp, f.state === 'wind' ? f.lunge : 0, false);
      if (d < 22) { putTag(f.tag, f.x, gy + (f.boss ? 4.6 : 2.5), f.z); f.tag.querySelector('b').style.width = clamp(f.hp / f.max * 100, 0, 100) + '%'; } else f.tag.style.display = 'none';
    }
  }

  // ---------------- fishing ----------------
  const fish = { on: false, st: '', t: 0, tx: 0, tz: 0, bx: 0, by: 0, bz: 0, wait: 0, ten: 0.3, zone: 0.5, zv: 0.1, prog: 0, over: 0, kind: null, pull: 0 };
  function castSpot() {
    if (ground(P.x, P.z) > 1.3) return null; const fx = Math.sin(P.rot), fz = Math.cos(P.rot);
    for (let d = 2.5; d <= 7; d += 0.5) { if (H(P.x + fx * d, P.z + fz * d) < -0.3) { const dd = Math.max(5, d + 2.5); if (H(P.x + fx * dd, P.z + fz * dd) < -0.3) return { x: P.x + fx * dd, z: P.z + fz * dd }; return { x: P.x + fx * d, z: P.z + fz * d }; } }
    return null;
  }
  function startFish(spot) {
    fish.on = true; fish.st = 'cast'; fish.t = 0; fish.tx = spot.x; fish.tz = spot.z; P.rot = Math.atan2(spot.x - P.x, spot.z - P.z);
    P.k.sword.visible = false; P.k.rod.visible = true; line.visible = true; bobber.visible = false; sfx.swing();
  }
  function endFish(msg) {
    fish.on = false; fish.st = ''; P.k.rod.visible = false; P.k.sword.visible = !!S.eq.weapon; line.visible = false; bobber.visible = false; W.ripple.z = 0;
    $('fishui').classList.add('hidden'); if (msg) toast(msg);
  }
  const tipV = new THREE.Vector3();
  function tickFish(dt) {
    if (!fish.on) return; fish.t += dt; const f = fish;
    P.k.rodTip.getWorldPosition(tipV);
    if (f.st === 'cast') {
      const q = f.t / 0.9;
      if (q > 0.62) { const u = clamp((q - 0.62) / 0.38 / 1.6, 0, 1); bobber.visible = true; f.bx = tipV.x + (f.tx - tipV.x) * u; f.bz = tipV.z + (f.tz - tipV.z) * u; f.by = tipV.y * (1 - u) + Math.sin(u * Math.PI) * 2.4; }
      if (f.t > 0.9 + 0.38 * 0.6 + 0.35) { f.st = 'wait'; f.t = 0; f.wait = rnd(2.2, 6); f.bx = f.tx; f.bz = f.tz; sfx.splash(); W.burst(f.tx, 0.1, f.tz, 0xbfd8ff, 8, 2.5, 1.4); W.ripple.set(f.tx, f.tz, 1); }
    } else if (f.st === 'wait') {
      f.by = Math.sin(time * 2.4) * 0.03; W.ripple.z = Math.max(0.15, W.ripple.z - dt * 0.4);
      if (f.t > f.wait) { f.st = 'bite'; f.t = 0; sfx.bite(); sfx.splash(); W.ripple.z = 1; floatText(f.bx, 0.8, f.bz, '!', 'crit'); }
    } else if (f.st === 'bite') {
      f.by = -0.14 + Math.sin(time * 30) * 0.03;
      if (f.t > 1.1) { f.st = 'wait'; f.t = 0; f.wait = rnd(2, 5); toast('It slipped the hook.'); }
    } else if (f.st === 'reel') {
      const k = f.kind, hard = 1 + k.r * 0.35;
      f.pull += (Math.random() - 0.5) * dt * 9; f.pull = clamp(f.pull, -1, 1);
      f.ten += ((inp.actHeld ? 0.95 : -0.75) + f.pull * 0.35 * hard) * dt; f.ten = clamp(f.ten, 0, 1);
      f.zone += f.zv * dt * hard; if (f.zone < 0.25 || f.zone > 0.75) { f.zv = -f.zv; f.zone = clamp(f.zone, 0.25, 0.75); } if (Math.random() < dt * 0.6) f.zv = rnd(-0.22, 0.22);
      const zw = 0.3 / (1 + k.r * 0.12), inside = Math.abs(f.ten - f.zone) < zw / 2;
      f.prog += (inside ? 0.26 / hard : -0.2) * dt; f.over = f.ten > 0.97 ? f.over + dt : 0;
      const u = clamp(f.prog, 0, 1); f.bx = f.tx + (P.x - f.tx) * u * 0.75 + Math.sin(time * 3) * 0.5 * (1 - u); f.bz = f.tz + (P.z - f.tz) * u * 0.75 + Math.cos(time * 2.3) * 0.5 * (1 - u); f.by = -0.1;
      W.ripple.set(f.bx, f.bz, 1); if (Math.random() < dt * 5) W.burst(f.bx, 0.05, f.bz, 0xbfd8ff, 2, 2, 1.2);
      $('f-zone').style.left = (f.zone - zw / 2) * 100 + '%'; $('f-zone').style.width = zw * 100 + '%'; $('f-mark').style.left = f.ten * 100 + '%'; $('f-prog').style.width = u * 100 + '%';
      if (f.over > 0.7) return endFish('Snap. The line parts.');
      if (f.prog < -0.2) return endFish('It got away.');
      if (f.prog >= 1) return landFish();
    }
    bobber.position.set(f.bx, f.by, f.bz);
    const pos = line.geometry.attributes.position, n = pos.count, bx = bobber.visible ? f.bx : tipV.x, by = bobber.visible ? f.by + 0.1 : tipV.y, bz = bobber.visible ? f.bz : tipV.z, sag = f.st === 'reel' ? 0.15 : 0.9;
    for (let i = 0; i < n; i++) { const u = i / (n - 1); pos.setXYZ(i, tipV.x + (bx - tipV.x) * u, tipV.y + (by - tipV.y) * u - Math.sin(u * Math.PI) * sag, tipV.z + (bz - tipV.z) * u); }
    pos.needsUpdate = true;
  }
  function hookFish() {
    const k = weighted(FISH); fish.kind = k; fish.st = 'reel'; fish.t = 0; fish.ten = 0.35; fish.zone = 0.5; fish.zv = 0.12; fish.prog = 0.28; fish.over = 0; fish.pull = 0;
    $('f-title').textContent = k.r >= 2 ? 'something heavy pulls…' : 'a fish is on the line'; $('fishui').classList.remove('hidden'); sfx.pick();
  }
  function landFish() {
    const k = fish.kind, kg = +rnd(k.kg[0], k.kg[1]).toFixed(1);
    const it = { slot: 'fish', rar: k.r, runes: [], name: k.n, kg, heal: k.heal };
    W.burst(fish.bx, 0.2, fish.bz, 0xbfd8ff, 14, 4, 1.6); sfx.splash(); sfx.pick();
    endFish(); gainXp(12 + k.r * 25);
    if (S.bag.length < BAG_MAX) { S.bag.push(it); toast('Caught <b class="' + RAR[k.r] + '">' + k.n + '</b> · ' + kg + ' kg'); } else toast('Caught a ' + k.n + ', but your bag is full.');
    if (S.quest === 1) { setQuest(2); toast('Maren nods from the shore. Now for the husks.'); }
    save();
  }

  // ---------------- actions ----------------
  let ctx = null;
  function context() {
    if (P.dead || dlg) return null;
    if (fish.on) return fish.st === 'bite' ? { l: '! set the hook', f: hookFish } : fish.st === 'reel' ? { l: '~ hold to reel', f: () => {} } : fish.st === 'wait' ? { l: 'reel in', f: () => endFish() } : null;
    if (Math.hypot(maren.x - P.x, maren.z - P.z) < 3.2) return { l: '" talk', f: talk };
    if (Math.hypot(camp.x - P.x, camp.z - P.z) < 3) return { l: '* rest', f: () => { heal(9999); toast('You rest by the fire.'); save(); } };
    if (S.quest === 3 && Math.hypot(beacon.x - P.x, beacon.z - P.z) < 4.5) return { l: '^ light the beacon', f: lightBeacon };
    const spot = P.speed < 0.2 || true ? castSpot() : null; if (spot) return { l: '~ cast line', f: () => startFish(spot) };
    return null;
  }
  function act() { if (!started || !$('bag').classList.contains('hidden')) return; if (dlg) return nextLine(); if (ctx) ctx.f(); }
  function lightBeacon() {
    beacon.set(true); sfx.fire(); W.burst(beacon.x, H(beacon.x, beacon.z) + 3.2, beacon.z, 0xff9a40, 40, 8, 1.6); W.cam.shake = 0.8;
    setQuest(4); banner('The beacon burns', 'Under the stones, something turns over.');
    setTimeout(() => { boss = spawnFoe(beacon.x - 9, beacon.z + 10, 5, true); boss.state = 'chase'; W.burst(boss.x, H(boss.x, boss.z) + 1, boss.z, 0xff5a2a, 30, 7, 1.4); }, 2200);
  }

  // ---------------- bag ----------------
  let sel = null;
  function toggleBag() { if (!started) return; const b = $('bag'); b.classList.toggle('hidden'); sfx.ui(); sel = null; if (!b.classList.contains('hidden')) drawBag(); }
  function iconHTML(it) { return '<pre class="' + RAR[it.rar] + '">' + ICON[it.slot].replace(/</g, '&lt;') + '</pre>'; }
  function drawBag() {
    $('bg-title').textContent = S.name.toUpperCase() + ' · KNIGHT-ERRANT';
    const worn = $('bg-worn'); worn.innerHTML = '';
    for (const s of SLOTS) { const it = S.eq[s], c = document.createElement('div'); c.className = 'cell' + (it ? '' : ' empty') + (sel && sel.eq === s ? ' sel' : ''); c.innerHTML = '<small>' + s + '</small>' + (it ? iconHTML(it) : ''); if (it) c.onclick = () => { sel = { eq: s }; sfx.ui(); drawBag(); }; worn.appendChild(c); }
    $('bg-stats').textContent = 'level ' + S.lvl + '   xp ' + S.xp + '/' + xpNeed() + '\nlife ' + Math.ceil(S.hp) + '/' + stats.hp + '   armour ' + stats.arm + '\ndamage ' + stats.min + '–' + stats.max + '   ' + (((stats.min + stats.max) / 2 + stats.burn) / stats.spd).toFixed(1) + ' dps\ncrit ' + stats.crit + '%   leech ' + stats.leech + '%   gold ' + S.gold;
    const grid = $('bg-grid'); grid.innerHTML = '';
    for (let i = 0; i < BAG_MAX; i++) { const it = S.bag[i], c = document.createElement('div'); c.className = 'cell' + (it ? '' : ' empty') + (sel && sel.bag === i ? ' sel' : ''); if (it) { c.innerHTML = iconHTML(it); c.onclick = () => { sel = { bag: i }; sfx.ui(); drawBag(); }; } grid.appendChild(c); }
    $('bg-count').textContent = 'bag ' + S.bag.length + '/' + BAG_MAX;
    const card = $('bg-card'), it = sel ? (sel.eq ? S.eq[sel.eq] : S.bag[sel.bag]) : null;
    if (!it) { card.innerHTML = '<span class="sub">Nothing selected.</span>'; return; }
    let h = '<h4 class="' + RAR[it.rar] + '">' + it.name + '</h4><div class="sub">' + RAR[it.rar] + (it.slot === 'fish' ? ' catch' : ', ' + it.slot) + (sel.eq ? ' · worn' : '') + '</div>' + itemLines(it).map((l) => '<div>' + l + '</div>').join('');
    if (sel.bag !== undefined && it.slot !== 'fish') { const cur = S.eq[it.slot]; const a = it.min ? ((it.min + it.max) / 2) / it.spd : (it.arm || it.hp || 0), b = cur ? (cur.min ? ((cur.min + cur.max) / 2) / cur.spd : (cur.arm || cur.hp || 0)) : 0, d = a - b; h += '<div class="' + (d >= 0 ? 'up' : 'down') + '">' + (d >= 0 ? '▲ +' : '▼ ') + d.toFixed(1) + ' vs worn</div>'; }
    h += '<div class="acts">' + (sel.eq ? '<button data-a="off">[ take off ]</button>' : it.slot === 'fish' ? '<button data-a="eat">[ eat ]</button><button data-a="drop">[ release ]</button>' : '<button data-a="on">[ equip ]</button><button data-a="drop">[ discard ]</button>') + '</div>';
    card.innerHTML = h;
    card.querySelectorAll('button').forEach((b) => { b.onclick = () => bagAct(b.dataset.a); });
  }
  function bagAct(a) {
    if (a === 'on') { const it = S.bag[sel.bag], old = S.eq[it.slot]; S.eq[it.slot] = it; if (old) S.bag[sel.bag] = old; else S.bag.splice(sel.bag, 1); sfx.pick(); }
    else if (a === 'off') { if (S.bag.length >= BAG_MAX) return toast('Your bag is full.'); S.bag.push(S.eq[sel.eq]); S.eq[sel.eq] = null; }
    else if (a === 'eat') { const it = S.bag.splice(sel.bag, 1)[0]; heal(it.heal); sfx.pick(); }
    else if (a === 'drop') S.bag.splice(sel.bag, 1);
    sel = null; recalc(); drawBag(); save();
  }

  // ---------------- frame ----------------
  function tickPlayer(dt) {
    P.hurtT += dt;
    if (P.dead) {
      P.dead += dt; W.animKnight(P.k, dt, { speed: 0, pose: 'dead', atk: -1, cast: -1 });
      if (P.dead > 2.8) { P.dead = 0; P.x = camp.x - 1.5; P.z = camp.z + 2; W.cam.snap = true; S.hp = stats.hp; for (const f of foes) if (f.state !== 'dead') f.state = 'idle'; }
    } else {
      let ix = inp.x + ((keys.d || keys.arrowright) ? 1 : 0) - ((keys.a || keys.arrowleft) ? 1 : 0), iz = inp.z + ((keys.s || keys.arrowdown) ? 1 : 0) - ((keys.w || keys.arrowup) ? 1 : 0);
      let l = Math.hypot(ix, iz); if (l > 1) { ix /= l; iz /= l; l = 1; }
      const busy = dlg || !$('bag').classList.contains('hidden');
      if (busy) l = 0;
      if (l > 0.15 && fish.on) { if (fish.st === 'wait' || fish.st === 'cast') endFish(); else l = 0; }
      const slow = P.atk >= 0 ? 0.35 : 1;
      if (l > 0.15) {
        const sp = 5.6 * l * slow, nx = P.x + ix * sp * dt, nz = P.z + iz * sp * dt;
        if (walkable(nx, nz)) { P.x = nx; P.z = nz; } else if (walkable(nx, P.z)) P.x = nx; else if (walkable(P.x, nz)) P.z = nz;
        if (P.atk < 0) { const want = Math.atan2(ix, iz); let dr = want - P.rot; dr = Math.atan2(Math.sin(dr), Math.cos(dr)); P.rot += dr * Math.min(1, dt * 12); }
      }
      P.speed += ((l > 0.15 ? l * slow : 0) - P.speed) * Math.min(1, dt * 10);
      if (P.atk >= 0) { P.atk += dt / stats.spd; if (!P.atkHit && P.atk > 0.45) { P.atkHit = true; strike(); } if (P.atk >= 1) P.atk = -1; }
      if (P.hurtT > 6 && S.hp < stats.hp) S.hp = Math.min(stats.hp, S.hp + dt * stats.hp * 0.02);
      W.animKnight(P.k, dt, { speed: P.speed, pose: fish.on ? (fish.st === 'reel' ? 'reel' : 'fish') : 'idle', atk: P.atk, cast: fish.st === 'cast' ? Math.min(1, fish.t / 0.9) : -1 });
    }
    P.y = ground(P.x, P.z);
    P.k.root.position.set(P.x, Math.max(P.y, -0.25), P.z); P.k.root.rotation.y = P.rot;
    // pickups
    for (let i = loot.length - 1; i >= 0; i--) {
      const o = loot[i]; o.t += dt; o.o.children[0].rotation.y += dt * 2.5; o.o.children[0].position.y = 0.7 + Math.sin(o.t * 3) * 0.12;
      if (P.dead || Math.hypot(o.x - P.x, o.z - P.z) > 1.5) continue;
      if (o.gold) { S.gold += o.gold; floatText(o.x, P.y + 1.6, o.z, '+' + o.gold + ' g', 'crit'); }
      else { if (S.bag.length >= BAG_MAX) continue; S.bag.push(o.item); toast('Found <b class="' + RAR[o.item.rar] + '">' + o.item.name + '</b>'); }
      sfx.pick(); W.scene.remove(o.o); loot.splice(i, 1); save();
    }
  }
  function tickHud() {
    $('h-hp').style.width = S.hp / stats.hp * 100 + '%'; $('h-hpt').textContent = Math.ceil(S.hp) + '/' + stats.hp;
    $('h-xp').style.width = S.xp / xpNeed() * 100 + '%'; $('h-lvl').textContent = 'lv ' + S.lvl; $('h-gold').textContent = S.gold + ' g';
    putTag(P.tag, P.x, P.y + 2.45, P.z); putTag(maren.tag, maren.x, H(maren.x, maren.z) + 2.5, maren.z);
    ctx = context(); const b = $('b-act');
    if (ctx) { b.classList.remove('hidden'); if (b.textContent !== ctx.l) b.textContent = ctx.l; } else b.classList.add('hidden');
    const t = questTarget(), ar = $('arrow');
    if (!t) { ar.classList.add('hidden'); return; }
    const dx = t.x - P.x, dz = t.z - P.z, d = Math.hypot(dx, dz);
    if (d < 9) { ar.classList.add('hidden'); return; }
    ar.classList.remove('hidden'); const r = Math.min(innerWidth, innerHeight) * 0.36, a = Math.atan2(dx, -dz);
    ar.style.left = innerWidth / 2 + Math.sin(a) * r + 'px'; ar.style.top = innerHeight / 2 - Math.cos(a) * r * 0.8 + 'px';
    ar.firstElementChild.style.transform = 'rotate(' + a + 'rad)'; ar.lastElementChild.textContent = Math.round(d) + ' m';
  }
  let last = 0, saveT = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000 || 0.016); last = now;
    perf(dt); tick(dt);
    W.render(dt, P);
  }
  let pfN = 0, pfT = 0, pfDone = false;
  function perf(dt) { // halve the grass once if the device cannot hold the frame rate
    if (pfDone || !started) return; pfN++; pfT += dt;
    if (pfN === 90) { pfDone = true; if (pfT / pfN > 0.03) W.thinGrass(); }
  }
  function tick(dt) {
    time += dt;
    if (started) {
      tickPlayer(dt); tickFoes(dt); tickFish(dt); W.tickSparks(dt);
      const hi = clamp((P.y - 7) / 9, 0, 1);
      const fight = boss && boss.state !== 'dead' && boss.state !== 'idle';
      W.cam.pitch = fish.on ? 0.36 : fight ? 0.66 : 0.93 - hi * 0.91; W.cam.dist = fish.on ? 9.5 : 9.5 + hi * 3.5; W.cam.ahead = fish.on ? 3.5 : fight ? 0 : hi * 2.5;
      tickHud(); saveT += dt; if (saveT > 8) { saveT = 0; save(); }
    } else { W.cam.pitch = 0.42; W.cam.dist = 8; W.cam.ahead = 2; W.animKnight(P.k, dt, { speed: 0, pose: 'idle', atk: -1, cast: -1 }); P.k.root.position.set(P.x, P.y, P.z); P.k.root.rotation.y = P.rot; }
    W.animKnight(maren.k, dt, { speed: 0, pose: 'fish', atk: -1, cast: -1 });
    camp.tick(time); beacon.tick(time);
    const fl = W.post.uniforms.uFlash; fl.value = Math.max(S && S.hp < stats.hp * 0.25 && !P.dead ? 0.35 + 0.15 * Math.sin(time * 5) : 0, fl.value - dt * 2.5);
  }

  function begin(isNew) {
    audioOn(); const nm = $('t-name').value.trim();
    if (isNew || !S) { S = fresh(); if (boss) { boss.state = 'dead'; boss.t = 9; boss.m.root.visible = false; boss.tag.style.display = 'none'; boss = null; } beacon.set(false); }
    if (nm) S.name = nm;
    P.x = S.x; P.z = S.z; P.y = ground(P.x, P.z); P.rot = 0;
    recalc(); if (S.hp <= 0) S.hp = stats.hp;
    if (S.quest >= 4) beacon.set(true);
    if (S.quest === 4) { boss = spawnFoe(beacon.x - 9, beacon.z + 10, 5, true); }
    P.tag.textContent = S.name; $('h-name').textContent = S.name; $('q-text').textContent = QUEST[S.quest]();
    $('title').classList.add('hidden'); ['hud', 'controls'].forEach((i) => $(i).classList.remove('hidden'));
    started = true; W.cam.snap = false; save();
    if (S.quest === 0) toast('A fisher stands by the lake to the north.');
  }

  function boot() {
    W.init($('gl')); buildWorld(); bindInput();
    S = load(); const tmp = S || fresh(); P.x = tmp.x; P.z = tmp.z; P.y = ground(P.x, P.z);
    stats = { hp: 110, spd: 0.6 };
    if (S) { $('t-name').value = S.name; $('t-go').textContent = '[ return to the moor ]'; $('t-new').classList.remove('hidden'); }
    $('t-go').onclick = () => begin(false); $('t-new').onclick = () => begin(true);
    window.GMDEBUG = { step(n, dt) { W.camera.updateMatrixWorld(); for (let i = 0; i < n; i++) tick(dt || 0.033); }, P, get S() { return S; }, foes, fish, begin, rollItem, jetty, act, attack, hookFish, inp, lightBeacon, recalc };
    requestAnimationFrame(frame);
  }
  boot();
})();
