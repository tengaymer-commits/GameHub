/* Ctrl+Alt+Survive — game data: weapons, passives, enemies, drives, users, upgrades, themes, tasks */
window.CAS = window.CAS || {};
(function (C) {
  'use strict';

  /* ------------------------------------------------------------------ *
   * WEAPONS
   * base: dmg, cd (s), amount, area (x), speed (x), dur (x), pierce, kb
   * lv[i] = bonus applied when reaching level i+2 (max level = lv.length + 1)
   * evo: passive needed, into: evolved weapon id
   * ------------------------------------------------------------------ */
  C.WEAPONS = {
    ping: {
      name: 'Ping.exe', desc: 'Sends an echo ring out from you. Hits everything it reaches.',
      base: { dmg: 10, cd: 2.4, amount: 1, area: 1, speed: 1, dur: 1, pierce: 0, kb: 1.2 },
      lv: [{ dmg: 4 }, { area: 0.15 }, { cd: -0.3 }, { amount: 1 }, { dmg: 6 }, { area: 0.2 }, { dmg: 8, cd: -0.2 }],
      evo: 'psu', into: 'pingdeath'
    },
    floppy: {
      name: 'Floppy Disk', desc: 'Thrown at the nearest threat. Comes back like a boomerang.',
      base: { dmg: 12, cd: 1.5, amount: 1, area: 1, speed: 1, dur: 1, pierce: 0, kb: 1 },
      lv: [{ amount: 1 }, { dmg: 5 }, { speed: 0.2, area: 0.1 }, { amount: 1 }, { dmg: 5 }, { cd: -0.25 }, { dmg: 8 }],
      evo: 'cache', into: 'zipdrive'
    },
    cd: {
      name: 'CD-ROM', desc: 'A spinning disc that bounces off the edges of the screen.',
      base: { dmg: 9, cd: 3.2, amount: 1, area: 1, speed: 1, dur: 1, pierce: 0, kb: 0.6 },
      lv: [{ amount: 1 }, { dmg: 4 }, { speed: 0.2, dur: 0.3 }, { amount: 1 }, { dmg: 5 }, { dur: 0.4 }, { amount: 1 }],
      evo: 'gpu', into: 'dvdburner'
    },
    icons: {
      name: 'Desktop Icons', desc: 'Shortcuts orbit around you and knock threats away.',
      base: { dmg: 10, cd: 3.5, amount: 2, area: 1, speed: 1, dur: 3, pierce: 0, kb: 1.4 },
      lv: [{ amount: 1 }, { speed: 0.25, area: 0.15 }, { dur: 0.5 }, { amount: 1 }, { dmg: 5 }, { dur: 0.5, area: 0.15 }, { amount: 1, dmg: 5 }],
      evo: 'ram', into: 'iconstorm'
    },
    firewall: {
      name: 'Firewall', desc: 'Leaves burning firewall tiles behind you as you move.',
      base: { dmg: 6, cd: 1.0, amount: 1, area: 1, speed: 1, dur: 2.4, pierce: 0, kb: 0 },
      lv: [{ dmg: 2 }, { area: 0.2 }, { amount: 1 }, { dur: 0.6 }, { dmg: 3 }, { area: 0.2 }, { amount: 1, cd: -0.2 }],
      evo: 'antivirus', into: 'hwfirewall'
    },
    email: {
      name: 'Reply All', desc: 'Homing e-mails that chase random threats.',
      base: { dmg: 9, cd: 1.3, amount: 1, area: 1, speed: 1, dur: 1, pierce: 1, kb: 0.8 },
      lv: [{ amount: 1 }, { dmg: 3 }, { cd: -0.2 }, { amount: 1 }, { pierce: 1 }, { dmg: 4 }, { amount: 1 }],
      evo: 'usb', into: 'massmailer'
    },
    surge: {
      name: 'Power Surge', desc: 'Lightning strikes random threats on screen.',
      base: { dmg: 18, cd: 2.6, amount: 1, area: 1, speed: 1, dur: 1, pierce: 0, kb: 0.3 },
      lv: [{ amount: 1 }, { dmg: 8 }, { area: 0.25 }, { amount: 1 }, { cd: -0.4 }, { dmg: 10 }, { amount: 1 }],
      evo: 'surgeprot', into: 'blackout'
    },
    laser: {
      name: 'Laser Mouse', desc: 'Fires a laser beam in the direction you are moving.',
      base: { dmg: 14, cd: 2.2, amount: 1, area: 1, speed: 1, dur: 1, pierce: 0, kb: 0.5 },
      lv: [{ dmg: 5 }, { area: 0.2 }, { amount: 1 }, { cd: -0.3 }, { dmg: 6 }, { amount: 1 }, { dmg: 10 }],
      evo: 'fan', into: 'optical'
    },
    recycle: {
      name: 'Recycle Bin', desc: 'Drops a bin that pulls threats in, then empties itself.',
      base: { dmg: 4, cd: 6.5, amount: 1, area: 1, speed: 1, dur: 3, pierce: 0, kb: 0 },
      lv: [{ area: 0.2 }, { dmg: 2 }, { cd: -1 }, { amount: 1 }, { dur: 1 }, { dmg: 3, area: 0.2 }, { amount: 1 }],
      evo: 'lucky', into: 'shiftdel'
    },
    paint: {
      name: 'Paint Bucket', desc: 'Splashes sticky paint that slows and damages threats.',
      base: { dmg: 4, cd: 3.2, amount: 1, area: 1, speed: 1, dur: 3, pierce: 0, kb: 0 },
      lv: [{ amount: 1 }, { area: 0.2 }, { dmg: 2 }, { dur: 1 }, { amount: 1 }, { dmg: 3 }, { area: 0.25 }],
      evo: 'mousepad', into: 'filltool'
    },
    scan: {
      name: 'Full Scan', desc: 'A scan line sweeps across the whole screen.',
      base: { dmg: 12, cd: 8, amount: 1, area: 1, speed: 1, dur: 1, pierce: 0, kb: 0.4 },
      lv: [{ dmg: 4 }, { cd: -0.8 }, { amount: 1 }, { dmg: 5 }, { cd: -0.8 }, { amount: 1 }, { dmg: 7 }],
      evo: 'cpu', into: 'deepscan'
    },
    dialup: {
      name: 'Dial-Up Tone', desc: 'Screeching sound waves in front of you. Big knockback.',
      base: { dmg: 7, cd: 1.3, amount: 1, area: 1, speed: 1, dur: 1, pierce: 0, kb: 3 },
      lv: [{ dmg: 3 }, { area: 0.2 }, { amount: 1 }, { cd: -0.2 }, { dmg: 4 }, { area: 0.2 }, { amount: 1 }],
      evo: 'modem', into: 'dsl'
    },
    keyboard: {
      name: 'Keyboard', desc: 'Types letters at whatever is in front of you.',
      base: { dmg: 6, cd: 0.55, amount: 1, area: 1, speed: 1, dur: 1, pierce: 1, kb: 0.4 },
      lv: [{ amount: 1 }, { dmg: 2 }, { cd: -0.08 }, { pierce: 1 }, { amount: 1 }, { dmg: 3 }, { cd: -0.08 }],
      evo: 'broadband', into: 'turbotype'
    },

    /* ---- evolutions ---- */
    pingdeath: { evolved: true, from: 'ping', name: 'Ping of Death', desc: 'Huge, rapid echo rings that blast threats back.', base: { dmg: 30, cd: 1.2, amount: 2, area: 1.7, speed: 1, dur: 1, pierce: 0, kb: 2.4 }, lv: [] },
    zipdrive: { evolved: true, from: 'floppy', name: 'Zip Drive', desc: '100 MB of pure boomerang. Three big disks at once.', base: { dmg: 26, cd: 1.1, amount: 3, area: 1.6, speed: 1.3, dur: 1.3, pierce: 0, kb: 1.4 }, lv: [] },
    dvdburner: { evolved: true, from: 'cd', name: 'DVD Burner', desc: 'Burning discs that leave a hot trail.', base: { dmg: 18, cd: 2.4, amount: 4, area: 1.3, speed: 1.2, dur: 1.6, pierce: 0, kb: 0.8 }, lv: [] },
    iconstorm: { evolved: true, from: 'icons', name: 'Icon Storm', desc: 'A permanent tornado of desktop shortcuts.', base: { dmg: 20, cd: 0, amount: 7, area: 1.4, speed: 1.5, dur: 1, pierce: 0, kb: 1.8 }, lv: [] },
    hwfirewall: { evolved: true, from: 'firewall', name: 'Hardware Firewall', desc: 'Rings of fire tiles that burn hotter and longer.', base: { dmg: 12, cd: 0.6, amount: 3, area: 1.6, speed: 1, dur: 3.5, pierce: 0, kb: 0 }, lv: [] },
    massmailer: { evolved: true, from: 'email', name: 'Mass Mailer', desc: 'A flood of exploding chain letters.', base: { dmg: 16, cd: 0.8, amount: 6, area: 1, speed: 1.3, dur: 1, pierce: 2, kb: 1 }, lv: [] },
    blackout: { evolved: true, from: 'surge', name: 'Blackout', desc: 'Chain lightning that jumps between threats.', base: { dmg: 34, cd: 1.6, amount: 4, area: 1.5, speed: 1, dur: 1, pierce: 0, kb: 0.4 }, lv: [] },
    optical: { evolved: true, from: 'laser', name: 'Optical Overdrive', desc: 'Two laser beams that sweep around you nonstop.', base: { dmg: 22, cd: 0.1, amount: 2, area: 1.3, speed: 1, dur: 1, pierce: 0, kb: 0.3 }, lv: [] },
    shiftdel: { evolved: true, from: 'recycle', name: 'Shift+Delete', desc: 'Black holes that permanently delete weak threats.', base: { dmg: 10, cd: 5, amount: 2, area: 1.8, speed: 1, dur: 4, pierce: 0, kb: 0 }, lv: [] },
    filltool: { evolved: true, from: 'paint', name: 'Fill Tool', desc: 'Floods the screen with paint puddles.', base: { dmg: 9, cd: 2.2, amount: 4, area: 1.8, speed: 1, dur: 4.5, pierce: 0, kb: 0 }, lv: [] },
    deepscan: { evolved: true, from: 'scan', name: 'Deep Scan', desc: 'Four scan lines at once, hitting much harder.', base: { dmg: 32, cd: 5, amount: 4, area: 1, speed: 1, dur: 0.9, pierce: 0, kb: 0.6 }, lv: [] },
    dsl: { evolved: true, from: 'dialup', name: 'DSL Blast', desc: 'Always-on broadband shockwaves in every direction.', base: { dmg: 16, cd: 1.0, amount: 2, area: 1.5, speed: 1, dur: 1, pierce: 0, kb: 4 }, lv: [] },
    turbotype: { evolved: true, from: 'keyboard', name: 'Turbo Typing', desc: '300 words per minute. Piercing letters, nonstop.', base: { dmg: 11, cd: 0.14, amount: 2, area: 1, speed: 1.4, dur: 1, pierce: 3, kb: 0.5 }, lv: [] }
  };
  for (const id in C.WEAPONS) { const w = C.WEAPONS[id]; w.id = id; w.max = w.lv.length + 1; }

  /* ------------------------------------------------------------------ *
   * PASSIVES (hardware)
   * ------------------------------------------------------------------ */
  C.PASSIVES = {
    ram: { name: 'RAM Stick', desc: '+20 max HP', max: 5, stat: { maxHp: 20 } },
    cpu: { name: 'CPU Overclock', desc: '-8% weapon cooldown', max: 5, stat: { cooldown: -0.08 } },
    gpu: { name: 'Graphics Card', desc: '+10% damage', max: 5, stat: { might: 0.1 } },
    psu: { name: 'Power Supply', desc: '+10% area', max: 5, stat: { area: 0.1 } },
    fan: { name: 'Cooling Fan', desc: '+10% effect duration', max: 5, stat: { duration: 0.1 } },
    usb: { name: 'USB Hub', desc: '+1 projectile amount', max: 2, stat: { amount: 1 } },
    mousepad: { name: 'Mouse Pad', desc: '+8% move speed', max: 5, stat: { move: 0.08 } },
    cache: { name: 'Cache', desc: '+30% pickup range', max: 5, stat: { magnet: 0.3 } },
    antivirus: { name: 'Virus Definitions', desc: '+1 armor', max: 3, stat: { armor: 1 } },
    surgeprot: { name: 'Surge Protector', desc: '+0.3 HP regenerated per second', max: 5, stat: { recovery: 0.3 } },
    lucky: { name: 'Lucky.dll', desc: '+10% luck', max: 5, stat: { luck: 0.1 } },
    modem: { name: '56k Modem', desc: '+8% experience', max: 5, stat: { growth: 0.08 } },
    broadband: { name: 'Broadband', desc: '+10% projectile speed', max: 5, stat: { speed: 0.1 } }
  };
  for (const id in C.PASSIVES) C.PASSIVES[id].id = id;

  /* ------------------------------------------------------------------ *
   * CONTROL PANEL (permanent upgrades bought with credits)
   * ------------------------------------------------------------------ */
  C.UPGRADES = [
    { id: 'might', name: 'Processor', icon: 'p_gpu', desc: '+5% damage', max: 5, cost: 200, stat: { might: 0.05 } },
    { id: 'armor', name: 'Firewall Rules', icon: 'p_antivirus', desc: '+1 armor', max: 3, cost: 600, stat: { armor: 1 } },
    { id: 'maxhp', name: 'Memory', icon: 'p_ram', desc: '+10% max HP', max: 3, cost: 200, stat: { maxHpMult: 0.1 } },
    { id: 'recovery', name: 'Auto-Repair', icon: 'u_wrench', desc: '+0.1 HP per second', max: 5, cost: 200, stat: { recovery: 0.1 } },
    { id: 'cooldown', name: 'Overclock', icon: 'p_cpu', desc: '-2.5% cooldown', max: 2, cost: 900, stat: { cooldown: -0.025 } },
    { id: 'area', name: 'Resolution', icon: 'p_psu', desc: '+5% area', max: 2, cost: 300, stat: { area: 0.05 } },
    { id: 'speed', name: 'Bandwidth', icon: 'p_broadband', desc: '+10% projectile speed', max: 2, cost: 300, stat: { speed: 0.1 } },
    { id: 'duration', name: 'Uptime', icon: 'p_fan', desc: '+15% duration', max: 2, cost: 300, stat: { duration: 0.15 } },
    { id: 'amount', name: 'Multitasking', icon: 'p_usb', desc: '+1 projectile amount', max: 1, cost: 5000, stat: { amount: 1 } },
    { id: 'move', name: 'Mouse Sensitivity', icon: 'p_mousepad', desc: '+5% move speed', max: 2, cost: 300, stat: { move: 0.05 } },
    { id: 'magnet', name: 'Cache Size', icon: 'p_cache', desc: '+25% pickup range', max: 2, cost: 300, stat: { magnet: 0.25 } },
    { id: 'luck', name: 'Lucky Bytes', icon: 'p_lucky', desc: '+10% luck', max: 3, cost: 600, stat: { luck: 0.1 } },
    { id: 'growth', name: 'Download Speed', icon: 'p_modem', desc: '+3% experience', max: 5, cost: 900, stat: { growth: 0.03 } },
    { id: 'greed', name: 'Shareware Fees', icon: 'u_coin', desc: '+10% credits', max: 5, cost: 200, stat: { greed: 0.1 } },
    { id: 'curse', name: 'Pop-up Blocker OFF', icon: 'u_curse', desc: '+10% enemy speed, health and amount (more loot)', max: 5, cost: 1666, stat: { curse: 0.1 } },
    { id: 'revival', name: 'System Restore', icon: 'u_restore', desc: '+1 revival per run', max: 1, cost: 10000, stat: { revival: 1 } },
    { id: 'reroll', name: 'Refresh (F5)', icon: 'u_refresh', desc: '+2 rerolls on level-up', max: 4, cost: 1000, stat: { reroll: 2 } },
    { id: 'skip', name: 'Skip', icon: 'u_skip', desc: '+2 skips on level-up', max: 4, cost: 100, stat: { skip: 2 } },
    { id: 'banish', name: 'Uninstall', icon: 'u_banish', desc: '+1 uninstall (removes an option for the run)', max: 4, cost: 100, stat: { banish: 1 } }
  ];

  /* ------------------------------------------------------------------ *
   * USER ACCOUNTS (characters)
   * ------------------------------------------------------------------ */
  C.CHARS = {
    guest: { name: 'Guest', cursor: { type: 'arrow', fill: '#ffffff' }, weapon: 'ping', desc: 'No password, no perks. The default account.', bonus: {}, perks: 'No bonuses' },
    intern: { name: 'Intern', cursor: { type: 'arrow', fill: '#ffe066' }, weapon: 'email', desc: 'Learns fast, breaks easily. Replies all.', bonus: { growth: 0.2, maxHp: -20 }, perks: '+20% XP, -20 max HP', unlock: { task: 'lvl10' } },
    gamer: { name: 'Gamer', cursor: { type: 'cross', fill: '#ff4d4d' }, weapon: 'keyboard', desc: 'Has the fastest fingers in the LAN party.', bonus: { move: 0.1, cooldown: -0.05 }, perks: '+10% move, -5% cooldown', unlock: { task: 'kills2500' } },
    grandma: { name: 'Grandma', cursor: { type: 'hand', fill: '#ffd6e8' }, weapon: 'icons', desc: 'Has 400 icons on her desktop. Very sturdy.', bonus: { maxHp: 40, recovery: 0.5, move: -0.1 }, perks: '+40 max HP, +0.5 HP/s, -10% move', unlock: { cost: 800 } },
    sysadmin: { name: 'Sysadmin', cursor: { type: 'arrow', fill: '#ff9f43' }, weapon: 'firewall', desc: 'Has seen things. Trusts nothing.', bonus: { armor: 2, maxHp: 20 }, perks: '+2 armor, +20 max HP', unlock: { task: 'boss3' } },
    webmaster: { name: 'Webmaster', cursor: { type: 'hand', fill: '#9fe7ff' }, weapon: 'dialup', desc: 'Built a site with 14 animated GIFs. Under construction.', bonus: { area: 0.15, magnet: 0.3 }, perks: '+15% area, +30% pickup range', unlock: { task: 'clear_net' } },
    hacker: { name: 'H4x0r', cursor: { type: 'arrow', fill: '#39ff7a' }, weapon: 'surge', desc: 'Types in green. Fragile, but runs everything twice.', bonus: { amount: 1, maxHpMult: -0.3 }, perks: '+1 amount, -30% max HP', unlock: { task: 'evolve3' } },
    admin: { name: 'Administrator', cursor: { type: 'arrow', fill: '#ffd23f', crown: true }, weapon: 'floppy', desc: 'Full rights. Full power.', bonus: { might: 0.2, luck: 0.2, maxHp: 20 }, perks: '+20% damage, +20% luck, +20 HP', unlock: { task: 'clear_all' } },
    artist: { name: 'Designer', cursor: { type: 'hand', fill: '#c39bff' }, weapon: 'paint', desc: 'Uses Comic Sans ironically. Probably.', bonus: { duration: 0.2, area: 0.1 }, perks: '+20% duration, +10% area', unlock: { cost: 2500 } }
  };
  C.CHAR_ORDER = ['guest', 'intern', 'gamer', 'grandma', 'artist', 'sysadmin', 'webmaster', 'hacker', 'admin'];

  /* ------------------------------------------------------------------ *
   * ENEMIES
   * ai: chase | worm | shooter | dash | straight | boss_worm | boss_summon | boss_dash | boss_hell
   * ------------------------------------------------------------------ */
  C.ENEMIES = {
    popup: { name: 'Pop-up Ad', hp: 6, spd: 48, r: 11, dmg: 6, xp: 1, desc: 'CONGRATULATIONS! You are the 1,000,000th visitor!' },
    spam: { name: 'Spam Mail', hp: 4, spd: 72, r: 9, dmg: 4, xp: 1, desc: 'FW: FW: FW: RE: you won\'t believe this' },
    error: { name: 'Error', hp: 11, spd: 40, r: 11, dmg: 8, xp: 2, desc: 'An error has occurred. Press OK to continue being attacked.' },
    cookie: { name: 'Tracking Cookie', hp: 3, spd: 58, r: 7, dmg: 3, xp: 1, desc: 'It knows what you looked at.' },
    worm: { name: 'Worm', hp: 22, spd: 62, r: 10, dmg: 8, xp: 3, ai: 'worm', desc: 'ILOVEYOU too, now stop.' },
    trojan: { name: 'Trojan.exe', hp: 42, spd: 34, r: 14, dmg: 10, xp: 4, split: ['popup', 3], desc: 'A free gift! Splits into pop-ups when deleted.' },
    adware: { name: 'Adware Toolbar', hp: 75, spd: 26, r: 16, dmg: 12, xp: 6, desc: 'Installed itself. Searches with a search engine you have never heard of.' },
    keylogger: { name: 'Keylogger', hp: 26, spd: 42, r: 11, dmg: 6, xp: 4, ai: 'shooter', range: 210, fire: 2.6, desc: 'Steals your keystrokes and throws them back at you.' },
    dialer: { name: 'Rogue Dialer', hp: 32, spd: 34, r: 12, dmg: 9, xp: 4, ai: 'dash', desc: 'Calls a premium number in another country. Charges at you.' },
    bsod: { name: 'Blue Screen', hp: 160, spd: 30, r: 20, dmg: 18, xp: 10, desc: 'A fatal exception has occurred at 0028:C0011E36.' },
    // bosses
    megaworm: { name: 'MEGAWORM.VBS', hp: 1700, spd: 78, r: 22, dmg: 20, xp: 60, boss: true, ai: 'boss_worm', segs: 14, desc: 'A script with too many loops. Hit the head, the body takes half.' },
    overlord: { name: 'Toolbar Overlord', hp: 2400, spd: 30, r: 34, dmg: 22, xp: 70, boss: true, ai: 'boss_summon', desc: 'Every toolbar you ever installed by accident, fused together.' },
    y2k: { name: 'The Y2K Bug', hp: 2100, spd: 52, r: 26, dmg: 24, xp: 70, boss: true, ai: 'boss_dash', desc: 'It was supposed to end the world in 2000. It is running late.' },
    fatal: { name: 'FATAL EXCEPTION', hp: 4200, spd: 32, r: 36, dmg: 26, xp: 120, boss: true, ai: 'boss_hell', desc: 'The final screen. Bullet patterns made of pure system failure.' },
    // props (breakable desktop shortcuts)
    prop: { name: 'Shortcut', hp: 1, spd: 0, r: 11, dmg: 0, xp: 0, prop: true }
  };
  for (const id in C.ENEMIES) C.ENEMIES[id].id = id;

  /* ------------------------------------------------------------------ *
   * DRIVES (stages)
   * pool: [type, minute it appears, weight]
   * ------------------------------------------------------------------ */
  C.DRIVES = [
    {
      id: 'c', name: 'C:\\My Documents', label: 'Local Disk (C:)', icon: 'd_hdd', bg: '#ffffff', grid: '#e4e8f2', sector: 1,
      desc: 'Your own files. A good place to start cleaning up.', diff: 1, dur: 480,
      pool: [['popup', 0, 10], ['spam', 0, 6], ['error', 1, 6], ['cookie', 2, 5], ['worm', 3, 4], ['trojan', 4, 3], ['keylogger', 5, 3], ['adware', 6, 2], ['bsod', 7, 1]],
      mid: 'megaworm', boss: 'overlord'
    },
    {
      id: 'd', name: 'D:\\Downloads', label: 'Downloads (D:)', icon: 'd_dl', bg: '#fffbea', grid: '#efe6c4', sector: 1.3,
      desc: 'Everything you ever downloaded. Trojans everywhere, but more loot.', diff: 1.35, dur: 480, loot: 1.3,
      pool: [['popup', 0, 8], ['trojan', 0, 4], ['spam', 0, 4], ['dialer', 1, 4], ['error', 2, 5], ['adware', 3, 3], ['worm', 4, 3], ['keylogger', 5, 3], ['bsod', 6, 2]],
      mid: 'overlord', boss: 'y2k', unlock: { task: 'surv5_c' }
    },
    {
      id: 'a', name: 'A:\\ (3½ Floppy)', label: '3½ Floppy (A:)', icon: 'd_floppy', bg: '#f4efe4', grid: '#ddd2bb', sector: 0.6, bounded: 1440,
      desc: 'Only 1.44 MB of space. Walled in, no room to run.', diff: 1.55, dur: 480,
      pool: [['cookie', 0, 8], ['popup', 0, 6], ['spam', 0, 5], ['worm', 1, 5], ['error', 2, 5], ['dialer', 3, 3], ['keylogger', 4, 3], ['trojan', 5, 3], ['bsod', 6, 2]],
      mid: 'y2k', boss: 'megaworm', unlock: { task: 'clear_d' }
    },
    {
      id: 'net', name: 'Network Neighborhood', label: 'Network Neighborhood', icon: 'd_net', bg: '#f0fbf2', grid: '#cfe9d6', sector: 1.6,
      desc: 'The LAN. Keyloggers and worms crawl between the computers.', diff: 1.7, dur: 480,
      pool: [['worm', 0, 8], ['spam', 0, 5], ['keylogger', 1, 4], ['popup', 0, 4], ['dialer', 2, 4], ['error', 2, 4], ['trojan', 4, 3], ['adware', 5, 3], ['bsod', 6, 2]],
      mid: 'megaworm', boss: 'y2k', bossMult: 1.4, unlock: { task: 'clear_a' }
    },
    {
      id: 'bin', name: 'Recycle Bin', label: 'Recycle Bin', icon: 'd_bin', bg: '#eeeeee', grid: '#d6d6d6', sector: 2.2,
      desc: 'Everything deleted ends up here. And it is angry.', diff: 2.05, dur: 480, loot: 1.2,
      pool: [['error', 0, 8], ['trojan', 0, 4], ['bsod', 1, 2], ['worm', 1, 4], ['keylogger', 2, 4], ['adware', 2, 3], ['dialer', 3, 4], ['spam', 0, 3], ['popup', 0, 3]],
      mid: 'overlord', boss: 'fatal', unlock: { task: 'clear_net' }
    }
  ];
  C.drive = id => C.DRIVES.find(d => d.id === id);

  /* ------------------------------------------------------------------ *
   * THEMES (Display Properties)
   * ------------------------------------------------------------------ */
  C.THEMES = [
    { id: 'sky', name: 'Sky Blue (default)', wall: 'hills' },
    { id: 'olive', name: 'Olive Green', wall: 'hills', unlock: { task: 'clear_c' } },
    { id: 'silver', name: 'Silver', wall: 'clouds', unlock: { task: 'runs10' } },
    { id: 'classic', name: 'Classic Gray', wall: 'teal', unlock: { task: 'die5' } },
    { id: 'bubble', name: 'Bubblegum', wall: 'bubbles', unlock: { task: 'heal500' } },
    { id: 'midnight', name: 'Midnight', wall: 'space', unlock: { task: 'clear_bin' } },
    { id: 'terminal', name: 'Terminal', wall: 'matrix', unlock: { task: 'kills25k' } }
  ];

  /* ------------------------------------------------------------------ *
   * TASKS (Tasks.xls). p(save) -> progress, goal, reward
   * ------------------------------------------------------------------ */
  const st = s => s.stats;
  const clears = (s, id) => (s.stats.clears[id] || 0);
  C.TASKS = [
    // ---- weapons
    { id: 'kills500', cat: 'Software', name: 'Delete 500 threats', p: s => st(s).kills, goal: 500, reward: { credits: 100, unlock: ['weapon', 'cd'] } },
    { id: 'lvl15', cat: 'Software', name: 'Reach level 15 in one scan', p: s => st(s).bestLevel, goal: 15, reward: { credits: 100, unlock: ['weapon', 'firewall'] } },
    { id: 'surv5', cat: 'Software', name: 'Survive 5 minutes on any drive', p: s => Math.floor(st(s).bestTime / 60), goal: 5, reward: { credits: 150, unlock: ['weapon', 'surge'] } },
    { id: 'zips5', cat: 'Software', name: 'Extract 5 .zip archives', p: s => st(s).zips, goal: 5, reward: { credits: 150, unlock: ['weapon', 'recycle'] } },
    { id: 'maxw', cat: 'Software', name: 'Get any program to level 8', p: s => st(s).maxedWeapons, goal: 1, reward: { credits: 150, unlock: ['weapon', 'laser'] } },
    { id: 'evolve1', cat: 'Software', name: 'Evolve a program', p: s => Object.keys(st(s).evolved).length, goal: 1, reward: { credits: 250, unlock: ['weapon', 'scan'] } },
    { id: 'credits2k', cat: 'Software', name: 'Earn 2,000 credits in total', p: s => st(s).creditsEarned, goal: 2000, reward: { credits: 200, unlock: ['weapon', 'paint'] } },
    { id: 'props50', cat: 'Software', name: 'Break 50 desktop shortcuts', p: s => st(s).props, goal: 50, reward: { credits: 200 } },
    { id: 'evolve6', cat: 'Software', name: 'Evolve 6 different programs', p: s => Object.keys(st(s).evolved).length, goal: 6, reward: { credits: 800 } },
    { id: 'evolve13', cat: 'Software', name: 'Evolve every program', p: s => Object.keys(st(s).evolved).length, goal: 13, reward: { credits: 3000 } },
    // ---- users
    { id: 'lvl10', cat: 'Users', name: 'Reach level 10 in one scan', p: s => st(s).bestLevel, goal: 10, reward: { credits: 50, unlock: ['char', 'intern'] } },
    { id: 'kills2500', cat: 'Users', name: 'Delete 2,500 threats', p: s => st(s).kills, goal: 2500, reward: { credits: 150, unlock: ['char', 'gamer'] } },
    { id: 'boss3', cat: 'Users', name: 'Defeat 3 bosses', p: s => st(s).bosses, goal: 3, reward: { credits: 300, unlock: ['char', 'sysadmin'] } },
    { id: 'evolve3', cat: 'Users', name: 'Evolve 3 different programs', p: s => Object.keys(st(s).evolved).length, goal: 3, reward: { credits: 400, unlock: ['char', 'hacker'] } },
    { id: 'clear_all', cat: 'Users', name: 'Clean every drive', p: s => C.DRIVES.filter(d => clears(s, d.id) > 0).length, goal: 5, reward: { credits: 1500, unlock: ['char', 'admin'] } },
    { id: 'chars5', cat: 'Users', name: 'Survive 5 minutes with 5 different users', p: s => Object.keys(st(s).charSurv5).length, goal: 5, reward: { credits: 600 } },
    // ---- drives
    { id: 'surv5_c', cat: 'Drives', name: 'Survive 5 minutes on C:', p: s => Math.floor((st(s).bestTimes.c || 0) / 60), goal: 5, reward: { credits: 150, unlock: ['drive', 'd'] } },
    { id: 'clear_c', cat: 'Drives', name: 'Clean C:\\My Documents', p: s => clears(s, 'c'), goal: 1, reward: { credits: 300, unlock: ['theme', 'olive'] } },
    { id: 'clear_d', cat: 'Drives', name: 'Clean D:\\Downloads', p: s => clears(s, 'd'), goal: 1, reward: { credits: 400, unlock: ['drive', 'a'] } },
    { id: 'clear_a', cat: 'Drives', name: 'Clean A:\\ (3½ Floppy)', p: s => clears(s, 'a'), goal: 1, reward: { credits: 500, unlock: ['drive', 'net'] } },
    { id: 'clear_net', cat: 'Drives', name: 'Clean Network Neighborhood', p: s => clears(s, 'net'), goal: 1, reward: { credits: 600, unlock: ['drive', 'bin'] } },
    { id: 'clear_bin', cat: 'Drives', name: 'Clean the Recycle Bin', p: s => clears(s, 'bin'), goal: 1, reward: { credits: 1000, unlock: ['theme', 'midnight'] } },
    { id: 'hyper1', cat: 'Drives', name: 'Clean any drive in Hyper mode', p: s => st(s).hyperClears, goal: 1, reward: { credits: 1000 } },
    // ---- themes
    { id: 'runs10', cat: 'Themes', name: 'Run 10 scans', p: s => st(s).runs, goal: 10, reward: { credits: 100, unlock: ['theme', 'silver'] } },
    { id: 'die5', cat: 'Themes', name: 'Have 5 fatal exceptions (die 5 times)', p: s => st(s).deaths, goal: 5, reward: { credits: 50, unlock: ['theme', 'classic'] } },
    { id: 'heal500', cat: 'Themes', name: 'Restore 500 HP in total', p: s => Math.floor(st(s).healed), goal: 500, reward: { credits: 150, unlock: ['theme', 'bubble'] } },
    { id: 'kills25k', cat: 'Themes', name: 'Delete 25,000 threats', p: s => st(s).kills, goal: 25000, reward: { credits: 1500, unlock: ['theme', 'terminal'] } },
    // ---- general
    { id: 'first', cat: 'General', name: 'Run your first scan', p: s => st(s).runs, goal: 1, reward: { credits: 50 } },
    { id: 'kills100', cat: 'General', name: 'Delete 100 threats', p: s => st(s).kills, goal: 100, reward: { credits: 30 } },
    { id: 'kills10k', cat: 'General', name: 'Delete 10,000 threats', p: s => st(s).kills, goal: 10000, reward: { credits: 800 } },
    { id: 'lvl25', cat: 'General', name: 'Reach level 25 in one scan', p: s => st(s).bestLevel, goal: 25, reward: { credits: 250 } },
    { id: 'lvl40', cat: 'General', name: 'Reach level 40 in one scan', p: s => st(s).bestLevel, goal: 40, reward: { credits: 600 } },
    { id: 'boss1', cat: 'General', name: 'Defeat a boss', p: s => st(s).bosses, goal: 1, reward: { credits: 150 } },
    { id: 'boss15', cat: 'General', name: 'Defeat 15 bosses', p: s => st(s).bosses, goal: 15, reward: { credits: 1200 } },
    { id: 'pops500', cat: 'General', name: 'Close 500 pop-up ads', p: s => st(s).killsBy.popup || 0, goal: 500, reward: { credits: 120 } },
    { id: 'format5', cat: 'General', name: 'Use Format C: 5 times', p: s => st(s).formats, goal: 5, reward: { credits: 150 } },
    { id: 'zips25', cat: 'General', name: 'Extract 25 .zip archives', p: s => st(s).zips, goal: 25, reward: { credits: 500 } },
    { id: 'buy5', cat: 'General', name: 'Buy 5 Control Panel upgrades', p: s => Object.values(s.upgrades).reduce((a, b) => a + b, 0), goal: 5, reward: { credits: 200 } },
    { id: 'buy25', cat: 'General', name: 'Buy 25 Control Panel upgrades', p: s => Object.values(s.upgrades).reduce((a, b) => a + b, 0), goal: 25, reward: { credits: 1500 } },
    { id: 'credits20k', cat: 'General', name: 'Earn 20,000 credits in total', p: s => st(s).creditsEarned, goal: 20000, reward: { credits: 2000 } },
    { id: 'time60', cat: 'General', name: 'Spend 60 minutes scanning in total', p: s => Math.floor(st(s).time / 60), goal: 60, reward: { credits: 700 } }
  ];
  C.TASK_CATS = ['Software', 'Users', 'Drives', 'Themes', 'General'];

  C.START_WEAPONS = ['ping', 'floppy', 'icons', 'email', 'dialup', 'keyboard'];
})(window.CAS);
