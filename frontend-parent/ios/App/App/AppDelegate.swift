import UIKit
import Capacitor

/* The Firebase iOS SDK is added to the Xcode project rather than to
   CapApp-SPM/Package.swift, which `npx cap sync` rewrites. Guarding the import
   means this file compiles either way: before the package is added it builds
   and reports a clear registration error, instead of failing to compile. */
#if canImport(FirebaseCore)
import FirebaseCore
#endif

#if canImport(FirebaseMessaging)
import FirebaseMessaging
#endif

enum PushSetupError: LocalizedError {
    case firebaseSDKMissing
    case firebaseNotConfigured
    case noTokenReturned

    var errorDescription: String? {
        switch self {
        case .firebaseSDKMissing:
            return "iOS push needs the Firebase SDK. Add firebase-ios-sdk to the Xcode project (FirebaseMessaging) — see frontend-parent/README.md."
        case .firebaseNotConfigured:
            return "GoogleService-Info.plist is missing from the app target, so Firebase could not be configured."
        case .noTokenReturned:
            return "Firebase returned no registration token."
        }
    }
}

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        #if canImport(FirebaseCore)
        // configure() aborts the process when the plist is absent, so an app
        // that is mid-setup starts and says why rather than dying at launch.
        if FirebaseApp.app() == nil,
           Bundle.main.url(forResource: "GoogleService-Info", withExtension: "plist") != nil {
            FirebaseApp.configure()
        }
        #endif

        return true
    }

    func applicationWillResignActive(_ application: UIApplication) {
        // Sent when the application is about to move from active to inactive state. This can occur for certain types of temporary interruptions (such as an incoming phone call or SMS message) or when the user quits the application and it begins the transition to the background state.
        // Use this method to pause ongoing tasks, disable timers, and invalidate graphics rendering callbacks. Games should use this method to pause the game.
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
        // Use this method to release shared resources, save user data, invalidate timers, and store enough application state information to restore your application to its current state in case it is terminated later.
        // If your application supports background execution, this method is called instead of applicationWillTerminate: when the user quits.
    }

    func applicationWillEnterForeground(_ application: UIApplication) {
        // Called as part of the transition from the background to the active state; here you can undo many of the changes made on entering the background.
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
        // Restart any tasks that were paused (or not yet started) while the application was inactive. If the application was previously in the background, optionally refresh the user interface.
    }

    func applicationWillTerminate(_ application: UIApplication) {
        // Called when the application is about to terminate. Save data if appropriate. See also applicationDidEnterBackground:.
    }

    /* APNs hands the device token to the app delegate and nowhere else, so
       without this the app asks for permission, is granted it, and then never
       receives a token.

       What gets published is not that token. APNs issues a device token; the
       backend sends through Firebase, which wants the FCM registration token it
       exchanges that device token for. Publishing the APNs token would have the
       backend store 64 hex characters that FCM rejects as an unknown
       registration — and then drop as dead on the first send. The plugin
       forwards a String verbatim, which is how the FCM token gets through. */
    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        #if canImport(FirebaseMessaging)
        guard FirebaseApp.app() != nil else {
            failRegistration(PushSetupError.firebaseNotConfigured)
            return
        }

        Messaging.messaging().apnsToken = deviceToken

        Messaging.messaging().token { token, error in
            guard let token else {
                self.failRegistration(error ?? PushSetupError.noTokenReturned)
                return
            }

            NotificationCenter.default.post(
                name: .capacitorDidRegisterForRemoteNotifications,
                object: token
            )
        }
        #else
        failRegistration(PushSetupError.firebaseSDKMissing)
        #endif
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        failRegistration(error)
    }

    private func failRegistration(_ error: Error) {
        NotificationCenter.default.post(
            name: .capacitorDidFailToRegisterForRemoteNotifications,
            object: error
        )
    }

    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        // Called when the app was launched with a url. Feel free to add additional processing here,
        // but if you want the App API to support tracking app url opens, make sure to keep this call
        return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
    }

    func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        // Called when the app was launched with an activity, including Universal Links.
        // Feel free to add additional processing here, but if you want the App API to support
        // tracking app url opens, make sure to keep this call
        return ApplicationDelegateProxy.shared.application(application, continue: userActivity, restorationHandler: restorationHandler)
    }

}
