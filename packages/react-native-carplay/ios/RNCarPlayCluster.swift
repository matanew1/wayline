//
//  RNCarPlayCluster.swift
//  RNCarPlay
//
//  Created by Manuel Auer on 08.11.24.
//

import CarPlay
import React

@available(iOS 15.4, *)
@objc(RNCarPlayCluster)
public class RNCarPlayCluster: NSObject, CPInstrumentClusterControllerDelegate {
    var instrumentClusterController: CPInstrumentClusterController?
    var window: UIWindow?
    @objc public var contentStyle: UIUserInterfaceStyle = .unspecified

    var bridge: RCTBridge?
    var id: String?

    var rootView: RCTRootView?

    @objc public var isConnected = false

    @objc public func connect(
        instrumentClusterController: CPInstrumentClusterController,
        contentStyle: UIUserInterfaceStyle,
        clusterId: String
    ) {
        instrumentClusterController.delegate = self
        self.instrumentClusterController = instrumentClusterController
        self.id = clusterId
        self.isConnected = true
        self.contentStyle = contentStyle

        RNCarPlayUtils.sendRNCarPlayEvent(
            name: "clusterControllerDidConnect", body: ["id": self.id ?? ""])
    }

    @objc public func connect(
        bridge: RCTBridge,
        config: [String: Any]
    ) {
        self.bridge = bridge

        if let instrumentClusterController = self.instrumentClusterController {
            if let descriptions = config["inactiveDescriptionVariants"]
                as? [[String: Any]]
            {
                for description in descriptions {
                    guard
                        let text = description["text"] as? String
                    else {
                        print(
                            "Skipping inactiveDescriptionVariant due to missing property"
                        )
                        continue
                    }

                    let string = NSMutableAttributedString(string: text)

                    if let image = description["image"] as? [String: Any],
                        let icon = RCTConvert.uiImage(image)
                    {
                        let attributedString = NSAttributedString(
                            attachment: NSTextAttachment(image: icon))

                        if let imagePosition = description["imagePosition"]
                            as? Int
                        {
                            string.insert(attributedString, at: imagePosition)
                        } else {
                            string.append(attributedString)
                        }
                    }

                    instrumentClusterController
                        .attributedInactiveDescriptionVariants.append(string)
                }
            }
        }

        guard let window = self.window, let id = self.id else {
            return
        }

        if self.rootView != nil {
            return
        }

        let rootView = RCTRootView(
            bridge: bridge, moduleName: id,
            initialProperties: [
                "id": self.id ?? "",
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

        RNCarPlayUtils.sendRNCarPlayEvent(
            name: "clusterWindowDidConnect",
            body: getConnectedWindowInformation())

        let isVisible = RNCPStore.sharedManager().getVisibility(id)

        RNCarPlayUtils.sendRNCarPlayEvent(
            name: RNCarPlayConstants.EventClusterStateDidChange,
            body: ["isVisible": isVisible])
    }

    @objc public func disconnect() {
        if let contentView = self.rootView?.contentView as? RCTRootContentView {
            contentView.invalidate()
        }
        self.rootView?.removeFromSuperview()

        self.rootView = nil
        self.window?.rootViewController = nil
        self.window = nil
        self.isConnected = false

        RNCarPlayUtils.sendRNCarPlayEvent(
            name: "clusterDidDisconnect", body: ["id": self.id ?? ""])
    }

    @objc public func getConnectedWindowInformation() -> [String: Any] {
        if let window = self.window {
            return [
                "height": window.screen.bounds.size.height,
                "width": window.screen.bounds.size.width,
                "scale": window.screen.scale,
                "id": self.id ?? "",
                "contentStyle": self.contentStyle.rawValue,
            ]
        }
        return ["id": self.id ?? ""]
    }

    // MARK: CPInstrumentClusterControllerDelegate
    public func instrumentClusterControllerDidConnect(
        _ instrumentClusterWindow: UIWindow
    ) {
        self.window = instrumentClusterWindow
    }

    public func instrumentClusterControllerDidDisconnectWindow(
        _ instrumentClusterWindow: UIWindow
    ) {
        self.window = nil
    }

    public func instrumentClusterControllerDidZoom(
        in instrumentClusterController: CPInstrumentClusterController
    ) {
        RNCarPlayUtils.sendRNCarPlayEvent(
            name: "clusterDidZoomIn", body: ["id": self.id ?? ""])
    }

    public func instrumentClusterControllerDidZoomOut(
        _ instrumentClusterController: CPInstrumentClusterController
    ) {
        RNCarPlayUtils.sendRNCarPlayEvent(
            name: "clusterDidZoomOut", body: ["id": self.id ?? ""])
    }

    public func instrumentClusterController(
        _ instrumentClusterController: CPInstrumentClusterController,
        didChangeCompassSetting compassSetting: CPInstrumentClusterSetting
    ) {
        RNCarPlayUtils.sendRNCarPlayEvent(
            name: "clusterDidChangeCompassSetting",
            body: [
                "id": self.id ?? "", "compassSetting": compassSetting.rawValue,
            ])
    }

    public func instrumentClusterController(
        _ instrumentClusterController: CPInstrumentClusterController,
        didChangeSpeedLimitSetting speedLimitSetting: CPInstrumentClusterSetting
    ) {
        RNCarPlayUtils.sendRNCarPlayEvent(
            name: "clusterDidChangeSpeedLimitSetting",
            body: [
                "id": self.id ?? "",
                "speedLimitSetting": speedLimitSetting.rawValue,
            ])
    }
}
