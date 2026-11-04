/* Ctrl+Alt+Survive — the fake early-2000s desktop: boot, log-on, windows, taskbar and meta apps */
(function (C) {
  'use strict';
  const $ = id => document.getElementById(id);
  const ico = n => C.SPR.icon(n);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const SV = () => C.Save.data;
  const fmt = n => Math.floor(n).toLocaleString();
  const isSmall = () => window.innerWidth < 720 || window.innerHeight < 480;

  const D = C.Desktop = {};
  const wins = {};
  let zTop = 10, cascade = 0;

  /* ================= settings / theme ================= */
  D.applySettings = function () {
    const s = SV().settings;
    const th = C.THEMES.find(t => t.id === s.theme) || C.THEMES[0];
    document.body.className = document.body.className.replace(/\btheme-\S+/g, '').trim() + ' theme-' + th.id;
    $('wall').className = 'wall-' + (s.wall || th.wall);
    $('crt').style.display = s.crt ? '' : 'none';
    document.body.classList.toggle('mouse-move', s.moveMode === 'mouse');
    updateTray();
  };

  /* ================= boot sequence ================= */
  D.boot = function () {
    const boot = $('boot');
    boot.classList.remove('hidden');
    boot.innerHTML = '<div class="bios"></div>';
    const bios = boot.querySelector('.bios');
    const lines = [
      'CAS Modular BIOS v6.00PG, An Energy Star Ally',
      'Copyright (C) 1984-2003, Ctrl+Alt+Survive Megatrends',
      '',
      'Main Processor : Pentagon(R) 4 2400MHz',
      'Memory Testing : 524288K OK',
      '',
      'Detecting IDE Primary Master   ... HDD-C 40GB',
      'Detecting IDE Primary Slave    ... HDD-D DOWNLOADS',
      'Detecting Floppy Drive A:      ... 1.44M, 3.5 in.',
      'Detecting Network Adapter      ... 10/100 LAN',
      '',
      'WARNING: 9,999 threats detected on this machine.',
      'Press DEL to enter SETUP, or click to skip'
    ];
    let i = 0, done = false;
    const skip = () => { if (done) return; done = true; cleanup(); D.login(); };
    const cleanup = () => { boot.removeEventListener('pointerdown', skip); window.removeEventListener('keydown', skip); };
    boot.addEventListener('pointerdown', skip); window.addEventListener('keydown', skip);
    (function next() {
      if (done) return;
      if (i < lines.length) { bios.innerHTML += esc(lines[i++]) + '<br>'; setTimeout(next, i < 4 ? 120 : 90); return; }
      setTimeout(() => {
        if (done) return;
        boot.innerHTML = '<div class="splash"><div class="logo"><span class="l1">Ctrl+Alt+</span><span class="l2">Survive</span><span class="l3">2003 · Professional</span></div><div class="loader"><i></i><i></i><i></i></div><div class="copy">Copyright © 2003 Totally Real Software Corp.</div></div>';
        setTimeout(skip, 2200);
      }, 500);
    })();
  };

  D.login = function () {
    $('boot').classList.add('hidden');
    const L = $('login');
    L.classList.remove('hidden');
    const name = SV().settings.userName || 'Player';
    L.innerHTML = '<div class="lg-top"></div><div class="lg-mid"><div class="lg-left"><div class="logo"><span class="l1">Ctrl+Alt+</span><span class="l2">Survive</span></div><p>To begin, click your user name</p></div><div class="lg-sep"></div><div class="lg-right"><button class="lg-user" id="lgUser"><img src="' + ico('c_guest') + '" alt=""><span><b>' + esc(name) + '</b><small>' + fmt(SV().credits) + ' credits</small></span></button></div></div><div class="lg-bot"><button class="lg-off" id="lgOff"><img src="' + ico('i_shutdown') + '" alt="">Turn off computer</button><span>After you log on, you can scan your drives for threats.</span></div>';
    $('lgUser').onclick = () => {
      C.Audio.init();
      L.classList.add('hidden');
      D.show();
      C.Audio.sfx('startup');
      if (!SV().booted) { SV().booted = true; C.Save.save(); setTimeout(() => D.open('readme'), 900); }
    };
    $('lgOff').onclick = () => { C.Audio.init(); D.shutdown(); };
  };

  D.shutdown = function () {
    C.Audio.sfx('shutdown'); C.Audio.music(null);
    ['desktop', 'login', 'runScreen'].forEach(id => $(id).classList.add('hidden'));
    const b = $('boot'); b.classList.remove('hidden');
    b.innerHTML = '<div class="safe">It is now safe to turn off<br>your computer.<small>(click to turn it back on)</small></div>';
    b.onpointerdown = () => { b.onpointerdown = null; D.boot(); };
    // the .exe launcher serves the game locally: turning off the computer quits the app
    if (window.CAS_STANDALONE) {
      b.querySelector('small').textContent = '(closing...)';
      setTimeout(() => { fetch('/__quit').catch(() => { }); window.close(); }, 1800);
    }
  };

  /* ================= desktop ================= */
  const ICONS = [
    ['mycomputer', 'My Computer', 'i_computer'],
    ['scan', 'Start Scan', 'i_scan'],
    ['control', 'Control Panel', 'i_control'],
    ['users', 'User Accounts', 'i_users'],
    ['tasks', 'Tasks.xls', 'i_tasks'],
    ['display', 'Display', 'i_display'],
    ['events', 'Event Viewer', 'i_events'],
    ['readme', 'ReadMe.txt', 'i_readme'],
    ['recycle', 'Recycle Bin', 'i_bin'],
    ['hub', 'GameHub.url', 'i_globe']
  ].filter(i => !(window.CAS_STANDALONE && i[0] === 'hub'));
  let built = false;
  function buildDesktop() {
    if (built) return; built = true;
    const di = $('dicons');
    di.innerHTML = ICONS.map(i => '<div class="dicon" tabindex="0" data-app="' + i[0] + '"><img src="' + ico(i[2]) + '" alt=""><span>' + esc(i[1]) + '</span></div>').join('');
    di.addEventListener('click', e => {
      const ic = e.target.closest('.dicon'); if (!ic) return;
      di.querySelectorAll('.dicon.sel').forEach(x => x.classList.remove('sel'));
      ic.classList.add('sel');
      if (e.pointerType === 'touch' || e.detail === 0 || matchMedia('(pointer: coarse)').matches) D.open(ic.dataset.app);
    });
    di.addEventListener('dblclick', e => { const ic = e.target.closest('.dicon'); if (ic) D.open(ic.dataset.app); });
    di.addEventListener('keydown', e => { if (e.key === 'Enter') { const ic = e.target.closest('.dicon'); if (ic) D.open(ic.dataset.app); } });
    $('wall').addEventListener('pointerdown', () => { di.querySelectorAll('.dicon.sel').forEach(x => x.classList.remove('sel')); closeStart(); });
    // start menu
    $('startBtn').onclick = e => { e.stopPropagation(); C.Audio.sfx('click'); $('startMenu').classList.contains('hidden') ? openStart() : closeStart(); };
    document.addEventListener('pointerdown', e => { if (!e.target.closest('#startMenu') && !e.target.closest('#startBtn')) closeStart(); });
    $('traySnd').onclick = () => { const s = SV().settings; if (s.vol > 0 || s.music > 0) { s._vol = s.vol; s._mus = s.music; s.vol = 0; s.music = 0; } else { s.vol = s._vol || 0.7; s.music = s._mus || 0.45; } C.Audio.setVolumes(); C.Save.save(); updateTray(); };
    setInterval(updateClock, 1000 * 15); updateClock();
    window.addEventListener('resize', () => { for (const id in wins) fitWin(wins[id]); });
  }
  function updateClock() { const d = new Date(); $('clock').textContent = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); }
  function updateTray() {
    const t = $('trayCred'); if (t) t.textContent = fmt(SV().credits) + ' cr';
    const s = SV().settings, snd = $('traySnd');
    if (snd) snd.textContent = s.vol > 0 || s.music > 0 ? '🔊' : '🔇';
  }
  D.updateTray = updateTray;

  function openStart() {
    const m = $('startMenu');
    const name = SV().settings.userName || 'Player';
    const L = [['scan', 'Start Scan', 'i_scan', 'Clean a drive'], ['control', 'Control Panel', 'i_control', 'Permanent upgrades'], ['users', 'User Accounts', 'i_users', 'Choose who you play'], ['tasks', 'Tasks.xls', 'i_tasks', 'Unlock new stuff']];
    const Rr = [['mycomputer', 'My Computer', 'i_computer'], ['display', 'Display Properties', 'i_display'], ['events', 'Event Viewer', 'i_events'], ['readme', 'Help and Support', 'i_readme']].concat(window.CAS_STANDALONE ? [] : [['hub', 'Back to GameHub', 'i_globe']]);
    m.innerHTML = '<div class="sm-head"><img src="' + ico('c_guest') + '" alt=""><b>' + esc(name) + '</b></div><div class="sm-cols"><div class="sm-left">' +
      L.map(i => '<div class="sm-item" data-app="' + i[0] + '"><img src="' + ico(i[2]) + '" alt=""><span><b>' + i[1] + '</b><small>' + i[3] + '</small></span></div>').join('') +
      '</div><div class="sm-right">' + Rr.map(i => '<div class="sm-item" data-app="' + i[0] + '"><img src="' + ico(i[2]) + '" alt=""><span>' + i[1] + '</span></div>').join('') + '</div></div>' +
      '<div class="sm-foot"><button data-app="logoff"><img src="' + ico('i_logoff') + '" alt="">Log Off</button><button data-app="shutdown"><img src="' + ico('i_shutdown') + '" alt="">Turn Off Computer</button></div>';
    m.classList.remove('hidden');
    $('startBtn').classList.add('on');
    m.onclick = e => {
      const it = e.target.closest('[data-app]'); if (!it) return;
      closeStart();
      const a = it.dataset.app;
      if (a === 'logoff') { closeAll(); $('desktop').classList.add('hidden'); C.Audio.music(null); D.login(); }
      else if (a === 'shutdown') { closeAll(); D.shutdown(); }
      else D.open(a);
    };
  }
  function closeStart() { $('startMenu').classList.add('hidden'); $('startBtn').classList.remove('on'); }
  function closeAll() { for (const id in wins) closeWin(id, true); }

  D.show = function (tasks) {
    buildDesktop();
    $('runScreen').classList.add('hidden');
    $('desktop').classList.remove('hidden');
    D.applySettings();
    C.Audio.music('menu');
    for (const id in wins) if (wins[id].refresh) wins[id].refresh();
    if (tasks && tasks.length) tasks.forEach((t, i) => setTimeout(() => D.balloon('Task completed', t.name + ' (+' + (t.reward.credits || 0) + ' cr' + (t.reward.unlock ? ', unlocked ' + C.RunUI.unlockName(t.reward.unlock) : '') + ')'), 400 + i * 1400));
  };

  D.startRun = function (opts) {
    closeStart();
    SV().settings.lastChar = opts.char; SV().settings.lastDrive = opts.drive; C.Save.save();
    $('desktop').classList.add('hidden');
    $('runScreen').classList.remove('hidden');
    $('runTitle').textContent = C.drive(opts.drive).name + ' - Ctrl+Alt+Survive' + (opts.hyper ? ' [HYPER]' : '');
    $('runIcon').src = ico(C.drive(opts.drive).icon);
    $('overlay').innerHTML = '';
    C.Audio.sfx('dialup');
    requestAnimationFrame(() => C.Game.start(opts));
  };

  /* ================= balloons ================= */
  const bq = [];
  let bShowing = false;
  D.balloon = function (title, text) { bq.push([title, text]); if (!bShowing) nextBalloon(); };
  function nextBalloon() {
    const n = bq.shift(); if (!n) { bShowing = false; return; }
    bShowing = true;
    const b = document.createElement('div'); b.className = 'balloon';
    b.innerHTML = '<img src="' + ico('i_tasks') + '" alt=""><div><b>' + esc(n[0]) + '</b><p>' + esc(n[1]) + '</p></div><button>×</button>';
    $('balloons').appendChild(b);
    C.Audio.sfx('balloon');
    let gone = false;
    const hide = () => { if (gone) return; gone = true; b.classList.add('out'); setTimeout(() => { b.remove(); nextBalloon(); }, 300); };
    b.querySelector('button').onclick = hide;
    setTimeout(hide, 4200);
  }

  /* ================= message boxes ================= */
  D.confirm = function (title, text, icon, buttons) {
    return new Promise(res => {
      const host = $('runScreen').classList.contains('hidden') ? $('wins') : $('overlay');
      const shade = document.createElement('div'); shade.className = 'shade top';
      shade.innerHTML = '<div class="win dlg msgbox"><div class="titlebar"><span class="ttext">' + esc(title) + '</span></div><div class="wbody"><div class="mb-row"><img src="' + ico(icon || 'e_error') + '" alt=""><p>' + esc(text) + '</p></div><div class="dlg-foot center">' + (buttons || ['OK']).map((b, i) => '<button class="btn' + (i === 0 ? ' primary' : '') + '" data-i="' + i + '">' + esc(b) + '</button>').join('') + '</div></div></div>';
      host.appendChild(shade);
      C.Audio.sfx(icon === 'e_error' ? 'error' : 'ding');
      shade.addEventListener('click', e => { const b = e.target.closest('button[data-i]'); if (!b) return; shade.remove(); res(+b.dataset.i); });
    });
  };

  /* ================= window manager ================= */
  function openWin(id, title, icon, opts, build) {
    if (wins[id]) { const w = wins[id]; if (w.min) toggleMin(id); focusWin(id); if (opts.onReopen) opts.onReopen(w); return w; }
    const el = document.createElement('div');
    el.className = 'win app ' + (opts.cls || '');
    el.innerHTML = '<div class="titlebar"><img class="ticon" src="' + ico(icon) + '" alt=""><span class="ttext">' + esc(title) + '</span><div class="tbtns"><button class="tb min" title="Minimize">_</button>' + (opts.noMax ? '' : '<button class="tb max" title="Maximize">□</button>') + '<button class="tb close" title="Close">×</button></div></div>' +
      (opts.menu ? '<div class="menubar">' + opts.menu.map(m => '<span>' + m + '</span>').join('') + '</div>' : '') +
      '<div class="wbody"></div>' + (opts.status ? '<div class="statusbar"><div class="sb" data-status></div></div>' : '');
    $('wins').appendChild(el);
    const w = { id, el, body: el.querySelector('.wbody'), opts, min: false, max: false };
    wins[id] = w;
    const ww = Math.min(opts.w || 520, window.innerWidth - 16), hh = Math.min(opts.h || 400, window.innerHeight - 50);
    w.x = 60 + (cascade % 6) * 26 + (opts.x || 0); w.y = 20 + (cascade % 6) * 22; cascade++;
    if (w.x + ww > window.innerWidth) w.x = Math.max(0, (window.innerWidth - ww) / 2);
    el.style.width = ww + 'px'; el.style.height = hh + 'px';
    if (isSmall()) w.max = true;
    fitWin(w);
    // taskbar button
    const tb = document.createElement('button'); tb.className = 'tbapp'; tb.innerHTML = '<img src="' + ico(icon) + '" alt=""><span>' + esc(title) + '</span>';
    tb.onclick = () => { if (w.min) toggleMin(id); else if (+el.style.zIndex === zTop) toggleMin(id); else focusWin(id); };
    $('tbApps').appendChild(tb); w.tb = tb;
    el.addEventListener('pointerdown', () => focusWin(id));
    el.querySelector('.close').onclick = e => { e.stopPropagation(); closeWin(id); };
    el.querySelector('.min').onclick = e => { e.stopPropagation(); toggleMin(id); };
    const mx = el.querySelector('.max'); if (mx) mx.onclick = e => { e.stopPropagation(); w.max = !w.max; fitWin(w); };
    // dragging
    const bar = el.querySelector('.titlebar');
    bar.addEventListener('dblclick', e => { if (e.target.closest('.tbtns') || opts.noMax) return; w.max = !w.max; fitWin(w); });
    bar.addEventListener('pointerdown', e => {
      if (e.target.closest('.tbtns') || w.max) return;
      const sx = e.clientX, sy = e.clientY, ox = w.x, oy = w.y;
      bar.setPointerCapture(e.pointerId);
      const mv = ev => { w.x = ox + ev.clientX - sx; w.y = oy + ev.clientY - sy; fitWin(w); };
      const up = () => { bar.removeEventListener('pointermove', mv); bar.removeEventListener('pointerup', up); bar.removeEventListener('pointercancel', up); };
      bar.addEventListener('pointermove', mv); bar.addEventListener('pointerup', up); bar.addEventListener('pointercancel', up);
    });
    w.setStatus = t => { const s = el.querySelector('[data-status]'); if (s) s.innerHTML = t; };
    w.refresh = () => build(w);
    build(w);
    focusWin(id);
    C.Audio.sfx('open');
    return w;
  }
  function fitWin(w) {
    const el = w.el, vw = window.innerWidth, vh = window.innerHeight - 34;
    if (isSmall() && !w.max) w.max = true;
    el.classList.toggle('maxed', w.max);
    if (w.max) { el.style.left = '0px'; el.style.top = '0px'; el.style.width = vw + 'px'; el.style.height = vh + 'px'; return; }
    const ow = Math.min(w.opts.w || 520, vw - 8), oh = Math.min(w.opts.h || 400, vh - 8);
    el.style.width = ow + 'px'; el.style.height = oh + 'px';
    w.x = Math.max(-ow + 80, Math.min(vw - 80, w.x)); w.y = Math.max(0, Math.min(vh - 30, w.y));
    el.style.left = w.x + 'px'; el.style.top = w.y + 'px';
  }
  function focusWin(id) {
    const w = wins[id]; if (!w) return;
    w.el.style.zIndex = ++zTop;
    for (const k in wins) { wins[k].el.classList.toggle('inactive', k !== id); wins[k].tb.classList.toggle('on', k === id && !wins[k].min); }
  }
  function toggleMin(id) {
    const w = wins[id]; w.min = !w.min;
    w.el.classList.toggle('minimized', w.min);
    w.tb.classList.toggle('on', !w.min);
    if (!w.min) focusWin(id);
  }
  function closeWin(id, silent) {
    const w = wins[id]; if (!w) return;
    w.el.remove(); w.tb.remove(); delete wins[id];
    if (!silent) C.Audio.sfx('close');
  }
  D.closeWin = closeWin;

  /* ================= apps ================= */
  D.open = function (app, arg) {
    closeStart();
    const f = APPS[app];
    if (f) f(arg);
  };
  const APPS = {};

  /* ---------- Scan wizard ---------- */
  APPS.scan = function (arg) {
    const s = SV().settings;
    const st = { step: arg && arg.drive ? 2 : 1, char: s.lastChar && C.Save.has('char', s.lastChar) ? s.lastChar : 'guest', drive: (arg && arg.drive) || (s.lastDrive && C.Save.has('drive', s.lastDrive) ? s.lastDrive : 'c'), hyper: false };
    openWin('scan', 'Scan Wizard', 'i_scan', {
      w: 640, h: 470, cls: 'wizard', noMax: false,
      onReopen: w => { if (arg && arg.drive) { st.drive = arg.drive; st.step = 2; w.refresh(); } }
    }, w => {
      const sv = SV();
      let html = '<div class="wz-head"><div><b>' + (st.step === 1 ? 'Select a user account' : 'Select a drive to scan') + '</b><small>Step ' + st.step + ' of 2</small></div><img src="' + ico('i_scan') + '" alt=""></div><div class="wz-body">';
      if (st.step === 1) {
        html += '<div class="usergrid">' + C.CHAR_ORDER.map(id => userTile(id, st.char === id)).join('') + '</div>';
      } else {
        html += '<div class="drivelist">' + C.DRIVES.map(d => {
          const ok = C.Save.has('drive', d.id) || !d.unlock;
          const best = sv.stats.bestTimes[d.id] || 0, clr = sv.stats.clears[d.id] || 0;
          return '<div class="drive' + (ok ? '' : ' locked') + (st.drive === d.id ? ' sel' : '') + '" data-drive="' + d.id + '"><img src="' + ico(ok ? d.icon : 'i_lock') + '" alt=""><div><b>' + esc(d.label) + '</b>' + (clr ? ' <span class="ok">✔ Clean</span>' : '') + '<small>' + esc(ok ? d.desc : C.Save.unlockText(d)) + '</small>' + (ok ? '<small class="meta">Threat level ' + '★'.repeat(Math.round(d.diff * 2)) + ' · Best ' + C.Game.fmtTime(best) + ' / ' + C.Game.fmtTime(d.dur) + (d.bounded ? ' · Walled arena' : '') + '</small>' : '') + '</div></div>';
        }).join('') + '</div>';
        const cleared = (sv.stats.clears[st.drive] || 0) > 0;
        if (!cleared) st.hyper = false;
        html += '<label class="hyper' + (cleared ? '' : ' dis') + '"><input type="checkbox" id="hyperCk"' + (st.hyper ? ' checked' : '') + (cleared ? '' : ' disabled') + '> <b>Hyper mode</b> (faster threats, +50% credits)' + (cleared ? '' : ' - clean this drive first') + '</label>';
      }
      html += '</div><div class="dlg-foot">' + (st.step === 2 ? '<button class="btn" data-a="back">&lt; Back</button>' : '<span class="credits-note">' + fmt(sv.credits) + ' credits</span>') + '<span class="sp"></span>' +
        (st.step === 1 ? '<button class="btn primary" data-a="next">Next &gt;</button>' : '<button class="btn primary" data-a="go">Start Scan</button>') + '<button class="btn" data-a="cancel">Cancel</button></div>';
      w.body.innerHTML = html;
      w.body.onclick = e => {
        const u = e.target.closest('[data-char]');
        if (u) {
          const id = u.dataset.char, def = C.CHARS[id];
          if (e.target.closest('[data-buy]')) { buyChar(id).then(() => w.refresh()); return; }
          if (!C.Save.has('char', id)) { C.Audio.sfx('error'); return; }
          st.char = id; C.Audio.sfx('click');
          if (e.detail > 1) { st.step = 2; }
          w.refresh(); return;
        }
        const dv = e.target.closest('[data-drive]');
        if (dv) { const d = C.drive(dv.dataset.drive); if (!(C.Save.has('drive', d.id) || !d.unlock)) { C.Audio.sfx('error'); return; } st.drive = d.id; C.Audio.sfx('click'); if (e.detail > 1) go(); else w.refresh(); return; }
        const b = e.target.closest('button[data-a]'); if (!b) return;
        const a = b.dataset.a;
        if (a === 'next') { st.step = 2; C.Audio.sfx('click'); w.refresh(); }
        else if (a === 'back') { st.step = 1; C.Audio.sfx('click'); w.refresh(); }
        else if (a === 'cancel') closeWin('scan');
        else if (a === 'go') go();
      };
      const hk = w.body.querySelector('#hyperCk'); if (hk) hk.onchange = () => { st.hyper = hk.checked; };
      function go() { closeWin('scan', true); D.startRun({ char: st.char, drive: st.drive, hyper: st.hyper }); }
    });
  };
  function userTile(id, sel) {
    const d = C.CHARS[id], ok = C.Save.has('char', id);
    const buy = !ok && d.unlock && d.unlock.cost;
    return '<div class="user' + (ok ? '' : ' locked') + (sel ? ' sel' : '') + '" data-char="' + id + '"><img class="av" src="' + ico(ok ? 'c_' + id : 'i_lock') + '" alt=""><div class="ut"><b>' + esc(d.name) + '</b><small>' + esc(ok ? d.perks : C.Save.unlockText(d)) + '</small><span class="sw"><img src="' + ico('w_' + d.weapon) + '" alt="">' + esc(C.WEAPONS[d.weapon].name) + '</span>' + (buy ? '<button class="btn mini" data-buy="1"' + (SV().credits >= d.unlock.cost ? '' : ' disabled') + '>Buy ' + fmt(d.unlock.cost) + '</button>' : '') + '</div></div>';
  }
  function buyChar(id) {
    const d = C.CHARS[id];
    return D.confirm('User Accounts', 'Create the account "' + d.name + '" for ' + fmt(d.unlock.cost) + ' credits?', 'i_users', ['Buy', 'Cancel']).then(r => {
      if (r !== 0) return;
      if (SV().credits < d.unlock.cost) return;
      SV().credits -= d.unlock.cost; C.Save.unlock('char', id); C.Save.save(); C.Audio.sfx('install'); updateTray();
      C.Save.checkTasks().forEach(t => D.balloon('Task completed', t.name));
    });
  }

  /* ---------- My Computer ---------- */
  APPS.mycomputer = function () {
    openWin('mycomputer', 'My Computer', 'i_computer', { w: 560, h: 400, menu: ['File', 'Edit', 'View', 'Favorites', 'Tools', 'Help'], status: true }, w => {
      const sv = SV();
      w.body.innerHTML = '<div class="explorer"><div class="ex-side"><div class="ex-box"><b>System Tasks</b><a data-a="scan">🔍 Start a scan</a><a data-a="control">⚙ Change a setting</a><a data-a="events">📋 View system information</a></div><div class="ex-box"><b>Details</b><p>Credits available:<br><b>' + fmt(sv.credits) + '</b></p><p>Drives cleaned: ' + C.DRIVES.filter(d => sv.stats.clears[d.id]).length + ' / ' + C.DRIVES.length + '</p></div></div><div class="ex-main"><h4>Drives</h4><div class="ex-icons">' +
        C.DRIVES.map(d => { const ok = C.Save.has('drive', d.id) || !d.unlock; return '<div class="exi' + (ok ? '' : ' locked') + '" data-drive="' + d.id + '" title="' + esc(ok ? d.desc : C.Save.unlockText(d)) + '"><img src="' + ico(ok ? d.icon : 'i_lock') + '" alt=""><span>' + esc(d.label) + '</span>' + (ok ? '<div class="usage"><i style="width:' + Math.min(100, (sv.stats.bestTimes[d.id] || 0) / d.dur * 100) + '%"></i></div>' : '') + '</div>'; }).join('') +
        '</div><p class="tip">Double-click a drive to scan it. The bar shows how far you got.</p></div></div>';
      w.setStatus(C.DRIVES.length + ' objects');
      w.body.onclick = e => {
        const a = e.target.closest('[data-a]'); if (a) { D.open(a.dataset.a); return; }
        const d = e.target.closest('[data-drive]'); if (!d) return;
        if (d.classList.contains('locked')) { D.confirm('Access denied', C.Save.unlockText(C.drive(d.dataset.drive)) + ' to get access to this drive.', 'e_error'); return; }
        if (e.detail > 1 || matchMedia('(pointer: coarse)').matches) D.open('scan', { drive: d.dataset.drive });
      };
    });
  };

  /* ---------- Control Panel ---------- */
  APPS.control = function () {
    let sel = null;
    openWin('control', 'Control Panel', 'i_control', { w: 640, h: 480, menu: ['File', 'Edit', 'View', 'Favorites', 'Tools', 'Help'], status: true }, w => {
      const sv = SV();
      w.body.innerHTML = '<div class="cp"><div class="cp-head"><b>Pick an upgrade</b><span>' + fmt(sv.credits) + ' credits</span></div><div class="cp-grid">' +
        C.UPGRADES.map(u => {
          const l = C.Save.upgradeLevel(u.id), maxed = l >= u.max, cost = C.Save.upgradeCost(u);
          return '<div class="cpi' + (sel === u.id ? ' sel' : '') + (maxed ? ' maxed' : '') + '" data-up="' + u.id + '"><img src="' + ico(u.icon) + '" alt=""><span>' + esc(u.name) + '</span><div class="pips">' + Array.from({ length: u.max }, (_, i) => '<i class="' + (i < l ? 'on' : '') + '"></i>').join('') + '</div><small>' + (maxed ? 'MAX' : fmt(cost) + ' cr') + '</small></div>';
        }).join('') + '</div>' +
        '<div class="cp-detail">' + (sel ? (() => {
          const u = C.UPGRADES.find(x => x.id === sel), l = C.Save.upgradeLevel(u.id), cost = C.Save.upgradeCost(u), maxed = l >= u.max;
          return '<img src="' + ico(u.icon) + '" alt=""><div><b>' + esc(u.name) + '</b> <em>Level ' + l + '/' + u.max + '</em><p>' + esc(u.desc) + ' per level.</p></div><span class="sp"></span><button class="btn primary" data-a="buy"' + (maxed || sv.credits < cost ? ' disabled' : '') + '>' + (maxed ? 'Maxed' : 'Buy (' + fmt(cost) + ')') + '</button>';
        })() : '<p>Select an item to see what it does. Prices go up a little with every upgrade you own.</p>') + '</div>' +
        '<div class="dlg-foot"><button class="btn" data-a="refund">Refund all</button><span class="sp"></span><button class="btn" data-a="close">Close</button></div></div>';
      w.setStatus(C.Save.totalUpgrades() + ' upgrades installed');
      w.body.onclick = e => {
        const it = e.target.closest('[data-up]');
        if (it) { if (sel === it.dataset.up && e.detail > 1) buy(); else { sel = it.dataset.up; C.Audio.sfx('click'); w.refresh(); } return; }
        const b = e.target.closest('button[data-a]'); if (!b) return;
        if (b.dataset.a === 'buy') buy();
        else if (b.dataset.a === 'close') closeWin('control');
        else if (b.dataset.a === 'refund') D.confirm('Control Panel', 'Remove every upgrade and get all spent credits back?', 'i_control', ['Refund', 'Cancel']).then(r => { if (r === 0) { C.Save.refundAll(); updateTray(); w.refresh(); } });
      };
      function buy() {
        const u = C.UPGRADES.find(x => x.id === sel);
        if (u && C.Save.buyUpgrade(u)) { C.Audio.sfx('install'); C.Save.checkTasks().forEach(t => D.balloon('Task completed', t.name)); updateTray(); w.refresh(); }
        else C.Audio.sfx('error');
      }
    });
  };

  /* ---------- User accounts ---------- */
  APPS.users = function () {
    openWin('users', 'User Accounts', 'i_users', { w: 620, h: 470, status: true }, w => {
      const sv = SV();
      w.body.innerHTML = '<div class="ua"><div class="ua-head"><img src="' + ico('i_users') + '" alt=""><div><b>Pick an account to use</b><p>Each user starts with a different program and different perks. Click one to make it the default for your next scan.</p></div></div><div class="usergrid big">' + C.CHAR_ORDER.map(id => userTile(id, (sv.settings.lastChar || 'guest') === id)).join('') + '</div></div>';
      w.setStatus(sv.unlocked.char.length + ' of ' + C.CHAR_ORDER.length + ' accounts');
      w.body.onclick = e => {
        const u = e.target.closest('[data-char]'); if (!u) return;
        const id = u.dataset.char;
        if (e.target.closest('[data-buy]')) { buyChar(id).then(() => w.refresh()); return; }
        if (!C.Save.has('char', id)) { C.Audio.sfx('error'); return; }
        sv.settings.lastChar = id; C.Save.save(); C.Audio.sfx('click'); w.refresh();
        if (e.detail > 1) D.open('scan');
      };
    });
  };

  /* ---------- Tasks.xls ---------- */
  APPS.tasks = function () {
    let cat = 'Software', sortDone = true;
    openWin('tasks', 'Tasks.xls - Ctrl+Alt+Survive', 'i_tasks', { w: 720, h: 500, cls: 'xls', menu: ['File', 'Edit', 'View', 'Insert', 'Format', 'Tools', 'Data', 'Help'] }, w => {
      const sv = SV();
      const done = C.TASKS.filter(t => sv.tasks[t.id]).length;
      const tabs = C.TASK_CATS.map(c => { const ts = C.TASKS.filter(t => t.cat === c), d = ts.filter(t => sv.tasks[t.id]).length; return '<button class="xtab' + (c === cat ? ' on' : '') + '" data-cat="' + c + '"><small>' + d + '/' + ts.length + '</small>' + c + '</button>'; }).join('');
      let rows = C.TASKS.filter(t => t.cat === cat);
      if (sortDone) rows = rows.slice().sort((a, b) => (sv.tasks[a.id] ? 1 : 0) - (sv.tasks[b.id] ? 1 : 0));
      const body = rows.map((t, i) => {
        const p = C.Save.taskProgress(t), ok = !!sv.tasks[t.id];
        const rw = (t.reward.credits ? '+' + fmt(t.reward.credits) + ' cr' : '') + (t.reward.unlock ? ' · ' + esc(C.RunUI.unlockName(t.reward.unlock)) : '');
        return '<tr class="' + (ok ? 'done' : '') + '"><td class="rn">' + (i + 1) + '</td><td class="tn">' + esc(t.name) + '</td><td class="tp"><div class="xbar"><i style="width:' + (p / t.goal * 100) + '%"></i></div><small>' + fmt(p) + '/' + fmt(t.goal) + '</small></td><td class="tr">' + rw + '</td><td class="tc">' + (ok ? '☑' : '☐') + '</td></tr>';
      }).join('');
      w.body.innerHTML = '<div class="xls-wrap"><div class="xls-bar"><span class="fx">fx</span><span class="formula">=COUNTIF(Tasks, "done") &rarr; ' + done + ' / ' + C.TASKS.length + '</span><label><input type="checkbox" id="sortDone"' + (sortDone ? ' checked' : '') + '> Unfinished first</label></div><div class="xtabs">' + tabs + '</div>' +
        '<div class="xls-grid"><table><tr class="hdr"><th></th><th>A: Task</th><th>B: Progress</th><th>C: Reward</th><th>D</th></tr>' + body + '</table></div>' +
        '<div class="sheets"><span class="on">Sheet1</span><span>Sheet2</span><span>Sheet3</span></div></div>';
      w.body.onclick = e => { const t = e.target.closest('[data-cat]'); if (t) { cat = t.dataset.cat; C.Audio.sfx('click'); w.refresh(); } };
      w.body.querySelector('#sortDone').onchange = e => { sortDone = e.target.checked; w.refresh(); };
    });
  };

  /* ---------- Display properties ---------- */
  APPS.display = function () {
    let tab = 'themes', pick = SV().settings.theme;
    openWin('display', 'Display Properties', 'i_display', { w: 460, h: 500, noMax: true }, w => {
      const sv = SV(), s = sv.settings;
      let html = '<div class="tabs"><button class="tab' + (tab === 'themes' ? ' on' : '') + '" data-tab="themes">Themes</button><button class="tab' + (tab === 'settings' ? ' on' : '') + '" data-tab="settings">Settings</button></div><div class="tabbody">';
      if (tab === 'themes') {
        const th = C.THEMES.find(t => t.id === pick);
        html += '<div class="preview theme-' + pick + '"><div class="pv-screen wall-' + th.wall + '"><div class="pv-win"><div class="pv-tb">Window</div><div class="pv-body"></div></div><div class="pv-task"><i></i></div></div><div class="pv-stand"></div></div>' +
          '<label class="fl">Theme:</label><div class="theme-list">' + C.THEMES.map(t => { const ok = C.Save.has('theme', t.id) || !t.unlock; return '<div class="th' + (pick === t.id ? ' sel' : '') + (ok ? '' : ' locked') + '" data-th="' + t.id + '">' + (ok ? '' : '🔒 ') + esc(t.name) + (ok ? '' : ' <small>' + esc(C.Save.unlockText(t)) + '</small>') + '</div>'; }).join('') + '</div>';
      } else {
        html += '<div class="optsform"><fieldset><legend>Sound</legend><label>Sound effects <input type="range" min="0" max="1" step="0.05" value="' + s.vol + '" data-set="vol"></label><label>Music <input type="range" min="0" max="1" step="0.05" value="' + s.music + '" data-set="music"></label></fieldset>' +
          '<fieldset><legend>Controls</legend>' + '<label>Movement <select data-set="moveMode"><option value="keys"' + (s.moveMode !== 'mouse' ? ' selected' : '') + '>Keyboard / drag</option><option value="mouse"' + (s.moveMode === 'mouse' ? ' selected' : '') + '>Mouse (direct control)</option></select></label><label>Mouse speed <input type="range" min="0.3" max="2.5" step="0.1" value="' + (s.mouseSens || 1) + '" data-set="mouseSens"></label>' + '<p class="tip">Mouse: your real mouse moves the in-game cursor directly, like on the desktop. Click the game to capture the mouse, Esc to release it. WASD still works.</p></fieldset>' +
          '<fieldset><legend>Screen</legend><label><input type="checkbox" data-set="crt"' + (s.crt ? ' checked' : '') + '> CRT monitor effect (scanlines)</label><label><input type="checkbox" data-set="dmgNums"' + (s.dmgNums ? ' checked' : '') + '> Show damage numbers</label><label><input type="checkbox" data-set="shake"' + (s.shake ? ' checked' : '') + '> Screen shake</label></fieldset>' +
          '<fieldset><legend>User</legend><label>Log-on name <input type="text" maxlength="16" value="' + esc(s.userName || 'Player') + '" data-set="userName"></label></fieldset></div>';
      }
      html += '</div><div class="dlg-foot"><span class="sp"></span><button class="btn primary" data-a="ok">OK</button><button class="btn" data-a="apply">Apply</button></div>';
      w.body.innerHTML = html;
      w.body.onclick = e => {
        const t = e.target.closest('[data-tab]'); if (t) { tab = t.dataset.tab; w.refresh(); return; }
        const th = e.target.closest('[data-th]');
        if (th) { const def = C.THEMES.find(x => x.id === th.dataset.th); if (!(C.Save.has('theme', def.id) || !def.unlock)) { C.Audio.sfx('error'); return; } pick = def.id; C.Audio.sfx('click'); w.refresh(); return; }
        const b = e.target.closest('button[data-a]'); if (!b) return;
        if (tab === 'themes') { s.theme = pick; s.wall = ''; C.Save.save(); D.applySettings(); }
        if (b.dataset.a === 'ok') closeWin('display');
      };
      w.body.oninput = e => {
        const k = e.target.dataset.set; if (!k) return;
        s[k] = e.target.type === 'checkbox' ? e.target.checked : e.target.tagName === 'SELECT' ? e.target.value : e.target.type === 'text' ? e.target.value.trim() || 'Player' : +e.target.value;
        C.Audio.setVolumes(); D.applySettings(); C.Save.save();
      };
    });
  };

  /* ---------- Event Viewer ---------- */
  APPS.events = function () {
    let tab = 'stats';
    openWin('events', 'Event Viewer', 'i_events', { w: 680, h: 500, status: true }, w => {
      const sv = SV(), s = sv.stats;
      const tabs = [['stats', 'Statistics'], ['threats', 'Threat Database'], ['software', 'Software'], ['hardware', 'Hardware']].map(t => '<button class="tab' + (tab === t[0] ? ' on' : '') + '" data-tab="' + t[0] + '">' + t[1] + '</button>').join('');
      let c = '';
      if (tab === 'stats') {
        const rows = [['Scans run', s.runs], ['Threats deleted', fmt(s.kills)], ['Fatal exceptions', s.deaths], ['Time scanning', C.Game.fmtTime(s.time)], ['Best time', C.Game.fmtTime(s.bestTime)], ['Highest level', s.bestLevel], ['Bosses defeated', s.bosses], ['Archives extracted', s.zips], ['Shortcuts broken', s.props], ['HP restored', fmt(s.healed)], ['Credits earned', fmt(s.creditsEarned)], ['Credits available', fmt(sv.credits)], ['Programs evolved', Object.keys(s.evolved).length + ' / 13'], ['Tasks completed', Object.keys(sv.tasks).length + ' / ' + C.TASKS.length]];
        c = '<table class="grid ev"><tr><th>Type</th><th>Event</th><th>Value</th></tr>' + rows.map(r => '<tr><td>ℹ️ Information</td><td>' + r[0] + '</td><td>' + r[1] + '</td></tr>').join('') +
          C.DRIVES.map(d => '<tr><td>' + (s.clears[d.id] ? '✅ Success' : '⚠️ Warning') + '</td><td>' + esc(d.name) + '</td><td>Best ' + C.Game.fmtTime(s.bestTimes[d.id] || 0) + (s.clears[d.id] ? ' · cleaned ' + s.clears[d.id] + 'x' : '') + '</td></tr>').join('') + '</table>';
      } else if (tab === 'threats') {
        c = '<div class="dex">' + Object.values(C.ENEMIES).filter(e => !e.prop).map(e => { const seen = sv.seen.enemy[e.id]; return '<div class="dx' + (seen ? '' : ' unk') + '"><img src="' + ico(seen ? 'e_' + e.id : 'i_lock') + '" alt=""><div><b>' + (seen ? esc(e.name) : '???') + '</b>' + (e.boss ? ' <em class="boss">BOSS</em>' : '') + '<small>' + (seen ? esc(e.desc || '') : 'Not encountered yet.') + '</small><small class="meta">Deleted: ' + fmt(s.killsBy[e.id] || 0) + '</small></div></div>'; }).join('') + '</div>';
      } else if (tab === 'software') {
        c = '<div class="dex">' + Object.values(C.WEAPONS).filter(x => !x.evolved).map(x => {
          const ok = sv.unlocked.weapon.includes(x.id) || Object.values(C.CHARS).some(ch => ch.weapon === x.id && sv.unlocked.char.includes(ch.id));
          const ev = C.WEAPONS[x.into], evSeen = s.evolved[x.into];
          const task = C.TASKS.find(t => t.reward.unlock && t.reward.unlock[0] === 'weapon' && t.reward.unlock[1] === x.id);
          return '<div class="dx' + (ok ? '' : ' unk') + '"><img src="' + ico(ok ? 'w_' + x.id : 'i_lock') + '" alt=""><div><b>' + esc(x.name) + '</b><small>' + (ok ? esc(x.desc) : 'Locked. ' + (task ? 'Task: ' + esc(task.name) : 'Starting program of a locked user.')) + '</small><small class="meta"><img src="' + ico(evSeen ? 'w_' + ev.id : 'i_lock') + '" alt=""> ' + (evSeen ? '<b>' + esc(ev.name) + '</b> = ' + esc(x.name) + ' Lv ' + x.max + ' + ' + esc(C.PASSIVES[x.evo].name) : 'Evolution: ??? (max level + a hardware part, then open a .zip)') + '</small></div></div>';
        }).join('') + '</div>';
      } else {
        c = '<div class="dex">' + Object.values(C.PASSIVES).map(p => { const seen = sv.seen.passive[p.id]; return '<div class="dx' + (seen ? '' : ' unk') + '"><img src="' + ico('p_' + p.id) + '" alt=""><div><b>' + esc(p.name) + '</b><small>' + esc(p.desc) + ' per level (max ' + p.max + ').</small></div></div>'; }).join('') + '</div>';
      }
      w.body.innerHTML = '<div class="tabs">' + tabs + '</div><div class="tabbody scroll">' + c + '</div>';
      w.setStatus('Log: ' + tab);
      w.body.onclick = e => { const t = e.target.closest('[data-tab]'); if (t) { tab = t.dataset.tab; C.Audio.sfx('click'); w.refresh(); } };
    });
  };

  /* ---------- ReadMe ---------- */
  APPS.readme = function () {
    openWin('readme', 'ReadMe.txt - Notepad', 'i_readme', { w: 560, h: 460, menu: ['File', 'Edit', 'Format', 'View', 'Help'], cls: 'notepad' }, w => {
      w.body.innerHTML = '<textarea readonly spellcheck="false">' + esc([
        'CTRL+ALT+SURVIVE 2003 - README',
        '==============================',
        '',
        'Your computer is infected. Badly. You are the mouse cursor.',
        'Survive the scan and delete everything that moves.',
        '',
        'CONTROLS',
        '  Move ............ WASD / arrow keys, or drag anywhere (touch)',
        '  Mouse only ...... Display > Settings > Movement: Mouse.',
        '                    Your mouse moves the cursor directly. Click the',
        '                    game to capture the mouse, Esc releases it.',
        '  Pause ........... Esc or P (opens the Task Manager)',
        '  Level-up ........ click an option, or keys 1-4 then Enter',
        '  Your programs fire on their own. Just move!',
        '',
        'HOW A SCAN WORKS',
        '  * Threats drop data gems. Collect them to level up.',
        '  * Each level-up opens the Setup Wizard: install a new',
        '    program (weapon) or hardware part (passive), or level one up.',
        '  * You can hold 6 programs and 6 hardware parts.',
        '  * Elite threats (gold glow) and bosses drop .zip archives.',
        '    Extracting one upgrades your stuff for free.',
        '  * A boss appears halfway. The final boss arrives at 8:00.',
        '    Delete it to clean the drive.',
        '  * Break desktop shortcuts for items:',
        '      Patch (heal)  Defrag (collect all gems)',
        '      End Task (freeze)  Format C: (wipe the screen)',
        '  * Bad sectors (noisy blobs) slow you down. Threats ignore them.',
        '',
        'EVOLUTIONS',
        '  Get a program to level 8 while owning its matching hardware,',
        '  then open a .zip archive. Example: Ping.exe + Power Supply.',
        '  The Task Manager (pause) shows which hardware each program wants.',
        '',
        'BETWEEN SCANS',
        '  Control Panel ... spend credits on permanent upgrades',
        '  User Accounts ... unlock new users with new starting programs',
        '  Tasks.xls ....... finish tasks to unlock programs, users,',
        '                    drives and themes',
        '  My Computer ..... pick a drive. Each one is harder.',
        '  Display ......... themes, CRT effect, sound',
        '',
        'Clean all 5 drives. Then try Hyper mode.',
        '',
        'This software is provided "as is". No floppies were harmed.'
      ].join('\n')) + '</textarea>';
    });
  };

  /* ---------- Recycle bin ---------- */
  APPS.recycle = function () {
    openWin('recycle', 'Recycle Bin', 'i_bin', { w: 420, h: 300, noMax: true, status: true }, w => {
      w.body.innerHTML = '<div class="explorer one"><div class="ex-main"><div class="ex-icons"><div class="exi"><img src="' + ico('i_folder') + '" alt=""><span>old_homework.doc</span></div><div class="exi"><img src="' + ico('ico_page') + '" alt=""><span>passwords.txt</span></div></div><p class="tip">Emptying the Recycle Bin deletes your save: credits, upgrades, unlocks and stats.</p><div class="dlg-foot"><span class="sp"></span><button class="btn" data-a="empty">Empty Recycle Bin</button></div></div></div>';
      w.setStatus('2 objects');
      w.body.onclick = e => {
        if (!e.target.closest('[data-a="empty"]')) return;
        D.confirm('Confirm File Delete', 'Are you sure you want to permanently delete ALL your progress? This cannot be undone.', 'e_error', ['Yes', 'No']).then(r => {
          if (r !== 0) return;
          closeAll(); C.Save.reset(); D.applySettings(); C.Audio.sfx('boom'); D.balloon('Recycle Bin', 'Your save was deleted. Fresh install!');
        });
      };
    });
  };

  APPS.hub = function () {
    D.confirm('GameHub.url', 'Leave Ctrl+Alt+Survive and go back to the GameHub? Your progress is saved.', 'i_globe', ['Go', 'Cancel']).then(r => { if (r === 0) location.href = '../index.html'; });
  };
})(window.CAS);
