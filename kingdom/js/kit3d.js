/* Small shared toolkit for the Three.js mini-games (Pin Rescue, Gate Rush). */
(function () {
  'use strict';
  const { clamp } = GH;
  const cache = {};

  const K3 = {
    lam(c) { return cache['l' + c] || (cache['l' + c] = new THREE.MeshLambertMaterial({ color: c })); },
    basic(c) { return cache['b' + c] || (cache['b' + c] = new THREE.MeshBasicMaterial({ color: c })); },
    std(c, o = {}) {
      const key = 's' + c + JSON.stringify(o);
      return cache[key] || (cache[key] = new THREE.MeshStandardMaterial(Object.assign({ color: c, roughness: 0.55, metalness: 0 }, o)));
    },
    geo: {
      get box() { return cache.gbox || (cache.gbox = new THREE.BoxGeometry(1, 1, 1)); },
      get sphere() { return cache.gsph || (cache.gsph = new THREE.SphereGeometry(0.5, 12, 9)); },
      get cyl() { return cache.gcyl || (cache.gcyl = new THREE.CylinderGeometry(0.5, 0.5, 1, 12)); },
      get capsule() { return cache.gcap || (cache.gcap = new THREE.CapsuleGeometry(0.3, 0.45, 4, 10)); },
    },

    mesh(geo, mat, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1) {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.scale.set(sx, sy, sz);
      m.castShadow = true;
      return m;
    },
    box(w, h, d, mat, x = 0, y = 0, z = 0) { return this.mesh(this.geo.box, mat, x, y, z, w, h, d); },

    /** Full-bleed overlay inside the game screen; hides the shell's 2D canvas while alive. */
    layer(html = '') {
      const el = document.createElement('div');
      el.className = 'fs-layer';
      el.innerHTML = html;
      document.getElementById('canvas-wrap').appendChild(el);
      const c2d = document.getElementById('game-canvas');
      c2d.style.visibility = 'hidden';
      return { el, destroy() { el.remove(); c2d.style.visibility = ''; } };
    },

    renderer(el, shadows = true) {
      const r = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
      r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      r.shadowMap.enabled = shadows;
      r.shadowMap.type = THREE.PCFSoftShadowMap;
      el.prepend(r.domElement);
      return r;
    },

    /** Size renderer to its layer and pick a FOV that shows `halfW` world units either side at distance `dist`. */
    fit(renderer, camera, el, halfW, dist, minF = 35, maxF = 80) {
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) return;
      renderer.setSize(r.width, r.height, false);
      renderer.domElement.style.width = '100%';
      renderer.domElement.style.height = '100%';
      camera.aspect = r.width / r.height;
      camera.fov = clamp((2 * Math.atan(halfW / dist / camera.aspect) * 180) / Math.PI, minF, maxF);
      camera.updateProjectionMatrix();
    },

    canvasTex(w, h) {
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      return { canvas, ctx: canvas.getContext('2d'), tex };
    },

    person(body, hood, skin = '#ffd2a6') {
      const g = new THREE.Group();
      const legL = this.box(0.16, 0.36, 0.18, this.lam('#3a3d48'), -0.14, 0.18, 0);
      const legR = this.box(0.16, 0.36, 0.18, this.lam('#3a3d48'), 0.14, 0.18, 0);
      g.add(legL, legR);
      g.add(this.mesh(this.geo.capsule, this.lam(body), 0, 0.72, 0));
      g.add(this.mesh(this.geo.sphere, this.lam(skin), 0, 1.33, 0, 0.54, 0.54, 0.54));
      if (hood) g.add(this.mesh(this.geo.sphere, this.lam(hood), 0, 1.42, -0.04, 0.6, 0.4, 0.6));
      g.userData.legs = [legL, legR];
      return g;
    },
    animLegs(g, phase, moving) {
      const a = moving ? Math.sin(phase) * 0.6 : 0;
      g.userData.legs[0].rotation.x = a;
      g.userData.legs[1].rotation.x = -a;
    },

    /** Project a world point to CSS pixels inside `el`. */
    toScreen(v, camera, el) {
      const p = v.clone().project(camera);
      const r = el.getBoundingClientRect();
      return { x: ((p.x + 1) / 2) * r.width, y: ((1 - p.y) / 2) * r.height, behind: p.z > 1 };
    },
  };

  GH.K3 = K3;
})();
