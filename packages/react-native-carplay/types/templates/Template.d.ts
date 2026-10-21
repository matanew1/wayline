import { EmitterSubscription, ImageSourcePropType } from 'react-native';
import { BarButton } from '../interfaces/BarButton';
export interface BaseEvent {
    /**
     * Template id that fired the event
     */
    templateId: string;
}
export interface SearchButtonPressedEvent extends BaseEvent {
    searchText: string;
}
export interface BarButtonEvent extends BaseEvent {
    id: string;
}
export interface NavigationAlertShowEvent extends BaseEvent {
    navigationAlertId: number;
}
export interface NavigationAlertHideEvent extends BaseEvent {
    navigationAlertId: number;
    reason: 'none' | 'timeout' | 'system' | 'user' | 'notSupported' | 'unknown';
    /**
     * @namespace Android
     */
    type?: 'dismiss' | 'cancel';
}
export interface TemplateConfig {
    /**
     * Give the template your own ID. Must be unique.
     */
    id?: string;
    /**
     * An array of bar buttons to display on the leading side of the navigation bar.
     *
     * The navigation bar displays up to two buttons in the leading space. When including more than two buttons in the array, the system displays only the first two buttons.
     * @namespace iOS
     */
    leadingNavigationBarButtons?: BarButton[];
    /**
     * An array of bar buttons to display on the trailing side of the navigation bar.
     *
     * The navigation bar displays up to two buttons in the trailing space. When including more than two buttons in the array, the system displays only the first two buttons.
     * @namespace iOS
     */
    trailingNavigationBarButtons?: BarButton[];
    /**
     * UITabBarSystemItem
     */
    tabSystemItem?: number;
    /**
     * Name of system image for tab
     */
    tabSystemImageName?: string;
    /**
     * Image source for tab
     */
    tabImage?: ImageSourcePropType;
    /**
     * Set tab title
     */
    tabTitle?: string;
    /**
     * Fired before template appears
     * @param e Event
     */
    onWillAppear?(e: BaseEvent): void;
    /**
     * Fired before template disappears
     * @param e Event
     */
    onWillDisappear?(e: BaseEvent): void;
    /**
     * Fired after template appears
     * @param e Event
     */
    onDidAppear?(e: BaseEvent): void;
    /**
     * Fired after template disappears
     * @param e Event
     */
    onDidDisappear?(e: BaseEvent): void;
    /**
     * Fired when bar button is pressed
     * @param e Event
     */
    onBarButtonPressed?(e: BarButtonEvent): void;
    /**
     * Fired when popToRootTemplate finished
     */
    onPoppedToRoot?(e: BaseEvent): void;
}
export declare class Template<P> {
    config: TemplateConfig & P;
    get type(): string;
    id: string;
    listenerSubscriptions: EmitterSubscription[];
    get eventMap(): {};
    constructor(config: TemplateConfig & P);
    updateTemplate: (config: P) => void;
    parseConfig(config: any): any;
    destroy(): void;
}
