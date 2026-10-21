import UIKit

/// Creates React root views for the CarPlay window, dashboard and cluster.
///
/// React Native 0.82+ is bridgeless: `RCTRootView(bridge:)` no longer works, and the root views
/// come from the app's `RCTReactNativeFactory`. The app installs the factory with
/// `RNCarPlay.setRootViewFactory` (Wayline's generated CarSceneDelegate does it) before connecting.
/// (Wayline vendoring change; upstream targets the bridge.)
@objc(RNCarPlayRootView)
public class RNCarPlayRootView: NSObject {
    @objc public static var factory: ((String, [AnyHashable: Any]) -> UIView)?

    static func make(moduleName: String, initialProperties: [AnyHashable: Any]) -> UIView? {
        guard let factory = factory else {
            NSLog("[RNCarPlay] no root view factory — call RNCarPlay.setRootViewFactory before connecting")
            return nil
        }
        return factory(moduleName, initialProperties)
    }
}
