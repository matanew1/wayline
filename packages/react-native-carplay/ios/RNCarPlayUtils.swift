//
//  RNCarPlayUtils.swift
//  RNCarPlay
//
//  Created by Manuel Auer on 24.10.24.
//

import CarPlay
import Foundation

@objc public class RNCarPlayUtils: NSObject {

    @objc public static let RNCarPlaySendEventNotification =
        "RNCarPlaySendEventNotification"

    @objc public static func sendRNCarPlayEvent(
        name: String, body: [String: Any]?
    ) {
        let userInfo = body ?? [:]
        NotificationCenter.default.post(
            name: Notification.Name(rawValue: RNCarPlaySendEventNotification),
            object: nil,
            userInfo: ["name": name, "body": userInfo])
    }

    @objc public static func sendTemplateEvent(
        with template: CPTemplate, name: String, json: [String: Any]?
    ) {
        var body = json ?? [:]
        if let userInfo = template.userInfo as? [String: Any],
            let templateId = userInfo["templateId"]
        {
            body["templateId"] = templateId
        }
        sendRNCarPlayEvent(name: name, body: body)
    }

}
