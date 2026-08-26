(function () {
  "use strict";

  function cap() {
    return window.Capacitor || null;
  }
  function isNative() {
    var C = cap();
    if (C) {
      try {
        if (typeof C.isNativePlatform === "function") return C.isNativePlatform();
      } catch (e) {}
      return true;
    }
    return /TriTrickAndroid/i.test(navigator.userAgent || "");
  }
  if (!isNative()) return;

  document.documentElement.classList.add("is-native");

  function plugin(name) {
    var C = cap();
    if (!C || !C.Plugins) return null;
    return C.Plugins[name] || null;
  }

  async function bootNative() {
    var StatusBar = plugin("StatusBar");
    var SplashScreen = plugin("SplashScreen");
    var Keyboard = plugin("Keyboard");
    var App = plugin("App");
    var Haptics = plugin("Haptics");

    try {
      if (StatusBar) {
        await StatusBar.setOverlaysWebView({ overlay: true });
        await StatusBar.setStyle({ style: "DARK" });
        if (StatusBar.setBackgroundColor) await StatusBar.setBackgroundColor({ color: "#00000000" });
      }
    } catch (e) {}
    try { if (SplashScreen) await SplashScreen.hide({ fadeOutDuration: 220 }); } catch (e) {}
    try {
      if (typeof window.TriTrickStartMusic === "function") window.TriTrickStartMusic();
    } catch (e) {}
    try {
      if (Keyboard && Keyboard.setAccessoryBarVisible) await Keyboard.setAccessoryBarVisible({ isVisible: false });
    } catch (e) {}

    if (App && App.addListener) {
      App.addListener("backButton", function () {
        if (typeof window.TriTrickConsumeBack === "function" && window.TriTrickConsumeBack()) return;
        if (App.exitApp) App.exitApp();
      });
      App.addListener("appStateChange", function (state) {
        if (!state) return;
        if (state.isActive) {
          if (typeof window.TriTrickStartMusic === "function") window.TriTrickStartMusic();
        } else if (typeof window.TriTrickStopMusic === "function") {
          window.TriTrickStopMusic();
        }
      });
      App.addListener("pause", function () {
        if (typeof window.TriTrickStopMusic === "function") window.TriTrickStopMusic();
      });
      App.addListener("resume", function () {
        if (typeof window.TriTrickStartMusic === "function") window.TriTrickStartMusic();
      });
    }
    if (Haptics && Haptics.impact && typeof navigator.vibrate !== "function") {
      navigator.vibrate = function () {
        try { Haptics.impact({ style: "Light" }); } catch (e) {}
        return true;
      };
    }
  }

  document.addEventListener("gesturestart", function (e) { e.preventDefault(); });
  if (cap() && cap().whenPluginReady) cap().whenPluginReady().then(bootNative).catch(bootNative);
  else window.addEventListener("DOMContentLoaded", function () { setTimeout(bootNative, 40); });
})();
