/* Glyphmoor: renderer, world and models.
   The 3D scene is drawn small, then rebuilt on screen out of text glyphs.
   Grass and fireflies are drawn at full resolution on top, depth-tested against the scene. */
(function () {
  'use strict';
  const T = THREE;
  T.ColorManagement.enabled = false;

  // ---------- terrain (kept in sync with the GLSL copy below) ----------
  const RIDGE = { x: 62, z: -10 }, LAKE = { x: -6, z: -44 };
  const sst = (t) => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };
  function H(x, z) {
    let h = 3.4 + 1.6 * Math.sin(x * 0.045 + 1.3) * Math.cos(z * 0.05) + 0.9 * Math.sin(x * 0.11 + z * 0.07) + 0.35 * Math.sin(x * 0.31 - z * 0.27);
    h += 15 * sst(1 - Math.hypot(x - RIDGE.x, z - RIDGE.z) / 40);
    h -= 8.5 * sst(1 - Math.hypot(x - LAKE.x, z - LAKE.z) / 30);
    return h;
  }
  const GLSL_H = `
    float sst(float t){ t = clamp(t, 0., 1.); return t*t*(3.-2.*t); }
    float H(vec2 p){
      float h = 3.4 + 1.6*sin(p.x*.045+1.3)*cos(p.y*.05) + .9*sin(p.x*.11+p.y*.07) + .35*sin(p.x*.31-p.y*.27);
      h += 15.*sst(1.-length(p-vec2(${RIDGE.x}.,${RIDGE.z}.))/40.);
      h -= 8.5*sst(1.-length(p-vec2(${LAKE.x}.,${LAKE.z}.))/30.);
      return h;
    }`;

  const COL = {
    zenith: new T.Color(0x0b0720), horizon: new T.Color(0x3a2250), fog: new T.Color(0x2c1c44),
    ground: new T.Color(0x6a4420), sand: new T.Color(0x6b5a48), rock: new T.Color(0x3d3a4a),
  };
  const MOON = new T.Vector3(0.08, 0.31, -0.95).normalize();

  const W = { H, RIDGE, LAKE, MOON, time: 0, ripple: new T.Vector3(0, 0, 0) };
  let renderer, scene, camera, rtScene, rtRefl, postScene, postCam, postMat, grass, flies, water, sky, moonLight, depthMat;
  const reflCam = new T.PerspectiveCamera();
  const clipPlane = [new T.Plane(new T.Vector3(0, 1, 0), -0.03)];
  const focus = new T.Vector3(), camTarget = new T.Vector3();

  // ---------- glyph atlas ----------
  const RAMPS = [" .·:;~+=cox#%@", " .':-~+*eaO8&M", " ,`;^<|zsdQ$WB"];
  function makeAtlas() {
    const n = RAMPS[0].length, cw = 20, ch = 32;
    const c = document.createElement('canvas');
    c.width = n * cw; c.height = RAMPS.length * ch;
    const g = c.getContext('2d');
    g.fillStyle = '#000'; g.fillRect(0, 0, c.width, c.height);
    g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = 'bold 27px "Courier New", "DejaVu Sans Mono", Menlo, Consolas, monospace';
    RAMPS.forEach((r, j) => { for (let i = 0; i < n; i++) g.fillText(r[i], i * cw + cw / 2, j * ch + ch / 2 + 1); });
    const t = new T.CanvasTexture(c);
    t.minFilter = t.magFilter = T.LinearFilter; t.generateMipmaps = false;
    return { tex: t, n, rows: RAMPS.length };
  }

  // ---------- init ----------
  W.init = function (canvas) {
    renderer = new T.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    renderer.outputColorSpace = T.LinearSRGBColorSpace;
    renderer.autoClear = false;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.autoUpdate = false;
    renderer.setClearColor(0x000000, 1);

    scene = new T.Scene();
    scene.fog = new T.Fog(COL.fog, 45, 170);
    camera = new T.PerspectiveCamera(42, 1, 0.5, 700);
    camera.layers.enable(2);
    W.scene = scene; W.camera = camera; W.renderer = renderer;

    scene.add(new T.HemisphereLight(0xb0a8e8, 0x5a4638, 1.25));
    moonLight = new T.DirectionalLight(0xfff0d0, 1.5);
    moonLight.castShadow = true;
    moonLight.shadow.mapSize.set(1024, 1024);
    const sc = moonLight.shadow.camera;
    sc.left = -14; sc.right = 14; sc.top = 14; sc.bottom = -14; sc.near = 1; sc.far = 90;
    moonLight.shadow.bias = -0.002; moonLight.shadow.normalBias = 0.04;
    scene.add(moonLight, moonLight.target);
    const key = new T.DirectionalLight(0xd0d8ff, 1.0);
    key.position.set(-0.4, 0.8, 1); scene.add(key);

    depthMat = new T.MeshBasicMaterial({ colorWrite: false });
    buildSky(); buildTerrain(); buildWater(); buildGrass(); buildFlies(); buildPost();
    W.resize();
    window.addEventListener('resize', W.resize);
    return W;
  };

  function buildPost() {
    const atlas = makeAtlas();
    postScene = new T.Scene();
    postCam = new T.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    postMat = new T.ShaderMaterial({
      depthTest: false, depthWrite: false,
      uniforms: { tScene: { value: null }, tAtlas: { value: atlas.tex }, grid: { value: new T.Vector2(1, 1) }, nG: { value: atlas.n }, nR: { value: atlas.rows }, uT: { value: 0 }, uFlash: { value: 0 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }',
      fragmentShader: `
        precision highp float;
        uniform sampler2D tScene, tAtlas; uniform vec2 grid; uniform float nG, nR, uT, uFlash; varying vec2 vUv;
        float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        void main(){
          vec2 g = vUv * grid, cell = floor(g), f = fract(g);
          vec3 c = texture2D(tScene, (cell + .5) / grid).rgb;
          float l = max(dot(c, vec3(.3, .55, .15)), max(c.r, max(c.g, c.b)) * .8);
          float lv = clamp(1. - exp(-l * 2.6), 0., .999);
          float idx = floor(lv * nG);
          float row = floor(hash(cell + floor(uT * .7) * .0) * nR);
          float m = texture2D(tAtlas, vec2((idx + f.x) / nG, (row + f.y) / nR)).r;
          vec3 hue = c / max(l, .02);
          vec3 ink = hue * (.5 + .95 * lv);
          vec3 col = c * .36 + ink * m;
          vec2 v = vUv - .5;
          col *= 1. - dot(v, v) * .4;
          col += vec3(.9, .2, .12) * uFlash * dot(v, v) * 1.6;
          gl_FragColor = vec4(col, 1.);
        }`,
    });
    const q = new T.Mesh(new T.PlaneGeometry(2, 2), postMat);
    q.frustumCulled = false; postScene.add(q);
    W.post = postMat;
  }

  W.resize = function () {
    const w = window.innerWidth, h = window.innerHeight, pr = Math.min(window.devicePixelRatio || 1, 2);
    renderer.setPixelRatio(pr); renderer.setSize(w, h, false);
    const chh = Math.max(7, Math.min(11, h / 112)), cww = chh * 0.6;
    const cols = Math.ceil(w / cww), rows = Math.ceil(h / chh);
    postMat.uniforms.grid.value.set(w / cww, h / chh);
    if (rtScene) { rtScene.dispose(); rtRefl.dispose(); }
    rtScene = new T.WebGLRenderTarget(cols * 2, rows * 2, { minFilter: T.LinearFilter, magFilter: T.LinearFilter });
    rtRefl = new T.WebGLRenderTarget(cols, rows, { minFilter: T.LinearFilter, magFilter: T.LinearFilter });
    postMat.uniforms.tScene.value = rtScene.texture;
    water.material.uniforms.tRefl.value = rtRefl.texture;
    camera.aspect = w / h;
    camera.fov = w < h ? 50 : 40;
    camera.updateProjectionMatrix();
    W.portrait = w < h;
  };

  // ---------- sky ----------
  function buildSky() {
    sky = new T.Mesh(new T.SphereGeometry(500, 32, 20), new T.ShaderMaterial({
      side: T.BackSide, depthWrite: false, fog: false,
      uniforms: { uT: { value: 0 }, uMoon: { value: MOON }, cZ: { value: COL.zenith }, cH: { value: COL.horizon } },
      vertexShader: 'varying vec3 vD; void main(){ vD = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }',
      fragmentShader: `
        precision highp float;
        uniform float uT; uniform vec3 uMoon, cZ, cH; varying vec3 vD;
        float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.-2.*f);
          return mix(mix(hash(i), hash(i+vec2(1,0)), f.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), f.x), f.y); }
        float fbm(vec2 p){ float a = .5, s = 0.; for(int i = 0; i < 5; i++){ s += a*noise(p); p = p*2.03 + 7.1; a *= .5; } return s; }
        void main(){
          vec3 d = normalize(vD);
          float y = d.y;
          vec3 col = mix(cH, cZ, smoothstep(-.05, .55, y));
          vec2 sg = d.xz / (abs(y) + .4) * 46.;
          float st = hash(floor(sg));
          col += vec3(.9, .85, 1.) * step(.988, st) * (.5 + .5*sin(uT*2. + st*90.)) * smoothstep(.0, .3, y);
          float m = dot(d, uMoon);
          vec3 up = normalize(cross(uMoon, vec3(1,0,0))), rt = cross(up, uMoon);
          vec2 mp = vec2(dot(d, rt), dot(d, up)) / .12;
          float disc = smoothstep(1., .93, length(mp)) * step(0., m);
          float crater = fbm(mp*2.6 + 3.) * .55 + fbm(mp*7.) * .25;
          vec3 moon = vec3(1., .93, .74) * (.55 + .65*crater) * (1. - .35*dot(mp, mp));
          col += vec3(1., .8, .55) * (pow(max(m, 0.), 90.) * .32 + pow(max(m, 0.), 900.) * .5);
          col = mix(col, moon, disc);
          vec2 q = vec2(atan(d.x, -d.z) * 2.6 + uT*.006, y * 8.5);
          float f = fbm(q) * .75 + fbm(q * 2.7 + 4.) * .25;
          col *= .55 + .9 * fbm(q * .6 + 9.);
          float c = smoothstep(.5, .72, f) * smoothstep(-.03, .06, y);
          float lit = .16 + 1.1*pow(max(m, 0.), 8.) + .45*smoothstep(.62, .92, f);
          col = mix(col, vec3(.72, .66, .86) * lit, c * .8);
          gl_FragColor = vec4(col, 1.);
        }`,
    }));
    sky.frustumCulled = false; sky.renderOrder = -10;
    scene.add(sky);
  }

  // ---------- terrain ----------
  function buildTerrain() {
    const N = 220, S = 440, g = new T.PlaneGeometry(S, S, N, N);
    g.rotateX(-Math.PI / 2);
    const p = g.attributes.position, col = new Float32Array(p.count * 3), c = new T.Color();
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i), h = H(x, z);
      p.setY(i, h);
      const sl = Math.hypot(H(x + 1, z) - h, H(x, z + 1) - h);
      c.copy(COL.ground);
      c.lerp(COL.sand, sst(1 - h / 0.9));
      c.lerp(COL.rock, sst((sl - 0.42) / 0.2) * 0.8);
      const n = 0.82 + 0.3 * Math.sin(x * 0.7) * Math.sin(z * 0.9);
      col[i * 3] = c.r * n; col[i * 3 + 1] = c.g * n; col[i * 3 + 2] = c.b * n;
    }
    g.setAttribute('color', new T.BufferAttribute(col, 3));
    g.computeVertexNormals();
    const m = new T.Mesh(g, new T.MeshLambertMaterial({ vertexColors: true }));
    m.receiveShadow = true;
    scene.add(m);
  }

  // ---------- water ----------
  function buildWater() {
    water = new T.Mesh(new T.PlaneGeometry(90, 90).rotateX(-Math.PI / 2), new T.ShaderMaterial({
      uniforms: { tRefl: { value: null }, uT: { value: 0 }, uRip: { value: W.ripple }, uRipP: { value: new T.Vector2() } },
      vertexShader: 'varying vec4 vC; varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.); vW = w.xyz; vC = projectionMatrix * viewMatrix * w; gl_Position = vC; }',
      fragmentShader: `
        precision highp float;
        uniform sampler2D tRefl; uniform float uT; uniform vec3 uRip; varying vec4 vC; varying vec3 vW;
        ${GLSL_H}
        void main(){
          vec2 uv = vC.xy / vC.w * .5 + .5;
          float r1 = sin(vW.x*1.3 + uT*1.1) + sin(vW.z*1.7 - uT*.9 + vW.x*.4);
          float rd = length(vW.xz - uRip.xy);
          float ring = sin(rd*7. - uT*6.) * exp(-rd*.7) * uRip.z;
          vec2 ruv = vec2(uv.x + r1*.004 + ring*.02, 1. - uv.y + sin(vW.z*2.3 + uT*1.3)*.007 + ring*.02);
          vec3 refl = texture2D(tRefl, ruv).rgb;
          vec3 V = normalize(cameraPosition - vW);
          float fres = .4 + .6*pow(1. - max(V.y, 0.), 2.);
          vec3 col = vec3(.012, .04, .058) + refl * refl * fres * 1.5;
          float sh = H(vW.xz);
          float foam = smoothstep(-.3, -.02, sh) * (.55 + .45*sin(sh*30. + uT*2. + vW.x*2.));
          col += vec3(.5, .55, .62) * foam * .5 + vec3(.6, .7, .8) * max(ring, 0.) * .5;
          gl_FragColor = vec4(col, 1.);
        }`,
    }));
    water.position.set(LAKE.x, 0, LAKE.z);
    scene.add(water);
  }

  // ---------- grass ----------
  const PATCH = 46;
  function buildGrass() {
    const count = Math.min(window.innerWidth, window.innerHeight) < 700 ? 70000 : 110000;
    const g = new T.InstancedBufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute([-0.5, 0, 0, 0.5, 0, 0, -0.5, 0.5, 0, 0.5, 0.5, 0, 0, 1, 0], 3));
    g.setIndex([0, 1, 2, 2, 1, 3, 2, 3, 4]);
    const off = new Float32Array(count * 4);
    for (let i = 0; i < count; i++) { off[i * 4] = Math.random() * PATCH; off[i * 4 + 1] = Math.random() * PATCH; off[i * 4 + 2] = Math.random(); off[i * 4 + 3] = Math.random(); }
    g.setAttribute('aOff', new T.InstancedBufferAttribute(off, 4));
    g.instanceCount = count;
    grass = new T.Mesh(g, new T.ShaderMaterial({
      side: T.DoubleSide,
      uniforms: { uT: { value: 0 }, uP: { value: new T.Vector3() }, uC: { value: new T.Vector3() }, uRight: { value: new T.Vector3(1, 0, 0) }, uFog: { value: COL.fog }, uSh: { value: new T.Vector2(MOON.x, MOON.z).normalize().multiplyScalar(-1) } },
      vertexShader: `
        precision highp float;
        attribute vec4 aOff; uniform float uT; uniform vec3 uP, uC, uRight; uniform vec2 uSh;
        varying vec3 vCol; varying float vFog;
        ${GLSL_H}
        void main(){
          const float S = ${PATCH}.;
          vec2 w = mod(aOff.xy - uC.xz, S) - S*.5 + uC.xz;
          float h = H(w);
          float edge = 1. - smoothstep(S*.36, S*.5, length(w - uC.xz));
          float hgt = (.42 + .6*aOff.z) * edge * smoothstep(.2, 1.1, h) * .95;
          float t = position.y;
          float gust = sin(uT*.55 + w.x*.07 - w.y*.05) * .5 + .5;
          vec2 bend = vec2(.85, .5) * (sin(uT*1.8 + w.x*.33 + w.y*.27 + aOff.w*6.28) * .13 + .3*gust + .05);
          bend += (vec2(aOff.w, fract(aOff.w*7.3)) - .5) * .7;
          vec2 d = w - uP.xz; float dl = length(d);
          float push = (1. - smoothstep(.25, 1.25, dl)) * step(abs(h - uP.y), 1.6);
          bend += d / (dl + .001) * push * .9;
          hgt *= 1. - push * .4;
          vec3 pos = vec3(w.x, h, w.y);
          pos.xz += bend * t * t * hgt;
          pos.y += t * hgt * (1. - .25*length(bend)*t);
          pos += uRight * position.x * .05 * (1. - t*.8);
          vec4 mv = viewMatrix * vec4(pos, 1.);
          gl_Position = projectionMatrix * mv;
          float ptc = sin(w.x*.19 + 1.)*sin(w.y*.16) * .5 + .5;
          vec3 base = mix(vec3(.26, .13, .05), vec3(.28, .10, .10), ptc);
          vec3 tip = mix(vec3(1., .74, .26), vec3(.92, .44, .18), ptc*.8);
          tip = mix(tip, vec3(.62, .66, .30), smoothstep(.55, .9, sin(w.x*.045 - w.y*.06)*.5 + .5)*.5);
          vec3 c = mix(base, tip, pow(t, 1.4)) * (.72 + .5*aOff.z);
          float bloom = step(.972, aOff.w) * smoothstep(.75, 1., t);
          c = mix(c, vec3(.86, .76, 1.), bloom);
          float cl = .78 + .26*sin(w.x*.05 + uT*.09)*sin(w.y*.06 - uT*.06) + gust*.14*t;
          vec2 sd = d - uSh*1.1; float along = dot(sd, uSh), across = length(sd - uSh*along);
          float shade = (1. - smoothstep(.3, 1.5, length(vec2(along*.55, across)))) * step(abs(h - uP.y), 1.6);
          c *= cl * (1. - shade*.72);
          vCol = c; vFog = smoothstep(45., 170., -mv.z);
        }`,
      fragmentShader: 'precision highp float; uniform vec3 uFog; varying vec3 vCol; varying float vFog; void main(){ gl_FragColor = vec4(mix(vCol, uFog, vFog), 1.); }',
    }));
    grass.frustumCulled = false; grass.layers.set(1);
    scene.add(grass);
  }

  function buildFlies() {
    const n = 150, g = new T.BufferGeometry(), a = new Float32Array(n * 3);
    for (let i = 0; i < n * 3; i++) a[i] = Math.random();
    g.setAttribute('position', new T.BufferAttribute(a, 3));
    flies = new T.Points(g, new T.ShaderMaterial({
      transparent: true, depthWrite: false, blending: T.AdditiveBlending,
      uniforms: { uT: { value: 0 }, uC: { value: new T.Vector3() }, uPx: { value: 1 } },
      vertexShader: `
        precision highp float; uniform float uT, uPx; uniform vec3 uC; varying float vA;
        ${GLSL_H}
        void main(){
          const float S = 56.;
          vec2 w = mod(position.xz*S - uC.xz, S) - S*.5 + uC.xz;
          w += vec2(sin(uT*.4 + position.y*40.), cos(uT*.33 + position.x*40.)) * 1.2;
          float h = max(H(w), 0.) + .5 + position.y*2.2 + sin(uT*.8 + position.x*30.)*.3;
          vec4 mv = viewMatrix * vec4(w.x, h, w.y, 1.);
          gl_Position = projectionMatrix * mv;
          vA = (.35 + .65*sin(uT*1.6 + position.z*50.)) * (1. - smoothstep(S*.36, S*.5, length(w - uC.xz)));
          gl_PointSize = uPx * (5. + 4.*position.y) / -mv.z;
        }`,
      fragmentShader: 'precision highp float; varying float vA; void main(){ float d = length(gl_PointCoord - .5); float a = smoothstep(.5, .0, d); gl_FragColor = vec4(vec3(1., .78, .42) * a * a * max(vA, 0.) * 1.2, 1.); }',
    }));
    flies.frustumCulled = false; flies.layers.set(1);
    scene.add(flies);
  }

  // ---------- frame ----------
  let camPitch = 0.9, camDist = 11;
  W.cam = { pitch: 0.9, dist: 9.5, ahead: 0, shake: 0 };
  W.render = function (dt, player) {
    W.time += dt;
    const t = W.time;
    if (W.cam.snap) { camPitch = W.cam.pitch; camDist = W.cam.dist; focus.set(player.x, player.y + 1.1 + W.cam.ahead * 0.25, player.z - W.cam.ahead); W.cam.snap = false; }
    camPitch += (W.cam.pitch - camPitch) * Math.min(1, dt * 2.2);
    camDist += (W.cam.dist - camDist) * Math.min(1, dt * 2.2);
    focus.lerp(camTarget.set(player.x, player.y + 1.1 + W.cam.ahead * 0.25, player.z - W.cam.ahead), Math.min(1, dt * 6));
    const sh = W.cam.shake; W.cam.shake = Math.max(0, sh - dt * 3);
    camera.position.set(focus.x + (Math.random() - 0.5) * sh * 0.5, focus.y + Math.sin(camPitch) * camDist + (Math.random() - 0.5) * sh * 0.5, focus.z + Math.cos(camPitch) * camDist);
    camera.lookAt(focus);
    camera.updateMatrixWorld();

    sky.position.copy(camera.position);
    sky.material.uniforms.uT.value = t;
    water.material.uniforms.uT.value = t;
    postMat.uniforms.uT.value = t;
    const gu = grass.material.uniforms;
    gu.uT.value = t; gu.uP.value.set(player.x, player.y, player.z); gu.uC.value.copy(focus);
    gu.uRight.value.setFromMatrixColumn(camera.matrixWorld, 0);
    flies.material.uniforms.uT.value = t; flies.material.uniforms.uC.value.copy(focus);
    flies.material.uniforms.uPx.value = renderer.domElement.height * 0.06;
    moonLight.target.position.set(player.x, player.y, player.z);
    moonLight.position.copy(moonLight.target.position).addScaledVector(MOON, 45);

    // 1. mirrored view for the lake
    camera.layers.set(0);
    const nearLake = Math.hypot(player.x - LAKE.x, player.z - LAKE.z) < 75;
    renderer.shadowMap.needsUpdate = true;
    if (nearLake) {
      reflCam.copy(camera);
      reflCam.position.set(camera.position.x, -camera.position.y, camera.position.z);
      reflCam.up.set(0, 1, 0);
      reflCam.lookAt(focus.x, -focus.y, focus.z);
      reflCam.updateMatrixWorld();
      water.visible = false;
      renderer.clippingPlanes = clipPlane;
      renderer.setRenderTarget(rtRefl); renderer.clear(); renderer.render(scene, reflCam);
      renderer.clippingPlanes = [];
      water.visible = true;
    }
    // 2. scene, small
    camera.layers.enable(2);
    renderer.setRenderTarget(rtScene); renderer.clear(); renderer.render(scene, camera);
    // 3. screen: depth only, glyphs, then grass
    renderer.setRenderTarget(null); renderer.clear();
    camera.layers.set(0);
    scene.overrideMaterial = depthMat; sky.visible = false;
    renderer.render(scene, camera);
    scene.overrideMaterial = null; sky.visible = true;
    renderer.render(postScene, postCam);
    camera.layers.set(1);
    renderer.render(scene, camera);
    camera.layers.set(0); camera.layers.enable(2);
  };

  W.thinGrass = function () { grass.geometry.instanceCount = Math.floor(grass.geometry.instanceCount * 0.5); };
  const v3 = new T.Vector3();
  W.project = function (x, y, z) {
    v3.set(x, y, z).project(camera);
    return { x: (v3.x * 0.5 + 0.5) * window.innerWidth, y: (-v3.y * 0.5 + 0.5) * window.innerHeight, on: v3.z < 1 && Math.abs(v3.x) < 1.1 && Math.abs(v3.y) < 1.1 };
  };

  // =====================================================================
  //  Models: everything is built by hand from lathed and primitive parts.
  // =====================================================================
  const phong = (c, sh, extra) => new T.MeshPhongMaterial(Object.assign({ color: c, shininess: sh, specular: 0x8890a8 }, extra));
  const lamb = (c, extra) => new T.MeshLambertMaterial(Object.assign({ color: c }, extra));
  function add(parent, geo, mat, x, y, z, rx, ry, rz) {
    const m = new T.Mesh(geo, mat);
    m.position.set(x || 0, y || 0, z || 0); m.rotation.set(rx || 0, ry || 0, rz || 0);
    m.castShadow = true; parent.add(m); return m;
  }
  function J(parent, x, y, z) { const g = new T.Group(); g.position.set(x, y, z); parent.add(g); return g; }
  const lathe = (pts, seg) => new T.LatheGeometry(pts.map((p) => new T.Vector2(p[0], p[1])), seg || 16);
  const cyl = (r1, r2, h, seg) => new T.CylinderGeometry(r1, r2, h, seg || 12).translate(0, -h / 2, 0); // hangs down from its origin

  const KNIGHT_PAL = {
    knight: { steel: 0xd4dcea, dark: 0x59627a, mail: 0x353b4c, trim: 0xe0a94a, cloth: 0x6a70f0, leather: 0x4a2f20 },
    angler: { steel: 0x9a7b52, dark: 0x5a4632, mail: 0x6f7a5c, trim: 0xd8c690, cloth: 0x8a3b2a, leather: 0x3a2a1c },
  };

  W.makeKnight = function (kind) {
    const P = KNIGHT_PAL[kind || 'knight'], angler = kind === 'angler';
    const m = { steel: phong(P.steel, 80), dark: phong(P.dark, 40), mail: lamb(P.mail), trim: phong(P.trim, 60, { specular: 0xffe0a0 }), cloth: lamb(P.cloth, { side: T.DoubleSide }), leather: lamb(P.leather), slit: new T.MeshBasicMaterial({ color: 0x05050a }) };
    const root = new T.Group(), j = {};
    j.hips = J(root, 0, 0.98, 0);
    // fauld, belt and tassets
    add(j.hips, lathe([[0.2, 0.13], [0.235, 0.02], [0.265, -0.13], [0.245, -0.15]]), m.dark).scale.z = 0.82;
    add(j.hips, new T.TorusGeometry(0.215, 0.025, 6, 18), m.leather, 0, 0.1, 0, Math.PI / 2).scale.y = 0.82;
    add(j.hips, new T.BoxGeometry(0.07, 0.07, 0.03), m.trim, 0, 0.1, 0.185);
    for (const s of [-1, 1]) {
      add(j.hips, new T.BoxGeometry(0.15, 0.24, 0.03), m.steel, s * 0.115, -0.2, 0.17, -0.12, 0, s * 0.06);
      add(j.hips, new T.BoxGeometry(0.13, 0.2, 0.03), m.steel, s * 0.2, -0.19, -0.02, 0, s * 1.35, s * 0.1);
    }
    // cuirass
    j.spine = J(j.hips, 0, 0.1, 0);
    const cu = add(j.spine, lathe([[0.2, 0], [0.215, 0.08], [0.255, 0.22], [0.27, 0.33], [0.24, 0.43], [0.15, 0.49], [0.1, 0.51]], 18), m.steel);
    cu.scale.z = 0.8;
    add(j.spine, new T.BoxGeometry(0.03, 0.34, 0.03), m.trim, 0, 0.26, 0.2, -0.1);
    add(j.spine, new T.TorusGeometry(0.2, 0.018, 6, 18), m.trim, 0, 0.03, 0, Math.PI / 2).scale.y = 0.8;
    add(j.spine, lathe([[0.1, 0.49], [0.135, 0.5], [0.125, 0.57], [0.095, 0.58]]), m.dark);
    // head
    j.head = J(j.spine, 0, 0.61, 0);
    if (angler) {
      add(j.head, new T.SphereGeometry(0.115, 12, 10), lamb(0xc9a27c), 0, 0.09, 0);
      add(j.head, new T.ConeGeometry(0.34, 0.16, 14), m.trim, 0, 0.23, 0);
      add(j.head, lathe([[0.12, 0.1], [0.135, 0.0], [0.15, -0.08]]), m.cloth);
    } else {
      add(j.head, lathe([[0.001, 0.34], [0.06, 0.325], [0.105, 0.28], [0.13, 0.19], [0.136, 0.06], [0.126, -0.03], [0.108, -0.07]], 18), m.steel);
      add(j.head, new T.BoxGeometry(0.2, 0.024, 0.03), m.slit, 0, 0.145, 0.118);
      add(j.head, new T.BoxGeometry(0.022, 0.2, 0.03), m.trim, 0, 0.1, 0.132);
      for (const s of [-1, 1]) for (let i = 0; i < 3; i++) add(j.head, new T.BoxGeometry(0.008, 0.045, 0.02), m.slit, s * (0.04 + i * 0.022), 0.04, 0.125 - i * 0.004);
      add(j.head, new T.BoxGeometry(0.022, 0.07, 0.3), m.trim, 0, 0.31, -0.02);
      const plume = add(j.head, new T.ConeGeometry(0.07, 0.5, 8), m.cloth, 0, 0.36, -0.2, -2.0);
      plume.scale.x = 0.45;
      add(j.head, new T.TorusGeometry(0.13, 0.012, 6, 18), m.trim, 0, -0.035, 0, Math.PI / 2);
    }
    // arms
    for (const s of [-1, 1]) {
      const side = s < 0 ? 'R' : 'L';
      const sh = j['sh' + side] = J(j.spine, s * 0.29, 0.42, 0);
      const half = new T.SphereGeometry(0.135, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2);
      add(sh, half, m.steel, s * 0.02, 0.0, 0, 0, 0, -s * 0.35).scale.set(1.15, 0.85, 1.15);
      add(sh, half, m.dark, s * 0.045, -0.06, 0, 0, 0, -s * 0.5).scale.set(1.0, 0.7, 1.0);
      add(sh, new T.TorusGeometry(0.15, 0.012, 6, 16), m.trim, s * 0.02, 0.0, 0, Math.PI / 2, s * 0.35, 0);
      add(sh, cyl(0.058, 0.052, 0.3), m.mail);
      add(sh, cyl(0.07, 0.064, 0.15), m.steel, 0, -0.1, 0);
      const el = j['el' + side] = J(sh, 0, -0.3, 0);
      add(el, new T.SphereGeometry(0.072, 10, 8), m.steel);
      add(el, new T.ConeGeometry(0.04, 0.09, 6), m.steel, 0, 0, -0.07, -Math.PI / 2);
      add(el, cyl(0.066, 0.05, 0.25), m.steel, 0, -0.03, 0);
      add(el, new T.TorusGeometry(0.055, 0.01, 6, 12), m.trim, 0, -0.26, 0, Math.PI / 2);
      const hand = j['hand' + side] = J(el, 0, -0.29, 0);
      add(hand, cyl(0.07, 0.05, 0.07, 8), m.dark, 0, 0.04, 0);
      add(hand, new T.BoxGeometry(0.085, 0.1, 0.1), m.steel, 0, -0.05, 0.005);
    }
    // legs
    for (const s of [-1, 1]) {
      const side = s < 0 ? 'R' : 'L';
      const hp = j['hip' + side] = J(j.hips, s * 0.11, -0.06, 0);
      add(hp, cyl(0.1, 0.078, 0.42), m.steel);
      add(hp, cyl(0.104, 0.098, 0.06), m.trim, 0, -0.05, 0);
      const kn = j['knee' + side] = J(hp, 0, -0.44, 0);
      add(kn, new T.SphereGeometry(0.088, 10, 8), m.steel, 0, 0, 0.01);
      add(kn, new T.BoxGeometry(0.03, 0.1, 0.05), m.trim, 0, 0, 0.09);
      add(kn, cyl(0.074, 0.056, 0.4), m.steel, 0, -0.04, 0);
      add(kn, new T.BoxGeometry(0.02, 0.3, 0.03), m.dark, 0, -0.22, 0.06);
      const ft = j['foot' + side] = J(kn, 0, -0.44, 0);
      add(ft, new T.BoxGeometry(0.1, 0.085, 0.2), m.steel, 0, -0.045, 0.04);
      add(ft, new T.ConeGeometry(0.05, 0.13, 4), m.steel, 0, -0.06, 0.2, Math.PI / 2, Math.PI / 4, 0).scale.set(1, 1, 0.75);
    }
    // cape (cloth is moved by hand every frame)
    const cg = new T.PlaneGeometry(0.62, 1.08, 4, 9); cg.translate(0, -0.54, 0);
    const cape = add(j.spine, cg, m.cloth, 0, 0.5, -0.19);
    cape.userData.rest = cg.attributes.position.array.slice();
    cape.visible = !angler;
    // sword
    const sword = J(j.handR, 0, -0.06, 0.02); sword.rotation.x = 1.9;
    const bladeMat = phong(0xe6ecf6, 120, { emissive: 0x000000 });
    const blade = add(sword, new T.BoxGeometry(0.052, 0.86, 0.014), bladeMat, 0, 0.53, 0);
    add(sword, new T.ConeGeometry(0.037, 0.14, 4), bladeMat, 0, 1.03, 0, 0, Math.PI / 4, 0).scale.z = 0.27;
    add(sword, new T.BoxGeometry(0.014, 0.6, 0.018), m.dark, 0, 0.45, 0);
    add(sword, new T.BoxGeometry(0.28, 0.035, 0.05), m.trim, 0, 0.09, 0);
    add(sword, new T.CylinderGeometry(0.02, 0.02, 0.2, 8), m.leather, 0, -0.02, 0);
    add(sword, new T.SphereGeometry(0.034, 8, 6), m.trim, 0, -0.13, 0);
    const glow = new T.PointLight(0xffaa55, 0, 5); glow.position.y = 0.6; sword.add(glow);
    // rod
    const rod = J(j.handR, 0, -0.06, 0.02); rod.rotation.x = 1.9;
    add(rod, new T.CylinderGeometry(0.008, 0.022, 2.4, 6), lamb(0x8a6a44), 0, 1.1, 0);
    add(rod, new T.CylinderGeometry(0.035, 0.035, 0.07, 8).rotateZ(Math.PI / 2), m.trim, 0.03, 0.12, 0);
    const rodTip = J(rod, 0, 2.3, 0);
    rod.visible = angler; sword.visible = !angler;
    // shield on the left forearm
    if (!angler) {
      const shp = new T.Shape();
      shp.moveTo(-0.2, 0.26); shp.lineTo(0.2, 0.26); shp.quadraticCurveTo(0.22, -0.1, 0, -0.38); shp.quadraticCurveTo(-0.22, -0.1, -0.2, 0.26);
      const sg = new T.ExtrudeGeometry(shp, { depth: 0.03, bevelEnabled: true, bevelSize: 0.012, bevelThickness: 0.012, bevelSegments: 1 });
      const shield = J(j.elL, 0.09, -0.12, 0); shield.rotation.y = Math.PI / 2;
      add(shield, sg, m.dark);
      add(shield, new T.BoxGeometry(0.035, 0.6, 0.02), m.trim, 0, -0.05, 0.045);
      add(shield, new T.BoxGeometry(0.36, 0.035, 0.02), m.trim, 0, 0.1, 0.045);
      add(shield, new T.SphereGeometry(0.05, 10, 8), m.steel, 0, 0.1, 0.05);
    }
    root.scale.setScalar(1.12);
    return { root, j, cape, sword, rod, rodTip, bladeMat, glow, phase: 0, t: Math.random() * 9, atk: -1, cast: 0, pose: 'idle', kind: kind || 'knight' };
  };

  const POSE_KEYS = ['hips', 'spine', 'head', 'shR', 'shL', 'elR', 'elL', 'handR', 'hipR', 'hipL', 'kneeR', 'kneeL'];
  const tgt = {};
  POSE_KEYS.forEach((k) => { tgt[k] = { x: 0, y: 0, z: 0 }; });
  const ease = (a, b, t) => a + (b - a) * sst(t);

  /** st: { speed 0..1, pose: 'idle'|'fish'|'reel'|'dead', atk: 0..1 or -1, cast: 0..1 or -1 } */
  W.animKnight = function (k, dt, st) {
    k.t += dt;
    const a = st.speed || 0;
    k.phase += dt * (5.2 + a * 5.4) * (a > 0.05 ? 1 : 0);
    const p = k.phase, s = Math.sin(p), br = Math.sin(k.t * 1.7);
    for (const key of POSE_KEYS) { tgt[key].x = tgt[key].y = tgt[key].z = 0; }
    let hipY = 0.98 + br * 0.006;
    // base: idle blended with walk
    tgt.spine.x = 0.03 + br * 0.012 + a * 0.13;
    tgt.hipR.x = -s * 0.78 * a; tgt.hipL.x = s * 0.78 * a;
    tgt.kneeR.x = Math.max(0, Math.sin(p - 1.1)) * 1.15 * a + 0.04;
    tgt.kneeL.x = Math.max(0, Math.sin(p - 1.1 + Math.PI)) * 1.15 * a + 0.04;
    tgt.hips.y = s * 0.1 * a;
    tgt.spine.y = -s * 0.14 * a;
    tgt.shR.x = s * 0.3 * a - 0.12; tgt.shR.z = -0.1;
    tgt.elR.x = -0.3 - a * 0.25;
    tgt.shL.x = -s * 0.4 * a - 0.25; tgt.shL.z = 0.16;
    tgt.elL.x = -0.95;
    tgt.head.x = -a * 0.06;
    hipY += Math.cos(p * 2) * 0.035 * a - a * 0.02;
    if (st.pose === 'fish' || st.pose === 'reel') {
      tgt.shR.x = -1.0 + br * 0.03; tgt.elR.x = -0.45; tgt.handR.x = 0.95 + br * 0.05; tgt.spine.x = 0.02;
      tgt.shL.x = -0.75; tgt.elL.x = -1.0; tgt.shL.z = -0.25;
      if (st.pose === 'reel') { const r = k.t * 14; tgt.handR.x = 0.6 + Math.sin(r * 0.3) * 0.2; tgt.shR.x = -1.25; tgt.spine.x = -0.14; tgt.elL.x = -1.1 + Math.sin(r) * 0.18; tgt.shL.x = -0.75 + Math.cos(r) * 0.12; }
    }
    if (st.cast >= 0) {
      const q = st.cast;
      if (q < 0.5) { tgt.shR.x = ease(-1.0, -2.5, q / 0.5); tgt.handR.x = ease(0.9, -0.5, q / 0.5); tgt.spine.x = -0.15; }
      else { tgt.shR.x = ease(-2.5, -1.0, (q - 0.5) / 0.3); tgt.handR.x = ease(-0.5, 1.4, (q - 0.5) / 0.3); tgt.spine.x = 0.2; }
      tgt.elR.x = -0.3;
    }
    let snap = 14;
    if (st.atk >= 0) {
      const q = st.atk; snap = 30;
      if (q < 0.32) { const u = q / 0.32; tgt.shR.x = ease(-0.3, -2.7, u); tgt.handR.x = 0; tgt.spine.y = ease(0, -0.6, u); tgt.shR.z = -0.35; tgt.spine.x = -0.08; }
      else if (q < 0.55) { const u = (q - 0.32) / 0.23; tgt.shR.x = ease(-2.7, -0.85, u); tgt.handR.x = ease(0, 1.75, u); tgt.spine.y = ease(-0.6, 0.65, u); tgt.shR.z = ease(-0.35, 0.5, u); tgt.spine.x = ease(-0.08, 0.32, u); hipY -= 0.07 * u; }
      else { const u = (q - 0.55) / 0.45; tgt.shR.x = ease(-0.85, -0.2, u); tgt.handR.x = ease(1.75, 0, u); tgt.spine.y = ease(0.65, 0, u); tgt.shR.z = ease(0.5, -0.1, u); tgt.spine.x = ease(0.32, 0.03, u); hipY -= 0.07 * (1 - u); }
      tgt.elR.x = -0.15; tgt.hipL.x -= 0.25; tgt.hipR.x += 0.2; tgt.kneeR.x += 0.2;
    }
    if (st.pose === 'dead') { tgt.spine.x = 1.2; tgt.hipR.x = -1.2; tgt.hipL.x = -1.0; tgt.kneeR.x = 1.6; tgt.kneeL.x = 1.5; tgt.head.x = 0.5; hipY = 0.42; tgt.shR.x = 0.3; tgt.shL.x = 0.2; }
    const f = Math.min(1, dt * snap);
    for (const key of POSE_KEYS) { const r = k.j[key].rotation, g = tgt[key]; r.x += (g.x - r.x) * f; r.y += (g.y - r.y) * f; r.z += (g.z - r.z) * f; }
    k.j.hips.position.y += (hipY - k.j.hips.position.y) * f;
    // cape
    if (k.cape.visible) {
      const pos = k.cape.geometry.attributes.position, rest = k.cape.userData.rest;
      for (let i = 0; i < pos.count; i++) {
        const y = -rest[i * 3 + 1] / 1.08, x = rest[i * 3];
        const wave = Math.sin(k.t * (2.2 + a * 5) - y * 4.2 + x * 3) * (0.035 + a * 0.07) * y;
        pos.setZ(i, -(y * y) * (0.14 + a * 0.5) - y * 0.05 + wave);
        pos.setX(i, x * (1 + y * 0.35));
      }
      pos.needsUpdate = true; k.cape.geometry.computeVertexNormals();
    }
  };

  // ---------- husks: the things that walk the moor at night ----------
  W.makeHusk = function (boss) {
    const bone = lamb(boss ? 0xd8c8a8 : 0xbfc4b0), hide = lamb(boss ? 0x4a1f1a : 0x3d4a3c), eye = new T.MeshBasicMaterial({ color: boss ? 0xff5a2a : 0xffc04a });
    const root = new T.Group(), j = {};
    j.body = J(root, 0, 1.0, 0); j.body.rotation.x = 0.5;
    add(j.body, new T.SphereGeometry(0.34, 12, 10), hide, 0, 0.1, 0).scale.set(1, 1.45, 0.85);
    add(j.body, new T.ConeGeometry(0.42, 0.9, 9, 1, true), hide, 0, -0.35, 0);
    for (let i = 0; i < 5; i++) add(j.body, new T.TorusGeometry(0.27 - i * 0.012, 0.022, 5, 12, Math.PI), bone, 0, 0.36 - i * 0.12, 0.05, Math.PI / 2 + 0.2, 0, Math.PI);
    j.head = J(j.body, 0, 0.62, 0.12); j.head.rotation.x = -0.45;
    add(j.head, new T.SphereGeometry(0.19, 10, 8), bone).scale.set(0.9, 1, 1.15);
    add(j.head, new T.BoxGeometry(0.16, 0.14, 0.2), bone, 0, -0.12, 0.13);
    for (const s of [-1, 1]) {
      add(j.head, new T.SphereGeometry(0.04, 6, 6), eye, s * 0.075, 0.02, 0.2);
      const an = J(j.head, s * 0.12, 0.14, -0.02); an.rotation.z = -s * 0.7;
      add(an, cyl(0.022, 0.012, 0.5, 5), bone, 0, 0.5, 0);
      add(an, cyl(0.014, 0.006, 0.26, 5), bone, 0, 0.36, 0, 0, 0, s * 0.9);
      add(an, cyl(0.014, 0.006, 0.22, 5), bone, 0, 0.5, 0, 0.5, 0, -s * 0.8);
      const arm = j['arm' + (s < 0 ? 'R' : 'L')] = J(j.body, s * 0.36, 0.4, 0); arm.rotation.z = s * 0.25;
      add(arm, cyl(0.06, 0.04, 0.62, 6), hide);
      const fore = J(arm, 0, -0.6, 0); fore.rotation.x = -0.9;
      add(fore, cyl(0.045, 0.03, 0.62, 6), bone);
      for (let i = -1; i <= 1; i++) add(fore, new T.ConeGeometry(0.018, 0.2, 4), bone, i * 0.035, -0.7, 0, Math.PI);
      const leg = j['leg' + (s < 0 ? 'R' : 'L')] = J(root, s * 0.17, 0.75, -0.1);
      add(leg, cyl(0.08, 0.05, 0.75, 6), hide);
      add(leg, new T.BoxGeometry(0.12, 0.06, 0.24), bone, 0, -0.74, 0.06);
    }
    if (boss) {
      for (let i = 0; i < 6; i++) add(j.head, new T.ConeGeometry(0.03, 0.2, 4), eye, Math.cos(i * 1.047) * 0.15, 0.19, Math.sin(i * 1.047) * 0.15);
      const l = new T.PointLight(0xff5a2a, 2.2, 9); l.position.y = 1.4; root.add(l);
      root.scale.setScalar(1.9);
    }
    return { root, j, t: Math.random() * 9, boss: !!boss };
  };
  W.animHusk = function (h, dt, speed, lunge, dead) {
    h.t += dt * (1 + speed * 2.2);
    const s = Math.sin(h.t * 3.2);
    h.j.legR.rotation.x = s * 0.7 * speed; h.j.legL.rotation.x = -s * 0.7 * speed;
    const reach = lunge > 0 ? -1.9 * Math.sin(Math.min(1, lunge) * Math.PI) : 0;
    h.j.armR.rotation.x = -s * 0.5 * speed - 0.25 + reach; h.j.armL.rotation.x = s * 0.5 * speed - 0.25 + reach * 0.8;
    h.j.body.rotation.x += ((dead ? 1.5 : 0.5 + Math.sin(h.t * 1.3) * 0.05 + (lunge > 0 ? 0.3 : 0)) - h.j.body.rotation.x) * Math.min(1, dt * 8);
    h.j.body.position.y += ((dead ? 0.35 : 1.0 + Math.abs(s) * 0.05 * speed) - h.j.body.position.y) * Math.min(1, dt * 8);
    h.j.head.rotation.y = Math.sin(h.t * 0.9) * 0.3;
  };

  // ---------- props ----------
  const stone = lamb(0x6a6878), wood = lamb(0x5a3d26), darkwood = lamb(0x2c1f18);
  W.place = function (obj, x, z, dy) { obj.position.set(x, H(x, z) + (dy || 0), z); scene.add(obj); return obj; };
  W.makeFire = function (big) {
    const g = new T.Group();
    if (big) {
      add(g, lathe([[0.9, 0], [0.7, 0.5], [0.3, 0.9], [0.32, 1.9], [0.75, 2.3], [0.9, 2.7], [0.8, 2.72]]), stone);
      for (let i = 0; i < 4; i++) add(g, new T.BoxGeometry(0.16, 1.1, 0.16), darkwood, Math.cos(i * 1.57) * 0.5, 2.6, Math.sin(i * 1.57) * 0.5, 0, 0, 0);
    } else {
      for (let i = 0; i < 7; i++) add(g, new T.DodecahedronGeometry(0.2, 0), stone, Math.cos(i * 0.9) * 0.62, 0.1, Math.sin(i * 0.9) * 0.62);
      for (let i = 0; i < 3; i++) add(g, new T.CylinderGeometry(0.07, 0.08, 1.0, 6), wood, 0, 0.22, 0, 1.2, i * 2.1, 0);
    }
    const fy = big ? 2.9 : 0.35, flames = [];
    const fm = new T.MeshBasicMaterial({ color: 0xffb040 }), fm2 = new T.MeshBasicMaterial({ color: 0xff5a20 });
    for (let i = 0; i < 5; i++) { const f = add(g, new T.ConeGeometry(big ? 0.34 : 0.2, big ? 1.3 : 0.75, 6), i % 2 ? fm : fm2, (Math.random() - 0.5) * 0.3, fy + 0.3, (Math.random() - 0.5) * 0.3); f.castShadow = false; flames.push(f); }
    const light = new T.PointLight(0xff9a40, 0, big ? 40 : 16); light.position.y = fy + 0.8; g.add(light);
    const fire = { g, flames, light, lit: false, power: big ? 5 : 2.6, fy };
    fire.set = (on) => { fire.lit = on; flames.forEach((f) => { f.visible = on; }); if (!on) light.intensity = 0; };
    fire.tick = (t) => { if (!fire.lit) return; flames.forEach((f, i) => { const s = 0.75 + 0.35 * Math.sin(t * (9 + i * 2.3) + i); f.scale.set(1, s, 1); f.position.y = fy + 0.3 * s + 0.1; f.rotation.y = t * (1 + i); }); light.intensity = fire.power * (0.85 + 0.15 * Math.sin(t * 17) * Math.sin(t * 7.3)); };
    fire.set(false);
    return fire;
  };
  W.makeStone = function (h) {
    const g = new T.Group();
    add(g, new T.BoxGeometry(0.9, h, 0.5), stone, 0, h / 2 - 0.3, 0, 0.04, Math.random() * 3, 0.05);
    return g;
  };
  W.makeTree = function () {
    const g = new T.Group(), ht = 4 + Math.random() * 2.5;
    add(g, new T.CylinderGeometry(0.1, 0.28, ht, 7), darkwood, 0, ht / 2 - 0.2, 0, 0, 0, (Math.random() - 0.5) * 0.14);
    for (let i = 0; i < 6; i++) {
      const b = J(g, 0, ht * (0.45 + i * 0.09), 0); b.rotation.set(0, i * 2.4 + Math.random(), 1.0 + Math.random() * 0.4);
      add(b, cyl(0.05, 0.015, 1.5 + Math.random(), 5), darkwood, 0, 0, 0, Math.PI, 0, 0);
      const tw = J(b, 0, 0.9, 0); tw.rotation.z = 0.8; add(tw, cyl(0.025, 0.008, 0.9, 4), darkwood, 0, 0, 0, Math.PI, 0, 0);
    }
    return g;
  };
  W.makeRock = function (s) { const g = new T.Group(); add(g, new T.DodecahedronGeometry(s, 0), stone, 0, s * 0.3, 0, Math.random(), Math.random(), 0).scale.y = 0.7; return g; };
  W.makeJetty = function (len) {
    const g = new T.Group();
    for (let i = 0; i < len; i++) { add(g, new T.BoxGeometry(1.5, 0.07, 0.42), wood, 0, 0.42, -i * 0.48 - 0.2, 0, (Math.random() - 0.5) * 0.06, 0); }
    for (let i = 0; i < len; i += 4) for (const s of [-1, 1]) add(g, new T.CylinderGeometry(0.07, 0.07, 2.2, 6), darkwood, s * 0.7, -0.5, -i * 0.48 - 0.2);
    return g;
  };
  W.makeBobber = function () {
    const g = new T.Group();
    add(g, new T.SphereGeometry(0.09, 8, 6), new T.MeshBasicMaterial({ color: 0xff5540 }), 0, 0.03, 0).castShadow = false;
    add(g, new T.SphereGeometry(0.075, 8, 6), new T.MeshBasicMaterial({ color: 0xffffff }), 0, 0.1, 0).castShadow = false;
    return g;
  };
  W.makeLine = function () {
    const g = new T.BufferGeometry(); g.setAttribute('position', new T.BufferAttribute(new Float32Array(12 * 3), 3));
    const l = new T.Line(g, new T.LineBasicMaterial({ color: 0xd8d8e8 })); l.frustumCulled = false; l.layers.set(1); return l;
  };
  W.makeLoot = function (color) {
    const g = new T.Group(), m = new T.MeshBasicMaterial({ color });
    add(g, new T.OctahedronGeometry(0.22, 0), m, 0, 0.7, 0).castShadow = false;
    add(g, new T.CylinderGeometry(0.03, 0.03, 3.4, 5), m, 0, 2.2, 0).castShadow = false;
    return g;
  };

  // ---------- sparks ----------
  const sparks = [];
  W.initSparks = function () {
    const geo = new T.TetrahedronGeometry(0.09, 0);
    for (let i = 0; i < 70; i++) { const m = new T.Mesh(geo, new T.MeshBasicMaterial({ color: 0xffffff })); m.visible = false; m.layers.set(2); scene.add(m); sparks.push({ m, v: new T.Vector3(), life: 0 }); }
  };
  let si = 0;
  W.burst = function (x, y, z, color, n, power, up) {
    for (let i = 0; i < n; i++) {
      const s = sparks[si++ % sparks.length]; s.m.visible = true; s.m.position.set(x, y, z); s.m.material.color.setHex(color);
      s.v.set((Math.random() - 0.5) * power, Math.random() * power * (up || 1), (Math.random() - 0.5) * power); s.life = 0.5 + Math.random() * 0.5; s.m.scale.setScalar(0.6 + Math.random());
    }
  };
  W.tickSparks = function (dt) {
    for (const s of sparks) { if (s.life <= 0) continue; s.life -= dt; s.v.y -= 9 * dt; s.m.position.addScaledVector(s.v, dt); s.m.rotation.x += dt * 9; if (s.life <= 0) s.m.visible = false; }
  };

  window.GM = W;
})();
