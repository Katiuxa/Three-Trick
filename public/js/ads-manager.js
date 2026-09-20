/**
 * GameAds — freemium AdMob (Capacitor WebView).
 * Config: window.GAME_ADS_CONFIG before this file (see ads-config.js).
 * Banner bottom + "Quitar anuncios por 2 €".
 *
 * Interstitial policy (AdMob-safe, anti-spam):
 *  1. Natural match end (win or lose) always *attempts* an interstitial.
 *  2. Restart / "Nueva partida" spam: only if the player abandoned ≥ N games
 *     in a row (default 4) AND the global cooldown has elapsed.
 *  3. Global cooldown (default 3 min) is a hard floor — never bypassed except
 *     the developer "Probar anuncio" button.
 *  4. App boot and the first clean match start never show an interstitial.
 */
(function (global) {
  "use strict";

  var CFG = Object.assign({
    gameId: "game",
    purchaseKey: "game_remove_ads",
    legacyPurchaseKeys: [],
    appId: "PEGA_AQUÍ_EL_APP_ID_DE_ESTE_JUEGO",
    bannerId: "PEGA_AQUÍ_EL_BANNER_ID_DE_ESTE_JUEGO",
    interstitialId: "PEGA_AQUÍ_EL_INTERSTITIAL_ID_DE_ESTE_JUEGO",
    brand: "SPONSOR",
    priceEur: "2",
    developerForceAds: true,
    /* Hard floor between any two interstitials. Default 3 min (AdMob). */
    interstitialCooldownMs: 3 * 60 * 1000,
    /* Consecutive abandons / "Nueva partida" before a restart interstitial. */
    restartSpamCount: 4,
    /* First full-screen ad after this much play time (0 / omit = off). */
    sessionInterstitialMs: 0
  }, global.GAME_ADS_CONFIG || {});

  var PURCHASE_KEY = CFG.purchaseKey;
  var PRICE_EUR = String(CFG.priceEur || "2");
  var BANNER_H = "50px";
  var BANNER_SLOT_ID = "lat-ad-slot";
  var SIM_INTERSTITIAL_SEC = 15;
  var LAST_INTERSTITIAL_KEY = String(CFG.gameId || "game") + "_last_interstitial_at";
  var LOG = "[" + (CFG.gameId || "GameAds") + "]";

  var USE_GOOGLE_TEST_UNITS = false;
  var TEST = {
    banner: "ca-app-pub-3940256099942544/6300978111",
    interstitial: "ca-app-pub-3940256099942544/1033173712"
  };

  var state = {
    ready: false,
    purchased: false,
    admobReady: false,
    bannerEl: null,
    buyFab: null,
    metamoEl: null,
    interstitialEl: null,
    interstitialOpen: false,
    interstitialPrepared: false,
    countdownId: null,
    matchEndedPendingAd: false,
    matchEndTimer: null,
    matchInProgress: false,
    consecutiveRestarts: 0,
    matchesStarted: 0,
    lastInterstitialAt: 0,
    bannerShowing: false,
    bannerRetryId: null,
    listenersBound: false,
    devLaunchEl: null,
    sessionTimerId: null,
    /* Only count foreground play time toward the 5‑min interstitial. */
    sessionRemainingMs: 0,
    sessionDeadlineAt: 0
  };

  function restartSpamNeed() {
    var n = Number(CFG.restartSpamCount);
    if (!isFinite(n) || n < 1) return 4;
    return Math.floor(n);
  }

  function cooldownMs() {
    var n = Number(CFG.interstitialCooldownMs);
    if (!isFinite(n) || n < 0) return 3 * 60 * 1000;
    return n;
  }

  function readLastInterstitialAt() {
    try {
      var v = parseInt(global.localStorage.getItem(LAST_INTERSTITIAL_KEY), 10);
      return isFinite(v) && v > 0 ? v : 0;
    } catch (e) {
      return 0;
    }
  }

  function markInterstitialShown() {
    var now = Date.now();
    state.lastInterstitialAt = now;
    try {
      global.localStorage.setItem(LAST_INTERSTITIAL_KEY, String(now));
    } catch (e) {}
  }

  function cooldownReady() {
    var last = state.lastInterstitialAt || readLastInterstitialAt();
    state.lastInterstitialAt = last;
    if (!last) return true;
    return Date.now() - last >= cooldownMs();
  }

  function idsFilled() {
    var b = String(CFG.bannerId || "");
    var i = String(CFG.interstitialId || "");
    return b.indexOf("PEGA_AQUÍ") === -1 && i.indexOf("PEGA_AQUÍ") === -1 && b.indexOf("xxxx") === -1;
  }

    function nativeAds() {
    return global.GameAdsNative
      || global.OchoDamasNative
      || global.TriTrickNative
      || global.HuarongNative
      || global.PetteiaNative
      || global.LatrunculiNative
      || null;
  }
  function units() {
    return { banner: CFG.bannerId, interstitial: CFG.interstitialId };
  }

  function whenAdMobReady(done) {
    var tries = 0;
    var tick = function () {
      try {
        var C = global.Capacitor;
        var nativeOk = !!(C && C.isNativePlatform && C.isNativePlatform());
        var pluginOk = !!(C && typeof C.isPluginAvailable === "function" && C.isPluginAvailable("AdMob"));
        var AdMob = getAdMob();
        if (nativeOk && (pluginOk || (AdMob && typeof AdMob.initialize === "function" && typeof AdMob.showBanner === "function"))) {
          if (AdMob && typeof AdMob.initialize === "function") {
            done();
            return;
          }
        }
      } catch (e) {}
      tries += 1;
      if (tries >= 50) {
        done();
        return;
      }
      setTimeout(tick, 120);
    };
    tick();
  }

  function isNativeApp() {
    try {
      return (
        document.documentElement.classList.contains("android-app") ||
        document.documentElement.classList.contains("is-native") ||
        !!(global.Capacitor && global.Capacitor.isNativePlatform && global.Capacitor.isNativePlatform())
      );
    } catch (e) {
      return false;
    }
  }

  function isRealNative() {
    try {
      return !!(global.Capacitor && global.Capacitor.isNativePlatform && global.Capacitor.isNativePlatform());
    } catch (e) {
      return false;
    }
  }

  function getAdMob() {
    try {
      var C = global.Capacitor;
      if (!C) return null;
      if (typeof C.registerPlugin === "function") {
        return C.registerPlugin("AdMob");
      }
      if (C.Plugins && C.Plugins.AdMob) return C.Plugins.AdMob;
    } catch (e) {}
    return null;
  }

  function adsSurfaceActive() {
    return isNativeApp();
  }

  function developerForceAds() {
    if (CFG.developerForceAds === true) return true;
    try {
      return global.localStorage.getItem("metamovidas_dev_force_ads") === "1";
    } catch (e) {
      return false;
    }
  }

  function adsOff() {
    return !!state.purchased && !developerForceAds();
  }

  function notifyNativeBanner(on) {
    try {
      if (global.TriTrickNative && typeof global.TriTrickNative.setPlayAds === "function") {
        /* Never ask native to collapse while ads should show (zero-height AdView never fills). */
        if (!on && !adsOff()) return;
        global.TriTrickNative.setPlayAds(!!on && !adsOff());
      }
    } catch (e) {}
  }

  function emitAdsChange() {
    try {
      global.dispatchEvent(new Event("gameads-change"));
    } catch (e) {}
  }

  function readPurchased() {
    var keys = [PURCHASE_KEY].concat(CFG.legacyPurchaseKeys || []);
    try {
      for (var i = 0; i < keys.length; i++) {
        var v = global.localStorage.getItem(keys[i]);
        if (v === "true" || v === "1") return true;
      }
    } catch (e) {}
    return false;
  }

  function writePurchased(on) {
    try {
      if (on) global.localStorage.setItem(PURCHASE_KEY, "true");
      else global.localStorage.removeItem(PURCHASE_KEY);
    } catch (e) {}
    state.purchased = !!on;
    emitAdsChange();
  }

  function measureBannerRow() {
    try {
      var row = document.getElementById("lat-ad-row");
      if (!row || (state.bannerEl && (state.bannerEl.hidden || state.bannerEl.classList.contains("is-credit-only")))) {
        return null;
      }
      var h = row.getBoundingClientRect().height;
      return h > 0 ? Math.ceil(h) : null;
    } catch (e) {
      return null;
    }
  }

  function setBannerHeight(on, px) {
    if (adsSurfaceActive()) buildMetamo();
    if (state.bannerEl) {
      /* Native AdMob lives in a gap below the WebView. HTML only keeps the credit. */
      state.bannerEl.classList.add("is-credit-only");
      state.bannerEl.hidden = !adsSurfaceActive();
    }
    document.documentElement.classList.add("ads-chrome");
    document.documentElement.classList.toggle("has-ad-banner", !!on && adsSurfaceActive());
    document.documentElement.style.setProperty("--ad-row-h", "0px");
    document.documentElement.style.setProperty("--ad-banner-h", "0px");
    setMetamoVisible(adsSurfaceActive());
  }

  function navMarginDp() {
    /* Native MainActivity already pads the content view by the nav-bar inset
       and hides the bar until the user swipes. Extra AdMob margin would lift
       the banner over the board / counts. */
    return 0;
  }

  function t(key) {
    var lang = (document.documentElement.lang || "es").slice(0, 2).toLowerCase();
    var dict = {
      es: {
        sponsor: "Espacio publicitario",
        buy: "Quitar anuncios por " + PRICE_EUR + " €",
        buyShort: "2 €",
        noAds: "No<br>ads",
        noAdsAria: "Quitar anuncios por " + PRICE_EUR + " €",
        confirm:
          "¿Quitar anuncios por " +
          PRICE_EUR +
          " €?\n\n(Simulación de pago: se guardará en este dispositivo.)",
        thanks: "Compra registrada. Los anuncios quedan desactivados de forma permanente en este dispositivo.",
        thanksDev: "Compra guardada en este dispositivo. Como desarrollador los anuncios siguen activos.",
        devLaunch: "Probar anuncio",
        adTitle: "Anuncio",
        wait: "Podrás cerrar en",
        close: "Cerrar anuncio",
        simLabel: "Anuncio simulado"
      },
      en: {
        sponsor: "Ad space",
        buy: "Remove ads for €" + PRICE_EUR,
        buyShort: "€" + PRICE_EUR,
        noAds: "No<br>ads",
        noAdsAria: "Remove ads for €" + PRICE_EUR,
        confirm: "Remove ads for €" + PRICE_EUR + "?\n\n(Simulated purchase — saved on this device.)",
        thanks: "Purchase saved. Ads are permanently disabled on this device.",
        thanksDev: "Purchase saved. Developer mode keeps ads on.",
        devLaunch: "Test ad",
        adTitle: "Advertisement",
        wait: "You can close in",
        close: "Close ad",
        simLabel: "Simulated ad"
      }
    };
    return (dict[lang] || dict.es)[key] || dict.es[key] || key;
  }

  function muteGameAudio(mute) {
    try {
      if (mute && typeof global.latrunculiMuteForAd === "function") global.latrunculiMuteForAd(true);
      if (!mute && typeof global.latrunculiMuteForAd === "function") global.latrunculiMuteForAd(false);
      if (mute && typeof global.TriTrickStopMusic === "function") global.TriTrickStopMusic();
      if (!mute && typeof global.TriTrickStartMusic === "function") global.TriTrickStartMusic();
    } catch (e) {}
  }

  function setMetamoVisible(on) {
    if (!adsSurfaceActive()) {
      document.documentElement.classList.remove("has-metamo");
      document.documentElement.style.setProperty("--metamo-h", "0px");
      if (state.metamoEl) state.metamoEl.hidden = true;
      return;
    }
    buildMetamo();
    var show = on !== false;
    if (state.metamoEl) state.metamoEl.hidden = !show;
    document.documentElement.classList.toggle("has-metamo", show);
    document.documentElement.style.setProperty("--metamo-h", show ? "1.25rem" : "0px");
  }

  function syncMetamo() {
    setMetamoVisible(adsSurfaceActive());
  }

  function watchBootForMetamo() {
    syncMetamo();
  }

  function buildMetamo() {
    var banner = buildBanner();
    if (state.metamoEl && state.metamoEl.parentNode) return state.metamoEl;
    var el = document.createElement("p");
    el.className = "lat-metamo";
    el.setAttribute("aria-label", "Made with love by Metamovidas");
    el.innerHTML =
      "<span>Made with</span><span class=\"heart\" aria-hidden=\"true\">❤️</span><span>by Metamovidas</span>";
    banner.insertBefore(el, banner.firstChild);
    state.metamoEl = el;
    return el;
  }

  function showDevTools() {
    try {
      return global.localStorage.getItem("metamovidas_dev_force_ads") === "1";
    } catch (e) {
      return false;
    }
  }

  function buildDevLauncher() {
    if (!showDevTools()) return null;
    if (state.devLaunchEl) return state.devLaunchEl;
    buildBanner();
    return state.devLaunchEl;
  }

  function syncDevLauncher() {
    if (!showDevTools()) {
      if (state.devLaunchEl) state.devLaunchEl.hidden = true;
      return;
    }
    var btn = buildDevLauncher();
    if (btn) btn.hidden = !adsSurfaceActive() || adsOff();
  }

  function buildBuyFab() {
    if (state.buyFab) return state.buyFab;
    var btn = document.createElement("button");
    btn.type = "button";
    btn.id = "lat-ad-buy-fab";
    btn.className = "lat-ad-buy-fab";
    btn.textContent = t("buyShort");
    btn.setAttribute("aria-label", t("buy"));
    btn.addEventListener("click", simulatePurchase);
    document.body.appendChild(btn);
    state.buyFab = btn;
    return btn;
  }

  function injectNoAdsFab() {
    if (!adsSurfaceActive()) return;
    var hosts = document.querySelectorAll(".header-actions, .hero-end, .boot-sounds");
    for (var i = 0; i < hosts.length; i++) {
      var host = hosts[i];
      if (!host || host.querySelector(".lat-ad-noads-fab")) continue;
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "mute-fab lat-ad-noads-fab";
      btn.setAttribute("aria-label", t("noAdsAria"));
      btn.title = t("noAdsAria");
      btn.innerHTML = '<span class="lat-ad-noads-fab__txt">' + t("noAds") + "</span>";
      btn.addEventListener("click", simulatePurchase);
      host.insertBefore(btn, host.firstChild);
    }
  }

  function syncNoAdsFab() {
    injectNoAdsFab();
    var show = adsSurfaceActive() && !adsOff();
    var nodes = document.querySelectorAll(".lat-ad-noads-fab");
    for (var i = 0; i < nodes.length; i++) nodes[i].hidden = !show;
  }

  function buildBanner() {
    if (state.bannerEl) return state.bannerEl;
    var el = document.createElement("aside");
    el.id = "lat-ad-banner";
    el.className = "lat-ad-banner";
    el.setAttribute("role", "complementary");
    el.setAttribute("aria-label", t("sponsor"));
    var extraDev = showDevTools()
      ? '<button type="button" class="lat-ad-dev-launch" id="lat-ad-dev-launch">' +
        t("devLaunch") +
        "</button>"
      : "";
    el.innerHTML =
      '<div class="lat-ad-banner__row" id="lat-ad-row">' +
      extraDev +
      '<div class="lat-ad-banner__slot" id="' +
      BANNER_SLOT_ID +
      '"></div>' +
      '<button type="button" class="lat-ad-banner__buy" id="lat-ad-buy">' +
      t("buyShort") +
      "</button>" +
      "</div>";
    document.body.appendChild(el);
    el.querySelector("#lat-ad-buy").addEventListener("click", simulatePurchase);
    var devBtn = el.querySelector("#lat-ad-dev-launch");
    if (devBtn) {
      devBtn.addEventListener("click", function (ev) {
        ev.preventDefault();
        requestInterstitial(true);
      });
      state.devLaunchEl = devBtn;
    }
    state.bannerEl = el;
    return el;
  }

  function buildInterstitial() {
    if (state.interstitialEl) return state.interstitialEl;
    var el = document.createElement("div");
    el.id = "lat-ad-interstitial";
    el.className = "lat-ad-interstitial";
    el.hidden = true;
    el.setAttribute("role", "dialog");
    el.setAttribute("aria-modal", "true");
    el.innerHTML =
      '<div class="lat-ad-interstitial__panel">' +
      '<p class="lat-ad-interstitial__eyebrow">' +
      t("adTitle") +
      "</p>" +
      '<div class="lat-ad-interstitial__creative">' +
      '<span class="lat-ad-interstitial__mark">SPONSOR</span>' +
      "<strong>" +
      CFG.brand +
      "</strong>" +
      "<p></p>" +
      "</div>" +
      '<p class="lat-ad-interstitial__wait" id="lat-ad-wait"></p>' +
      '<button type="button" class="lat-ad-interstitial__close" id="lat-ad-close" disabled>' +
      t("close") +
      "</button>" +
      '<button type="button" class="lat-ad-interstitial__buy" id="lat-ad-buy-int">' +
      t("buy") +
      "</button>" +
      "</div>";
    document.body.appendChild(el);
    el.querySelector("#lat-ad-close").addEventListener("click", closeSimInterstitial);
    el.querySelector("#lat-ad-buy-int").addEventListener("click", simulatePurchase);
    state.interstitialEl = el;
    return el;
  }

  function bindAdMobListeners(AdMob) {
    if (state.listenersBound || !AdMob || typeof AdMob.addListener !== "function") return;
    state.listenersBound = true;
    try {
      AdMob.addListener("bannerAdSizeChanged", function (info) {
        if (!info) return;
        var h = info.height || info.adHeight;
        if (h) setBannerHeight(true, h);
      });
      AdMob.addListener("bannerAdLoaded", function () {
        state.bannerShowing = true;
        document.documentElement.classList.add("has-admob-native");
        setBannerHeight(true);
      });
      AdMob.addListener("bannerAdFailedToLoad", function (err) {
        console.warn(LOG, "banner failed code=" + (err && (err.code || err.errorCode)), err);
        document.documentElement.classList.remove("has-admob-native");
        setBannerHeight(true);
        scheduleBannerRetry();
      });
      AdMob.addListener("interstitialAdLoaded", function () {
        state.interstitialPrepared = true;
      });
      AdMob.addListener("interstitialAdFailedToLoad", function (err) {
        console.warn(LOG, "interstitial failed to load code=" + (err && (err.code || err.errorCode)), err);
        state.interstitialPrepared = false;
      });
      AdMob.addListener("interstitialAdShowed", function () {
        state.interstitialOpen = true;
        muteGameAudio(true);
      });
      AdMob.addListener("interstitialAdDismissed", function () {
        state.interstitialOpen = false;
        muteGameAudio(false);
        state.interstitialPrepared = false;
        prepareInterstitial();
      });
      AdMob.addListener("interstitialAdFailedToShow", function (err) {
        console.warn(LOG, "interstitial failed to show", err);
        state.interstitialOpen = false;
        muteGameAudio(false);
        state.interstitialPrepared = false;
        prepareInterstitial();
      });
    } catch (e) {
      console.warn(LOG, "listeners", e);
    }
  }

  function prepareInterstitial() {
    if (adsOff()) return Promise.resolve(false);
    var AdMob = getAdMob();
        var native = nativeAds();
    if (native && typeof native.preloadInterstitial === "function") {
      try { native.preloadInterstitial(); } catch (e) {}
      state.interstitialPrepared = true;
      return Promise.resolve(true);
    }
    if (!AdMob || typeof AdMob.prepareInterstitial !== "function") return Promise.resolve(false);
    return AdMob.prepareInterstitial({
      adId: units().interstitial,
      isTesting: false
    })
      .then(function () {
        state.interstitialPrepared = true;
        return true;
      })
      .catch(function (err) {
        var code = err && (err.code || err.errorCode);
        console.warn(LOG, "prepareInterstitial code=" + code, err);
        state.interstitialPrepared = false;
        setTimeout(function () {
          if (!adsOff()) prepareInterstitial();
        }, 4000);
        return false;
      });
  }

  function scheduleBannerRetry() {
    if (state.bannerRetryId) return;
    state.bannerRetryId = setTimeout(function () {
      state.bannerRetryId = null;
      if (adsOff() || !state.admobReady) return;
      showNativeBanner();
    }, 4000);
  }

  function showNativeBanner() {
    /* Bottom banner is a native AdView below the WebView (MainActivity).
       The Capacitor plugin overlay sits under the WebView surface and never shows. */
    buildMetamo();
    document.documentElement.classList.add("has-admob-native");
    if (state.bannerEl) state.bannerEl.hidden = false;
    setBannerHeight(true);
    if (state.buyFab) state.buyFab.hidden = true;
    state.bannerShowing = true;
    notifyNativeBanner(true);
    return Promise.resolve(true);
  }

  function hideNativeBanner() {
    state.bannerShowing = false;
    document.documentElement.classList.remove("has-admob-native");
    notifyNativeBanner(false);
    return Promise.resolve();
  }

  function showSimBannerChrome() {
    buildBanner();
    buildInterstitial();
    state.bannerEl.hidden = false;
    if (state.buyFab) state.buyFab.hidden = true;
    document.documentElement.classList.remove("has-admob-native");
    setBannerHeight(true);
    syncMetamo();
    syncDevLauncher();
    syncNoAdsFab();
    requestAnimationFrame(function () {
      setBannerHeight(true);
    });
  }

  function showBannerChrome() {
    if (adsOff() || !adsSurfaceActive()) {
      hideBannerChrome();
      return Promise.resolve(false);
    }
    buildMetamo();
    buildInterstitial();
    syncMetamo();
    syncDevLauncher();
    syncNoAdsFab();
    if (state.admobReady && isRealNative()) {
      return showNativeBanner();
    }
    if (isRealNative()) {
      return initAdMob().then(function () {
        return showNativeBanner();
      });
    }
    setBannerHeight(true);
    return Promise.resolve(true);
  }

  function hideBannerChrome() {
    if (state.buyFab) state.buyFab.hidden = true;
    if (state.devLaunchEl && !showDevTools()) state.devLaunchEl.hidden = true;
    setBannerHeight(false);
    syncMetamo();
    syncDevLauncher();
    syncNoAdsFab();
    return hideNativeBanner();
  }

  function destroyAds() {
    writePurchased(true);
    try { var n = nativeAds(); if (n && n.setAdsOff) n.setAdsOff(); } catch (e) {}
    clearSessionInterstitialTimer();
    closeSimInterstitial();
    hideBannerChrome();
    if (state.buyFab && state.buyFab.parentNode) {
      state.buyFab.parentNode.removeChild(state.buyFab);
      state.buyFab = null;
    }
    if (state.interstitialEl && state.interstitialEl.parentNode) {
      state.interstitialEl.parentNode.removeChild(state.interstitialEl);
      state.interstitialEl = null;
    }
    syncMetamo();
    syncNoAdsFab();
  }

  function applyPurchaseUnlocked() {
    writePurchased(true);
    try { var n = nativeAds(); if (n && n.setAdsOff) n.setAdsOff(); } catch (e) {}
    if (developerForceAds()) return;
    destroyAds();
    try { global.dispatchEvent(new Event("gameads-change")); } catch (e) {}
  }

  function simulatePurchase() {
    try {
      var n = nativeAds();
      if (n && typeof n.buyRemoveAds === "function") {
        n.buyRemoveAds();
        return;
      }
    } catch (e) {}
    if (!global.confirm(t("confirm"))) return;
    applyPurchaseUnlocked();
  }

  function closeSimInterstitial() {
    if (state.countdownId) {
      clearInterval(state.countdownId);
      state.countdownId = null;
    }
    if (state.interstitialEl) state.interstitialEl.hidden = true;
    state.interstitialOpen = false;
    document.body.classList.remove("lat-ad-locked");
    muteGameAudio(false);
  }

  function showSimInterstitial() {
    /* Never show the HTML “Anuncio simulado” overlay. Real AdMob only. */
    return false;
  }

  /**
   * @param {object|boolean} [opts]
   *   true / { bypassCooldown: true } — developer "Probar anuncio" only
   * Global 3 min floor applies to every other path (natural end and restart spam).
   * Boot and first clean start never call this.
   */
  function requestInterstitial(opts) {
    if (adsOff() || !adsSurfaceActive()) return Promise.resolve(false);
    if (state.interstitialOpen) return Promise.resolve(false);

    var bypass = false;
    if (opts === true) bypass = true;
    else if (opts && typeof opts === "object" && opts.bypassCooldown === true) bypass = true;

    if (!bypass && !cooldownReady()) {
      console.info(LOG, "interstitial skipped (global cooldown)", cooldownMs(), "ms");
      return Promise.resolve(false);
    }

    var AdMob = getAdMob();
    var nativeShow = nativeAds();
    if (nativeShow && typeof nativeShow.showInterstitial === "function") {
      try { nativeShow.showInterstitial(); } catch (e) {}
      return Promise.resolve(true);
    }
    if (state.admobReady && AdMob && typeof AdMob.showInterstitial === "function") {
      var show = function () {
        markInterstitialShown();
        return AdMob.showInterstitial()
          .then(function () {
            return true;
          })
          .catch(function (err) {
            console.warn(LOG, "showInterstitial", err);
            return false;
          });
      };
      if (state.interstitialPrepared) return show();
      return prepareInterstitial().then(function (ok) {
        if (ok) return show();
        return false;
      });
    }
    return Promise.resolve(false);
  }

  function sessionInterstitialMs() {
    var n = Number(CFG.sessionInterstitialMs);
    if (!isFinite(n) || n < 1) return 0;
    return Math.floor(n);
  }

  function clearSessionInterstitialTimer() {
    if (state.sessionTimerId) {
      clearTimeout(state.sessionTimerId);
      state.sessionTimerId = null;
    }
  }

  function pauseSessionInterstitialTimer() {
    if (!state.sessionTimerId && !state.sessionDeadlineAt) return;
    clearSessionInterstitialTimer();
    if (state.sessionDeadlineAt) {
      state.sessionRemainingMs = Math.max(0, state.sessionDeadlineAt - Date.now());
      state.sessionDeadlineAt = 0;
    }
  }

  function startSessionInterstitialTimer() {
    clearSessionInterstitialTimer();
    var ms = sessionInterstitialMs();
    if (!ms || adsOff() || !adsSurfaceActive()) return;
    try {
      if (document.visibilityState === "hidden") {
        if (!state.sessionRemainingMs) state.sessionRemainingMs = ms;
        return;
      }
    } catch (e) {}
    var delay = state.sessionRemainingMs > 0 ? state.sessionRemainingMs : ms;
    state.sessionRemainingMs = 0;
    state.sessionDeadlineAt = Date.now() + delay;
    state.sessionTimerId = setTimeout(function () {
      state.sessionTimerId = null;
      state.sessionDeadlineAt = 0;
      if (adsOff()) return;
      try {
        if (document.visibilityState === "hidden") {
          state.sessionRemainingMs = 0;
          return;
        }
      } catch (e2) {}
      requestInterstitial({ bypassCooldown: false }).then(function () {
        startSessionInterstitialTimer();
      });
    }, delay);
  }

  function onAppBecameActive() {
    if (adsOff() || !adsSurfaceActive()) return;
    startSessionInterstitialTimer();
    try {
      notifyNativeBanner(true);
      showBannerChrome();
    } catch (e) {}
  }

  function onAppBecameInactive() {
    pauseSessionInterstitialTimer();
  }

  function bindAppLifecycle() {
    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "hidden") onAppBecameInactive();
      else onAppBecameActive();
    });
    global.addEventListener("pagehide", onAppBecameInactive);
    global.addEventListener("pageshow", onAppBecameActive);
    try {
      var C = global.Capacitor;
      var App = C && C.Plugins && C.Plugins.App;
      if (App && typeof App.addListener === "function") {
        App.addListener("appStateChange", function (info) {
          if (info && info.isActive) onAppBecameActive();
          else onAppBecameInactive();
        });
      }
    } catch (e) {}
  }

  function onMatchStart() {
    /* Do not cancel a pending natural-end interstitial: a fast "Nueva partida"
       after a win/lose must not swallow that ad. */
    if (adsOff()) {
      state.matchInProgress = true;
      return;
    }

    var abandoned = !!state.matchInProgress;
    if (abandoned) {
      state.consecutiveRestarts += 1;
      console.info(LOG, "restart streak", state.consecutiveRestarts, "/", restartSpamNeed());
      if (state.consecutiveRestarts >= restartSpamNeed()) {
        requestInterstitial({ bypassCooldown: false }).then(function (shown) {
          if (shown) state.consecutiveRestarts = 0;
        });
      }
    } else {
      /* Boot / first clean start / start after a finished match: never an interstitial here. */
      state.consecutiveRestarts = 0;
    }

    state.matchInProgress = true;
    state.matchesStarted += 1;
    syncMetamo();
    prepareInterstitial();
  }

  function onMatchEnd() {
    if (adsOff()) {
      state.matchInProgress = false;
      state.consecutiveRestarts = 0;
      return;
    }
    state.matchInProgress = false;
    state.consecutiveRestarts = 0;
    if (state.matchesStarted < 1) state.matchesStarted = 1;
    state.matchEndedPendingAd = true;
    if (state.matchEndTimer) clearTimeout(state.matchEndTimer);
    /* Delay so win/lose UI paints. Store builds keep the 3 min floor. */
    state.matchEndTimer = setTimeout(function () {
      state.matchEndTimer = null;
      requestInterstitial({ bypassCooldown: false });
    }, 450);
  }

  function consumeBack() {
    if (!state.interstitialOpen) return false;
    var closeBtn = state.interstitialEl && state.interstitialEl.querySelector("#lat-ad-close");
    if (closeBtn && !closeBtn.disabled) {
      closeSimInterstitial();
      return true;
    }
    /* Native interstitial: let OS/ad SDK handle back */
    if (state.admobReady && isRealNative() && (!state.interstitialEl || state.interstitialEl.hidden)) {
      return true;
    }
    return true;
  }

  function initAdMob(attempt) {
    attempt = attempt || 0;
    if (!idsFilled()) return Promise.resolve(false);
    if (!isRealNative() || !getAdMob() || typeof getAdMob().initialize !== "function") {
      if (attempt < 10) {
        return new Promise(function (resolve) {
          setTimeout(function () {
            resolve(initAdMob(attempt + 1));
          }, 280);
        });
      }
      return Promise.resolve(false);
    }
    var AdMob = getAdMob();
    return AdMob.initialize({
      initializeForTesting: false
    })
      .then(function () {
        state.admobReady = true;
        bindAdMobListeners(AdMob);
        return prepareInterstitial().then(function () {
          return true;
        });
      })
      .catch(function (err) {
        console.warn(LOG, "AdMob.initialize failed", err);
        if (attempt < 10) {
          return new Promise(function (resolve) {
            setTimeout(function () {
              resolve(initAdMob(attempt + 1));
            }, 400);
          });
        }
        state.admobReady = false;
        return false;
      });
  }

  function init() {
    try {
      var n = nativeAds();
      if (n && typeof n.restorePurchases === "function") n.restorePurchases();
    } catch (eRest) {}
    state.purchased = readPurchased();
    state.lastInterstitialAt = readLastInterstitialAt();
    if (adsSurfaceActive()) {
      document.documentElement.classList.add("ads-chrome");
      buildMetamo();
      setMetamoVisible(true);
      /* Reserve chrome padding before AdMob fill so Guía never sits under the credit. */
      if (!adsOff()) setBannerHeight(true);
      syncNoAdsFab();
    }
    if (adsOff()) {
      if (adsSurfaceActive()) {
        buildMetamo();
        setBannerHeight(false);
        setMetamoVisible(true);
      } else {
        setBannerHeight(false);
        syncMetamo();
      }
      syncNoAdsFab();
      notifyNativeBanner(false);
      setTimeout(function () {
        notifyNativeBanner(false);
      }, 800);
      state.ready = true;
      return Promise.resolve(false);
    }
    if (!adsSurfaceActive()) {
      state.ready = true;
      return Promise.resolve(false);
    }

    return new Promise(function (resolve) {
      whenAdMobReady(function () {
        initAdMob().then(function () {
          buildMetamo();
          watchBootForMetamo();
          syncDevLauncher();
          syncNoAdsFab();
          setTimeout(function () {
            showBannerChrome().then(function () {
              bindAppLifecycle();
              startSessionInterstitialTimer();
              state.ready = true;
              resolve(true);
            });
          }, 450);
        });
      });
    });
  }

  var api = {
    enabled: true,
    PURCHASE_KEY: PURCHASE_KEY,
    APP_ID: CFG.appId,
    BANNER_ID: CFG.bannerId,
    INTERSTITIAL_ID: CFG.interstitialId,
    useProductionUnits: function () {
      USE_GOOGLE_TEST_UNITS = false;
      return true;
    },
    useTestUnits: function () {
      console.warn(LOG, "Google test ad units are disabled");
      USE_GOOGLE_TEST_UNITS = false;
      return false;
    },
    init: function () {
      return init();
    },
    onMatchStart: onMatchStart,
    onMatchEnd: onMatchEnd,
    onGameEnd: onMatchEnd,
    _onNativeInterstitialDone: function () {
      state.interstitialOpen = false;
      muteGameAudio(false);
      state.interstitialPrepared = false;
      prepareInterstitial();
    },
    showBanner: function () {
      return showBannerChrome();
    },
    hideBanner: function () {
      return hideBannerChrome();
    },
    showInterstitial: function () {
      return requestInterstitial();
    },
    forceInterstitial: function () {
      state.matchEndedPendingAd = false;
      return requestInterstitial({ bypassCooldown: true });
    },
    cooldownReady: cooldownReady,
    cooldownMs: cooldownMs,
    resetPurchase: function () {
      writePurchased(false);
      return showBannerChrome();
    },
    isPurchased: function () {
      return state.purchased;
    },
    adsOff: adsOff,
    buyNoAds: simulatePurchase,
    developerForceAds: developerForceAds,
    consumeBack: consumeBack,
    onNativePurchase: function (ok) {
      if (ok) applyPurchaseUnlocked();
    }
  };

  global.LatrunculiAds = api;
  global.PetteiaAds = api;
  global.OchoDamasAds = api;
  global.AdsManager = api;
  global.GameAds = api;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      api.init();
    });
  } else {
    api.init();
  }
})(typeof window !== "undefined" ? window : globalThis);
