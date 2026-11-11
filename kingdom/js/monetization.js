/*
 * Monetization layer (ads + in-app purchases + analytics).
 *
 * Every game talks ONLY to this interface, never to an ad SDK directly.
 * In the browser build everything is simulated ("mock" provider).
 * When wrapping with Capacitor, swap the provider implementation for
 * AdMob / AppLovin MAX + RevenueCat (see README "Monetization").
 */
(function () {
  'use strict';
  const { Save, UI, sfx } = GH;

  const config = {
    provider: 'mock',          // 'mock' | 'admob' (native build)
    rewardedSeconds: 5,        // length of the fake rewarded video
    interstitialSeconds: 3,    // fake interstitial becomes skippable after this
    interstitialEvery: 3,      // show an interstitial every N finished levels
    freeCoinsCooldownMs: 3 * 60 * 1000,
    // Real ad unit IDs go here for the native build (these are Google's public TEST ids).
    admob: {
      banner: 'ca-app-pub-3940256099942544/6300978111',
      interstitial: 'ca-app-pub-3940256099942544/1033173712',
      rewarded: 'ca-app-pub-3940256099942544/5224354917',
    },
  };

  // Catalog shown in the shop. Prices are display-only in the web build;
  // on device they come from the store via the IAP SDK.
  const products = [
    { id: 'remove_ads', icon: '🚫', name: 'Remove Ads', desc: 'No banners or interstitials. Rewarded ads stay optional.', price: '$2.99', featured: true, grant: () => { Save.data.noAds = true; } },
    { id: 'starter_pack', icon: '🎁', name: 'Starter Pack', desc: '2,000 coins + 100 gems', price: '$4.99', badge: 'BEST', grant: () => { Save.data.coins += 2000; Save.data.gems += 100; } },
    { id: 'gems_small', icon: '💎', name: 'Pouch of Gems', desc: '60 gems', price: '$0.99', grant: () => { Save.data.gems += 60; } },
    { id: 'gems_big', icon: '💰', name: 'Chest of Gems', desc: '400 gems', price: '$4.99', grant: () => { Save.data.gems += 400; } },
    { id: 'coins_gems', icon: '🪙', name: 'Coin Sack', desc: '1,000 coins for 50 gems', price: '50 💎', currency: 'gems', cost: 50, grant: () => { Save.data.coins += 1000; } },
  ];

  function track(event, params) {
    // Hook Firebase Analytics / GameAnalytics here.
    if (window.console && console.debug) console.debug('[analytics]', event, params || {});
  }

  // ----------------------------------------------------------- Mock ad player
  function playFakeAd({ seconds, skippableAfter, label, rewarded }) {
    return new Promise((resolve) => {
      const el = document.createElement('div');
      el.className = 'ad-player';
      el.innerHTML = `
        <div class="ad-top"><span class="label">AD</span><span class="count"></span><button class="ad-close" style="visibility:hidden">✕</button></div>
        <div class="ad-box">${label}<br><br><small style="font-size:13px;font-weight:600">(Simulated ${rewarded ? 'rewarded video' : 'interstitial'})</small></div>
        <div class="bar"><div></div></div>`;
      document.body.appendChild(el);
      const count = el.querySelector('.count');
      const close = el.querySelector('.ad-close');
      const bar = el.querySelector('.bar div');
      const start = performance.now();
      let done = false;
      const tick = () => {
        if (done) return;
        const t = (performance.now() - start) / 1000;
        const left = Math.max(0, Math.ceil(seconds - t));
        bar.style.width = Math.min(100, (t / seconds) * 100) + '%';
        count.textContent = left > 0 ? (rewarded ? `Reward in ${left}s` : `Skip in ${Math.max(0, Math.ceil(skippableAfter - t))}s`) : 'Reward earned ✓';
        if (t >= skippableAfter) close.style.visibility = 'visible';
        if (t >= seconds && rewarded) count.textContent = 'Reward earned ✓';
        requestAnimationFrame(tick);
      };
      tick();
      close.addEventListener('click', () => {
        const t = (performance.now() - start) / 1000;
        done = true;
        el.remove();
        resolve(rewarded ? t >= seconds : true);
      });
    });
  }

  const ADS = [
    '🏰 KINGDOM CLASH<br>Only 1% can pass level 5!',
    '❄️ FROZEN EMPIRE<br>Save the survivors!',
    '🧮 MATH ARMY<br>Choose the right gate!',
    '📌 PIN MASTER<br>IQ 200 players only',
  ];
  const pickAd = () => ADS[Math.floor(Math.random() * ADS.length)];

  const Monetization = {
    config,
    products,
    track,

    /** Resolves true if the user watched to the end and should be rewarded. */
    async showRewarded(placement) {
      track('rewarded_request', { placement });
      const ok = await playFakeAd({ seconds: config.rewardedSeconds, skippableAfter: 1.5, label: pickAd(), rewarded: true });
      track(ok ? 'rewarded_complete' : 'rewarded_skipped', { placement });
      if (!ok) UI.toast('Watch the full ad to get the reward');
      else sfx('coin');
      return ok;
    },

    /** Called after each finished level; frequency-capped and disabled by Remove Ads. */
    async maybeInterstitial(placement) {
      if (Save.data.noAds) return;
      Save.data.stats.levelsSinceInterstitial++;
      Save.save();
      if (Save.data.stats.levelsSinceInterstitial < config.interstitialEvery) return;
      Save.data.stats.levelsSinceInterstitial = 0;
      Save.save();
      track('interstitial_show', { placement });
      await playFakeAd({ seconds: config.interstitialSeconds, skippableAfter: config.interstitialSeconds, label: pickAd(), rewarded: false });
    },

    /** A rewarded ad was just watched – many games skip the next interstitial as a courtesy. */
    resetInterstitialCounter() {
      Save.data.stats.levelsSinceInterstitial = 0;
      Save.save();
    },

    refreshBanner() {
      const el = document.getElementById('ad-banner');
      if (el) el.classList.toggle('hidden', !!Save.data.noAds);
    },

    /** Resolves true when purchased. */
    async purchase(productId) {
      const p = products.find((x) => x.id === productId);
      if (!p) return false;
      if (p.id === 'remove_ads' && Save.data.noAds) { UI.toast('Already owned'); return false; }
      if (p.currency === 'gems') {
        if (Save.data.gems < p.cost) { UI.toast('Not enough gems 💎'); return false; }
        Save.data.gems -= p.cost;
        p.grant();
        Save.save();
        sfx('coin');
        UI.toast(`${p.name} purchased!`);
        return true;
      }
      track('iap_start', { productId });
      return new Promise((resolve) => {
        UI.modal({
          icon: p.icon,
          title: p.name,
          sub: `${p.desc}<br><br><b>${p.price}</b><br><small>Test mode – no real payment happens.</small>`,
          buttons: [
            { label: `Buy for ${p.price}`, cls: 'gold', onClick: () => {
              p.grant(); Save.save(); sfx('win');
              track('iap_complete', { productId });
              Monetization.refreshBanner();
              UI.toast(`${p.name} purchased!`);
              resolve(true);
            } },
            { label: 'Cancel', cls: 'ghost', onClick: () => resolve(false) },
          ],
        });
      });
    },
  };

  window.Monetization = Monetization;
})();
