//
//  RNCarPlayDashboard.swift
//  RNCarPlay
//
//  Created by Manuel Auer on 11.10.24.
//

import CarPlay
import React

@objc(RNCarPlayDashboard)
public class RNCarPlayDashboard: NSObject {

    var dashboardController: CPDashboardController?
    var window: UIWindow?

    var bridge: RCTBridge?
    var moduleName: String = "carplay-dashboard"
    var buttonConfig: [AnyHashable: Any] = [:]

    var rootView: RCTRootView?

    @objc public var isConnected = false

    @objc public func connectModule(
        bridge: RCTBridge, moduleName: String, buttonConfig: [AnyHashable: Any]
    ) {
        self.bridge = bridge
        self.moduleName = moduleName
        self.buttonConfig = buttonConfig

        connect()
        setDashboardButtons()
    }

    @objc public func connectScene(
        dashboardController: CPDashboardController,
        window: UIWindow
    ) {
        self.dashboardController = dashboardController
        self.window = window
        self.isConnected = true

        RNCarPlayUtils.sendRNCarPlayEvent(
            name: "dashboardDidConnect", body: getConnectedWindowInformation())
    }

    private func connect() {
        if self.rootView != nil {
            // there is already a visible root view
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
                    "height": window.screen.bounds.size.height,
                    "width": window.screen.bounds.size.width,
                    "scale": window.screen.scale,
                ],
            ])

        self.rootView = rootView

        window.rootViewController = RNCarPlayViewController(
            rootView: rootView)

        let isVisible = RNCPStore.sharedManager().getVisibility(
            RNCarPlayConstants.SceneIdCarPlayDashbaord)

        RNCarPlayUtils.sendRNCarPlayEvent(
            name: RNCarPlayConstants.EventDashboardStateDidChange,
            body: ["isVisible": isVisible])
    }

    @objc func disconnect() {
        if let contentView = self.rootView?.contentView as? RCTRootContentView {
            contentView.invalidate()
        }

        self.rootView?.removeFromSuperview()
        self.rootView = nil
        self.dashboardController = nil
        self.window?.rootViewController = nil
        self.window = nil
        self.isConnected = false

        RNCarPlayUtils.sendRNCarPlayEvent(
            name: "dashboardDidDisconnect", body: nil)
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

    @objc public func updateDashboardButtons(config: [AnyHashable: Any]) {
        self.buttonConfig = config
        setDashboardButtons()
    }

    public func setDashboardButtons() {
        var buttons: [CPDashboardButton] = []

        if let shortcutButtons = self.buttonConfig["shortcutButtons"]
            as? [[String: Any]]
        {
            for button in shortcutButtons {
                guard
                    let index = button["index"] as? Int,
                    let image = button["image"] as? [String: Any],
                    let subtitleVariants = button["subtitleVariants"]
                        as? [String],
                    let titleVariants = button["titleVariants"] as? [String],
                    let launchCarplayScene = button["launchCarplayScene"]
                        as? Bool
                else {
                    print("Skipping button due to missing property")
                    continue
                }

                let shortcutButton = CPDashboardButton(
                    titleVariants: titleVariants,
                    subtitleVariants: subtitleVariants,
                    image: RCTConvert.uiImage(image)
                ) { _ in
                    RNCarPlayUtils.sendRNCarPlayEvent(
                        name: "dashboardButtonPressed", body: ["index": index])

                    if launchCarplayScene {
                        guard
                            let bundleIdentifier = Bundle.main.bundleIdentifier
                        else { return }

                        guard
                            let url = URL(
                                string: "\(bundleIdentifier)://carplay")
                        else { return }

                        guard
                            let dashboardScene = UIApplication.shared
                                .connectedScenes.first(where: {
                                    $0 is CPTemplateApplicationDashboardScene
                                })
                        else { return }

                        dashboardScene.open(
                            url, options: nil, completionHandler: nil)
                    }

                }

                buttons.append(shortcutButton)
            }
        }

        if buttons.isEmpty {
            return
        }

        self.dashboardController?.shortcutButtons = buttons
    }
}
