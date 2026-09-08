import UIKit
import Capacitor
import UserNotifications
import FirebaseCore
import FirebaseMessaging

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate, MessagingDelegate {
    var window: UIWindow?
    private var firebaseReady = false

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        // Missing local Firebase configuration must not crash catalogue browsing.
        if let path = Bundle.main.path(forResource: "GoogleService-Info", ofType: "plist", inDirectory: "Firebase"),
           let options = FirebaseOptions(contentsOfFile: path) {
            FirebaseApp.configure(options: options)
            firebaseReady = true
            Messaging.messaging().delegate = self
        }
        let view = UNNotificationAction(identifier: "SAMOU_VIEW_ORDER", title: "عرض الطلب", options: [.foreground])
        let dismiss = UNNotificationAction(identifier: "SAMOU_DISMISS", title: "إغلاق التنبيه", options: [])
        let category = UNNotificationCategory(identifier: "SAMOU_NEW_ORDER", actions: [view, dismiss], intentIdentifiers: [], options: [.customDismissAction])
        UNUserNotificationCenter.current().setNotificationCategories([category])
        // Capacitor owns the notification-center delegate and queues tap events for JS.
        return true
    }

    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        guard firebaseReady else {
            registrationFailed(NSError(domain: "SamouPush", code: 1, userInfo: [NSLocalizedDescriptionKey: "Firebase iOS configuration is missing"]))
            return
        }
        // Backend uses Firebase Messaging: never register the raw APNs token as FCM.
        Messaging.messaging().apnsToken = deviceToken
        Messaging.messaging().token { token, error in
            if let error = error { self.registrationFailed(error); return }
            if let token = token { self.publishToken(token) }
        }
    }
    func messaging(_ messaging: Messaging, didReceiveRegistrationToken fcmToken: String?) {
        guard Messaging.messaging().apnsToken != nil, let token = fcmToken else { return }
        publishToken(token)
    }
    private func publishToken(_ token: String) {
        DispatchQueue.main.async {
            NotificationCenter.default.post(name: .capacitorDidRegisterForRemoteNotifications, object: token)
        }
    }
    private func registrationFailed(_ error: Error) {
        DispatchQueue.main.async {
            NotificationCenter.default.post(name: .capacitorDidFailToRegisterForRemoteNotifications, object: error)
        }
    }
    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) { registrationFailed(error) }
    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        ApplicationDelegateProxy.shared.application(app, open: url, options: options)
    }
    func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        ApplicationDelegateProxy.shared.application(application, continue: userActivity, restorationHandler: restorationHandler)
    }
}
