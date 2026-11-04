/* Ctrl+Alt+Survive — start-up glue */
(function (C) {
  'use strict';
  C.Save.load();
  C.Game.init();
  C.Desktop.applySettings();

  const $ = id => document.getElementById(id);
  $('rbPause').onclick = () => { if (C.Game.run && !C.Game.run.over && !C.Game.pauses.has('levelup') && !C.Game.pauses.has('zip')) C.RunUI.openPause(); };
  $('rbQuit').onclick = () => {
    if (!C.Game.run || C.Game.run.over) return;
    if (!C.Game.pauses.has('levelup') && !C.Game.pauses.has('zip')) C.RunUI.openPause();
    C.Desktop.confirm('End Task', 'End the scan now? You keep the credits you collected.', 'i_shutdown', ['End Task', 'Cancel']).then(r => { if (r === 0) { C.RunUI.closePause(true); C.Game.end('quit'); } });
  };
  document.querySelector('.run-menu').addEventListener('click', e => {
    const m = e.target.dataset.m;
    if (!m || !C.Game.run || C.Game.run.over || C.Game.pauses.has('levelup') || C.Game.pauses.has('zip')) return;
    if (m === 'help') { C.RunUI.openPause(); }
    else C.RunUI.openPause();
  });
  // the first user gesture unlocks audio
  window.addEventListener('pointerdown', () => C.Audio.init(), { once: true });
  window.addEventListener('keydown', () => C.Audio.init(), { once: true });
  // keep the game canvas sized to its window
  new ResizeObserver(() => C.Game.resize()).observe($('gameArea'));
  // stop pinch-zoom / double-tap zoom on touch devices
  document.addEventListener('gesturestart', e => e.preventDefault());
  document.addEventListener('contextmenu', e => { if (e.target.closest('#gameArea')) e.preventDefault(); });

  if (/[?&]quick\b/.test(location.search)) C.Desktop.login(); else C.Desktop.boot();
})(window.CAS);
