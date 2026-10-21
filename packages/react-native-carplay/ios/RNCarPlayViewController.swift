//
//  RNCarPlayViewController.swift
//  RNCarPlay
//
//  Created by Susan Thapa on 27/02/2024.
//  Updated by Manuel Auer on 24.10.24.
//

import React

@objc(RNCarPlayViewController)
public class RNCarPlayViewController: UIViewController {
    let rootView: RCTRootView
    
    @objc public init(rootView: RCTRootView) {
        self.rootView = rootView
        super.init(nibName: nil, bundle: nil)
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    public override func viewDidLoad() {
        super.viewDidLoad()

        self.view.translatesAutoresizingMaskIntoConstraints = false
        self.rootView.frame = self.view.bounds
        self.view = rootView
    }

    public override func viewWillLayoutSubviews() {
        super.viewWillLayoutSubviews()
        self.rootView.frame = self.view.bounds
    }

    public override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()

        RNCarPlayUtils.sendRNCarPlayEvent(
            name: "safeAreaInsetsDidChange",
            body: [
                "bottom": self.view.safeAreaInsets.bottom,
                "left": self.view.safeAreaInsets.left,
                "right": self.view.safeAreaInsets.right,
                "top": self.view.safeAreaInsets.top,
                "id": self.rootView.moduleName,
            ])
    }

    public override func traitCollectionDidChange(
        _ previousTraitCollection: UITraitCollection?
    ) {
        super.traitCollectionDidChange(previousTraitCollection)
        if traitCollection.hasDifferentColorAppearance(
            comparedTo: previousTraitCollection)
        {
            RNCarPlayUtils.sendRNCarPlayEvent(
                name: "appearanceDidChange",
                body: [
                    "colorScheme": traitCollection.userInterfaceStyle == .dark
                        ? "dark" : "light",
                    "id": self.rootView.moduleName,
                ])
        }
    }
    
    deinit {
        self.view = nil
    }
}
