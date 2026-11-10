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

  // ---------- dress the player ----------
  K.dress = function (P) {
    const body = P.body;
    while (body.children.length) body.remove(body.children[0]);
    const gear = P.gear;
    const H = K.GEAR.helm[gear.helm], C = K.GEAR.chest[gear.chest], CL = K.GEAR.cloak[gear.cloak];
    const M = (o) => GW.mat(Object.assign({ rim: 0.5, side: THREE.DoubleSide }, o));
    const plate = M({ id: ID.PLATE, color: 0xb0b6c2, rim: 0.9 });
    const darkSteel = M({ id: ID.PLATE, color: 0x5a5f6a, rim: 0.6 });
    const brass = M({ id: ID.METAL, color: 0xc8a050, rim: 0.7 });
    const under = M({ id: ID.CLOTH, color: 0x2a2630, rim: 0.3 });
    const leatherM = M({ id: ID.LEATHER, color: 0x5a3c24, rim: 0.3 });
    const skin = M({ id: ID.BODY, color: 0xd0b8a0, rim: 0.4 });
    const slit = GW.mat({ id: ID.VOID, color: 0x000000, unlit: true });
    const chestM = M({ id: C.set, color: C.color, rim: 0.8 });
    const helmM = M({ id: H.set, color: H.color, rim: 0.9 });
    const knight = gear.chest === 'knightplate';
    const mats = [plate, darkSteel, brass, under, leatherM, skin, chestM, helmM];

    // ---- legs: hip -> knee, with armour by chest type ----
    const leg = (x) => {
      const hip = new THREE.Group(); hip.position.set(x, 0.92, 0); body.add(hip);
      const knee = new THREE.Group(); knee.position.set(0, -0.46, 0); hip.add(knee);
      if (knight) {
        mesh(hip, lathe([[0.055, -0.46], [0.068, -0.3], [0.075, -0.05], [0.07, 0.02]], 10, 1.1), plate);   // cuisse
        mesh(knee, dome(0.065, 0.55), plate, 0, 0.0, 0.03, -0.3);                                          // poleyn
        mesh(knee, box(0.06, 0.03, 0.05), brass, 0, 0, 0.085);
        mesh(knee, lathe([[0.045, -0.4], [0.06, -0.32], [0.062, -0.12], [0.055, 0]], 10, 1.15), plate);     // greave
        mesh(knee, box(0.1, 0.07, 0.24), plate, 0, -0.43, 0.05);                                            // sabaton
        mesh(knee, box(0.09, 0.03, 0.08), darkSteel, 0, -0.42, 0.17, 0.3);
      } else {
        mesh(hip, box(0.12, 0.46, 0.14), under, 0, -0.23, 0);
        mesh(knee, box(0.1, 0.32, 0.12), under, 0, -0.16, 0);
        mesh(knee, box(0.11, 0.16, 0.14), leatherM, 0, -0.36, 0.01);
        mesh(knee, box(0.11, 0.07, 0.22), leatherM, 0, -0.43, 0.04);
      }
      return [hip, knee];
    };
    [P.legL, P.shinL] = leg(0.095); [P.legR, P.shinR] = leg(-0.095);

    // ---- torso ----
    mesh(body, box(0.3, 0.14, 0.18), under, 0, 0.97, 0);
    if (knight) {
      // breastplate with a centre ridge, faulds, gorget
      mesh(body, lathe([[0.14, 0.0], [0.17, 0.12], [0.2, 0.3], [0.205, 0.42], [0.17, 0.53], [0.09, 0.58]], 16, 0.7), plate, 0, 0.98, 0);
      mesh(body, box(0.014, 0.42, 0.02), brass, 0, 1.27, 0.145, -0.08);
      mesh(body, lathe([[0.155, 0.12], [0.18, 0.0], [0.2, -0.1]], 16, 0.72), plate, 0, 0.97, 0);
      mesh(body, lathe([[0.18, 0.0], [0.205, -0.1]], 16, 0.74), darkSteel, 0, 0.86, 0);
      mesh(body, lathe([[0.1, 0.0], [0.09, 0.06], [0.07, 0.1]], 12), plate, 0, 1.55, 0);
      mesh(body, box(0.34, 0.04, 0.2), leatherM, 0, 1.0, 0);                            // sword belt
      mesh(body, box(0.05, 0.05, 0.03), brass, 0, 1.0, 0.105);
      // tabard front and back: crimson with a pale cross
      const tab = M({ id: ID.TABARD, color: 0xa81818, rim: 0.3 }), tabCross = M({ id: ID.TABARD, color: 0xe8d8b0, rim: 0.3 });
      mats.push(tab, tabCross);
      P.tabard = mesh(body, box(0.15, 0.42, 0.012), tab, 0, 0.78, 0.13);
      mesh(body, box(0.03, 0.26, 0.014), tabCross, 0, 0.8, 0.137); mesh(body, box(0.12, 0.03, 0.014), tabCross, 0, 0.86, 0.137);
      mesh(body, box(0.15, 0.4, 0.012), tab, 0, 0.8, -0.13);
      // layered pauldrons (three lames each)
      for (const sx of [1, -1]) {
        for (let k = 0; k < 3; k++) {
          const p = mesh(body, dome(0.13 - k * 0.018, 0.5), plate, sx * (0.215 + k * 0.012), 1.56 - k * 0.055, 0);
          p.scale.set(1.0, 0.7, 1.05); p.rotation.z = -sx * (0.35 + k * 0.12);
        }
        mesh(body, box(0.03, 0.03, 0.03), brass, sx * 0.24, 1.6, 0.09);
      }
      // scabbard on the left hip
      mesh(body, box(0.05, 0.75, 0.03), leatherM, 0.19, 0.72, -0.08, 0.45, 0, 0.12);
      mesh(body, box(0.06, 0.05, 0.045), brass, 0.205, 0.43, -0.22, 0.45, 0, 0.12);
    } else if (gear.chest === 'hauberk') {
      mesh(body, lathe([[0.2, -0.32], [0.17, -0.05], [0.15, 0.05], [0.19, 0.35], [0.2, 0.5], [0.12, 0.6]], 16, 0.72), chestM, 0, 0.98, 0);
      mesh(body, box(0.33, 0.05, 0.2), leatherM, 0, 1.0, 0);
      for (const sx of [1, -1]) mesh(body, dome(0.105, 0.5), chestM, sx * 0.21, 1.53, 0, 0, 0, -sx * 0.4).scale.set(1, 0.7, 1);
    } else if (gear.chest === 'leather') {
      mesh(body, lathe([[0.15, 0.0], [0.18, 0.2], [0.19, 0.42], [0.15, 0.54], [0.09, 0.58]], 14, 0.66), chestM, 0, 0.98, 0);
      mesh(body, box(0.03, 0.62, 0.02), leatherM, 0.06, 1.28, 0.12, 0, 0, 0.5);
      mesh(body, box(0.32, 0.05, 0.19), leatherM, 0, 1.0, 0);
    } else {
      mesh(body, lathe([[0.19, -0.2], [0.15, 0.0], [0.19, 0.25], [0.2, 0.45], [0.14, 0.56], [0.09, 0.6]], 16, 0.7), chestM, 0, 0.98, 0);
      for (const sx of [1, -1]) mesh(body, dome(0.115, 0.5), chestM, sx * 0.22, 1.54, 0, 0, 0, -sx * 0.45).scale.set(1, 0.65, 1);
      mesh(body, box(0.32, 0.05, 0.19), leatherM, 0, 1.0, 0);
    }

    // ---- cloak ----
    P.cloak = null;
    if (gear.cloak !== 'none') {
      const cm = M({ id: CL.set, color: CL.color, rim: 0.4, side: THREE.DoubleSide }); mats.push(cm);
      const g = new THREE.CylinderGeometry(0.2, 0.34, 1.2, 12, 4, true, Math.PI * 0.55, Math.PI * 0.9);
      const pos = g.attributes.position; for (let i = 0; i < pos.count; i++) { const y = pos.getY(i), x = pos.getX(i); pos.setZ(i, pos.getZ(i) + Math.sin(x * 14) * 0.02 * (0.6 - y)); }
      g.computeVertexNormals();
      P.cloak = mesh(body, g, cm, 0, 0.97, -0.07);
      if (knight) mesh(body, box(0.32, 0.06, 0.08), cm, 0, 1.6, -0.09);
    }

    // ---- head & helm ----
    mesh(body, new THREE.CylinderGeometry(0.05, 0.055, 0.1, 6), skin, 0, 1.6, 0.01);
    const head = new THREE.Group(); head.position.set(0, 1.72, 0); body.add(head); P.head = head;
    if (gear.helm === 'greathelm') {
      mesh(head, lathe([[0.0, 0.215], [0.07, 0.21], [0.12, 0.19], [0.14, 0.14], [0.145, 0.0], [0.142, -0.1], [0.13, -0.13]], 16, 1.05), helmM);
      mesh(head, box(0.22, 0.02, 0.05), slit, 0, 0.04, 0.135);
      mesh(head, box(0.03, 0.27, 0.03), brass, 0, 0.02, 0.145);           // cross brace
      mesh(head, box(0.2, 0.03, 0.025), brass, 0, 0.09, 0.14);
      for (let k = 0; k < 4; k++) mesh(head, box(0.012, 0.012, 0.02), slit, 0.05 + (k % 2) * 0.025, -0.04 - Math.floor(k / 2) * 0.025, 0.142);
      const plume = M({ id: ID.SILK, color: 0xc01818, rim: 0.3 }); mats.push(plume);
      P.plume = new THREE.Group(); P.plume.position.set(0, 0.21, -0.01); head.add(P.plume);
      for (let k = 0; k < 6; k++) mesh(P.plume, new THREE.ConeGeometry(0.028, 0.3, 5), plume, (k - 2.5) * 0.008, 0.08 + k * 0.012, -0.06 - k * 0.04, -1.0 - k * 0.12);
    } else if (gear.helm === 'sallet') {
      mesh(head, lathe([[0.0, 0.17], [0.09, 0.16], [0.135, 0.1], [0.145, 0.0], [0.15, -0.06]], 14, 1.05), helmM);
      mesh(head, new THREE.ConeGeometry(0.17, 0.14, 12, 1, true), helmM, 0, -0.06, -0.06, -0.5);
      mesh(head, box(0.2, 0.02, 0.04), slit, 0, 0.02, 0.135);
      mesh(head, lathe([[0.13, -0.02], [0.12, -0.14], [0.05, -0.17]], 12, 0.9), helmM, 0, 0, 0.02);   // bevor
    } else if (gear.helm === 'coif') {
      mesh(head, new THREE.SphereGeometry(0.135, 12, 9), helmM).scale.set(0.95, 1.1, 1);
      mesh(head, lathe([[0.12, 0.0], [0.15, -0.12], [0.2, -0.17]], 14, 0.8), helmM, 0, -0.04, 0);
      mesh(head, box(0.12, 0.1, 0.03), skin, 0, 0.0, 0.12);
      mesh(head, box(0.1, 0.015, 0.02), slit, 0, 0.025, 0.135);
    } else if (gear.helm === 'hood') {
      mesh(head, new THREE.SphereGeometry(0.12, 10, 8), skin).scale.set(0.9, 1.1, 1);
      mesh(head, new THREE.ConeGeometry(0.17, 0.42, 10, 1, true), helmM, 0, 0.08, -0.04, -0.35);
      mesh(head, lathe([[0.13, 0.0], [0.17, -0.12], [0.22, -0.16]], 12, 0.8), helmM, 0, -0.06, 0);
      mesh(head, box(0.1, 0.02, 0.02), slit, 0, 0.02, 0.12);
    } else if (gear.helm === 'horned') {
      mesh(head, lathe([[0.0, 0.19], [0.1, 0.17], [0.145, 0.08], [0.15, -0.06], [0.13, -0.12]], 14, 1.05), helmM);
      mesh(head, box(0.2, 0.025, 0.05), slit, 0, 0.03, 0.135);
      for (const sx of [1, -1]) {
        const h = new THREE.Group(); h.position.set(sx * 0.13, 0.1, 0); h.rotation.z = -sx * 1.0; head.add(h);
        mesh(h, new THREE.ConeGeometry(0.04, 0.22, 6), helmM, 0, 0.11, 0);
        mesh(h, new THREE.ConeGeometry(0.025, 0.16, 6), helmM, 0, 0.27, -0.03, -0.5, 0, sx * 0.6);
      }
    }

    // ---- left arm: rerebrace, couter, vambrace, gauntlet ----
    P.armL = new THREE.Group(); P.armL.position.set(0.235, 1.48, 0); body.add(P.armL);
    const armMat = knight ? plate : gear.chest === 'hauberk' || gear.chest === 'scale' ? chestM : under;
    mesh(P.armL, lathe([[0.04, -0.28], [0.048, -0.15], [0.05, 0.0]], 8), armMat);
    if (knight) mesh(P.armL, dome(0.048, 0.6), plate, 0, -0.3, -0.02, 1.4);
    mesh(P.armL, lathe([[0.034, -0.56], [0.044, -0.45], [0.042, -0.3]], 8), knight ? plate : leatherM);
    mesh(P.armL, box(0.075, 0.09, 0.075), knight ? darkSteel : leatherM, 0, -0.6, 0.01);

    // ---- right arm + sword live in the swing pivot ----
    const sp = P.swing = new THREE.Group(); sp.position.set(0, 1.44, 0.02); body.add(sp);
    const arm = lathe([[0.045, 0.0], [0.05, 0.22], [0.04, 0.44]], 8); arm.rotateX(Math.PI / 2);
    mesh(sp, arm, armMat, -0.215, 0, 0);
    if (knight) mesh(sp, dome(0.048, 0.6), plate, -0.215, 0.0, 0.24, 0, 0, 0);
    mesh(sp, box(0.08, 0.08, 0.09), knight ? darkSteel : leatherM, -0.215, 0, 0.46);
    const sword = P.sword = new THREE.Group(); sword.position.set(-0.215, 0, 0.48); sp.add(sword);
    const sm = P.swordMats;
    mesh(sword, box(0.04, 0.04, 0.22), sm.hilt, 0, 0, -0.01);
    mesh(sword, new THREE.OctahedronGeometry(0.035, 0), sm.guard, 0, 0, -0.14);
    mesh(sword, box(0.3, 0.035, 0.05), sm.guard, 0, 0, 0.11);
    const bg = new THREE.BoxGeometry(0.075, 0.022, 1.15, 1, 1, 8); const bp = bg.attributes.position;
    for (let i = 0; i < bp.count; i++) { const k = (bp.getZ(i) + 0.575) / 1.15; if (k > 0.86) bp.setX(i, bp.getX(i) * Math.max(0, (1 - k) / 0.14)); }
    bg.computeVertexNormals();
    P.blade = mesh(sword, bg, sm.blade, 0, 0, 0.71);
    P.tipObj = new THREE.Object3D(); P.tipObj.position.set(0, 0, 1.28); sword.add(P.tipObj);
    P.baseObj = new THREE.Object3D(); P.baseObj.position.set(0, 0, 0.24); sword.add(P.baseObj);

    P.mats = mats.concat([sm.blade]);
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
