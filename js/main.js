/* GameHub shell: hub screens, game launcher, results, economy. */
(function () {
  'use strict';
  const { Save, Stage, UI, sfx, Games, fmt } = GH;
  const $ = (s) => document.querySelector(s);

  Save.load();

  const ORDER = ['pin', 'gate', 'frost'];

  const UPGRADES = [
    { id: 'gateStart', icon: '🪖', name: 'Recruits', game: 'Gate Rush', desc: (l) => `Start with ${3 + l * 2} → ${3 + (l + 1) * 2} soldiers`, cost: (l) => 100 + l * 120, max: 10 },
    { id: 'frostDmg', icon: '🪓', name: 'Axe Forge', game: 'Frost Survival', desc: (l) => `Axe & crossbow damage +${l * 20}% → +${(l + 1) * 20}%`, cost: (l) => 150 + l * 150, max: 10 },
    { id: 'frostWall', icon: '🧥', name: 'Warm Coat', game: 'Frost Survival', desc: (l) => `Max health ${100 + l * 25} → ${100 + (l + 1) * 25}`, cost: (l) => 120 + l * 120, max: 10 },
  ];

  // ================================================================= HUB
  function renderWallet() {
    $('#coins').textContent = fmt(Save.data.coins);
    $('#gems').textContent = fmt(Save.data.gems);
    Monetization.refreshBanner();
  }

  function renderGames() {
    const list = $('#game-list');
    list.innerHTML = '';
    for (const id of ORDER) {
      const g = Games[id];
      const card = document.createElement('button');
      card.className = 'game-card';
      card.innerHTML = `
        <div class="art" style="--c1:${g.colors[0]};--c2:${g.colors[1]}">${g.icon}</div>
        <div class="info"><h3>${g.name}</h3><p>${g.tagline}</p><span class="tag">Level ${Save.data.levels[id]}</span></div>
        <span class="btn small green play">PLAY</span>`;
      card.addEventListener('click', () => { sfx('tap'); launch(id); });
      list.appendChild(card);
    }
  }

  function renderUpgrades() {
    const list = $('#upgrade-list');
    list.innerHTML = '';
    for (const u of UPGRADES) {
      const l = Save.data.upgrades[u.id] || 0;
      const maxed = l >= u.max;
      const cost = u.cost(l);
      const el = document.createElement('div');
      el.className = 'upgrade';
      el.innerHTML = `<div class="ico">${u.icon}</div>
        <div class="info"><h4>${u.name} <small style="color:var(--muted)">Lv ${l}</small></h4><p>${u.game} · ${maxed ? 'MAX' : u.desc(l)}</p></div>`;
      const btn = document.createElement('button');
      btn.className = 'btn small gold';
      btn.textContent = maxed ? 'MAX' : `🪙 ${fmt(cost)}`;
      btn.disabled = maxed || Save.data.coins < cost;
      btn.addEventListener('click', () => {
        if (Save.data.coins < cost) return;
        Save.data.coins -= cost;
        Save.data.upgrades[u.id] = l + 1;
        Save.save();
        sfx('level');
        Monetization.track('upgrade', { id: u.id, level: l + 1 });
      });
      el.appendChild(btn);
      list.appendChild(el);
    }
  }

  function renderShop() {
    const list = $('#shop-list');
    list.innerHTML = '';
    // free rewarded offer
    const free = document.createElement('div');
    free.className = 'product';
    const cd = Save.data.stats.lastFreeCoinsAd + Monetization.config.freeCoinsCooldownMs - Date.now();
    free.innerHTML = `<div class="ico">📺</div><div class="info"><h4>Free coins</h4><p>Watch a short ad for 🪙 100</p></div>`;
    const fb = document.createElement('button');
    fb.className = 'btn small green ad';
    fb.textContent = cd > 0 ? `${Math.ceil(cd / 60000)}m` : 'FREE';
    fb.disabled = cd > 0;
    fb.addEventListener('click', async () => {
      if (await Monetization.showRewarded('shop_free_coins')) {
        Save.data.stats.lastFreeCoinsAd = Date.now();
        Save.addCoins(100);
        UI.toast('+100 🪙');
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
    renderGames();
    renderUpgrades();
    renderShop();
    $('#opt-sound').checked = Save.data.settings.sound;
    $('#opt-vibe').checked = Save.data.settings.vibe;
    const ready = Date.now() - Save.data.lastDaily > 20 * 3600 * 1000;
    $('#daily-btn').classList.toggle('gold', ready);
    $('#daily-btn').classList.toggle('ghost', !ready);
  }
  document.addEventListener('save-changed', renderAll);

  function showTab(name) {
    document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === name));
    document.querySelectorAll('.bottom-nav button').forEach((b) => b.classList.toggle('active', b.dataset.nav === name));
    $('#hub-main').scrollTop = 0;
    if (name === 'shop') renderShop();
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
    const grant = (mult) => {
      Save.data.lastDaily = Date.now();
      Save.data.coins += 100 * mult;
      Save.data.gems += 5 * mult;
      Save.save();
      sfx('win');
      UI.toast(`+${100 * mult} 🪙  +${5 * mult} 💎`);
    };
    UI.modal({
      icon: '🎁', title: 'Daily reward', cls: 'win',
      body: '<div class="reward">🪙 100 &nbsp; 💎 5</div>',
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
      title: 'Reset progress?', sub: 'Coins, levels, upgrades and purchases will be wiped.',
      buttons: [
        { label: 'Reset', cls: 'danger', onClick: () => { Save.reset(); UI.toast('Progress reset'); } },
        { label: 'Cancel', cls: 'ghost' },
      ],
    });
  });

  // ================================================================= GAME SHELL
  const canvas = $('#game-canvas');
  const stage = new Stage(canvas);
  let current = null;   // { id, game }
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
        el.addEventListener('click', () => { sfx('tap'); b.onClick(); });
        box.appendChild(el);
      }
    },
    setTitle(t) { $('#hud-title').textContent = t; },
    win(res) { setTimeout(() => showWin(res), 250); },
    lose(res) { setTimeout(() => showLose(res), 250); },
  };

  function launch(id, level) {
    stop();
    const def = Games[id];
    level = level || Save.data.levels[id];
    $('#hub').classList.remove('active');
    $('#game-screen').classList.add('active');
    $('#hud-level').textContent = `Level ${level}`;
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
    const dt = Math.min(0.033, (now - last) / 1000);
    last = now;
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
    UI.modal({
      title: 'Paused', icon: '⏸️',
      buttons: [
        { label: 'Resume', cls: 'green', onClick: () => { g.paused = false; } },
        { label: 'Restart', cls: 'ghost', onClick: () => launch(current.id, current.level) },
        { label: 'Quit to hub', cls: 'ghost', onClick: goHome },
      ],
    });
  });

  // pointer input -> game
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
  function showWin({ coins, text }) {
    if (!current) return;
    const { id, level } = current;
    sfx('win');
    GH.vibrate([30, 30, 60]);
    Save.data.levels[id] = Math.max(Save.data.levels[id], level + 1);
    Save.save();
    Monetization.track('level_complete', { game: id, level });
    const next = async (mult, watchedAd) => {
      Save.addCoins(coins * mult);
      UI.toast(`+${fmt(coins * mult)} 🪙`);
      if (watchedAd) Monetization.resetInterstitialCounter();
      else await Monetization.maybeInterstitial('level_complete');
      return true;
    };
    UI.modal({
      cls: 'win', icon: '🏆', title: 'Victory!', sub: text || '',
      body: `<div class="reward">🪙 ${fmt(coins)}</div>`,
      buttons: [
        { label: `Claim ×3 (🪙 ${fmt(coins * 3)})`, cls: 'gold ad', onClick: async () => {
          const ok = await Monetization.showRewarded('win_x3');
          await next(ok ? 3 : 1, ok);
          launch(id, level + 1);
        } },
        { label: 'Next level ▶', cls: 'green', onClick: async () => { await next(1, false); launch(id, level + 1); } },
        { label: 'Hub', cls: 'ghost', onClick: async () => { await next(1, false); goHome(); } },
      ],
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
    buttons.push({ label: 'Hub', cls: 'ghost', onClick: goHome });
    UI.modal({ cls: 'lose', icon: '💀', title: 'Defeated', sub: reason || '', buttons });
  }

  // ================================================================= BOOT
  renderAll();
  // unlock audio on first touch (mobile browsers require a gesture)
  window.addEventListener('pointerdown', () => { if (Save.data.settings.sound) sfx('pop'); }, { once: true });
  GH.launch = launch;
})();
