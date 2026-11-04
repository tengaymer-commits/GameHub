/* Ctrl+Alt+Survive — dialogs shown during a run */
(function (C) {
  'use strict';
  const $ = id => document.getElementById(id);
  const ico = n => C.SPR.icon(n);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function overlay() { return $('overlay'); }
  function dialog(cls, title, iconName, html) {
    const d = document.createElement('div');
    d.className = 'win dlg ' + cls;
    d.innerHTML = '<div class="titlebar"><img class="ticon" src="' + ico(iconName) + '" alt=""><span class="ttext">' + esc(title) + '</span></div><div class="wbody">' + html + '</div>';
    const shade = document.createElement('div'); shade.className = 'shade';
    shade.appendChild(d);
    overlay().appendChild(shade);
    return { el: d, shade, close() { shade.remove(); } };
  }

  /* ---------- descriptions ---------- */
  function bonusText(d, b) {
    const out = [];
    for (const k in b) {
      const v = b[k];
      if (k === 'dmg') out.push('+' + v + ' damage');
      else if (k === 'cd') out.push(v + 's cooldown');
      else if (k === 'amount') out.push('+' + v + ' amount');
      else if (k === 'area') out.push('+' + Math.round(v * 100) + '% area');
      else if (k === 'speed') out.push('+' + Math.round(v * 100) + '% speed');
      else if (k === 'dur') out.push(d.base.dur > 1.5 ? '+' + v + 's duration' : '+' + Math.round(v * 100) + '% duration');
      else if (k === 'pierce') out.push('+' + v + ' pierce');
    }
    return out.join(', ');
  }
  C.RunUI = {};
  const RU = C.RunUI;
  RU.choiceInfo = function (c) {
    if (c.type === 'w') {
      const d = C.WEAPONS[c.id];
      const evo = d.evo ? ' <span class="hint">Evolves with ' + esc(C.PASSIVES[d.evo].name) + ' at Lv ' + d.max + '.</span>' : '';
      return { icon: 'w_' + c.id, name: d.name, tag: c.lvl === 1 ? 'NEW!' : 'Level ' + c.lvl, desc: c.lvl === 1 ? d.desc + (C.Save.data.stats.evolved[d.into] ? evo : '') : bonusText(d, d.lv[c.lvl - 2]) + '.', kind: 'Program' };
    }
    if (c.type === 'p') { const d = C.PASSIVES[c.id]; return { icon: 'p_' + c.id, name: d.name, tag: c.lvl === 1 ? 'NEW!' : 'Level ' + c.lvl, desc: d.desc + '.', kind: 'Hardware' }; }
    if (c.type === 'credits') return { icon: 'u_coin', name: 'Shareware Bundle', tag: '', desc: '+' + c.v + ' credits.', kind: 'Bonus' };
    return { icon: 'k_patch', name: 'Service Pack', tag: '', desc: 'Restore ' + c.v + ' HP.', kind: 'Bonus' };
  };

  /* ---------- level up: Setup Wizard ---------- */
  RU.levelUp = function () {
    const R = C.Game.run;
    let choices = C.Game.makeChoices();
    let sel = 0, banishMode = false;
    const dlg = dialog('levelup', 'Setup Wizard - Level ' + (R.level - R.pendingLevels + 1), 'i_scan', '');
    function render() {
      const body = dlg.el.querySelector('.wbody');
      body.innerHTML =
        '<div class="wiz"><div class="wiz-side"><div class="box-art"><img src="' + ico(C.Game.run.weapons[0] ? 'w_' + C.Game.run.weapons[0].id : 'i_scan') + '" alt=""><span>Setup</span></div></div>' +
        '<div class="wiz-main"><h3>' + (banishMode ? 'Select a component to <u>uninstall</u> for this scan:' : 'Select a component to install:') + '</h3>' +
        '<div class="opts">' + choices.map((c, i) => {
          const f = RU.choiceInfo(c);
          return '<div class="opt' + (i === sel ? ' sel' : '') + (banishMode ? ' banish' : '') + '" data-i="' + i + '"><img src="' + ico(f.icon) + '" alt=""><div class="ot"><div class="on"><b>' + esc(f.name) + '</b> <em class="' + (f.tag === 'NEW!' ? 'new' : '') + '">' + esc(f.tag) + '</em><small>' + f.kind + '</small></div><div class="od">' + f.desc + '</div></div><kbd>' + (i + 1) + '</kbd></div>';
        }).join('') + '</div></div></div>' +
        '<div class="wiz-foot"><button class="btn" data-a="banish"' + (R.banishes > 0 ? '' : ' disabled') + '>' + (banishMode ? 'Cancel' : 'Uninstall') + ' (' + R.banishes + ')</button>' +
        '<button class="btn" data-a="skip"' + (R.skips > 0 ? '' : ' disabled') + '>Skip (' + R.skips + ')</button>' +
        '<button class="btn" data-a="reroll"' + (R.rerolls > 0 ? '' : ' disabled') + '>Refresh F5 (' + R.rerolls + ')</button>' +
        '<span class="sp"></span><button class="btn primary" data-a="install">Install &gt;</button></div>';
    }
    function pick(i) {
      const c = choices[i]; if (!c) return;
      if (banishMode) {
        if (c.type !== 'w' && c.type !== 'p') return;
        C.Game.banish(c); banishMode = false; choices = C.Game.makeChoices(); sel = 0; C.Audio.sfx('close'); render(); return;
      }
      finish(c);
    }
    function finish(c) {
      document.removeEventListener('keydown', onKey, true);
      dlg.close();
      C.Audio.sfx('install');
      C.Game.chooseLevel(c);
    }
    function onKey(e) {
      if (/^Digit[1-4]$/.test(e.code)) { const i = +e.code.slice(5) - 1; if (i < choices.length) { sel = i; pick(i); } e.preventDefault(); e.stopPropagation(); }
      else if (e.code === 'Enter' || e.code === 'Space') { pick(sel); e.preventDefault(); e.stopPropagation(); }
      else if (e.code === 'ArrowUp' || e.code === 'KeyW') { sel = (sel + choices.length - 1) % choices.length; render(); e.preventDefault(); e.stopPropagation(); }
      else if (e.code === 'ArrowDown' || e.code === 'KeyS') { sel = (sel + 1) % choices.length; render(); e.preventDefault(); e.stopPropagation(); }
      else if (e.code === 'F5' && R.rerolls > 0) { R.rerolls--; choices = C.Game.makeChoices(); sel = 0; render(); e.preventDefault(); e.stopPropagation(); }
    }
    document.addEventListener('keydown', onKey, true);
    dlg.el.addEventListener('click', e => {
      const o = e.target.closest('.opt');
      if (o) { const i = +o.dataset.i; if (sel === i || banishMode || e.detail > 1 || matchMedia('(pointer: coarse)').matches) pick(i); else { sel = i; C.Audio.sfx('click'); render(); } return; }
      const b = e.target.closest('button'); if (!b || b.disabled) return;
      const a = b.dataset.a;
      if (a === 'install') pick(sel);
      else if (a === 'skip') { R.skips--; finish(null); }
      else if (a === 'reroll') { R.rerolls--; choices = C.Game.makeChoices(); sel = 0; C.Audio.sfx('click'); render(); }
      else if (a === 'banish') { banishMode = !banishMode; C.Audio.sfx('click'); render(); }
    });
    render();
  };

  /* ---------- zip archive ---------- */
  RU.zip = function (items, bonus, done) {
    const dlg = dialog('zipdlg', 'Extracting archive_' + Math.floor(Math.random() * 900 + 100) + '.zip', 'k_zip',
      '<div class="zip-top"><img src="' + ico('k_zip') + '" alt=""><div><div>Extracting files to <b>C:\\Program Files\\</b></div><div class="progress"><div class="pfill" id="zipFill"></div></div></div></div>' +
      '<div class="zip-list" id="zipList"></div><div class="dlg-foot"><span id="zipBonus"></span><span class="sp"></span><button class="btn primary" id="zipOk">Skip</button></div>');
    const list = dlg.el.querySelector('#zipList'), fill = dlg.el.querySelector('#zipFill'), ok = dlg.el.querySelector('#zipOk');
    let i = 0, finished = false;
    const T = 1300 + items.length * 250;
    const t0 = performance.now();
    function row(it) {
      let icon, text, cls = '';
      if (it.type === 'evo') { icon = 'w_' + it.id; text = '<b>EVOLVED!</b> ' + esc(C.WEAPONS[it.from].name) + ' &rarr; <b>' + esc(C.WEAPONS[it.id].name) + '</b>'; cls = 'evo'; C.Audio.sfx('evolve'); }
      else if (it.type === 'w') { icon = 'w_' + it.id; text = esc(C.WEAPONS[it.id].name) + ' &rarr; Level ' + it.lvl; }
      else if (it.type === 'p') { icon = 'p_' + it.id; text = esc(C.PASSIVES[it.id].name) + ' &rarr; Level ' + it.lvl; }
      else { icon = 'u_coin'; text = '+' + it.v + ' credits'; }
      const d = document.createElement('div'); d.className = 'zrow ' + cls; d.innerHTML = '<img src="' + ico(icon) + '" alt=""><span>' + text + '</span>';
      list.appendChild(d);
      if (it.type !== 'evo') C.Audio.sfx('install');
    }
    function tick() {
      if (finished) return;
      const k = Math.min(1, (performance.now() - t0) / T);
      fill.style.width = (k * 100) + '%';
      while (i < items.length && k >= (i + 1) / (items.length + 1)) row(items[i++]);
      if (k >= 1) complete(); else requestAnimationFrame(tick);
    }
    function complete() {
      while (i < items.length) row(items[i++]);
      finished = true; fill.style.width = '100%';
      dlg.el.querySelector('#zipBonus').textContent = '+' + bonus + ' credits found in archive';
      ok.textContent = 'OK';
    }
    function close() { document.removeEventListener('keydown', onKey, true); dlg.close(); done(); }
    function onKey(e) { if (e.code === 'Enter' || e.code === 'Space' || e.code === 'Escape') { e.preventDefault(); e.stopPropagation(); if (finished) close(); else complete(); } }
    document.addEventListener('keydown', onKey, true);
    ok.addEventListener('click', () => { if (finished) close(); else complete(); });
    requestAnimationFrame(tick);
  };

  /* ---------- pause: Task Manager ---------- */
  let pauseDlg = null;
  RU.openPause = function () {
    if (pauseDlg || !C.Game.run || C.Game.run.over) return;
    C.Game.pause('menu');
    const R = C.Game.run;
    const dlg = dialog('taskmgr', 'Task Manager', 'i_computer', '');
    pauseDlg = dlg;
    let tab = 'apps';
    function render() {
      const S = R.S;
      const tabs = ['apps:Applications', 'proc:Hardware', 'perf:Performance', 'opts:Options'].map(t => { const [k, n] = t.split(':'); return '<button class="tab' + (k === tab ? ' on' : '') + '" data-tab="' + k + '">' + n + '</button>'; }).join('');
      let content = '';
      if (tab === 'apps') {
        content = '<table class="grid"><tr><th>Program</th><th>Level</th><th>Damage</th><th>Status</th></tr>' +
          R.weapons.map(w => { const d = C.WEAPONS[w.id]; return '<tr><td><img src="' + ico('w_' + w.id) + '" alt="">' + esc(d.name) + '</td><td>' + (d.evolved ? '★' : w.lvl + '/' + d.max) + '</td><td>' + Math.round(R.st.dmgBy[w.id] || 0).toLocaleString() + '</td><td>Running</td></tr>'; }).join('') + '</table>';
        const ev = R.weapons.filter(w => !C.WEAPONS[w.id].evolved && C.WEAPONS[w.id].evo).map(w => { const d = C.WEAPONS[w.id]; const known = C.Save.data.stats.evolved[d.into]; return '<li><img src="' + ico('w_' + w.id) + '" alt=""> + <img src="' + ico('p_' + d.evo) + '" alt=""> ' + (known ? esc(C.WEAPONS[d.into].name) : '???') + (R.passives[d.evo] ? ' <span class="ok">✔ hardware</span>' : '') + (w.lvl >= d.max ? ' <span class="ok">✔ Lv max</span>' : '') + '</li>'; }).join('');
        if (ev) content += '<div class="note">Evolutions (open a .zip when ready):<ul class="evo-list">' + ev + '</ul></div>';
      } else if (tab === 'proc') {
        content = '<table class="grid"><tr><th>Hardware</th><th>Level</th><th>Effect</th></tr>' + (R.passiveOrder.length ? R.passiveOrder.map(id => { const d = C.PASSIVES[id]; return '<tr><td><img src="' + ico('p_' + id) + '" alt="">' + esc(d.name) + '</td><td>' + R.passives[id] + '/' + d.max + '</td><td>' + esc(d.desc) + '</td></tr>'; }).join('') : '<tr><td colspan="3">No hardware installed yet.</td></tr>') + '</table>';
      } else if (tab === 'perf') {
        const rows = [['Max HP', S.maxHpFinal], ['Recovery', S.recovery.toFixed(1) + '/s'], ['Armor', S.armor], ['Move speed', pct(S.move)], ['Damage', pct(S.might)], ['Area', pct(S.area)], ['Projectile speed', pct(S.speed)], ['Duration', pct(S.duration)], ['Amount', '+' + S.amount], ['Cooldown', pct(S.cooldown)], ['Luck', pct(S.luck)], ['Experience', pct(S.growth)], ['Credits', pct(S.greed)], ['Pickup range', pct(S.magnet)], ['Curse', pct(S.curse)], ['Revivals', R.revivals]];
        content = '<div class="perf"><div class="graph"><canvas id="perfCv" width="220" height="80"></canvas><span>CPU Usage</span></div><table class="grid kv">' + rows.map(r => '<tr><td>' + r[0] + '</td><td>' + r[1] + '</td></tr>').join('') + '</table></div>';
      } else {
        const s = C.Save.data.settings;
        content = '<div class="optsform">' + '<label>Movement <select data-set="moveMode"><option value="keys"' + (s.moveMode !== 'mouse' ? ' selected' : '') + '>Keyboard / drag</option><option value="mouse"' + (s.moveMode === 'mouse' ? ' selected' : '') + '>Mouse (direct control)</option></select></label><label>Mouse speed <input type="range" min="0.3" max="2.5" step="0.1" value="' + (s.mouseSens || 1) + '" data-set="mouseSens"></label>' + '<label>Sound effects <input type="range" min="0" max="1" step="0.05" value="' + s.vol + '" data-set="vol"></label><label>Music <input type="range" min="0" max="1" step="0.05" value="' + s.music + '" data-set="music"></label><label><input type="checkbox" data-set="dmgNums"' + (s.dmgNums ? ' checked' : '') + '> Show damage numbers</label><label><input type="checkbox" data-set="shake"' + (s.shake ? ' checked' : '') + '> Screen shake</label><label><input type="checkbox" data-set="crt"' + (s.crt ? ' checked' : '') + '> CRT monitor effect</label></div>';
      }
      dlg.el.querySelector('.wbody').innerHTML = '<div class="tabs">' + tabs + '</div><div class="tabbody">' + content + '</div>' +
        '<div class="dlg-foot"><span class="status">Processes: ' + (R.enemyCount) + ' &nbsp; Threats deleted: ' + R.kills + ' &nbsp; ' + esc(R.drive.name) + (R.hyper ? ' (Hyper)' : '') + '</span><span class="sp"></span><button class="btn" data-a="quit">End Task</button><button class="btn primary" data-a="resume">Resume</button></div>';
      const pc = dlg.el.querySelector('#perfCv');
      if (pc) { const x = pc.getContext('2d'); x.fillStyle = '#000'; x.fillRect(0, 0, 220, 80); x.strokeStyle = '#0a5a0a'; for (let i = 0; i < 220; i += 12) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i, 80); x.stroke(); } for (let j = 0; j < 80; j += 12) { x.beginPath(); x.moveTo(0, j); x.lineTo(220, j); x.stroke(); } x.strokeStyle = '#39ff7a'; x.lineWidth = 1.5; x.beginPath(); for (let i = 0; i <= 44; i++) { const v = 40 + Math.sin(i * 0.7 + R.time) * 15 + Math.random() * 18 - R.enemyCount / 12; x.lineTo(i * 5, Math.max(4, Math.min(76, v))); } x.stroke(); }
    }
    const pct = v => Math.round(v * 100) + '%';
    dlg.el.addEventListener('click', e => {
      const t = e.target.closest('[data-tab]'); if (t) { tab = t.dataset.tab; C.Audio.sfx('click'); render(); return; }
      const b = e.target.closest('button[data-a]'); if (!b) return;
      if (b.dataset.a === 'resume') RU.closePause();
      else if (b.dataset.a === 'quit') C.Desktop.confirm('End Task', 'End the scan now? You keep the credits you collected.', 'i_shutdown', ['End Task', 'Cancel']).then(r => { if (r === 0) { RU.closePause(true); C.Game.end('quit'); } });
    });
    dlg.el.addEventListener('input', e => {
      const k = e.target.dataset.set; if (!k) return;
      const s = C.Save.data.settings;
      s[k] = e.target.type === 'checkbox' ? e.target.checked : e.target.tagName === 'SELECT' ? e.target.value : +e.target.value;
      C.Audio.setVolumes(); C.Desktop.applySettings(); C.Save.save();
    });
    render();
  };
  RU.closePause = function (silent) {
    if (!pauseDlg) return;
    pauseDlg.close(); pauseDlg = null;
    C.Game.resume('menu');
    if (!silent) C.Audio.sfx('click');
  };

  /* ---------- banners ---------- */
  RU.banner = function (text, dur) {
    let stack = overlay().querySelector('.banners');
    if (!stack) { stack = document.createElement('div'); stack.className = 'banners'; overlay().appendChild(stack); }
    if (stack.children.length > 3) stack.firstChild.remove();
    const b = document.createElement('div'); b.className = 'balloon-run'; b.textContent = text;
    stack.appendChild(b);
    setTimeout(() => b.classList.add('out'), (dur || 2) * 1000);
    setTimeout(() => b.remove(), (dur || 2) * 1000 + 500);
  };
  RU.bossWarning = function (name, final) {
    const b = document.createElement('div'); b.className = 'boss-warn';
    b.innerHTML = '<div class="bw-title">⚠ ' + (final ? 'CRITICAL THREAT DETECTED' : 'THREAT DETECTED') + '</div><div class="bw-name">' + esc(name) + '</div>';
    overlay().appendChild(b);
    setTimeout(() => b.remove(), 3200);
  };

  /* ---------- end of run report ---------- */
  RU.report = function (r) {
    overlay().querySelectorAll('.shade').forEach(s => s.remove());
    pauseDlg = null;
    const ch = C.CHARS[r.char];
    const head = r.reason === 'dead'
      ? '<div class="fatal-box"><b>FATAL EXCEPTION 0E</b><p>A fatal exception has occurred at ' + esc(r.drive.name) + '. The current scan has been terminated.</p><p>* Press OK to return to the desktop.<br>* Your credits were saved.</p></div>'
      : r.reason === 'win'
        ? '<div class="win-box"><img src="' + ico('i_scan') + '" alt=""><div><b>Scan complete.</b><p>' + esc(r.drive.name) + ' is clean. 0 threats remaining.' + (r.hyper ? ' (Hyper mode)' : '') + '</p></div></div>'
        : '<div class="win-box quit"><img src="' + ico('i_shutdown') + '" alt=""><div><b>Scan cancelled.</b><p>The program was ended by the user.</p></div></div>';
    const dmgRows = r.dmg.map(d => '<tr><td><img src="' + ico('w_' + d.id) + '" alt="">' + esc(C.WEAPONS[d.id] ? C.WEAPONS[d.id].name : d.id) + '</td><td>' + d.lvl + '</td><td>' + d.dmg.toLocaleString() + '</td></tr>').join('');
    const tasks = r.tasks.length ? '<div class="note"><b>Tasks completed:</b><ul>' + r.tasks.map(t => '<li>✔ ' + esc(t.name) + ' <em>+' + (t.reward.credits || 0) + ' cr' + (t.reward.unlock ? ', unlocks ' + unlockName(t.reward.unlock) : '') + '</em></li>').join('') + '</ul></div>' : '';
    const dlg = dialog('report', 'System Report', r.reason === 'dead' ? 'e_error' : 'i_scan',
      head +
      '<div class="rep-grid"><div><table class="grid kv">' +
      '<tr><td>User</td><td><img src="' + ico('c_' + r.char) + '" alt="">' + esc(ch.name) + '</td></tr>' +
      '<tr><td>Drive</td><td>' + esc(r.drive.name) + '</td></tr>' +
      '<tr><td>Time survived</td><td>' + C.Game.fmtTime(r.time) + '</td></tr>' +
      '<tr><td>Level</td><td>' + r.level + '</td></tr>' +
      '<tr><td>Threats deleted</td><td>' + r.kills.toLocaleString() + '</td></tr>' +
      '<tr><td>Bosses</td><td>' + r.bosses + '</td></tr>' +
      '<tr><td>Archives extracted</td><td>' + r.zips + '</td></tr>' +
      '<tr class="hl"><td>Credits earned</td><td>+' + r.credits.toLocaleString() + '</td></tr></table></div>' +
      '<div><table class="grid"><tr><th>Program</th><th>Lv</th><th>Damage</th></tr>' + dmgRows + '</table></div></div>' + tasks +
      '<div class="dlg-foot"><span class="sp"></span><button class="btn" data-a="again">Scan again</button><button class="btn primary" data-a="ok">OK</button></div>');
    dlg.el.addEventListener('click', e => {
      const b = e.target.closest('button[data-a]'); if (!b) return;
      dlg.close();
      C.Audio.sfx('click');
      if (b.dataset.a === 'again') C.Desktop.startRun({ char: r.char, drive: r.drive.id, hyper: r.hyper });
      else C.Desktop.show(r.tasks);
    });
  };
  function unlockName(u) {
    const [type, id] = u;
    if (type === 'weapon') return C.WEAPONS[id].name;
    if (type === 'char') return 'user ' + C.CHARS[id].name;
    if (type === 'drive') return C.drive(id).name;
    if (type === 'theme') return 'theme ' + (C.THEMES.find(t => t.id === id) || {}).name;
    return id;
  }
  RU.unlockName = unlockName;
})(window.CAS);
