import { type NativeEventEmitter } from 'react-native';
import { OnConnectCallback, OnDisconnectCallback } from '../CarPlay';
import type { DashboardConfig, DashboardShortcutButtonConfig } from '../interfaces/Dashboard';
import type { InternalCarPlay } from '../interfaces/InternalCarPlay';
import { WindowInformation } from '../interfaces/WindowInformation';
export declare class Dashboard {
    private readonly bridge;
    private readonly emitter;
    connected: boolean;
    window: WindowInformation | null;
    private onConnectCallbacks;
    private onDisconnectCallbacks;
    private stateSubscription;
    private buttonSubscription;
    constructor(bridge: InternalCarPlay, emitter: NativeEventEmitter);
    create(config: DashboardConfig): void;
    checkForConnection(): void;
    updateShortcutButtons(shortcutButtons: Array<DashboardShortcutButtonConfig>): void;
    /**
     * Fired when CarPlay is connected to the dashboard scene.
     */
    registerOnConnect: (callback: OnConnectCallback) => {
        remove: () => boolean;
    };
    /**
     * Fired when CarPlay is disconnected from the dashboard scene.
     */
    registerOnDisconnect: (callback: OnDisconnectCallback) => {
        remove: () => boolean;
    };
}
