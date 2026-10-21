import {
  AppRegistry,
  Image,
  type EmitterSubscription,
  type NativeEventEmitter,
} from 'react-native';
import { OnConnectCallback, OnDisconnectCallback } from '../CarPlay';
import type { DashboardConfig, DashboardShortcutButtonConfig } from '../interfaces/Dashboard';
import type { InternalCarPlay } from '../interfaces/InternalCarPlay';
import { WindowInformation } from '../interfaces/WindowInformation';

type NativeDashboardShortcutButtonConfig = Array<
  Omit<DashboardShortcutButtonConfig, 'onPress'> & { index: number; launchCarplayScene: boolean }
>;

export class Dashboard {
  private readonly bridge: InternalCarPlay;
  private readonly emitter: NativeEventEmitter;
  public connected = false;
  public window: WindowInformation | null = null;
  private onConnectCallbacks = new Set<OnConnectCallback>();
  private onDisconnectCallbacks = new Set<OnDisconnectCallback>();

  private stateSubscription: EmitterSubscription | null = null;
  private buttonSubscription: EmitterSubscription | null = null;

  constructor(bridge: InternalCarPlay, emitter: NativeEventEmitter) {
    this.bridge = bridge;
    this.emitter = emitter;

    this.emitter.addListener('dashboardDidConnect', (window: WindowInformation) => {
      this.connected = true;
      this.window = window;
      this.onConnectCallbacks.forEach(callback => {
        callback(window);
      });
    });

    this.emitter.addListener('dashboardDidDisconnect', () => {
      this.connected = false;
      this.window = null;
      this.onDisconnectCallbacks.forEach(callback => {
        callback();
      });
    });

    // check if already connected this will fire any 'dashboardDidDisconnect' events
    // if a connected is already present.
    this.bridge.checkForDashboardConnection();
  }

  public create(config: DashboardConfig) {
    for (const subscription of [this.stateSubscription, this.buttonSubscription]) {
      subscription?.remove();
    }

    const { id, component, shortcutButtons, onStateChanged } = config;

    if (shortcutButtons.length === 0 || shortcutButtons.length > 2) {
      throw new Error(
        `invalid number of dashboard shortcut buttons, got ${shortcutButtons.length} when it has to be a min of 1 and a max of 2`,
      );
    }

    const dashboardConfig: {
      shortcutButtons: NativeDashboardShortcutButtonConfig;
    } = {
      shortcutButtons: [],
    };

    if (shortcutButtons != null) {
      for (let index = 0; index < shortcutButtons.length; index++) {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { onPress, ...button } = shortcutButtons[index];

        dashboardConfig.shortcutButtons.push({
          ...button,
          index,
          image: Image.resolveAssetSource(button.image),
          launchCarplayScene: button.launchCarplayScene ?? false,
        });
      }

      this.buttonSubscription = this.emitter.addListener('dashboardButtonPressed', e => {
        shortcutButtons[e.index]?.onPress?.();
      });

      if (onStateChanged != null) {
        this.stateSubscription = this.emitter.addListener(
          'dashboardStateDidChange',
          ({ isVisible }: { isVisible: boolean }) => {
            onStateChanged(isVisible);
          },
        );
      }
    }

    AppRegistry.registerComponent(id, () => component);
    this.bridge.createDashboard(id, dashboardConfig);
  }

  public checkForConnection(): void {
    this.bridge.checkForDashboardConnection();
  }

  public updateShortcutButtons(shortcutButtons: Array<DashboardShortcutButtonConfig>) {
    const config: { shortcutButtons: NativeDashboardShortcutButtonConfig } = {
      shortcutButtons: [],
    };

    this.buttonSubscription?.remove();

    for (let index = 0; index < shortcutButtons.length; index++) {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { onPress, ...button } = shortcutButtons[index];

      config.shortcutButtons.push({
        ...button,
        index,
        image: Image.resolveAssetSource(button.image),
        launchCarplayScene: button.launchCarplayScene ?? false,
      });
    }

    this.buttonSubscription = this.emitter.addListener('dashboardButtonPressed', e => {
      shortcutButtons[e.index]?.onPress?.();
    });

    this.bridge.updateDashboardShortcutButtons(config);
  }

  /**
   * Fired when CarPlay is connected to the dashboard scene.
   */
  public registerOnConnect = (callback: OnConnectCallback) => {
    this.onConnectCallbacks.add(callback);
    return {
      remove: () => this.onConnectCallbacks.delete(callback),
    };
  };

  /**
   * Fired when CarPlay is disconnected from the dashboard scene.
   */
  public registerOnDisconnect = (callback: OnDisconnectCallback) => {
    this.onDisconnectCallbacks.add(callback);
    return {
      remove: () => this.onDisconnectCallbacks.delete(callback),
    };
  };
}
