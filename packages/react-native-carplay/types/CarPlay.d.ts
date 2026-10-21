import { ImageSourcePropType, NativeEventEmitter } from 'react-native';
import { ActionSheetTemplate } from './templates/ActionSheetTemplate';
import { AlertTemplate } from './templates/AlertTemplate';
import { ContactTemplate } from './templates/ContactTemplate';
import { GridTemplate } from './templates/GridTemplate';
import { InformationTemplate } from './templates/InformationTemplate';
import { ListTemplate } from './templates/ListTemplate';
import { MapTemplate } from './templates/MapTemplate';
import { NowPlayingTemplate } from './templates/NowPlayingTemplate';
import { PointOfInterestTemplate } from './templates/PointOfInterestTemplate';
import { SearchTemplate } from './templates/SearchTemplate';
import { TabBarTemplate } from './templates/TabBarTemplate';
import { VoiceControlTemplate } from './templates/VoiceControlTemplate';
import { MessageTemplate } from './templates/android/MessageTemplate';
import { NavigationTemplate } from './templates/android/NavigationTemplate';
import { PaneTemplate } from './templates/android/PaneTemplate';
import { PlaceListMapTemplate } from './templates/android/PlaceListMapTemplate';
import { PlaceListNavigationTemplate } from './templates/android/PlaceListNavigationTemplate';
import { RoutePreviewNavigationTemplate } from './templates/android/RoutePreviewNavigationTemplate';
import { Dashboard } from './scenes/Dashboard';
import { InternalCarPlay } from './interfaces/InternalCarPlay';
import { WindowInformation } from './interfaces/WindowInformation';
import { OnClusterControllerConnectCallback } from './interfaces/Cluster';
import { Cluster } from './scenes/Cluster';
import { MapWithListTemplate } from './templates/android/MapWithListTemplate';
import { MapWithPaneTemplate } from './templates/android/MapWithPaneTemplate';
import { CallbackAction } from './interfaces/Action';
import { MapWithGridTemplate } from './templates/android/MapWithGridTemplate';
import { AndroidAutoPermissions, OnTelemetryCallback, PermissionRequestResult } from './interfaces/Telemetry';
import { SignInTemplate } from './templates/android/SignInTemplate';
import { Action } from './interfaces/Action';
import { HeaderAction } from './interfaces/Action';
export type PushableTemplates = MapTemplate | SearchTemplate | GridTemplate | PointOfInterestTemplate | ListTemplate | MessageTemplate | PaneTemplate | InformationTemplate | ContactTemplate | NowPlayingTemplate | NavigationTemplate | PlaceListMapTemplate | PlaceListNavigationTemplate | RoutePreviewNavigationTemplate | MapWithListTemplate | MapWithPaneTemplate | MapWithGridTemplate | SignInTemplate;
export type PresentableTemplates = AlertTemplate | ActionSheetTemplate | VoiceControlTemplate;
export type ImageSize = {
    width: number;
    height: number;
};
export type OnConnectCallback = (window: WindowInformation) => void;
export type OnDisconnectCallback = () => void;
type AppearanceInformation = {
    colorScheme: 'dark' | 'light';
    /**
     * id that was specified on the MapTemplate, Dashboard or Cluster
     */
    id: string;
};
export type OnAppearanceDidChangeCallback = ({ colorScheme, id }: AppearanceInformation) => void;
export interface SafeAreaInsetsEvent {
    bottom: number;
    left: number;
    right: number;
    top: number;
    /**
     * id that was specified on the MapTemplate, Dashboard or Cluster
     */
    id: string;
    /**
     * legacy layout is considered as anything before Material Expression 3, on these the insets are quite buggy
     * @namespace Android
     */
    isLegacyLayout?: boolean;
}
export type OnSafeAreaInsetsDidChangeCallback = (safeAreaInsets: SafeAreaInsetsEvent) => void;
export type AndroidAutoAlertConfig = {
    id: number;
    title: string;
    duration: number;
    subtitle?: string;
    image?: ImageSourcePropType;
    actions?: CallbackAction[];
};
type VoiceCommandEvent = {
    action: 'NAVIGATE';
    query: string;
};
export type OnVoiceCommandCallback = (voiceCommand: VoiceCommandEvent) => void;
/**
 * A controller that manages all user interface elements appearing on your map displayed on the CarPlay screen.
 */
export declare class CarPlayInterface {
    /**
     * React Native bridge to the CarPlay interface
     */
    bridge: InternalCarPlay;
    /**
     * Boolean to denote if carplay is currently connected.
     */
    connected: boolean;
    window: WindowInformation | undefined;
    /**
     * CarPlay Event Emitter
     */
    emitter: NativeEventEmitter<Readonly<Record<string, readonly Object[]>>>;
    private onTelemetryCallbacks;
    private onConnectCallbacks;
    private onDisconnectCallbacks;
    private onClusterConnectCallbacks;
    private onAppearanceDidChangeCallbacks;
    private onOnSafeAreaInsetsDidChangeCallbacks;
    private alertCallbacks;
    private onVoiceCommandCallbacks;
    constructor();
    /**
     * Silently checks permissions without requesting them from the user
     * @param requestedPermissions AndroidAutoPermissions you want to check
     * @returns
     */
    checkAndroidAutoPermissions(requestedPermissions: AndroidAutoPermissions[]): Promise<boolean>;
    /**
     * Shows a message template to the user asking for specific permissions
     * @param permissions Permissions to request from the user
     * @param message Message to show on the template
     * @param primaryAction Primary action that can be pressed while the car is parked only
     * @returns Promise in case permissions were granted or denied or null in case a back button was specified as headerAction and was pressed by the user
     * @namespace Android
     */
    requestAndroidAutoPermissions(permissions: Array<AndroidAutoPermissions>, message: string, primaryAction: Omit<Action, 'id' | 'type'> & {
        type: 'custom';
    }, headerAction: HeaderAction): Promise<PermissionRequestResult>;
    /**
     * Fired when CarPlay gets telemetry data from the car.
     * make sure to call CarPlay.requestTelemetryPermissions first
     * @namespace Android
     */
    registerTelemetryListener: (callback: OnTelemetryCallback) => Promise<string>;
    /**
     * @param callback that was registered first using CarPlay.registerTelemetryListener
     * @namespace Android
     */
    unregisterTelemetryListener: (callback: OnTelemetryCallback) => void;
    /**
     * @namespace Android
     * @param callback voice command handler
     */
    registerVoiceCommandListener: (callback: OnVoiceCommandCallback) => void;
    /**
     * @namespace Android
     * @param callback voice command handler
     */
    unregisterVoiceCommandListener: (callback: OnVoiceCommandCallback) => void;
    /**
     * Fired when CarPlay is connected to the device.
     */
    registerOnConnect: (callback: OnConnectCallback) => void;
    unregisterOnConnect: (callback: OnConnectCallback) => void;
    /**
     * Fired when CarPlay is disconnected from the device.
     */
    registerOnDisconnect: (callback: OnDisconnectCallback) => void;
    unregisterOnDisconnect: (callback: OnDisconnectCallback) => void;
    registerOnClusterConnect: (callback: OnClusterControllerConnectCallback) => {
        remove: () => void;
    };
    registerOnAppearanceDidChange: (callback: OnAppearanceDidChangeCallback) => {
        remove: () => void;
    };
    registerOnSafeAreaInsetsDidChange: (callback: OnSafeAreaInsetsDidChangeCallback) => {
        remove: () => void;
    };
    /**
     * Sets the root template, starting a new stack for the template navigation hierarchy.
     * @param rootTemplate The root template. Replaces the current rootTemplate, if one exists.
     * @param animated Set TRUE to animate the presentation of the root template; ignored if there isn't a current rootTemplate.
     */
    setRootTemplate(rootTemplate: PushableTemplates | TabBarTemplate, animated?: boolean): void;
    /**
     * Pushes a template onto the navigation stack and updates the display.
     * @param templateToPush The template to push onto the navigation stack.
     * @param animated Set TRUE to animate the presentation of the template.
     */
    pushTemplate(templateToPush: PushableTemplates, animated?: boolean): void;
    /**
     * Pops templates until the specified template is at the top of the navigation stack.
     * @param targetTemplate The template that you want at the top of the stack. The template must be on the navigation stack before calling this method.
     * @param animated A Boolean value that indicates whether the system animates the display of transitioning templates.
     */
    popToTemplate(targetTemplate: PushableTemplates, animated?: boolean): void;
    /**
     * Pops all templates on the stack—except the root template—and updates the display.
     * @param animated A Boolean value that indicates whether the system animates the display of transitioning templates.
     */
    popToRootTemplate(animated?: boolean): void;
    /**
     * Pops the top template from the navigation stack and updates the display.
     * @param animated A Boolean value that indicates whether the system animates the display of transitioning templates.
     */
    popTemplate(animated?: boolean): void;
    /**
     * presents a presentable template, alert / action / voice
     * @param templateToPresent The presentable template to present
     * @param animated A Boolean value that indicates whether the system animates the display of transitioning templates.
     */
    presentTemplate(templateToPresent: PresentableTemplates, animated?: boolean): void;
    /**
     * Dismisses the current presented template
     * * @param animated A Boolean value that indicates whether the system animates the display of transitioning templates.
     */
    dismissTemplate(animated?: boolean): void;
    /**
     * The current root template in the template navigation hierarchy.
     */
    getRootTemplate(): Promise<string | null>;
    /**
     * The top-most template in the navigation hierarchy stack.
     */
    getTopTemplate(): Promise<string | null>;
    /**
     * Control now playing template state
     * @param enable A Boolean value that indicates whether the system use now playing template.
     */
    enableNowPlaying(enable?: boolean): void;
    /**
     * brings up an alert
     * @namespace Android
     */
    alert(alert: AndroidAutoAlertConfig): void;
    /**
     * dismisses ongoing alert, no-op in case the alert is not shown anymore
     * @namespace Android
     */
    dismissAlert(id: number): void;
    notify(title: string, text: string, largeIcon?: ImageSourcePropType): void;
    /**
     * @namespace Android
     */
    getPlayServicesAvailable(): Promise<boolean>;
    private cleanAlertCallbacks;
}
export declare const CarPlay: CarPlayInterface;
export declare const CarPlayDashboard: Dashboard;
export declare const CarPlayCluster: Cluster;
export {};
