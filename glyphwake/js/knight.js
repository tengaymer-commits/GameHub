// Glyphwake: the hero's body and armour. Every piece is shaped geometry tagged with
// its own glyph set, so mail renders as rings, plate as banded strokes, scale as v-rows.
(function () {
  'use strict';
  const GW = window.GW, ID = GW.ID;
  const K = GW.Knight = {};

  K.GEAR = {
    helm: {
      greathelm: { name: 'Knight\'s Great Helm', set: ID.PLATE, color: 0xb0b6c2, armor: 4, desc: 'Barrel helm with a cross-braced visor and a crimson plume.' },
      sallet: { name: 'Iron Sallet', set: ID.PLATE, color: 0x8a909c, armor: 3, crit: 0.04, desc: 'Swept-back sallet. Better sight: +4% crit.' },
      coif: { name: 'Mail Coif', set: ID.MAIL, color: 0xb8bcc8, armor: 2, hp: 10, desc: 'Riveted rings over a padded cap. +10 health.' },
      hood: { name: 'Ranger\'s Hood', set: ID.LEATHER, color: 0x4f5e3c, armor: 1, crit: 0.07, desc: 'Oiled leather hood. +7% crit.' },
      horned: { name: 'Warden-bone Helm', set: ID.BONEPLATE, color: 0xd8d0b8, armor: 5, hp: 20, desc: 'Carved from the Warden\'s crown. +20 health.' },
    },
    chest: {
      knightplate: { name: 'Knight\'s Plate', set: ID.PLATE, color: 0xb0b6c2, armor: 7, move: -0.04, desc: 'Full harness over a crimson tabard. Heavy: -4% move speed.' },
      hauberk: { name: 'Mail Hauberk', set: ID.MAIL, color: 0xb0b4c0, armor: 4, stam: 0.2, desc: 'Knee-length mail. +20% stamina regen.' },
      leather: { name: 'Leather Jerkin', set: ID.LEATHER, color: 0x6a4a2e, armor: 2, move: 0.1, desc: 'Light and quiet. +10% move speed.' },
      scale: { name: 'Wyrmscale Coat', set: ID.SCALE, color: 0x4a8a72, armor: 5, focus: 0.2, desc: 'Overlapping green scales. +20% focus regen.' },
    },
    cloak: {
      crimson: { name: 'Crimson Cloak', set: ID.CLOTH, color: 0xa81616, armor: 0, desc: 'A knight\'s cloak, wool-heavy.' },
      night: { name: 'Nightweave Mantle', set: ID.SILK, color: 0x30307a, armor: 0, focus: 0.25, desc: 'Woven at dusk. +25% focus regen.' },
      ember: { name: 'Emberlined Cloak', set: ID.SILK, color: 0xd0601e, armor: 1, hp: 15, desc: 'Lined with warm ash-silk. +15 health.' },
      none: { name: 'No cloak', set: ID.CLOTH, color: 0, armor: 0, desc: 'Nothing on your back.' },
    },
  };
  K.SLOTS = ['helm', 'chest', 'cloak'];
  K.DEFAULT = { helm: 'greathelm', chest: 'knightplate', cloak: 'crimson' };
  K.pattern = function (set) { return { [ID.PLATE]: '=#H#', [ID.MAIL]: 'o0O8', [ID.LEATHER]: ';x%&', [ID.SCALE]: 'vVwW', [ID.SILK]: '~^*&', [ID.BONEPLATE]: '!|IX', [ID.CLOTH]: ':ox%' }[set] || '##'; };

  K.stats = function (gear) {
    const s = { armor: 0, hp: 0, crit: 0, move: 0, stam: 0, focus: 0 };
    for (const slot of K.SLOTS) { const g = K.GEAR[slot][gear[slot]]; if (!g) continue; for (const k in s) s[k] += g[k] || 0; }
    s.reduce = Math.min(0.5, s.armor * 0.025);
    return s;
  };

  // ---------- geometry helpers ----------
  const V2 = THREE.Vector2;
  function lathe(prof, segs, sz) { const g = new THREE.LatheGeometry(prof.map(p => new V2(p[0], p[1])), segs || 14); if (sz) g.scale(1, 1, sz); g.computeVertexNormals(); return g; }
  function mesh(parent, geom, mat, x, y, z, rx, ry, rz) {
    const m = new THREE.Mesh(geom, mat); m.position.set(x || 0, y || 0, z || 0);
    if (rx || ry || rz) m.rotation.set(rx || 0, ry || 0, rz || 0);
    parent.add(m); return m;
  }
  const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
  const dome = (r, frac) => new THREE.SphereGeometry(r, 12, 6, 0, Math.PI * 2, 0, Math.PI * (frac || 0.5));

  // ---------- shared prop builders (also used by Hollows) ----------
  K.buildSword = function (sm, scale) {
    const sword = new THREE.Group();
    mesh(sword, box(0.04, 0.04, 0.22), sm.hilt, 0, 0, -0.01);
    mesh(sword, new THREE.OctahedronGeometry(0.035, 0), sm.guard, 0, 0, -0.14);
    mesh(sword, box(0.3, 0.035, 0.05), sm.guard, 0, 0, 0.11);
    const L = 1.0 * (scale || 1);
    const bg = new THREE.BoxGeometry(0.07, 0.02, L, 1, 1, 8); const bp = bg.attributes.position;
    for (let i = 0; i < bp.count; i++) { const k = (bp.getZ(i) + L / 2) / L; if (k > 0.86) bp.setX(i, bp.getX(i) * Math.max(0, (1 - k) / 0.14)); }
    bg.computeVertexNormals();
    const blade = mesh(sword, bg, sm.blade, 0, 0, 0.14 + L / 2);
    const tip = new THREE.Object3D(); tip.position.set(0, 0, 0.14 + L); sword.add(tip);
    const base = new THREE.Object3D(); base.position.set(0, 0, 0.24); sword.add(base);
    return { sword, blade, tip, base };
  };
  // transform that puts a prop's +z along the fist's blade axis, origin in the grip
  K.gripPlace = function (rig, side) {
    const s = side || 'R';
    const ix = rig.boneModel('Index2.' + s), pk = rig.boneModel('Pinky2.' + s), wr = rig.boneModel('Wrist.' + s), md = rig.boneModel('Middle2.' + s);
    const z = ix.clone().sub(pk).normalize();
    const f = md.clone().sub(wr).normalize();
    const x = new THREE.Vector3().crossVectors(f, z).normalize();
    const y = new THREE.Vector3().crossVectors(z, x).normalize();
    const grip = ix.clone().add(pk).multiplyScalar(0.5).lerp(wr, 0.3);
    return new THREE.Matrix4().makeBasis(x, y, z).setPosition(grip);
  };
  K.bindPose = function (rig) { rig.restPose(); };

  // ---------- dress the player (rigged knight) ----------
  K.dress = function (P) {
    const gear = P.gear;
    if (!P.rig) {
      P.rig = new GW.Rig('monarch', 1.05, () => ({}));
      P.body.add(P.rig.root);
    }
    const rig = P.rig;
    (P.attachments || []).forEach(o => o && o.parent && o.parent.remove(o));
    P.attachments = [];
    const H = K.GEAR.helm[gear.helm], C = K.GEAR.chest[gear.chest], CL = K.GEAR.cloak[gear.cloak];
    const closed = gear.helm === 'greathelm' || gear.helm === 'sallet' || gear.helm === 'horned';
    const spec = {
      knightplate: [{ id: ID.PLATE, color: 0xb0b6c2, rim: 0.9 }, { id: ID.MAIL, color: 0x7a808c, rim: 0.5 }],
      hauberk: [{ id: ID.MAIL, color: 0xb4b8c4, rim: 0.6 }, { id: ID.MAIL, color: 0x868a96, rim: 0.5 }],
      leather: [{ id: ID.LEATHER, color: 0x7a5434, rim: 0.4 }, { id: ID.LEATHER, color: 0x4a3220, rim: 0.3 }],
      scale: [{ id: ID.SCALE, color: 0x4a8a72, rim: 0.6 }, { id: ID.SCALE, color: 0x2e5a4a, rim: 0.5 }],
    }[gear.chest];
    rig.remap((mn, o) => {
      const head = /head/i.test(o.name) || /head/i.test((o.parent && o.parent.name) || '');
      if (head && (closed || mn === 'Gold' || mn === 'Hair_White')) return null;
      switch (mn) {
        case 'Metal': return spec[0];
        case 'Metal_Dark': return spec[1];
        case 'Blue': return { id: ID.TABARD, color: 0x9c1515, rim: 0.35 };
        case 'DarkBrown': return { id: ID.LEATHER, color: 0x4a3020, rim: 0.3 };
        case 'Beige': return { id: ID.CLOTH, color: 0x6a5a48, rim: 0.3 };
        case 'Skin': return { id: ID.BODY, color: 0xd0b8a0, rim: 0.4 };
        case 'Hair_White': return { id: ID.BODY, color: 0x9a9a9a };
        case 'Eye': return { id: ID.BODY, color: 0x151515 };
        case 'Gold': return { id: ID.METAL, color: 0xc8a050, rim: 0.7 };
        default: return { id: ID.CLOTH, color: 0x777777 };
      }
    });
    const M = (o) => { const m = GW.mat(Object.assign({ rim: 0.5, side: THREE.DoubleSide }, o)); mats.push(m); return m; };
    const mats = [];
    const brass = M({ id: ID.METAL, color: 0xc8a050, rim: 0.7 });
    const slit = GW.mat({ id: ID.VOID, color: 0x000000, unlit: true, side: THREE.DoubleSide });
    const helmM = M({ id: H.set, color: H.color, rim: 0.9 });
    const skin = M({ id: ID.BODY, color: 0xd0b8a0, rim: 0.4 });

    K.bindPose(rig);
    const headB = rig.boneModel('Head');
    const headC = headB.clone().add(new THREE.Vector3(0, 0.1, 0.01));
    // ---- helm on the head bone ----
    const head = new THREE.Group(); head.scale.setScalar(0.95);
    if (gear.helm === 'greathelm') {
      mesh(head, lathe([[0.0, 0.215], [0.07, 0.21], [0.12, 0.19], [0.14, 0.14], [0.145, 0.0], [0.142, -0.1], [0.13, -0.13]], 16, 1.05), helmM);
      mesh(head, box(0.22, 0.02, 0.05), slit, 0, 0.04, 0.135);
      mesh(head, box(0.03, 0.27, 0.03), brass, 0, 0.02, 0.145);
      mesh(head, box(0.2, 0.03, 0.025), brass, 0, 0.09, 0.14);
      for (let k = 0; k < 4; k++) mesh(head, box(0.012, 0.012, 0.02), slit, 0.05 + (k % 2) * 0.025, -0.04 - Math.floor(k / 2) * 0.025, 0.142);
      const plume = M({ id: ID.SILK, color: 0xc01818, rim: 0.3 });
      P.plume = new THREE.Group(); P.plume.position.set(0, 0.21, -0.01); head.add(P.plume);
      for (let k = 0; k < 6; k++) mesh(P.plume, new THREE.ConeGeometry(0.028, 0.3, 5), plume, (k - 2.5) * 0.008, 0.08 + k * 0.012, -0.06 - k * 0.04, -1.0 - k * 0.12);
    } else {
      P.plume = null;
      if (gear.helm === 'sallet') {
        mesh(head, lathe([[0.0, 0.17], [0.09, 0.16], [0.135, 0.1], [0.145, 0.0], [0.15, -0.06]], 14, 1.05), helmM);
        mesh(head, new THREE.ConeGeometry(0.17, 0.14, 12, 1, true), helmM, 0, -0.06, -0.06, -0.5);
        mesh(head, box(0.2, 0.02, 0.04), slit, 0, 0.02, 0.135);
        mesh(head, lathe([[0.13, -0.02], [0.12, -0.14], [0.05, -0.17]], 12, 0.9), helmM, 0, 0, 0.02);
      } else if (gear.helm === 'coif') {
        mesh(head, new THREE.SphereGeometry(0.128, 12, 9, 0, Math.PI * 2, 0, Math.PI * 0.62), helmM, 0, 0.0, -0.01).scale.set(1, 1.1, 1.05);
        mesh(head, lathe([[0.12, 0.0], [0.15, -0.12], [0.2, -0.17]], 14, 0.8), helmM, 0, -0.06, 0);
      } else if (gear.helm === 'hood') {
        mesh(head, new THREE.ConeGeometry(0.17, 0.42, 10, 1, true), helmM, 0, 0.08, -0.04, -0.35);
        mesh(head, lathe([[0.13, 0.0], [0.17, -0.12], [0.22, -0.16]], 12, 0.8), helmM, 0, -0.06, 0);
      } else if (gear.helm === 'horned') {
        mesh(head, lathe([[0.0, 0.19], [0.1, 0.17], [0.145, 0.08], [0.15, -0.06], [0.13, -0.12]], 14, 1.05), helmM);
        mesh(head, box(0.2, 0.025, 0.05), slit, 0, 0.03, 0.135);
        for (const sx of [1, -1]) {
          const h = new THREE.Group(); h.position.set(sx * 0.13, 0.1, 0); h.rotation.z = -sx * 1.0; head.add(h);
          mesh(h, new THREE.ConeGeometry(0.04, 0.22, 6), helmM, 0, 0.11, 0);
          mesh(h, new THREE.ConeGeometry(0.025, 0.16, 6), helmM, 0, 0.27, -0.03, -0.5, 0, sx * 0.6);
        }
      }
    }
    P.attachments.push(rig.attach('Head', head, new THREE.Matrix4().makeTranslation(headC.x, headC.y, headC.z)));
    // ---- cloak from the shoulders, on the chest bone ----
    P.cloak = null;
    if (gear.cloak !== 'none') {
      const cm = M({ id: CL.set, color: CL.color, rim: 0.4 });
      const sh = rig.boneModel('Shoulder.L');
      const g = new THREE.CylinderGeometry(0.17, 0.36, 1.05, 12, 5, true, Math.PI * 0.55, Math.PI * 0.9); g.translate(0, -0.52, 0);
      const pos = g.attributes.position; for (let i = 0; i < pos.count; i++) { const y = pos.getY(i), x = pos.getX(i); pos.setZ(i, pos.getZ(i) + Math.sin(x * 14) * 0.02 * (-y)); }
      g.computeVertexNormals();
      const holder = new THREE.Group();
      P.cloak = mesh(holder, g, cm);
      P.attachments.push(rig.attach('Chest', holder, new THREE.Matrix4().makeTranslation(0, sh.y + 0.04, -0.08)));
    }
    // ---- sword in the right fist ----
    const sw = K.buildSword(P.swordMats, 1);
    P.sword = sw.sword; P.blade = sw.blade; P.tipObj = sw.tip; P.baseObj = sw.base;
    P.attachments.push(rig.attach('Wrist.R', sw.sword, K.gripPlace(rig, 'R')));
    P.mats = rig.mats.concat(mats, [P.swordMats.blade]);
    if (P.slashPeak === undefined) P.slashPeak = rig.peakFraction('Sword_Slash', 'Wrist.R');
    rig.play('Idle_Sword', { fade: 0 }); rig.update(0);
  };

  // ---------- gear screen ----------
  const $ = id => document.getElementById(id);
  const U = K.UI = { ang: 0.4, open: false };
  U.toggle = function (G, on) {
    U.G = G; U.open = on;
    $('gear').classList.toggle('hidden', !on);
    if (on) { U.ang = G.player.visYaw + 0.5; U.render(); GWAudio.sfx('ui'); }
  };
  U.render = function () {
    const P = U.G.player, gs = K.stats(P.gear);
    const lists = $('g-lists'); lists.innerHTML = '';
    for (const slot of K.SLOTS) {
      const h = document.createElement('div'); h.className = 'f-sec'; h.textContent = slot === 'helm' ? 'Helm' : slot === 'chest' ? 'Body armour' : 'Cloak'; lists.appendChild(h);
      const row = document.createElement('div'); row.className = 'f-row';
      for (const key of Object.keys(K.GEAR[slot])) {
        const it = K.GEAR[slot][key], owned = key === 'none' || P.inv.armor[key];
        if (!owned) continue;
        const b = document.createElement('button'); b.className = 'chip' + (P.gear[slot] === key ? ' sel' : '');
        const col = '#' + (it.color || 0x6b7385).toString(16).padStart(6, '0');
        b.innerHTML = `<span style="color:${col}">${K.pattern(it.set)}</span> ${it.name}`;
        b.onclick = () => { P.gear[slot] = key; K.dress(P); P.recalc(); GWAudio.sfx(slot === 'cloak' ? 'roll' : 'block'); U.render(); U.G.save(); };
        b.title = it.desc;
        row.appendChild(b);
      }
      const unknown = Object.keys(K.GEAR[slot]).filter(k => k !== 'none' && !P.inv.armor[k]).length;
      if (unknown) { const d = document.createElement('span'); d.className = 'chip off'; d.textContent = '? ×' + unknown; row.appendChild(d); }
      lists.appendChild(row);
    }
    const lines = [`Armour <b>${gs.armor}</b>  (−${Math.round(gs.reduce * 100)}% damage taken)`];
    if (gs.hp) lines.push('Health +' + gs.hp);
    if (gs.crit) lines.push('Critical +' + Math.round(gs.crit * 100) + '%');
    if (gs.move) lines.push('Move speed ' + (gs.move > 0 ? '+' : '') + Math.round(gs.move * 100) + '%');
    if (gs.stam) lines.push('Stamina regen +' + Math.round(gs.stam * 100) + '%');
    if (gs.focus) lines.push('Focus regen +' + Math.round(gs.focus * 100) + '%');
    for (const slot of K.SLOTS) { const it = K.GEAR[slot][P.gear[slot]]; lines.push(`<span style="color:#6b7385">${it.name}:</span> ${it.desc}`); }
    $('g-stats').innerHTML = lines.join('\n');
  };
  U.freeRect = function () {
    const W = window.innerWidth, H = window.innerHeight, side = $('g-side').getBoundingClientRect();
    if (W <= 640) return { cx: W / 2, cy: (40 + side.top) / 2 };
    return { cx: side.left / 2, cy: H / 2 };
  };
  U.init = function (G) {
    $('g-close').onclick = () => G.closeGear();
    let last = null;
    const cv = $('gl');
    cv.addEventListener('pointerdown', e => { if (U.open) { last = e.clientX; U.drag = true; } });
    window.addEventListener('pointermove', e => { if (U.open && last !== null) { U.ang -= (e.clientX - last) * 0.012; last = e.clientX; } });
    window.addEventListener('pointerup', () => { last = null; U.drag = false; });
  };
})();
