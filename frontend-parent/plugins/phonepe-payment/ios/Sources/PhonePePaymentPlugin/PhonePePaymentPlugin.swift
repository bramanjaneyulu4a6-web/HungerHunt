import Capacitor
import Foundation
import PhonePePayment
import UIKit

@objc(PhonePePaymentPlugin)
public final class PhonePePaymentPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "PhonePePaymentPlugin"
    public let jsName = "PhonePePayment"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "startCheckout", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "openUpiIntent", returnType: CAPPluginReturnPromise)
    ]

    private var activePayment: PPPayment?
    private var checkoutActive = false

    public override func load() {
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(handleOpenURL(_:)),
            name: .capacitorOpenURL,
            object: nil
        )
    }

    deinit {
        NotificationCenter.default.removeObserver(self)
    }

    @objc public func startCheckout(_ call: CAPPluginCall) {
        guard !checkoutActive else {
            call.reject("A PhonePe checkout is already active.")
            return
        }
        guard let merchantId = required("merchantId", call),
              let appId = required("appId", call),
              let flowId = required("flowId", call),
              let orderId = required("orderId", call),
              let token = required("token", call),
              let environmentName = required("environment", call),
              let appSchema = required("appSchema", call) else {
            return
        }

        let environment: Environment
        switch environmentName {
        case "PRODUCTION": environment = .production
        case "SANDBOX": environment = .sandbox
        default:
            call.reject("environment must be SANDBOX or PRODUCTION.")
            return
        }

        guard let viewController = bridge?.viewController else {
            call.reject("PhonePe checkout has no presenting view controller.")
            return
        }

        let payment = PPPayment(
            environment: environment,
            flowId: flowId,
            merchantId: merchantId,
            enableLogging: false,
            appId: appId
        )
        payment.setAdditionalInfo(sdkType: .ionic)
        activePayment = payment
        checkoutActive = true

        DispatchQueue.main.async { [weak self] in
            payment.startCheckoutFlow(
                merchantId: merchantId,
                orderId: orderId,
                token: token,
                appSchema: appSchema,
                on: viewController
            ) { _, state in
                guard let self else { return }
                self.checkoutActive = false
                self.activePayment = nil

                // Like Android's activity result, this callback only says the
                // SDK returned. HungerHunt polls its backend for payment truth.
                switch state {
                case .success:
                    call.resolve(["status": "RETURNED"])
                case .failure(let error):
                    call.resolve(["status": "FAILURE", "message": error.localizedDescription])
                case .interrupted(let error):
                    call.resolve(["status": "INTERRUPTED", "message": error.localizedDescription])
                @unknown default:
                    call.resolve(["status": "INTERRUPTED"])
                }
            }
        }
    }

    @objc public func openUpiIntent(_ call: CAPPluginCall) {
        guard let value = required("intentUrl", call), let url = URL(string: value) else {
            if call.getString("intentUrl") != nil { call.reject("The UPI intent URL is invalid.") }
            return
        }

        DispatchQueue.main.async {
            UIApplication.shared.open(url, options: [:]) { opened in
                if opened {
                    call.resolve(["status": "RETURNED"])
                } else {
                    call.reject("The selected UPI app is not installed.")
                }
            }
        }
    }

    @objc private func handleOpenURL(_ notification: Notification) {
        guard let userInfo = notification.object as? [String: Any],
              let url = userInfo["url"] as? URL else {
            return
        }
        _ = PPPayment.checkDeeplink(url)
    }

    private func required(_ name: String, _ call: CAPPluginCall) -> String? {
        guard let value = call.getString(name), !value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            call.reject("\(name) is required.")
            return nil
        }
        return value
    }
}
