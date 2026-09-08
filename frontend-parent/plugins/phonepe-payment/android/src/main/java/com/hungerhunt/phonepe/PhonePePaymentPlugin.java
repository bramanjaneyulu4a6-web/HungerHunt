package com.hungerhunt.phonepe;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.phonepe.intent.sdk.api.PhonePeKt;
import com.phonepe.intent.sdk.api.models.PhonePeEnvironment;
import com.phonepe.intent.sdk.api.models.SDKType;

@CapacitorPlugin(name = "PhonePePayment")
public class PhonePePaymentPlugin extends Plugin {
    private ActivityResultLauncher<Intent> checkoutLauncher;
    private PluginCall checkoutCall;

    @Override
    public void load() {
        checkoutLauncher = getActivity().registerForActivityResult(
            new ActivityResultContracts.StartActivityForResult(),
            result -> {
                PluginCall call = checkoutCall;
                checkoutCall = null;
                if (call == null) return;

                JSObject response = new JSObject();
                response.put(
                    "status",
                    result.getResultCode() == Activity.RESULT_CANCELED ? "CANCELLED" : "RETURNED"
                );
                // The activity result only means control returned to the app.
                // Payment truth is read from HungerHunt's backend afterwards.
                call.resolve(response);
            }
        );
    }

    @PluginMethod
    public void openUpiIntent(PluginCall call) {
        if (checkoutCall != null) {
            call.reject("A UPI payment is already active.");
            return;
        }

        String intentUrl = required(call, "intentUrl");
        if (intentUrl == null) return;

        try {
            Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(intentUrl));
            if (intent.resolveActivity(getContext().getPackageManager()) == null) {
                call.reject("The selected UPI app is not installed.");
                return;
            }
            checkoutCall = call;
            checkoutLauncher.launch(intent);
        } catch (Exception error) {
            checkoutCall = null;
            call.reject("Could not open the selected UPI app.", error);
        }
    }

    @PluginMethod
    public void startCheckout(PluginCall call) {
        if (checkoutCall != null) {
            call.reject("A PhonePe checkout is already active.");
            return;
        }

        String merchantId = required(call, "merchantId");
        String flowId = required(call, "flowId");
        String orderId = required(call, "orderId");
        String token = required(call, "token");
        String environmentName = required(call, "environment");
        if (merchantId == null || flowId == null || orderId == null || token == null || environmentName == null) {
            return;
        }

        PhonePeEnvironment environment;
        if ("PRODUCTION".equals(environmentName)) {
            environment = PhonePeEnvironment.RELEASE;
        } else if ("SANDBOX".equals(environmentName)) {
            environment = PhonePeEnvironment.SANDBOX;
        } else {
            call.reject("environment must be SANDBOX or PRODUCTION.");
            return;
        }

        try {
            boolean initialized = PhonePeKt.init(
                getActivity(), merchantId, flowId, environment, false, null
            );
            if (!initialized) {
                call.reject("PhonePe SDK initialization failed.");
                return;
            }
            PhonePeKt.setAdditionalInfo(SDKType.IONIC);
            if (checkoutLauncher == null) {
                call.reject("PhonePe checkout launcher is not ready.");
                return;
            }

            checkoutCall = call;
            PhonePeKt.startCheckoutPage(getActivity(), token, orderId, checkoutLauncher);
        } catch (Exception error) {
            checkoutCall = null;
            call.reject("Could not start PhonePe checkout.", error);
        }
    }

    private String required(PluginCall call, String name) {
        String value = call.getString(name);
        if (value == null || value.trim().isEmpty()) {
            call.reject(name + " is required.");
            return null;
        }
        return value;
    }
}
