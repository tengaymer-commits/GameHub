// Glyphwake: procedural attack poses. The rig ships a single sword swing, so each weapon's moves are authored here
// as key poses solved with two-bone IK on top of the playing clip. A pose says where the hands go and where the
// blades point (body space: the hero faces +z, his right is -x, feet at y=0), plus torso/hip twist and a hop.
// Timing is "snappy": ease into the anticipation and hold it, snap through the strike in ~5 frames,
// hold the follow-through, then ease back.
//   T [yaw, pitch] torso · H [yaw] hips · R { h: hand pos, b: blade dir } · L { h, b } or 'grip' (two-handed) · y hop · z lunge
(function () {
  'use strict';
  const GW = window.GW, V3 = THREE.Vector3;
  const P0 = null;   // "no pose": the clip as it plays
  const K = {
    // ---------- sword & shield ----------
    sw_fore_a: { T: [-0.6, 0], H: [-0.25], R: { h: [-0.5, 1.75, -0.05], b: [-0.3, 0.8, -0.5] }, L: { h: [0.3, 1.25, 0.3], b: [0, 1, 0.15] } },
    sw_fore_s: { T: [0.6, 0.15], H: [0.25], R: { h: [0.22, 1.05, 0.5], b: [0.7, -0.45, 0.55] }, L: { h: [0.4, 1.2, 0.15], b: [0, 1, 0.15] }, z: 0.15 },
    sw_back_a: { T: [0.6, 0], H: [0.25], R: { h: [0.25, 1.1, 0.25], b: [0.8, -0.2, -0.55] }, L: { h: [0.4, 1.2, 0.1], b: [0, 1, 0.15] } },
    sw_back_s: { T: [-0.55, 0.1], H: [-0.25], R: { h: [-0.5, 1.6, 0.4], b: [-0.7, 0.55, 0.45] }, L: { h: [0.3, 1.25, 0.3], b: [0, 1, 0.15] }, z: 0.15 },
    sw_chop_a: { T: [-0.1, -0.25], R: { h: [-0.15, 2.0, -0.05], b: [0.05, 0.25, -0.97] }, L: { h: [0.35, 1.4, 0.25], b: [0, 1, 0.15] }, y: 0.12 },
    sw_chop_s: { T: [0.05, 0.4], R: { h: [-0.1, 1.05, 0.55], b: [0, -0.5, 0.87] }, L: { h: [0.4, 1.15, 0.1], b: [0, 1, 0.15] }, y: -0.1, z: 0.35 },
    sw_block: { T: [0.25, 0.05], R: { h: [-0.35, 1.0, 0.15], b: [-0.2, -0.3, 0.93] }, L: { h: [0.12, 1.4, 0.45], b: [0, 1, 0.15] } },
    // ---------- greatsword (two hands on the hilt) ----------
    gr_sweep_a: { T: [-1.0, 0.05], H: [-0.45], R: { h: [-0.55, 1.25, -0.3], b: [-0.5, 0.2, -0.85] }, L: 'grip' },
    gr_sweep_s: { T: [0.9, 0.2], H: [0.4], R: { h: [0.35, 1.2, 0.45], b: [0.8, 0.05, 0.6] }, L: 'grip', z: 0.2 },
    gr_ret_a: { T: [0.9, 0.05], H: [0.4], R: { h: [0.45, 1.25, -0.15], b: [0.6, 0.2, -0.8] }, L: 'grip' },
    gr_ret_s: { T: [-0.9, 0.2], H: [-0.4], R: { h: [-0.45, 1.15, 0.45], b: [-0.85, 0, 0.5] }, L: 'grip', z: 0.2 },
    gr_slam_a: { T: [0, -0.35], R: { h: [-0.05, 2.05, -0.1], b: [0, 0.35, -0.94] }, L: 'grip', y: 0.3 },
    gr_slam_s: { T: [0, 0.6], R: { h: [0, 0.9, 0.6], b: [0, -0.65, 0.76] }, L: 'grip', y: -0.2, z: 0.4 },
    two_block: { T: [0, 0.05], R: { h: [-0.2, 1.4, 0.4], b: [0.95, 0.25, 0.1] }, L: 'grip' },
    // ---------- spear (the left hand rides the shaft) ----------
    sp_draw: { T: [-0.5, 0], H: [-0.3], R: { h: [-0.45, 1.25, -0.25], b: [0.05, 0.08, 1] }, L: 'shaft' },
    sp_thr: { T: [0.3, 0.15], H: [0.25], R: { h: [-0.15, 1.35, 0.55], b: [0.05, 0.02, 1] }, L: 'shaft', z: 0.5 },
    sp_low: { T: [0.3, 0.35], H: [0.25], R: { h: [-0.15, 1.05, 0.55], b: [0, -0.3, 0.95] }, L: 'shaft', z: 0.45, y: -0.12 },
    sp_high: { T: [0.3, 0], H: [0.25], R: { h: [-0.2, 1.65, 0.5], b: [0, 0.25, 0.97] }, L: 'shaft', z: 0.45 },
    sp_spin_a: { T: [-1.2, 0], H: [-0.6], R: { h: [-0.55, 1.2, -0.1], b: [-0.6, 0, -0.8] }, L: 'shaft' },
    sp_spin_s: { T: [1.1, 0.15], H: [0.55], R: { h: [0.3, 1.2, 0.45], b: [0.9, 0, 0.4] }, L: 'shaft', z: 0.35 },
    // ---------- twin daggers (alternating hands, low crouch) ----------
    dg_r_a: { T: [-0.4, 0.2], H: [-0.2], R: { h: [-0.4, 1.15, -0.1], b: [0, 0.3, 0.95] }, L: { h: [0.2, 1.3, 0.3], b: [0, 0.5, 0.85] }, y: -0.12 },
    dg_r_s: { T: [0.4, 0.25], H: [0.2], R: { h: [-0.05, 1.3, 0.6], b: [0.1, 0, 1] }, L: { h: [0.3, 1.15, 0], b: [0, 0.3, 0.95] }, y: -0.15, z: 0.25 },
    dg_l_a: { T: [0.4, 0.2], H: [0.2], L: { h: [0.4, 1.15, -0.1], b: [0, 0.3, 0.95] }, R: { h: [-0.2, 1.3, 0.3], b: [0, 0.5, 0.85] }, y: -0.12 },
    dg_l_s: { T: [-0.4, 0.25], H: [-0.2], L: { h: [0.05, 1.3, 0.6], b: [-0.1, 0, 1] }, R: { h: [-0.3, 1.15, 0], b: [0, 0.3, 0.95] }, y: -0.15, z: 0.25 },
    dg_x_a: { T: [0, -0.1], R: { h: [-0.45, 1.8, 0.1], b: [-0.4, 0.6, 0.7] }, L: { h: [0.45, 1.8, 0.1], b: [0.4, 0.6, 0.7] }, y: 0.2 },
    dg_x_s: { T: [0, 0.45], R: { h: [0.15, 1.05, 0.5], b: [0.6, -0.5, 0.6] }, L: { h: [-0.15, 1.05, 0.5], b: [-0.6, -0.5, 0.6] }, y: -0.2, z: 0.35 },
    dg_block: { T: [0, 0.15], R: { h: [0.05, 1.4, 0.35], b: [0.7, 0.7, 0.1] }, L: { h: [-0.05, 1.4, 0.35], b: [-0.7, 0.7, 0.1] }, y: -0.1 },
    // ---------- bow (side stance: the left arm holds the bow out, the right hand draws to the cheek) ----------
    bw_draw: { T: [-0.8, 0], H: [-0.5], L: { h: [0.1, 1.45, 0.62], b: [0, 1, 0.1] }, R: { h: [-0.15, 1.55, 0], b: [0, 0, 1] } },
    bw_loose: { T: [-0.8, 0], H: [-0.5], L: { h: [0.1, 1.45, 0.62], b: [0, 1, 0.1] }, R: { h: [-0.42, 1.6, -0.25], b: [-0.3, 0.3, -0.9] } },
    bw_rest: { L: { h: [0.3, 1.05, 0.2], b: [0, 1, 0.25] } },
    bw_block: { T: [-0.3, 0], L: { h: [0.1, 1.4, 0.4], b: [0, 1, 0.1] }, R: { h: [-0.25, 1.1, 0.2], b: [0, 0, 1] } },
  };
  const MOVES = {
    sword: [['sw_fore_a', 'sw_fore_s'], ['sw_back_a', 'sw_back_s'], ['sw_chop_a', 'sw_chop_s']],
    great: [['gr_sweep_a', 'gr_sweep_s'], ['gr_ret_a', 'gr_ret_s'], ['gr_slam_a', 'gr_slam_s']],
    spear: [['sp_draw', 'sp_thr'], ['sp_draw', 'sp_low'], ['sp_draw', 'sp_high'], ['sp_spin_a', 'sp_spin_s']],
    daggers: [['dg_r_a', 'dg_r_s'], ['dg_l_a', 'dg_l_s'], ['dg_r_a', 'dg_r_s'], ['dg_l_a', 'dg_l_s'], ['dg_x_a', 'dg_x_s']],
    bow: [['bw_draw', 'bw_loose'], ['bw_draw', 'bw_loose']],
  };
  const HEAVY = { sword: ['sw_chop_a', 'sw_chop_s'], great: ['gr_slam_a', 'gr_slam_s'], spear: ['sp_draw', 'sp_thr'], daggers: ['dg_x_a', 'dg_x_s'], bow: ['bw_draw', 'bw_loose'] };
  const BLOCK = { sword: 'sw_block', great: 'two_block', spear: 'two_block', daggers: 'dg_block', bow: 'bw_block' };

  // ---------- blending poses ----------
  const lerp = (a, b, k) => a + (b - a) * k;
  const lv = (a, b, k) => a && b ? [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)] : (k < 0.5 ? a : b);
  const lhand = (a, b, k) => {
    if (typeof a === 'string' || typeof b === 'string' || !a || !b) return k < 0.5 ? a : b;
    return { h: lv(a.h, b.h, k), b: lv(a.b, b.b, k) };
  };
  function mix(A, B, k) {   // A or B may be null (= the clip pose, weight 0)
    if (!A && !B) return null;
    if (!A) return Object.assign({}, B, { w: k * (B.w === undefined ? 1 : B.w) });
    if (!B) return Object.assign({}, A, { w: (1 - k) * (A.w === undefined ? 1 : A.w) });
    return { T: lv(A.T ? [A.T[0], A.T[1], 0] : [0, 0, 0], B.T ? [B.T[0], B.T[1], 0] : [0, 0, 0], k), H: [lerp((A.H || [0])[0], (B.H || [0])[0], k)],
      R: lhand(A.R, B.R, k), L: lhand(A.L, B.L, k), y: lerp(A.y || 0, B.y || 0, k), z: lerp(A.z || 0, B.z || 0, k),
      w: lerp(A.w === undefined ? 1 : A.w, B.w === undefined ? 1 : B.w, k) };
  }
  const eOut = k => 1 - Math.pow(1 - k, 3), eIO = k => k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
  function attackPose(a, s, t, h, d) {
    const A = K[a], S = K[s], snap0 = h - 0.045, ant = Math.max(0.04, snap0 - 0.03), snapEnd = h + 0.03, hold = Math.min(d * 0.8, h + 0.16);
    if (t < ant) return mix(P0, A, eOut(t / ant));          // ease into the anticipation
    if (t < snap0) return A;                                 // hold it: the read frame
    if (t < snapEnd) return mix(A, S, eOut((t - snap0) / (snapEnd - snap0)));   // snap
    if (t < hold) return S;                                  // hold the follow-through
    return mix(S, P0, eIO(Math.min(1, (t - hold) / Math.max(0.05, d - hold))));
  }

  // enemies: a slower, legible rhythm — rise into the anticipation, HOLD it still, snap, hold the follow-through
  function enemyPose(a, s, t, h, d) {
    const A = K[a], S = K[s], snap0 = h - 0.05, ant = Math.max(0.1, snap0 * 0.6), snapEnd = h + 0.02, hold = Math.min(d * 0.85, h + 0.2);
    if (t < ant) return mix(P0, A, eOut(t / ant));
    if (t < snap0) return A;
    if (t < snapEnd) return mix(A, S, eOut((t - snap0) / (snapEnd - snap0)));
    if (t < hold) return S;
    return mix(S, P0, eIO(Math.min(1, (t - hold) / Math.max(0.05, d - hold))));
  }
  // ---------- solving a pose onto the rig ----------
  const _q = new THREE.Quaternion(), _p = new THREE.Quaternion(), _m = new THREE.Quaternion(), _e = new THREE.Euler();
  const tmp = { a: new V3(), b: new V3(), c: new V3(), d: new V3(), t: new V3(), n: new V3(), pole: new V3(), e: new V3() };
  function turnWorld(bone, qWorld) {   // premultiply a world-space rotation onto a bone
    bone.parent.getWorldQuaternion(_p);
    const local = _p.clone().invert().multiply(qWorld).multiply(_p);
    bone.quaternion.premultiply(local); bone.updateMatrixWorld(true);
  }
  function aimBone(bone, from, to) {   // rotate bone so the world vector `from` lines up with `to`
    if (from.lengthSq() < 1e-8 || to.lengthSq() < 1e-8) return;
    _q.setFromUnitVectors(from.clone().normalize(), to.clone().normalize()); turnWorld(bone, _q);
  }
  function twist(rig, name, yaw, pitch) {
    if (!yaw && !pitch) return; const b = rig.bone(name); if (!b) return;
    rig.root.getWorldQuaternion(_m); _e.set(pitch || 0, yaw || 0, 0, 'YXZ'); _q.setFromEuler(_e);
    _q.premultiply(_m).multiply(_m.clone().invert()); turnWorld(b, _q);
  }
  function solveArm(rig, body, side, hand, prop, blade) {
    const up = rig.bone('UpperArm.' + side), lo = rig.bone('LowerArm.' + side), wr = rig.bone('Wrist.' + side); if (!up || !lo || !wr) return;
    const S = up.getWorldPosition(tmp.a), E0 = lo.getWorldPosition(tmp.b), W0 = wr.getWorldPosition(tmp.c);
    const la = S.distanceTo(E0), lb = E0.distanceTo(W0);
    const T = body.localToWorld(tmp.t.set(hand[0], hand[1], hand[2]));
    const toT = T.clone().sub(S); let d = toT.length(); const n = toT.normalize();
    d = GW.clamp(d, Math.abs(la - lb) + 0.01, la + lb - 0.005);
    const pole = body.localToWorld(tmp.pole.set(side === 'R' ? -0.7 : 0.7, 0.4, -0.5)).sub(body.localToWorld(tmp.e.set(0, 1, 0)));
    const perp = pole.sub(n.clone().multiplyScalar(pole.dot(n))).normalize();
    const cosA = GW.clamp((la * la + d * d - lb * lb) / (2 * la * d), -1, 1), sinA = Math.sqrt(1 - cosA * cosA);
    const E = S.clone().add(n.clone().multiplyScalar(la * cosA)).add(perp.multiplyScalar(la * sinA));
    aimBone(up, E0.clone().sub(S), E.clone().sub(S));
    const E1 = lo.getWorldPosition(new V3()), W1 = wr.getWorldPosition(new V3()), Tc = S.clone().add(n.multiplyScalar(d));
    aimBone(lo, W1.clone().sub(E1), Tc.sub(E1));
    if (prop && blade) {   // point the held prop's +z (the blade) along `blade`
      prop.updateMatrixWorld(true);
      const cur = new V3(0, 0, 1).transformDirection(prop.matrixWorld);
      const want = new V3(blade[0], blade[1], blade[2]).transformDirection(body.matrixWorld);
      aimBone(wr, cur, want);
    }
  }
  const SAVE = ['Hips', 'Torso', 'UpperArm.R', 'LowerArm.R', 'Wrist.R', 'UpperArm.L', 'LowerArm.L', 'Wrist.L'];
  function apply(P, pose) {
    if (!pose) return;
    const w = pose.w === undefined ? 1 : pose.w; if (w <= 0.001) return;
    const rig = P.rig, body = P.body;
    body.updateMatrixWorld(true);
    const orig = SAVE.map(n => { const b = rig.bone(n); return b ? b.quaternion.clone() : null; });
    // remember the clip's pose: bones the clip doesn't key would otherwise keep this frame's turn and add the next on top
    rig._poseRestore = SAVE.map((n, i) => [rig.bone(n), orig[i]]).filter(r => r[0] && r[1]);
    if (pose.H) twist(rig, 'Hips', pose.H[0], 0);
    if (pose.T) twist(rig, 'Torso', pose.T[0], pose.T[1]);
    if (pose.R && pose.R.h) solveArm(rig, body, 'R', pose.R.h, P.sword, pose.R.b);
    let L = pose.L;
    if ((L === 'grip' || L === 'shaft') && pose.R && pose.R.h) {   // the off hand holds the weapon below / along the right hand
      const bd = pose.R.b || [0, 0, 1], k = L === 'grip' ? -0.16 : 0.45;
      L = { h: [pose.R.h[0] + bd[0] * k, pose.R.h[1] + bd[1] * k, pose.R.h[2] + bd[2] * k] };
    }
    if (L && L.h) solveArm(rig, body, 'L', L.h, P.leftProp, L.b);
    if (w < 0.999) SAVE.forEach((n, i) => { const b = rig.bone(n); if (b && orig[i]) b.quaternion.slerpQuaternions(orig[i], b.quaternion.clone(), w); });
  }
  // undo last frame's pose layer (call before the mixer updates)
  function restore(rig) { if (!rig || !rig._poseRestore) return; for (const [b, q] of rig._poseRestore) b.quaternion.copy(q); rig._poseRestore = null; }
  GW.Moves = { restore, K, MOVES, HEAVY, BLOCK, attackPose, enemyPose, apply, mix };
})();
