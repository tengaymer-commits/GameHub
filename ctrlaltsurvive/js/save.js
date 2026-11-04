/* Ctrl+Alt+Survive — save data (localStorage) and meta-progression helpers */
(function (C) {
  'use strict';
  const KEY = 'cas_save_v1';

  function fresh() {
    return {
      v: 1,
      credits: 0,
      upgrades: {},
      unlocked: { char: ['guest'], weapon: C.START_WEAPONS.slice(), drive: ['c'], theme: ['sky'] },
      tasks: {},
      seen: { enemy: {}, weapon: {}, passive: {} },
      stats: {
        runs: 0, kills: 0, deaths: 0, time: 0, bosses: 0, zips: 0, props: 0, formats: 0, healed: 0,
        creditsEarned: 0, bestLevel: 0, bestTime: 0, bestTimes: {}, clears: {}, hyperClears: 0,
        killsBy: {}, evolved: {}, maxedWeapons: 0, charSurv5: {}
      },
      settings: { theme: 'sky', crt: true, vol: 0.7, music: 0.45, dmgNums: true, shake: true, wall: '', moveMode: 'keys' },
      booted: false
    };
  }

  function merge(base, data) {
    if (!data || typeof data !== 'object') return base;
    for (const k in base) {
      if (!(k in data)) continue;
      const b = base[k], d = data[k];
      if (b && typeof b === 'object' && !Array.isArray(b) && d && typeof d === 'object' && !Array.isArray(d)) {
        // objects whose keys are dynamic are copied wholesale
        if (Object.keys(b).length === 0) base[k] = d; else merge(b, d);
      } else base[k] = d;
    }
    return base;
  }

  const S = C.Save = {
    data: fresh(),
    load() {
      try {
        const raw = localStorage.getItem(KEY);
        if (raw) S.data = merge(fresh(), JSON.parse(raw));
      } catch (e) { S.data = fresh(); }
      return S.data;
    },
    save() { try { localStorage.setItem(KEY, JSON.stringify(S.data)); } catch (e) { /* storage blocked */ } },
    reset() { S.data = fresh(); S.data.booted = true; S.save(); },
    has(type, id) { return (S.data.unlocked[type] || []).includes(id); },
    unlock(type, id) {
      const arr = S.data.unlocked[type] || (S.data.unlocked[type] = []);
      if (!arr.includes(id)) { arr.push(id); return true; }
      return false;
    },
    upgradeLevel(id) { return S.data.upgrades[id] || 0; },
    totalUpgrades() { return Object.values(S.data.upgrades).reduce((a, b) => a + b, 0); },
    upgradeCost(u) {
      const lvl = S.upgradeLevel(u.id);
      return Math.round(u.cost * (lvl + 1) * (1 + 0.1 * S.totalUpgrades()));
    },
    buyUpgrade(u) {
      const lvl = S.upgradeLevel(u.id);
      if (lvl >= u.max) return false;
      const cost = S.upgradeCost(u);
      if (S.data.credits < cost) return false;
      S.data.credits -= cost;
      S.data.upgrades[u.id] = lvl + 1;
      S.data.spent = (S.data.spent || 0) + cost;
      S.save();
      return true;
    },
    refundAll() {
      S.data.credits += S.data.spent || 0;
      S.data.spent = 0;
      S.data.upgrades = {};
      S.save();
    },
    /* Combined permanent stat bonuses from the Control Panel */
    metaStats() {
      const out = {};
      for (const u of C.UPGRADES) {
        const l = S.upgradeLevel(u.id);
        if (!l) continue;
        for (const k in u.stat) out[k] = (out[k] || 0) + u.stat[k] * l;
      }
      return out;
    },
    /* Checks all tasks and applies rewards. Returns newly completed tasks. */
    checkTasks() {
      const done = [];
      for (const t of C.TASKS) {
        if (S.data.tasks[t.id]) continue;
        let p = 0;
        try { p = t.p(S.data) || 0; } catch (e) { p = 0; }
        if (p >= t.goal) {
          S.data.tasks[t.id] = true;
          if (t.reward.credits) S.data.credits += t.reward.credits;
          if (t.reward.unlock) S.unlock(t.reward.unlock[0], t.reward.unlock[1]);
          done.push(t);
        }
      }
      if (done.length) { S.save(); if (done.length) S.checkTasks().forEach(t => done.push(t)); }
      return done;
    },
    taskProgress(t) { let p = 0; try { p = t.p(S.data) || 0; } catch (e) { } return Math.min(p, t.goal); },
    /* Is a char/drive/theme available? (checks unlock rule) */
    available(type, def) {
      if (S.has(type, def.id)) return true;
      if (!def.unlock) return true;
      return false;
    },
    unlockText(def) {
      if (!def.unlock) return '';
      if (def.unlock.task) { const t = C.TASKS.find(x => x.id === def.unlock.task); return t ? 'Task: ' + t.name : 'Locked'; }
      if (def.unlock.cost) return 'Buy for ' + def.unlock.cost.toLocaleString() + ' credits';
      return 'Locked';
    }
  };
})(window.CAS);
