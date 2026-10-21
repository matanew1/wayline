import CarPlay
import React

@objc(RNCarPlayApp)
public class RNCarPlayApp: NSObject, CPInterfaceControllerDelegate {
    @objc public var interfaceController: CPInterfaceController?
    var window: UIWindow?

    var bridge: RCTBridge?
    var moduleName: String = "carplay-app"

    var rootView: RCTRootView?

    @objc public var isConnected = false

    @objc public func connectModule(
        bridge: RCTBridge, moduleName: String
    ) {
        self.bridge = bridge
        self.moduleName = moduleName

        connect()
    }

    @objc public func connectScene(
        interfaceController: CPInterfaceController,
        window: UIWindow
    ) {
        if let name = Bundle.main.object(
            forInfoDictionaryKey: "RNCPSplashScreenStoryboard") as? String,
            Bundle.main.path(forResource: name, ofType: "storyboardc") != nil
        {
            let storyboard = UIStoryboard(name: name, bundle: nil)
            if let splashViewController =
                storyboard.instantiateInitialViewController()
            {
                window.rootViewController = splashViewController
                window.makeKeyAndVisible()
            }
        }

        self.interfaceController = interfaceController
        self.window = window

        self.interfaceController?.delegate = self
        self.isConnected = true

        RNCarPlayUtils.sendRNCarPlayEvent(
            name: "didConnect", body: getConnectedWindowInformation())
    }

    internal func connect() {
        if self.rootView != nil {
            return
        }

        guard let window = self.window else {
            // connectScene was not called yet
            return
        }

        guard let bridge = self.bridge else {
            // connectModule was not called yet
            return
        }

        let rootView = RCTRootView(
            bridge: bridge, moduleName: self.moduleName,
            initialProperties: [
                "id": self.moduleName,
                "colorScheme": window.screen.traitCollection
                    .userInterfaceStyle == .dark ? "dark" : "light",
                "window": [
                    "height": window.bounds.size.height,
                    "width": window.bounds.size.width,
                    "scale": window.screen.scale,
                ],
            ])

        self.rootView = rootView

        window.rootViewController = RNCarPlayViewController(
            rootView: rootView)

        let isVisible = RNCPStore.sharedManager().getVisibility(
            RNCarPlayConstants.SceneIdCarPlayApp)

        RNCarPlayUtils.sendRNCarPlayEvent(
            name: RNCarPlayConstants.EventStateDidChange,
            body: ["isVisible": isVisible])
    }

    @objc public func disconnect() {
        if let contentView = self.rootView?.contentView as? RCTRootContentView {
            contentView.invalidate()
        }

        self.rootView?.removeFromSuperview()

        self.rootView = nil
        self.interfaceController = nil
        self.window?.rootViewController = nil
        self.window = nil
        self.isConnected = false

        RNCarPlayUtils.sendRNCarPlayEvent(name: "didDisconnect", body: nil)
    }

    @objc public func getConnectedWindowInformation() -> [String: Any] {
        if let window = self.window {
            return [
                "height": window.bounds.size.height,
                "width": window.bounds.size.width,
                "scale": window.screen.scale,
            ]
        }
        return [:]
    }

    public func templateDidAppear(_ aTemplate: CPTemplate, animated: Bool) {
        RNCarPlayUtils.sendTemplateEvent(
            with: aTemplate, name: "didAppear", json: ["animated": animated])
    }

    public func templateDidDisappear(_ aTemplate: CPTemplate, animated: Bool) {
        RNCarPlayUtils.sendTemplateEvent(
            with: aTemplate, name: "didDisappear", json: ["animated": animated])
    }

    public func templateWillAppear(_ aTemplate: CPTemplate, animated: Bool) {
        RNCarPlayUtils.sendTemplateEvent(
            with: aTemplate, name: "willAppear", json: ["animated": animated])
    }

    public func templateWillDisappear(_ aTemplate: CPTemplate, animated: Bool) {
        RNCarPlayUtils.sendTemplateEvent(
            with: aTemplate, name: "willDisappear", json: ["animated": animated]
        )
    }
}
