// Glyphwake: weapon classes. The forged blade (metal + runes, see forge.js) is the soul; the class is its form.
// Five forms, two carried (X swaps). Each form has its own combo, heavy, block/parry, roll cost and model.
(function () {
  'use strict';
  const GW = window.GW, ID = GW.ID;
  const C = (dur, dmg, range, cone, step, st, o) => Object.assign({ dur, dmg, range, cone, step, st, brk: 0.6 }, o || {});
  const CLS = {
    sword: { name: 'Sword & Shield', g: '†', col: '#c8d4e8', src: 'start',
      desc: 'Balanced cuts. The shield blocks 85% and gives the widest parry window.',
      combo: [C(0.42, 1.0, 2.8, 1.95, 2.6, 11, { a: 0 }), C(0.42, 1.1, 2.8, 1.95, 2.6, 11, { a: 1 }), C(0.62, 1.9, 3.2, 0.8, 4.2, 17, { heavy: true, a: 2, brk: 1.6 })],
      heavy: { dmgK: 1, rangeK: 1, stepK: 1 }, block: { soak: 0.85, parry: 0.22, st: 1 }, roll: 24, speed: 1, crit: 0 },
    great: { name: 'Greatsword', g: '‡', col: '#e0c090', src: 'shop', region: 'high',
      desc: 'Slow, huge arcs that shatter guards. Weak block (60%), tight parry.',
      combo: [C(0.6, 1.55, 3.5, 2.2, 3.2, 18, { a: 0, brk: 1.6 }), C(0.62, 1.65, 3.5, 2.2, 3.2, 18, { a: 1, brk: 1.6 }), C(0.86, 2.7, 3.9, 1.1, 5, 26, { heavy: true, a: 2, brk: 3.5 })],
      heavy: { dmgK: 1.45, rangeK: 1.15, stepK: 1.2 }, block: { soak: 0.6, parry: 0.16, st: 1.3 }, roll: 30, speed: 0.9, crit: 0 },
    spear: { name: 'Spear', g: '↑', col: '#a8f0ff', src: 'shop', region: 'frost',
      desc: 'Long, narrow thrusts in a 4-hit chain. Keep foes at the end of the shaft.',
      combo: [C(0.36, 0.85, 4.4, 0.45, 1.6, 9, { a: 3 }), C(0.36, 0.85, 4.4, 0.45, 1.6, 9, { a: 3 }), C(0.38, 0.95, 4.5, 0.45, 1.8, 9, { a: 3 }), C(0.56, 1.7, 4.8, 0.6, 5, 15, { heavy: true, a: 2, brk: 1.4 })],
      heavy: { dmgK: 1.1, rangeK: 1.35, stepK: 2 }, block: { soak: 0.7, parry: 0.2, st: 1.1 }, roll: 22, speed: 1, crit: 0.03 },
    daggers: { name: 'Twin Daggers', g: '✕', col: '#ff8a9a', src: 'shop', region: 'dusk',
      desc: 'A 5-cut flurry, +15% crit, cheap rolls. A poor block (50%), but the widest parry window of all.',
      combo: [C(0.26, 0.5, 2.3, 1.9, 1.6, 6, { a: 0 }), C(0.26, 0.5, 2.3, 1.9, 1.6, 6, { a: 1 }), C(0.26, 0.55, 2.3, 1.9, 1.6, 6, { a: 0 }), C(0.28, 0.6, 2.3, 1.9, 1.8, 6, { a: 1 }), C(0.44, 1.15, 2.6, 2.4, 3.4, 10, { a: 2, brk: 1 })],
      heavy: { dmgK: 0.8, rangeK: 0.9, stepK: 1.6 }, block: { soak: 0.5, parry: 0.3, st: 0.8 }, roll: 15, speed: 1.05, crit: 0.15 },
    bow: { name: 'Glyph Bow', g: ')', col: '#d8f0a0', src: 'shop', region: 'salt',
      desc: 'Loose rune-arrows at range. Hold attack to draw a piercing shot. Weak block (40%).',
      combo: [C(0.44, 1.05, 0, 0, -1.2, 7, { shot: true, a: 4, brk: 0.8 }), C(0.44, 1.05, 0, 0, -1.2, 7, { shot: true, a: 4, brk: 0.8 })],
      heavy: { dmgK: 1.3, rangeK: 1, stepK: -0.5, shot: true }, block: { soak: 0.4, parry: 0.18, st: 1 }, roll: 20, speed: 1, crit: 0.05 },
  };
  const A = GW.Arms = { CLS };
  A.ensure = function (P) {
    const inv = P.inv; if (!inv.arms) inv.arms = { owned: { sword: 1 }, set: ['sword', null], act: 0 };
    const a = inv.arms; a.owned.sword = 1; a.set = (a.set || []).slice(0, 2); while (a.set.length < 2) a.set.push(null);
    a.set = a.set.map(k => (k && CLS[k] && a.owned[k]) ? k : null); if (!a.set[0] && !a.set[1]) a.set[0] = 'sword';
    if (!a.set[a.act]) a.act = a.set[0] ? 0 : 1;
    return a;
  };
  // every weapon form keeps its own forging: metal, runes and upgrade level. P.weapon always points at the one in hand.
  A.bindWeapon = function (P) {
    const a = A.ensure(P), k = A.curKey(P); a.forge = a.forge || {};
    if (!a.forge[k]) a.forge[k] = (k === 'sword' && P.weapon && !Object.values(a.forge).includes(P.weapon)) ? P.weapon : { metal: 'iron', runes: [null, null, null], up: 0 };
    const w = a.forge[k]; w.cls = k; w.up = w.up || 0; while (w.runes.length < (w.up >= 3 ? 4 : 3)) w.runes.push(null);
    P.weapon = w; return w;
  };
  A.cur = P => CLS[A.ensure(P).set[P.inv.arms.act]] || CLS.sword;
  A.curKey = P => A.ensure(P).set[P.inv.arms.act] || 'sword';
  A.learn = function (P, k) { const a = A.ensure(P); if (a.owned[k]) return false; a.owned[k] = 1; if (!a.set[1]) a.set[1] = k; return true; };
  A.where = k => { const c = CLS[k]; return c.src === 'start' ? 'your first blade' : 'sold by traders in ' + ((GW.World.REGIONS[c.region] || {}).name || '?') + ', or found in elite chests'; };

  // ---------- models (in grip space: +z runs out of the fist along the blade) ----------
  const mesh = (p, g, m, x, y, z) => { const o = new THREE.Mesh(g, m); o.position.set(x || 0, y || 0, z || 0); p.add(o); return o; };
  const box = (x, y, z) => new THREE.BoxGeometry(x, y, z);
  const blade = (sm, L, W, at) => {
    const bg = new THREE.BoxGeometry(W, 0.02, L, 1, 1, 8), bp = bg.attributes.position;
    for (let i = 0; i < bp.count; i++) { const k = (bp.getZ(i) + L / 2) / L; if (k > 0.86) bp.setX(i, bp.getX(i) * Math.max(0, (1 - k) / 0.14)); }
    bg.computeVertexNormals(); return mesh(new THREE.Group(), bg, sm.blade, 0, 0, at + L / 2);
  };
  const ends = (g, z0, z1) => { const tip = new THREE.Object3D(); tip.position.set(0, 0, z1); g.add(tip); const base = new THREE.Object3D(); base.position.set(0, 0, z0); g.add(base); return { tip, base }; };
  A.build = function (sm, k) {
    const R = new THREE.Group(); let L = null, e;
    if (k === 'great') {
      mesh(R, box(0.05, 0.05, 0.38), sm.hilt, 0, 0, 0.02); mesh(R, box(0.5, 0.05, 0.07), sm.guard, 0, 0, 0.2);
      const b = blade(sm, 1.55, 0.13, 0.22); R.add(b.parent); e = ends(R, 0.35, 1.77);
    } else if (k === 'spear') {
      mesh(R, new THREE.CylinderGeometry(0.025, 0.025, 2.1, 6).rotateX(Math.PI / 2), sm.hilt, 0, 0, 0.45);
      mesh(R, box(0.05, 0.05, 0.05), sm.guard, 0, 0, 1.48);
      const b = blade(sm, 0.4, 0.09, 1.5); R.add(b.parent); e = ends(R, 1.2, 1.9);
    } else if (k === 'daggers') {
      const mk = () => { const g = new THREE.Group(); mesh(g, box(0.035, 0.035, 0.14), sm.hilt, 0, 0, 0); mesh(g, box(0.16, 0.03, 0.035), sm.guard, 0, 0, 0.08); const b = blade(sm, 0.42, 0.06, 0.09); g.add(b.parent); return g; };
      const r = mk(); R.add(r); e = ends(R, 0.12, 0.51); L = mk();
    } else if (k === 'bow') {
      // bow in the left fist; the right hand is empty (tip/base still exist for the trail code)
      L = new THREE.Group();
      // limbs run along the fist axis (+z), the belly bulges toward +x; the string closes the arc
      const r = 0.62, arc = new THREE.TorusGeometry(r, 0.026, 5, 20, Math.PI * 0.9); arc.rotateZ(-Math.PI * 0.45); arc.rotateX(Math.PI / 2); arc.translate(-r, 0, 0);
      mesh(L, arc, sm.blade, 0, 0, 0); mesh(L, box(0.06, 0.06, 0.16), sm.hilt, 0, 0, 0);
      const sx = -r + r * Math.cos(Math.PI * 0.45), sl = 2 * r * Math.sin(Math.PI * 0.45);
      mesh(L, new THREE.CylinderGeometry(0.005, 0.005, sl, 3).rotateX(Math.PI / 2), sm.guard, sx, 0, 0);
      e = ends(R, 0.1, 0.4);
    } else {
      mesh(R, box(0.04, 0.04, 0.22), sm.hilt, 0, 0, -0.01); mesh(R, new THREE.OctahedronGeometry(0.035, 0), sm.guard, 0, 0, -0.14);
      mesh(R, box(0.3, 0.035, 0.05), sm.guard, 0, 0, 0.11);
      const b = blade(sm, 1.0, 0.07, 0.14); R.add(b.parent); e = ends(R, 0.24, 1.14);
      // kite shield on the left forearm
      L = new THREE.Group();
      const sg = new THREE.CylinderGeometry(0.26, 0.26, 0.04, 7, 1); sg.scale(1, 1, 1.3); sg.rotateZ(Math.PI / 2);
      mesh(L, sg, sm.guard, -0.08, 0, 0.02); mesh(L, new THREE.CylinderGeometry(0.2, 0.2, 0.05, 7).scale(1, 1, 1.3).rotateZ(Math.PI / 2), sm.shield, -0.1, 0, 0.02);
    }
    return { right: R, left: L, tip: e.tip, base: e.base };
  };
})();
