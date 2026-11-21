// Glyphwake: the skill tree. One point per level, three branches; deeper rows need points already spent in the branch.
// Effects are read where they apply with GW.Skills.r(P, id) (the rank, 0 if unlearned).
(function () {
  'use strict';
  const GW = window.GW;
  const BR = {
    blade: { name: 'BLADE', g: '†', col: '#ffb070', sub: 'the edge and the swing' },
    guard: { name: 'GUARD', g: '⛨', col: '#8ac8ff', sub: 'the wall and the timing' },
    glyph: { name: 'GLYPH', g: '✶', col: '#c8a0ff', sub: 'the ink and the arts' },
  };
  // tier t needs 2·t points already spent in the branch
  const NODES = [
    { id: 'b_edge', br: 'blade', t: 0, max: 3, g: '/', name: 'Honed Edge', desc: r => `+${6 * r || 6}% weapon damage` },
    { id: 'b_flow', br: 'blade', t: 0, max: 2, g: '~', name: 'Flow', desc: r => `light attacks cost ${15 * (r || 1)}% less stamina` },
    { id: 'b_charge', br: 'blade', t: 1, max: 2, g: '»', name: 'Quick Draw', desc: r => `charged heavies fill ${25 * (r || 1)}% faster` },
    { id: 'b_moment', br: 'blade', t: 1, max: 2, g: '≫', name: 'Momentum', desc: r => `each hit deeper in a combo deals +${5 * (r || 1)}% (up to 3 steps)` },
    { id: 'b_sunder', br: 'blade', t: 2, max: 2, g: '#', name: 'Sunder', desc: r => `+${20 * (r || 1)}% break damage` },
    { id: 'b_keen', br: 'blade', t: 2, max: 2, g: '*', name: 'Keen Eye', desc: r => `+${4 * (r || 1)}% critical chance` },
    { id: 'b_exec', br: 'blade', t: 3, max: 1, g: '†', name: 'Executioner', desc: () => 'finishers deal +50% and heal 8% more' },
    { id: 'b_shatter', br: 'blade', t: 3, max: 1, g: '◇', name: 'Shatterpoint', desc: () => 'elemental reactions deal +40% damage' },
    { id: 'g_parry', br: 'guard', t: 0, max: 2, g: '⌒', name: 'Steady Hand', desc: r => `parry window +${(0.04 * (r || 1)).toFixed(2)} s` },
    { id: 'g_vigor', br: 'guard', t: 0, max: 3, g: '♥', name: 'Vigor', desc: r => `+${15 * (r || 1)} maximum health` },
    { id: 'g_wall', br: 'guard', t: 1, max: 2, g: '▌', name: 'Iron Wall', desc: r => `blocking costs ${20 * (r || 1)}% less stamina` },
    { id: 'g_feet', br: 'guard', t: 1, max: 2, g: '⟲', name: 'Light Feet', desc: r => `rolls cost ${15 * (r || 1)}% less stamina` },
    { id: 'g_ripo', br: 'guard', t: 2, max: 1, g: '!', name: 'Riposte Master', desc: () => 'ripostes hit ×4.5 instead of ×3.5 and refund 20 stamina' },
    { id: 'g_after', br: 'guard', t: 2, max: 1, g: '◌', name: 'Afterimage', desc: () => 'the perfect-dodge window widens (0.22 → 0.32 s) and glyph-time lasts longer' },
    { id: 'g_flask', br: 'guard', t: 3, max: 1, g: '♥', name: 'Deep Flask', desc: () => '+1 flask' },
    { id: 'g_wind', br: 'guard', t: 3, max: 1, g: '∞', name: 'Second Wind', desc: () => 'a killing blow leaves you standing at 30% health instead (once every 2 minutes)' },
    { id: 'y_well', br: 'glyph', t: 0, max: 3, g: '≈', name: 'Wellspring', desc: r => `+${15 * (r || 1)}% focus regeneration` },
    { id: 'y_thrift', br: 'glyph', t: 0, max: 2, g: '¢', name: 'Thrift', desc: r => `abilities cost ${10 * (r || 1)}% less focus` },
    { id: 'y_quick', br: 'glyph', t: 1, max: 2, g: '⌛', name: 'Quickened Ink', desc: r => `ability cooldowns ${10 * (r || 1)}% shorter` },
    { id: 'y_thirst', br: 'glyph', t: 1, max: 1, g: '&', name: 'Ink Thirst', desc: () => 'weapon hits restore 5 focus instead of 3' },
    { id: 'y_attune', br: 'glyph', t: 2, max: 2, g: '∴', name: 'Attunement', desc: r => `burn, chill and poison from your runes last ${25 * (r || 1)}% longer` },
    { id: 'y_potent', br: 'glyph', t: 2, max: 2, g: '✶', name: 'Potency', desc: r => `abilities deal +${12 * (r || 1)}% damage` },
    { id: 'y_echo', br: 'glyph', t: 3, max: 1, g: '"', name: 'Echo', desc: () => '15% chance an ability comes straight back off cooldown' },
    { id: 'y_fuse', br: 'glyph', t: 3, max: 1, g: '⊕', name: 'Fusion', desc: () => 'after a parry (fire), perfect dodge (frost) or finisher (storm), your next ability within 1.8 s is free, +50% and carries the element' },
  ];
  const BYID = {}; NODES.forEach(n => { BYID[n.id] = n; });
  const S = GW.Skills = { BR, NODES, BYID };
  S.ensure = P => { const inv = P.inv; if (!inv.skills) inv.skills = {}; return inv.skills; };
  S.r = (P, id) => (P.inv && P.inv.skills && P.inv.skills[id]) || 0;
  S.spent = (P, br) => { const sk = S.ensure(P); let n = 0; for (const id in sk) if (!br || BYID[id].br === br) n += sk[id]; return n; };
  S.points = P => Math.max(0, (P.level - 1) - S.spent(P));
  S.canLearn = (P, id) => { const n = BYID[id]; return S.points(P) > 0 && S.r(P, id) < n.max && S.spent(P, n.br) >= n.t * 2; };
  S.learn = (P, id) => { if (!S.canLearn(P, id)) return false; const sk = S.ensure(P); sk[id] = (sk[id] || 0) + 1; P.recalc(); return true; };
  S.reset = P => { P.inv.skills = {}; P.recalc(); };

  // ---------- the Skills tab in the Book ----------
  S.render = function (G, el) {
    const P = G.player, pts = S.points(P);
    let h = `<div class="sk-head"><span>Skill points: <b style="color:${pts ? '#ffd860' : '#8a90a0'}">${pts}</b> &nbsp;·&nbsp; one per level</span><button class="btn sm ghost" id="sk-reset">Reset (free while testing)</button></div><div class="sk-cols">`;
    for (const b in BR) {
      const B = BR[b], spent = S.spent(P, b);
      h += `<div class="sk-col"><div class="sk-br" style="color:${B.col}">${B.g} ${B.name}<span>${B.sub} · ${spent} spent</span></div>`;
      for (let t = 0; t < 4; t++) {
        const locked = spent < t * 2;
        h += `<div class="sk-tier${locked ? ' locked' : ''}">${t ? `<div class="sk-req">${locked ? '🔒 ' : ''}needs ${t * 2} in ${B.name.toLowerCase()}</div>` : ''}`;
        for (const n of NODES.filter(q => q.br === b && q.t === t)) {
          const r = S.r(P, n.id), can = S.canLearn(P, n.id), full = r >= n.max;
          h += `<div class="sk-node${r ? ' got' : ''}${can ? ' can' : ''}${full ? ' full' : ''}" data-id="${n.id}" style="--c:${B.col}"><span class="g">${n.g}</span><div class="t"><b>${n.name}</b> <span class="rk">${r}/${n.max}</span><br><span class="d">${n.desc(r || 1)}</span></div></div>`;
        }
        h += '</div>';
      }
      h += '</div>';
    }
    el.innerHTML = h + '</div>';
    el.querySelectorAll('.sk-node').forEach(d => d.onclick = () => {
      if (S.learn(P, d.dataset.id)) { GWAudio.sfx('socket'); G.save(); S.render(G, el); }
      else { GWAudio.sfx('ui'); const n = BYID[d.dataset.id]; if (S.points(P) <= 0) G.ui.toast('No skill points: level up to earn more', 1.6); else if (S.r(P, n.id) >= n.max) G.ui.toast('Already at its highest rank', 1.2); else G.ui.toast(`Needs ${n.t * 2} points in ${BR[n.br].name.toLowerCase()}`, 1.6); }
    });
    const rs = el.querySelector('#sk-reset'); if (rs) rs.onclick = () => { S.reset(P); GWAudio.sfx('ui'); G.save(); S.render(G, el); };
  };
})();
