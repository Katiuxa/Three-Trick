package com.metamovidas.tritrick;

import android.app.Activity;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import com.android.billingclient.api.AcknowledgePurchaseParams;
import com.android.billingclient.api.BillingClient;
import com.android.billingclient.api.BillingClientStateListener;
import com.android.billingclient.api.BillingFlowParams;
import com.android.billingclient.api.BillingResult;
import com.android.billingclient.api.PendingPurchasesParams;
import com.android.billingclient.api.ProductDetails;
import com.android.billingclient.api.Purchase;
import com.android.billingclient.api.PurchasesUpdatedListener;
import com.android.billingclient.api.QueryProductDetailsParams;
import com.android.billingclient.api.QueryPurchasesParams;
import java.util.Collections;
import java.util.List;

public final class PlayBilling implements PurchasesUpdatedListener {
    private static final String TAG = "MetamoBilling";
    private final Activity activity;
    private final String productId;
    private final Runnable onUnlocked;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private BillingClient client;
    private boolean ready;

    public PlayBilling(Activity activity, String productId, Runnable onUnlocked) {
        this.activity = activity;
        this.productId = productId;
        this.onUnlocked = onUnlocked;
    }

    public void start() {
        client = BillingClient.newBuilder(activity)
            .setListener(this)
            .enablePendingPurchases(
                PendingPurchasesParams.newBuilder().enableOneTimeProducts().build()
            )
            .build();
        client.startConnection(new BillingClientStateListener() {
            @Override
            public void onBillingSetupFinished(@NonNull BillingResult result) {
                ready = result.getResponseCode() == BillingClient.BillingResponseCode.OK;
                Log.i(TAG, "setup code=" + result.getResponseCode() + " " + result.getDebugMessage());
                if (ready) restore();
            }

            @Override
            public void onBillingServiceDisconnected() {
                ready = false;
            }
        });
    }

    public void launch() {
        if (client == null || !ready) {
            Log.w(TAG, "billing not ready");
            return;
        }
        QueryProductDetailsParams params = QueryProductDetailsParams.newBuilder()
            .setProductList(Collections.singletonList(
                QueryProductDetailsParams.Product.newBuilder()
                    .setProductId(productId)
                    .setProductType(BillingClient.ProductType.INAPP)
                    .build()
            ))
            .build();
        client.queryProductDetailsAsync(params, (result, list) -> {
            if (result.getResponseCode() != BillingClient.BillingResponseCode.OK
                || list == null || list.isEmpty()) {
                Log.w(TAG, "product missing id=" + productId
                    + " code=" + result.getResponseCode() + " " + result.getDebugMessage());
                return;
            }
            ProductDetails details = list.get(0);
            BillingFlowParams flow = BillingFlowParams.newBuilder()
                .setProductDetailsParamsList(Collections.singletonList(
                    BillingFlowParams.ProductDetailsParams.newBuilder()
                        .setProductDetails(details)
                        .build()
                ))
                .build();
            handler.post(() -> client.launchBillingFlow(activity, flow));
        });
    }

    public void restore() {
        if (client == null || !ready) return;
        client.queryPurchasesAsync(
            QueryPurchasesParams.newBuilder().setProductType(BillingClient.ProductType.INAPP).build(),
            (result, purchases) -> {
                if (purchases == null) return;
                for (Purchase p : purchases) handle(p);
            }
        );
    }

    @Override
    public void onPurchasesUpdated(@NonNull BillingResult result, @Nullable List<Purchase> purchases) {
        if (result.getResponseCode() != BillingClient.BillingResponseCode.OK || purchases == null) {
            Log.i(TAG, "purchasesUpdated code=" + result.getResponseCode());
            return;
        }
        for (Purchase p : purchases) handle(p);
    }

    private void handle(Purchase p) {
        if (p.getPurchaseState() != Purchase.PurchaseState.PURCHASED) return;
        if (!p.getProducts().contains(productId)) return;
        if (!p.isAcknowledged() && client != null) {
            client.acknowledgePurchase(
                AcknowledgePurchaseParams.newBuilder().setPurchaseToken(p.getPurchaseToken()).build(),
                r -> Log.i(TAG, "ack " + r.getResponseCode())
            );
        }
        handler.post(onUnlocked);
    }

    public void destroy() {
        if (client != null) {
            client.endConnection();
            client = null;
        }
        ready = false;
    }
}
