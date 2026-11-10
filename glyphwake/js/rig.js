// Glyphwake: rigged, animated characters (glTF skinned meshes + animation clips).
// Models: Quaternius (CC0), see assets/models/. Clips cross-fade; props are bolted to bones.
(function () {
  'use strict';
  const GW = window.GW;

  // ---------------- asset loading (files, or base64 embedded by the single-file build) ----------------
  const A = GW.Assets = { gltf: {} };
  function b64ToBuffer(b64) { const bin = atob(b64), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u.buffer; }
  A.load = function (names, onProgress) {
    const loader = new THREE.GLTFLoader();
    let done = 0;
    return Promise.all(names.map(n => {
      const get = (window.GW_EMBED && window.GW_EMBED[n]) ? Promise.resolve(b64ToBuffer(window.GW_EMBED[n]))
        : fetch('assets/models/' + n + '.glb').then(r => { if (!r.ok) throw new Error('model ' + n + ': HTTP ' + r.status); return r.arrayBuffer(); });
      return get.then(buf => new Promise((res, rej) => loader.parse(buf, '', g => { A.gltf[n] = g; done++; if (onProgress) onProgress(done / names.length); res(g); }, rej)));
    }));
  };

  // ---------------- rig ----------------
  // matMap(materialName, mesh) -> material options for GW.mat, or null to hide that part
  function Rig(name, scale, matMap) {
    const src = A.gltf[name];
    this.root = THREE.SkeletonUtils.clone(src.scene);
    this.root.scale.setScalar(scale);
    this.scale = scale;
    this.mats = []; this.parts = [];
    this.root.traverse(o => {
      if (!o.isMesh) return;
      o.frustumCulled = false;
      const mn = o.userData.srcMat || o.material.name; o.userData.srcMat = mn;
      this.parts.push(o);
    });
    this.remap(matMap);
    this.mixer = new THREE.AnimationMixer(this.root);
    this.clips = {}; src.animations.forEach(c => { this.clips[c.name] = c; });
    this.actions = {}; this.cur = null; this.curName = '';
    this.bones = {}; this.rest = []; this.root.traverse(o => { if (o.isBone) { this.bones[o.name] = o; this.rest.push([o, o.position.clone(), o.quaternion.clone(), o.scale.clone()]); } });
  }
  Rig.prototype.remap = function (matMap) {
    this.mats = [];
    for (const o of this.parts) {
      const spec = matMap(o.userData.srcMat, o);
      if (!spec) { o.visible = false; continue; }
      o.visible = true;
      const m = GW.mat(Object.assign({ rim: 0.5 }, spec));
      o.material = m; this.mats.push(m);
    }
  };
  Rig.prototype.bone = function (n) { return this.bones[n] || this.bones[THREE.PropertyBinding.sanitizeNodeName(n)] || null; };
  Rig.prototype.restPose = function () { this.mixer.stopAllAction(); this.cur = null; for (const [b, p, q, sc] of this.rest) { b.position.copy(p); b.quaternion.copy(q); b.scale.copy(sc); } this.root.updateMatrixWorld(true); };
  Rig.prototype.has = function (n) { return !!this.clips[n]; };
  Rig.prototype.dur = function (n) { return this.clips[n] ? this.clips[n].duration : 1; };
  // play a clip; returns the action. opts: fade, loop, speed, restart, at (start fraction)
  Rig.prototype.play = function (n, o) {
    o = o || {};
    const clip = this.clips[n]; if (!clip) return null;
    let a = this.actions[n]; if (!a) a = this.actions[n] = this.mixer.clipAction(clip);
    a.setEffectiveTimeScale(o.speed || 1);
    if (this.cur === a && !o.restart) return a;
    const fade = o.fade === undefined ? 0.16 : o.fade;
    a.reset();
    a.setLoop(o.loop === false ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
    a.clampWhenFinished = o.loop === false;
    if (o.at) a.time = o.at * clip.duration;
    a.setEffectiveWeight(1);
    if (this.cur && this.cur !== a) { a.play(); this.cur.crossFadeTo(a, fade, false); } else { a.fadeIn(fade).play(); }
    this.cur = a; this.curName = n;
    return a;
  };
  Rig.prototype.update = function (dt) { this.mixer.update(dt); };
  Rig.prototype.setFlash = function (v) { for (const m of this.mats) m.uniforms.uFlash.value = v; };
  // Bolt obj to a bone. `place` gives the object's transform in the rig's model space, in metres
  // (origin at the feet, +z forward), measured in the current pose.
  Rig.prototype.attach = function (boneName, obj, place) {
    const bone = this.bone(boneName); if (!bone) return null;
    this.root.updateMatrixWorld(true);
    const parentW = this.root.parent ? this.root.parent.matrixWorld : new THREE.Matrix4();
    const rootNoScale = new THREE.Matrix4().compose(this.root.position, this.root.quaternion, new THREE.Vector3(1, 1, 1));
    const W = parentW.clone().multiply(rootNoScale).multiply(place);
    const local = bone.matrixWorld.clone().invert().multiply(W);
    local.decompose(obj.position, obj.quaternion, obj.scale);
    bone.add(obj);
    return obj;
  };
  // world position of a bone, expressed in the rig's model space (metres)
  Rig.prototype.boneModel = function (boneName) {
    const bone = this.bone(boneName); if (!bone) return new THREE.Vector3();
    this.root.updateMatrixWorld(true);
    const p = bone.getWorldPosition(new THREE.Vector3());
    const parentW = this.root.parent ? this.root.parent.matrixWorld : new THREE.Matrix4();
    const rootNoScale = new THREE.Matrix4().compose(this.root.position, this.root.quaternion, new THREE.Vector3(1, 1, 1));
    return p.applyMatrix4(parentW.clone().multiply(rootNoScale).invert());
  };
  // find the moment of fastest motion of a bone in a clip (used to line up hit frames)
  Rig.prototype.peakFraction = function (clipName, boneName) {
    const clip = this.clips[clipName]; if (!clip) return 0.4;
    const a = this.mixer.clipAction(clip), prevCur = this.cur;
    const N = 40; let best = 0.4, bestV = 0, prev = null;
    a.reset(); a.setEffectiveWeight(1); a.play();
    const others = Object.values(this.actions).filter(x => x !== a && x.isRunning());
    others.forEach(x => x.setEffectiveWeight(0));
    for (let i = 0; i <= N; i++) {
      a.time = clip.duration * i / N; this.mixer.update(0);
      const p = this.boneModel(boneName);
      if (prev && i > 2 && i < N - 2) { const v = p.distanceTo(prev); if (v > bestV) { bestV = v; best = i / N; } }
      prev = p;
    }
    a.stop(); others.forEach(x => x.setEffectiveWeight(1)); this.cur = prevCur;
    return best;
  };
  GW.Rig = Rig;
})();
