package com.metamovidas.tritrick;

import android.app.Activity;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.FrameLayout;
import androidx.annotation.NonNull;
import com.google.android.gms.ads.AdError;
import com.google.android.gms.ads.AdListener;
import com.google.android.gms.ads.AdRequest;
import com.google.android.gms.ads.AdSize;
import com.google.android.gms.ads.AdView;
import com.google.android.gms.ads.FullScreenContentCallback;
import com.google.android.gms.ads.LoadAdError;
import com.google.android.gms.ads.MobileAds;
import com.google.android.gms.ads.interstitial.InterstitialAd;
import com.google.android.gms.ads.interstitial.InterstitialAdLoadCallback;

/**
 * Shared AdMob controller for Metamovidas Capacitor games.
 * Banner lives in a dedicated row below the WebView (never over it).
 * Adaptive width, 4s retry, interstitial preload, Logcat diagnostics.
 */
public final class AdsManager {
    public static final String TAG = "MetamoAds";
    private static final long RETRY_MS = 4000L;
    private static final String TEST_BANNER = "ca-app-pub-3940256099942544/6300978111";
    private static final String TEST_INTERSTITIAL = "ca-app-pub-3940256099942544/1033173712";

    private final Activity activity;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final int slotColor;
    private final String prodBannerId;
    private final String prodInterstitialId;

    private FrameLayout slot;
    private AdView bannerView;
    private InterstitialAd interstitial;
    private boolean sdkReady;
    private boolean initializing;
    private boolean adsEnabled = true;
    private boolean usingTestUnits;
    private boolean loadingInterstitial;
    private Runnable pendingShow;

    private final Runnable retryBanner = this::reloadBanner;
    private final Runnable retryInterstitial = this::preloadInterstitial;
    private final Runnable showTimeout = () -> {
        Runnable cb = pendingShow;
        pendingShow = null;
        if (cb == null) return;
        InterstitialAd ad = interstitial;
        if (ad != null) present(ad, cb);
        else {
            preloadInterstitial();
            cb.run();
        }
    };

    public AdsManager(Activity activity, int slotColor, String bannerId, String interstitialId) {
        this.activity = activity;
        this.slotColor = slotColor;
        this.prodBannerId = bannerId == null ? "" : bannerId.trim();
        this.prodInterstitialId = interstitialId == null ? "" : interstitialId.trim();
    }

    public void bindSlot(FrameLayout bannerSlot) {
        slot = bannerSlot;
        if (slot == null) return;
        slot.setBackgroundColor(slotColor);
        slot.setVisibility(View.VISIBLE);
        if (sdkReady && adsEnabled) loadBanner();
    }

    public void start() {
        if (!adsEnabled) return;
        initSdk();
    }

    public void setAdsEnabled(boolean enabled) {
        adsEnabled = enabled;
        if (!enabled) {
            hideBanner();
            interstitial = null;
            return;
        }
        if (slot != null) slot.setVisibility(View.VISIBLE);
        if (sdkReady) {
            loadBanner();
            preloadInterstitial();
        } else {
            initSdk();
        }
    }

    public void pause() {
        if (bannerView != null) bannerView.pause();
    }

    public void resume() {
        if (bannerView != null) bannerView.resume();
        if (adsEnabled && sdkReady && bannerView == null) loadBanner();
    }

    public void destroy() {
        handler.removeCallbacks(retryBanner);
        handler.removeCallbacks(retryInterstitial);
        handler.removeCallbacks(showTimeout);
        pendingShow = null;
        if (bannerView != null) {
            bannerView.destroy();
            bannerView = null;
        }
        interstitial = null;
        slot = null;
    }

    private void initSdk() {
        if (!adsEnabled || !bannerIdReady()) return;
        if (sdkReady) {
            loadBanner();
            preloadInterstitial();
            return;
        }
        if (initializing) return;
        initializing = true;
        new Thread(() -> MobileAds.initialize(activity, unused -> handler.post(() -> {
            sdkReady = true;
            initializing = false;
            Log.i(TAG, "MobileAds ready package=" + activity.getPackageName());
            loadBanner();
            preloadInterstitial();
        })), "metamo-ads-init").start();
    }

    private boolean bannerIdReady() {
        String id = bannerUnit();
        return id.contains("/") && id.startsWith("ca-app-pub-") && !id.contains("PEGA");
    }

    private String bannerUnit() {
        return usingTestUnits ? TEST_BANNER : prodBannerId;
    }

    private String interstitialUnit() {
        return usingTestUnits ? TEST_INTERSTITIAL : prodInterstitialId;
    }

    private boolean interstitialReady() {
        String id = interstitialUnit();
        return id.contains("/") && id.startsWith("ca-app-pub-") && !id.contains("PEGA");
    }

    private void loadBanner() {
        FrameLayout host = slot;
        if (host == null || !adsEnabled || !sdkReady || !bannerIdReady()) return;
        int w = host.getWidth();
        if (w <= 0 && host.getParent() instanceof View) {
            w = ((View) host.getParent()).getWidth();
        }
        if (w <= 0) {
            host.post(this::loadBanner);
            return;
        }
        attachBanner();
    }

    private void attachBanner() {
        FrameLayout host = slot;
        if (host == null || !adsEnabled || !sdkReady) return;
        if (bannerView != null) {
            host.removeView(bannerView);
            bannerView.destroy();
            bannerView = null;
        }

        float density = activity.getResources().getDisplayMetrics().density;
        int widthPx = host.getWidth();
        if (widthPx <= 0 && host.getParent() instanceof View) {
            widthPx = ((View) host.getParent()).getWidth();
        }
        int widthDp = Math.round(widthPx / density);
        if (widthDp < 320) widthDp = 320;
        final AdSize size = AdSize.BANNER;
        int bannerH = Math.max(size.getHeightInPixels(activity), Math.round(50 * density));
        ViewGroup.LayoutParams lp = host.getLayoutParams();
        if (lp != null) {
            lp.height = bannerH;
            host.setLayoutParams(lp);
        }
        host.setBackgroundColor(slotColor);
        host.setVisibility(View.VISIBLE);

        AdView view = new AdView(activity);
        view.setAdUnitId(bannerUnit());
        view.setAdSize(size);
        view.setBackgroundColor(slotColor);
        view.setVisibility(View.VISIBLE);
        host.addView(
            view,
            new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT,
                Gravity.CENTER
            )
        );
        bannerView = view;
        view.setAdListener(new AdListener() {
            @Override
            public void onAdLoaded() {
                Log.i(TAG, "banner loaded unit=" + bannerUnit()
                    + " size=" + size.getWidth() + "x" + size.getHeight());
                if (bannerView != null) bannerView.setVisibility(View.VISIBLE);
                if (slot != null) slot.setVisibility(View.VISIBLE);
            }

            @Override
            public void onAdFailedToLoad(@NonNull LoadAdError error) {
                Log.w(TAG, "banner failed code=" + error.getCode()
                    + " (" + failReason(error.getCode()) + ") "
                    + error.getMessage()
                    + " domain=" + error.getDomain()
                    + " unit=" + bannerUnit());
                if (!usingTestUnits && !installedFromPlay()) {
                    usingTestUnits = true;
                    Log.i(TAG, "sideload: switching to Google test units");
                    attachBanner();
                    preloadInterstitial();
                    return;
                }
                scheduleBannerRetry();
            }
        });
        view.loadAd(new AdRequest.Builder().build());
    }

    private void reloadBanner() {
        if (!adsEnabled) return;
        if (bannerView != null) {
            bannerView.setVisibility(View.VISIBLE);
            bannerView.loadAd(new AdRequest.Builder().build());
            return;
        }
        loadBanner();
    }

    private void scheduleBannerRetry() {
        FrameLayout host = slot;
        if (host == null) {
            handler.removeCallbacks(retryBanner);
            handler.postDelayed(retryBanner, RETRY_MS);
            return;
        }
        host.removeCallbacks(retryBanner);
        host.postDelayed(retryBanner, RETRY_MS);
    }

    private void hideBanner() {
        if (bannerView != null) {
            bannerView.destroy();
            bannerView = null;
        }
        if (slot != null) {
            slot.removeAllViews();
            ViewGroup.LayoutParams lp = slot.getLayoutParams();
            if (lp != null) {
                lp.height = 0;
                slot.setLayoutParams(lp);
            }
            slot.setVisibility(View.GONE);
        }
    }

    public void preloadInterstitial() {
        if (!adsEnabled || !sdkReady || !interstitialReady()) return;
        if (loadingInterstitial || interstitial != null) return;
        loadingInterstitial = true;
        InterstitialAd.load(
            activity,
            interstitialUnit(),
            new AdRequest.Builder().build(),
            new InterstitialAdLoadCallback() {
                @Override
                public void onAdLoaded(@NonNull InterstitialAd ad) {
                    loadingInterstitial = false;
                    interstitial = ad;
                    Log.i(TAG, "interstitial loaded unit=" + interstitialUnit());
                    Runnable cb = pendingShow;
                    if (cb != null) {
                        pendingShow = null;
                        handler.removeCallbacks(showTimeout);
                        present(ad, cb);
                    }
                }

                @Override
                public void onAdFailedToLoad(@NonNull LoadAdError error) {
                    loadingInterstitial = false;
                    interstitial = null;
                    Log.w(TAG, "interstitial failed code=" + error.getCode()
                        + " (" + failReason(error.getCode()) + ") "
                        + error.getMessage()
                        + " unit=" + interstitialUnit());
                    if (!usingTestUnits && !installedFromPlay() && interstitialReady()) {
                        usingTestUnits = true;
                        handler.post(() -> preloadInterstitial());
                        return;
                    }
                    handler.removeCallbacks(retryInterstitial);
                    handler.postDelayed(retryInterstitial, RETRY_MS);
                }
            }
        );
    }

    public void showInterstitial(Runnable onDone) {
        Runnable done = onDone != null ? onDone : () -> { };
        if (!adsEnabled) {
            done.run();
            return;
        }
        handler.removeCallbacks(showTimeout);
        InterstitialAd ad = interstitial;
        if (ad != null) {
            present(ad, done);
            return;
        }
        pendingShow = done;
        preloadInterstitial();
        handler.postDelayed(showTimeout, 2200);
    }

    private void present(InterstitialAd ad, Runnable onDone) {
        interstitial = null;
        ad.setFullScreenContentCallback(new FullScreenContentCallback() {
            @Override
            public void onAdDismissedFullScreenContent() {
                preloadInterstitial();
                onDone.run();
            }

            @Override
            public void onAdFailedToShowFullScreenContent(@NonNull AdError error) {
                Log.w(TAG, "interstitial show failed code=" + error.getCode()
                    + " " + error.getMessage());
                preloadInterstitial();
                onDone.run();
            }
        });
        ad.show(activity);
    }

    static String failReason(int code) {
        switch (code) {
            case 0: return "INTERNAL_ERROR";
            case 1: return "INVALID_REQUEST";
            case 2: return "NETWORK_ERROR";
            case 3: return "NO_FILL";
            default: return "UNKNOWN";
        }
    }

    private boolean installedFromPlay() {
        try {
            String installer;
            if (Build.VERSION.SDK_INT >= 30) {
                installer = activity.getPackageManager()
                    .getInstallSourceInfo(activity.getPackageName())
                    .getInstallingPackageName();
            } else {
                installer = activity.getPackageManager()
                    .getInstallerPackageName(activity.getPackageName());
            }
            return "com.android.vending".equals(installer);
        } catch (Exception e) {
            return false;
        }
    }
}
