/* GameHub shell: town hub, chests, game launcher, results, economy. */
(function () {
  'use strict';
  const { Save, Stage, UI, sfx, Games, fmt, Town } = GH;
  const $ = (s) => document.querySelector(s);

  Save.load();

  const ORDER = ['frost', 'gate', 'pin'];
  const REWARDS = {
    pin: ['🪙 Gold', '📦 Chests'],
    gate: ['🪖 Troops', '🪙 Gold', '📦 Boss chests'],
    frost: ['🥩 Food', '📦 Chests', '💤 Offline'],
  };
  let town = null;

  // ================================================================= HUB
  function renderWallet() {
    for (const k of ['coins', 'food', 'troops', 'gems']) $('#res-' + k).textContent = fmt(Save.data[k]);
    Monetization.refreshBanner();
  }

  let gamesHtml = '';
  function renderGames() {
    const html = ORDER.map((id) => {
      const g = Games[id];
      const off = g.offlinePreview ? g.offlinePreview() : null;
      return `<button class="game-card" data-game="${id}">
        <div class="art" style="--c1:${g.colors[0]};--c2:${g.colors[1]}">${g.icon}</div>
        <div class="info"><h3>${g.name}</h3>
          <div class="chips">${REWARDS[id].map((r) => `<span class="chip">${r}</span>`).join('')}</div>
          <span class="tag">${g.levelLabel ? g.levelLabel() : 'Level ' + Save.data.levels[id]}</span>
          ${off ? `<span class="tag off">💤 +${fmt(off.meat)} 🥩 waiting</span>` : ''}</div>
        <span class="btn small green play">PLAY</span></button>`;
    }).join('');
    if (html !== gamesHtml) { gamesHtml = html; $('#game-list').innerHTML = html; }
  }
  $('#game-list').addEventListener('click', (e) => {
    const card = e.target.closest('[data-game]');
    if (card) { sfx('tap'); launch(card.dataset.game); }
  });

  function fmtTime(s) {
    if (s >= 3600) return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
    if (s >= 60) return `${Math.floor(s / 60)}m ${s % 60}s`;
    return `${s}s`;
  }

  function renderChests() {
    const box = $('#chest-slots');
    if (!box.children.length) {
      for (let i = 0; i < Save.data.chests.length; i++) {
        const el = document.createElement('button');
        el.addEventListener('click', () => chestTap(i));
        box.appendChild(el);
      }
    }
    Save.data.chests.forEach((c, i) => {
      const el = box.children[i];
      const st = Town.chestState(c);
      let html;
      if (st === 'empty') {
        html = '<span class="ico">＋</span><small>Win a level</small>';
      } else {
        const def = Town.CHESTS[c.type];
        el.style.setProperty('--cc', def.color);
        const sub = st === 'ready' ? '<b>OPEN!</b>' : st === 'unlocking' ? `<b>${fmtTime(Town.chestLeft(c))}</b>` : `<small>${Town.unlocking() ? 'Locked' : 'Tap to unlock'}</small><small>${fmtTime(Town.chestSecs(c))}</small>`;
        html = `<span class="ico">${def.icon}</span>${sub}`;
      }
      el.className = 'chest ' + st;
      if (el.innerHTML !== html) el.innerHTML = html;
    });
  }

  function chestTap(i) {
    const c = Save.data.chests[i];
    const st = Town.chestState(c);
    if (st === 'empty') { UI.toast('Win mini-game levels to earn chests'); return; }
    sfx('tap');
    if (st === 'ready') { Town.openChest(i); return; }
    if (st === 'locked' && !Town.unlocking()) { Town.startUnlock(i); renderChests(); return; }
    const def = Town.CHESTS[c.type];
    const gems = Town.gemsToOpen(c);
    const adOpens = c.type !== 'gold';
    UI.modal({
      icon: def.icon, title: def.name,
      sub: st === 'unlocking' ? `Unlocks in ${fmtTime(Town.chestLeft(c))}` : 'Another chest is unlocking. Open this one now?',
      buttons: [
        { label: `Open now · 💎 ${gems}`, cls: 'gold', disabled: Save.data.gems < gems, onClick: () => { Save.data.gems -= gems; Town.openChest(i); } },
        { label: adOpens ? 'Open with ad' : 'Halve the time', cls: 'green ad', onClick: async () => {
          if (!(await Monetization.showRewarded('chest_speedup'))) return;
          if (adOpens) Town.openChest(i);
          else { c.start = (c.start || Date.now()) - (Town.chestLeft(c) * 1000) / 2; Save.save(); }
        } },
        { label: 'Later', cls: 'ghost' },
      ],
    });
  }

  function renderItems() {
    const box = $('#item-list');
    box.innerHTML = Object.entries(Town.ITEMS).map(([id, it]) =>
      `<div class="item"><span class="ico">${it.icon}</span><b>×${Save.data.items[id] || 0}</b><small>${it.game}</small></div>`).join('');
  }

  function openBuilding(id) {
    const b = Town.BUILDINGS[id];
    const l = Town.lv(id);
    const maxed = l >= Town.maxLevel(id);
    const cost = Town.nextCost(id);
    const pend = Town.pending(id);
    const costHtml = Object.entries(cost).filter(([, v]) => v > 0).map(([k, v]) =>
      `<span class="chip ${Save.data[k] >= v ? '' : 'short'}">${Town.RES[k].icon} ${fmt(v)}</span>`).join('');
    const body = `
      <div class="bld-info">
        ${l ? `<p><b>Now:</b> ${b.desc(l)}</p>` : '<p>Not built yet.</p>'}
        ${id === 'hall' && l >= b.max ? '' : `<p><b>${l ? 'Next' : 'Level 1'}:</b> ${b.desc(l + 1)}</p>`}
        ${maxed && id !== 'hall' ? '<p class="warn">Upgrade the Town Hall to raise this building\'s cap.</p>' : ''}
      </div>
      ${maxed ? '' : `<div class="cost">${costHtml}</div>`}`;
    const buttons = [];
    if (pend > 0) buttons.push({ label: `Collect ${fmt(pend)} ${Town.RES[b.produces].icon}`, cls: 'green', onClick: () => { Town.collect(id); town && town.refresh(); } });
    if (!maxed) buttons.push({ label: l ? `Upgrade to Lv ${l + 1}` : 'Build', cls: 'gold', disabled: !Save.canAfford(cost), onClick: () => { if (Town.upgrade(id)) { town && town.refresh(); UI.toast(`${b.name} Lv ${Town.lv(id)}!`); } } });
    buttons.push({ label: 'Close', cls: 'ghost' });
    UI.modal({ icon: b.icon, title: `${b.name}${l ? ` · Lv ${l}` : ''}`, body, buttons, dismissable: true });
  }

  function renderShop() {
    const list = $('#shop-list');
    list.innerHTML = '';
    const free = document.createElement('div');
    free.className = 'product';
    const cd = Save.data.stats.lastFreeCoinsAd + Monetization.config.freeCoinsCooldownMs - Date.now();
    free.innerHTML = `<div class="ico">📺</div><div class="info"><h4>Free supplies</h4><p>Watch a short ad for 🪙 100 · 🥩 30 · 🪖 15</p></div>`;
    const fb = document.createElement('button');
    fb.className = 'btn small green ad';
    fb.textContent = cd > 0 ? `${Math.ceil(cd / 60000)}m` : 'FREE';
    fb.disabled = cd > 0;
    fb.addEventListener('click', async () => {
      if (await Monetization.showRewarded('shop_free_supplies')) {
        Save.data.stats.lastFreeCoinsAd = Date.now();
        Save.grant({ coins: 100, food: 30, troops: 15 });
        UI.toast('+100 🪙  +30 🥩  +15 🪖');
      }
    });
    free.appendChild(fb);
    list.appendChild(free);

    for (const p of Monetization.products) {
      const owned = p.id === 'remove_ads' && Save.data.noAds;
      const el = document.createElement('div');
      el.className = 'product' + (p.featured ? ' featured' : '');
      el.innerHTML = `<div class="ico">${p.icon}</div><div class="info"><h4>${p.name}${p.badge ? `<span class="badge">${p.badge}</span>` : ''}</h4><p>${p.desc}</p></div>`;
      const b = document.createElement('button');
      b.className = 'btn small gold';
      b.textContent = owned ? 'OWNED' : p.price;
      b.disabled = owned;
      b.addEventListener('click', () => Monetization.purchase(p.id));
      el.appendChild(b);
      list.appendChild(el);
    }
  }

  function renderAll() {
    renderWallet();
    if (current) return; // the hub is hidden while a game runs
    renderGames();
    renderChests();
    renderItems();
    renderShop();
    if (town) town.refresh();
    $('#opt-sound').checked = Save.data.settings.sound;
    $('#opt-vibe').checked = Save.data.settings.vibe;
    const ready = Date.now() - Save.data.lastDaily > 20 * 3600 * 1000;
    $('#daily-btn').classList.toggle('gold', ready);
    $('#daily-btn').classList.toggle('ghost', !ready);
  }
  document.addEventListener('save-changed', renderAll);

  let tab = 'home';
  function showTab(name) {
    tab = name;
    document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === name));
    document.querySelectorAll('.bottom-nav button').forEach((b) => b.classList.toggle('active', b.dataset.nav === name));
    $('#hub-main').scrollTop = 0;
    if (name === 'shop') renderShop();
    if (town) town.setActive(name === 'home' && !current);
  }
  document.querySelectorAll('[data-nav]').forEach((b) => b.addEventListener('click', () => { sfx('tap'); showTab(b.dataset.nav); }));
  document.querySelectorAll('[data-open]').forEach((b) => b.addEventListener('click', () => { sfx('tap'); if (current) return; showTab(b.dataset.open); }));

  $('#daily-btn').addEventListener('click', () => {
    const ready = Date.now() - Save.data.lastDaily > 20 * 3600 * 1000;
    if (!ready) {
      const left = 20 * 3600 * 1000 - (Date.now() - Save.data.lastDaily);
      UI.toast(`Next reward in ${Math.ceil(left / 3600000)}h`);
      return;
    }
    const base = { coins: 100, food: 40, troops: 20, gems: 5 };
    const grant = (mult) => {
      Save.data.lastDaily = Date.now();
      const r = {};
      for (const k in base) r[k] = base[k] * mult;
      Save.grant(r);
      sfx('win');
      UI.toast(`Daily reward ×${mult} collected!`);
    };
    UI.modal({
      icon: '🎁', title: 'Daily reward', cls: 'win',
      body: `<div class="chips center">${Town.rewardChips(base)}</div>`,
      buttons: [
        { label: 'Claim ×2', cls: 'gold ad', onClick: async () => { grant((await Monetization.showRewarded('daily_x2')) ? 2 : 1); } },
        { label: 'Claim', cls: 'ghost', onClick: () => grant(1) },
      ],
    });
  });

  $('#opt-sound').addEventListener('change', (e) => { Save.data.settings.sound = e.target.checked; Save.save(); });
  $('#opt-vibe').addEventListener('change', (e) => { Save.data.settings.vibe = e.target.checked; Save.save(); });
  $('#reset-btn').addEventListener('click', () => {
    UI.modal({
      title: 'Reset progress?', sub: 'Your town, camp, resources, chests and purchases will be wiped.',
      buttons: [
        { label: 'Reset', cls: 'danger', onClick: () => { Save.reset(); UI.toast('Progress reset'); } },
        { label: 'Cancel', cls: 'ghost' },
      ],
    });
  });

  // ================================================================= GAME SHELL
  const canvas = $('#game-canvas');
  const stage = new Stage(canvas);
  let current = null; // { id, game, level }
  let raf = 0;
  let last = 0;

  const api = {
    setHudButtons(btns) {
      const box = $('#hud-actions');
      box.innerHTML = '';
      for (const b of btns) {
        const el = document.createElement('button');
        el.className = 'btn ' + (b.cls || '');
        el.innerHTML = b.label;
        if (b.id) el.id = b.id;
        el.addEventListener('click', () => { sfx('tap'); b.onClick(el); });
        box.appendChild(el);
      }
    },
    setTitle(t) { $('#hud-title').textContent = t; },
    setLevelLabel(t) { $('#hud-level').textContent = t; },
    win(res) { setTimeout(() => showWin(res), 250); },
    lose(res) { setTimeout(() => showLose(res), 250); },
    runOver(res) { setTimeout(() => showRunOver(res), 350); },
  };

  function launch(id, level) {
    stop();
    const def = Games[id];
    level = level || Save.data.levels[id];
    if (town) town.setActive(false);
    $('#hub').classList.remove('active');
    $('#game-screen').classList.add('active');
    $('#hud-level').textContent = def.levelLabel ? def.levelLabel() : `Level ${level}`;
    stage.resize();
    const game = def.create({ stage, api, level, save: Save.data });
    $('#hud-title').textContent = game.title || def.name;
    current = { id, game, level };
    window.__game = game; // handy for debugging in devtools
    Monetization.track('level_start', { game: id, level });
    last = performance.now();
    raf = requestAnimationFrame(loop);
  }

  function loop(now) {
    raf = requestAnimationFrame(loop);
    if (!current) return;
    // rAF timestamps can predate the performance.now() taken at launch; never step backwards
    const dt = Math.max(0, Math.min(0.033, (now - last) / 1000));
    last = Math.max(last, now);
    const g = current.game;
    if (!g.paused && UI.modalCount === 0 && !document.querySelector('.ad-player')) g.update(dt);
    stage.begin();
    g.draw(stage.ctx);
  }

  function stop() {
    cancelAnimationFrame(raf);
    if (current) current.game.destroy();
    current = null;
    window.__game = null;
  }

  function goHome() {
    stop();
    $('#game-screen').classList.remove('active');
    $('#hub').classList.add('active');
    showTab('home');
    renderAll();
  }

  $('#game-back').addEventListener('click', () => {
    sfx('tap');
    if (!current) return goHome();
    const g = current.game;
    g.paused = true;
    const buttons = [{ label: 'Resume', cls: 'green', onClick: () => { g.paused = false; } }];
    if (!Games[current.id].continuous) buttons.push({ label: 'Restart', cls: 'ghost', onClick: () => launch(current.id, current.level) });
    buttons.push({ label: 'Back to town', cls: 'ghost', onClick: goHome });
    UI.modal({ title: 'Paused', icon: '⏸️', buttons });
  });

  // pointer input -> game (3D games attach their own listeners)
  const ptr = (fn) => (e) => {
    if (!current) return;
    const g = current.game;
    if (g.paused || UI.modalCount) return;
    e.preventDefault();
    if (fn === 'onDown') { try { canvas.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ } }
    if (g[fn]) g[fn](stage.toLocal(e));
  };
  canvas.addEventListener('pointerdown', ptr('onDown'));
  canvas.addEventListener('pointermove', ptr('onMove'));
  canvas.addEventListener('pointerup', ptr('onUp'));
  canvas.addEventListener('pointercancel', ptr('onUp'));
  window.addEventListener('resize', () => { if (current) stage.resize(); });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && current && !UI.modalCount && current.game.state !== 'done') $('#game-back').click();
  });

  // ================================================================= RESULTS
  function showWin({ coins, troops, text }) {
    if (!current) return;
    const { id, level } = current;
    sfx('win');
    GH.vibrate([30, 30, 60]);
    Save.data.levels[id] = Math.max(Save.data.levels[id], level + 1);
    const gold = Math.round(coins * Town.bonus.goldMult());
    const chestType = Town.rollChest(level);
    const slot = Town.addChest(chestType);
    Save.save();
    Monetization.track('level_complete', { game: id, level });
    const chestLine = slot >= 0
      ? `<div class="loot"><span>${Town.CHESTS[chestType].icon}</span><b>${Town.CHESTS[chestType].name}</b></div>`
      : '<div class="loot muted-loot"><span>📦</span><b>Chest slots full. Open some in town!</b></div>';
    const next = async (mult, watchedAd) => {
      Save.grant({ coins: gold * mult, troops: troops || 0 });
      UI.toast(`+${fmt(gold * mult)} 🪙${troops ? `  +${fmt(troops)} 🪖` : ''}`);
      if (watchedAd) Monetization.resetInterstitialCounter();
      else await Monetization.maybeInterstitial('level_complete');
    };
    UI.modal({
      cls: 'win', icon: '🏆', title: 'Victory!', sub: text || '',
      body: `<div class="chips center big">${Town.rewardChips({ coins: gold, troops: troops || 0 })}</div><div class="loot-list">${chestLine}</div>`,
      buttons: [
        { label: `Gold ×3 (🪙 ${fmt(gold * 3)})`, cls: 'gold ad', onClick: async () => {
          const ok = await Monetization.showRewarded('win_x3');
          await next(ok ? 3 : 1, ok);
          launch(id, level + 1);
        } },
        { label: 'Next level ▶', cls: 'green', onClick: async () => { await next(1, false); launch(id, level + 1); } },
        { label: 'Back to town', cls: 'ghost', onClick: async () => { await next(1, false); goHome(); } },
      ],
    });
  }

  /** End of an endless run: rewards are granted once, when the player leaves this screen. */
  function showRunOver(res) {
    if (!current) return;
    const { id, game } = current;
    sfx('lose');
    Monetization.track('run_over', { game: id, stats: res.stats });
    const chestDef = res.chest && Town.CHESTS[res.chest];
    const collect = async (mult, watchedAd) => {
      Save.grant({ coins: res.rewards.coins * mult, troops: (res.rewards.troops || 0) * mult });
      let msg = `+${fmt(res.rewards.coins * mult)} 🪙  +${fmt((res.rewards.troops || 0) * mult)} 🪖`;
      if (res.chest) msg += Town.addChest(res.chest) >= 0 ? `  ${chestDef.icon}` : '  (chest slots full)';
      UI.toast(msg);
      if (watchedAd) Monetization.resetInterstitialCounter();
      else await Monetization.maybeInterstitial('run_over');
    };
    const buttons = [];
    if (res.canRevive && game.revive) {
      buttons.push({ label: 'Revive and keep running', cls: 'gold ad', onClick: async () => {
        if (await Monetization.showRewarded('revive')) { Monetization.resetInterstitialCounter(); game.revive(); } else showRunOver(res);
      } });
      buttons.push({ label: 'Revive for 💎 10', cls: 'ghost', disabled: Save.data.gems < 10, onClick: () => { Save.addGems(-10); game.revive(); } });
    }
    buttons.push({ label: 'Rewards ×2', cls: 'gold ad', onClick: async () => { const ok = await Monetization.showRewarded('run_x2'); await collect(ok ? 2 : 1, ok); launch(id); } });
    buttons.push({ label: 'Collect & run again', cls: 'green', onClick: async () => { await collect(1, false); launch(id); } });
    buttons.push({ label: 'Collect & back to town', cls: 'ghost', onClick: async () => { await collect(1, false); goHome(); } });
    UI.modal({
      cls: res.title === 'New record!' ? 'win' : 'lose', icon: res.title === 'New record!' ? '🏆' : '🏁', title: res.title,
      body: `<div class="run-stats">${res.stats.map(([k, v]) => `<div><small>${k}</small><b>${v}</b></div>`).join('')}</div>
        <div class="chips center big">${Town.rewardChips(res.rewards)}</div>
        ${chestDef ? `<div class="loot-list"><div class="loot"><span>${chestDef.icon}</span><b>${chestDef.name}</b></div></div>` : ''}`,
      buttons,
    });
  }

  function showLose({ reason, canRevive }) {
    if (!current) return;
    const { id, level, game } = current;
    sfx('lose');
    Monetization.track('level_fail', { game: id, level, reason });
    const buttons = [];
    if (canRevive && game.revive) {
      buttons.push({ label: 'Revive', cls: 'gold ad', onClick: async () => {
        const ok = await Monetization.showRewarded('revive');
        if (ok) { Monetization.resetInterstitialCounter(); game.revive(); }
        else showLose({ reason, canRevive });
      } });
      buttons.push({ label: 'Revive for 💎 10', cls: 'ghost', disabled: Save.data.gems < 10, onClick: () => { Save.addGems(-10); game.revive(); } });
    }
    if (id === 'pin') {
      buttons.push({ label: 'Skip level', cls: 'ghost ad', onClick: async () => {
        const ok = await Monetization.showRewarded('pin_skip');
        if (ok) { Monetization.resetInterstitialCounter(); Save.data.levels[id] = Math.max(Save.data.levels[id], level + 1); Save.save(); launch(id, level + 1); }
        else showLose({ reason, canRevive });
      } });
    }
    buttons.push({ label: 'Retry ↻', cls: 'green', onClick: async () => { await Monetization.maybeInterstitial('level_fail'); launch(id, level); } });
    buttons.push({ label: 'Back to town', cls: 'ghost', onClick: goHome });
    UI.modal({ cls: 'lose', icon: '💀', title: 'Defeated', sub: reason || '', buttons });
  }

  // ================================================================= BOOT
  if (window.THREE) {
    try { town = new Town.TownView($('#town-view'), openBuilding); } catch (e) { console.warn('Town view unavailable', e); }
  }
  renderAll();
  showTab('home');
  // live countdowns for chests and production bubbles
  setInterval(() => { if (!current && tab === 'home') { renderChests(); renderGames(); } }, 1000);
  // unlock audio on first touch (mobile browsers require a gesture)
  window.addEventListener('pointerdown', () => { if (Save.data.settings.sound) sfx('pop'); }, { once: true });
  GH.launch = launch;
  GH.goHome = goHome;
})();
