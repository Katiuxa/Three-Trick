package com.metamovidas.tritrick;

import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import androidx.activity.OnBackPressedCallback;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;

/**
 * Status bar may overlay the WebView. The Android navigation bar must not cover
 * the last on-screen content: the content view is padded by the nav inset.
 *
 * AdMob banners cannot sit on top of the WebView surface. The WebView and the
 * banner live in a vertical LinearLayout so the ad has its own row underneath.
 */
public class MainActivity extends BridgeActivity {
    private static final int NAV_BAR_COLOR = Color.parseColor("#0E1A12");
    private String lastInsetJs = "";
    private FrameLayout bannerSlot;
    private AdsManager ads;
    private boolean layoutWrapped;
    private boolean jsBridgeBound;
    private PlayBilling billing;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        getWindow().setStatusBarColor(Color.TRANSPARENT);
        getWindow().setNavigationBarColor(NAV_BAR_COLOR);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            getWindow().setNavigationBarContrastEnforced(true);
        }

        hideNavigationBar();
        bindNavInsets();

        WebView webView = getBridge().getWebView();
        WebSettings settings = webView.getSettings();
        settings.setDomStorageEnabled(true);
        settings.setJavaScriptEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setSupportZoom(false);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        settings.setTextZoom(100);
        settings.setUseWideViewPort(true);
        settings.setLoadWithOverviewMode(true);
        webView.setOverScrollMode(WebView.OVER_SCROLL_NEVER);
        webView.setBackgroundColor(NAV_BAR_COLOR);
        bindJsBridge();
        billing = new PlayBilling(this, "threetrick_remove_ads", this::notifyJsPurchaseOk);
        billing.start();
        setupNativeBanner();
        webView.post(this::setupNativeBanner);

        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                if (lastInsetJs.length() > 0) {
                    getBridge().getWebView().evaluateJavascript(lastInsetJs, null);
                }
                getBridge().getWebView().evaluateJavascript(
                    "(function(){try{if(window.GameAds&&window.GameAds.consumeBack&&window.GameAds.consumeBack())return true;return window.TriTrickConsumeBack&&window.TriTrickConsumeBack()===true;}catch(e){return false;}})()",
                    value -> {
                        if (!"true".equals(value)) {
                            moveTaskToBack(true);
                        }
                    }
                );
            }
        });
    }

    @Override
    public void onResume() {
        super.onResume();
        hideNavigationBar();
        if (ads != null) ads.resume();
    }

    @Override
    public void onPause() {
        if (ads != null) ads.pause();
        super.onPause();
    }

    @Override
    public void onDestroy() {
        if (billing != null) billing.destroy();
        if (ads != null) ads.destroy();
        super.onDestroy();
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (!hasFocus) return;
        hideNavigationBar();
        View root = findViewById(android.R.id.content);
        if (root != null) ViewCompat.requestApplyInsets(root);
        if (getBridge() != null && getBridge().getWebView() != null && lastInsetJs.length() > 0) {
            getBridge().getWebView().evaluateJavascript(lastInsetJs, null);
        }
    }

    private void hideNavigationBar() {
        View decor = getWindow().getDecorView();
        WindowInsetsControllerCompat bars = WindowCompat.getInsetsController(getWindow(), decor);
        bars.setAppearanceLightStatusBars(false);
        bars.setAppearanceLightNavigationBars(false);
        bars.setSystemBarsBehavior(
            WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        );
        bars.hide(WindowInsetsCompat.Type.navigationBars());
    }

    private void bindNavInsets() {
        final View root = findViewById(android.R.id.content);
        ViewCompat.setOnApplyWindowInsetsListener(root, (v, windowInsets) -> {
            Insets nav = windowInsets.getInsets(WindowInsetsCompat.Type.navigationBars());
            Insets tap = windowInsets.getInsets(WindowInsetsCompat.Type.tappableElement());
            Insets cut = windowInsets.getInsets(WindowInsetsCompat.Type.displayCutout());
            Insets status = windowInsets.getInsets(WindowInsetsCompat.Type.statusBars());
            int bottomPx = Math.max(nav.bottom, tap.bottom);
            v.setPadding(0, 0, 0, bottomPx);
            if (v instanceof ViewGroup) {
                ViewGroup g = (ViewGroup) v;
                g.setClipToPadding(false);
                g.setClipChildren(false);
            }

            float d = getResources().getDisplayMetrics().density;
            int top = Math.round(Math.max(status.top, cut.top) / d);
            int right = Math.round(Math.max(status.right, cut.right) / d);
            int left = Math.round(Math.max(status.left, cut.left) / d);

            lastInsetJs =
                "(function(){var s=document.documentElement&&document.documentElement.style;if(!s)return;"
                + "s.setProperty('--android-inset-top','" + top + "px');"
                + "s.setProperty('--android-inset-right','" + right + "px');"
                + "s.setProperty('--android-inset-left','" + left + "px');"
                + "s.setProperty('--android-inset-bottom','0px');"
                + "s.setProperty('--inset-top','" + Math.max(top, 10) + "px');"
                + "s.setProperty('--inset-bottom','0px');"
                + "s.setProperty('--ad-safe-bottom','0px');})()";
            if (getBridge() != null && getBridge().getWebView() != null) {
                getBridge().getWebView().evaluateJavascript(lastInsetJs, null);
            }
            return windowInsets;
        });
        ViewCompat.requestApplyInsets(root);
        root.post(() -> {
            hideNavigationBar();
            ViewCompat.requestApplyInsets(root);
            setupNativeBanner();
            bindJsBridge();
        });
    }

    private void bindJsBridge() {
        if (jsBridgeBound) return;
        if (getBridge() == null || getBridge().getWebView() == null) return;
        getBridge().getWebView().addJavascriptInterface(new JsBridge(), "TriTrickNative");
        getBridge().getWebView().addJavascriptInterface(new JsBridge(), "GameAdsNative");
        jsBridgeBound = true;
    }

    private class JsBridge {
        @JavascriptInterface
        public void setPlayAds(final boolean inPlay) {
            runOnUiThread(() -> {
                startAds();
                if (inPlay && ads != null) ads.setAdsEnabled(true);
            });
        }

        @JavascriptInterface
        public void setAdsOff() {
            runOnUiThread(() -> {
                if (ads != null) ads.setAdsEnabled(false);
            });
        }

        @JavascriptInterface
        public void preloadInterstitial() {
            runOnUiThread(() -> {
                if (ads != null) ads.preloadInterstitial();
            });
        }

        @JavascriptInterface
        public void buyRemoveAds() {
            runOnUiThread(() -> {
                if (billing != null) billing.launch();
            });
        }

        @JavascriptInterface
        public void restorePurchases() {
            runOnUiThread(() -> {
                if (billing != null) billing.restore();
            });
        }

        @JavascriptInterface
        public void showInterstitial() {
            runOnUiThread(() -> {
                if (ads != null) ads.showInterstitial(MainActivity.this::notifyJsInterstitialDone);
            });
        }
    }

    private void notifyJsPurchaseOk() {
        if (getBridge() == null || getBridge().getWebView() == null) return;
        getBridge().getWebView().evaluateJavascript(
            "(function(){try{if(window.GameAds&&window.GameAds.onNativePurchase)window.GameAds.onNativePurchase(true);}catch(e){}})()",
            null
        );
    }

    private void notifyJsInterstitialDone() {
        if (getBridge() == null || getBridge().getWebView() == null) return;
        getBridge().getWebView().evaluateJavascript(
            "(function(){try{if(window.GameAds&&window.GameAds._onNativeInterstitialDone)window.GameAds._onNativeInterstitialDone();}catch(e){}})()",
            null
        );
    }

    private void setupNativeBanner() {
        if (layoutWrapped) {
            startAds();
            return;
        }
        if (getBridge() == null || getBridge().getWebView() == null) return;
        WebView webView = getBridge().getWebView();
        if (!(webView.getParent() instanceof ViewGroup)) return;
        ViewGroup host = (ViewGroup) webView.getParent();
        if (!(host.getParent() instanceof ViewGroup)) return;
        ViewGroup content = (ViewGroup) host.getParent();

        int bannerH = Math.round(50 * getResources().getDisplayMetrics().density);
        bannerSlot = new FrameLayout(this);
        bannerSlot.setBackgroundColor(NAV_BAR_COLOR);
        bannerSlot.setVisibility(View.VISIBLE);

        ViewGroup.LayoutParams hostLp = host.getLayoutParams();
        int index = content.indexOfChild(host);
        content.removeView(host);

        LinearLayout column = new LinearLayout(this);
        column.setOrientation(LinearLayout.VERTICAL);
        column.setBackgroundColor(NAV_BAR_COLOR);

        host.setLayoutParams(new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            0,
            1f
        ));
        column.addView(host);
        column.addView(bannerSlot, new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            bannerH
        ));

        ViewGroup.LayoutParams columnLp = hostLp != null
            ? hostLp
            : new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            );
        if (index >= 0) content.addView(column, index, columnLp);
        else content.addView(column, columnLp);

        layoutWrapped = true;
        startAds();
    }

    private void startAds() {
        if (bannerSlot == null) return;
        if (ads == null) {
            ads = new AdsManager(this, NAV_BAR_COLOR, bannerUnitId(), interstitialUnitId());
            ads.bindSlot(bannerSlot);
        }
        ads.start();
    }

    private String bannerUnitId() {
        try {
            return getString(R.string.admob_banner_id);
        } catch (Exception e) {
            return "";
        }
    }

    private String interstitialUnitId() {
        try {
            int id = getResources().getIdentifier("admob_interstitial_id", "string", getPackageName());
            return id != 0 ? getString(id) : "";
        } catch (Exception e) {
            return "";
        }
    }
}
