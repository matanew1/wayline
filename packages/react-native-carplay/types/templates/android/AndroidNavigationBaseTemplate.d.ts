import * as React from 'react';
import { NavigationAlertHideEvent, NavigationAlertShowEvent, Template, TemplateConfig } from '../Template';
import { PanGestureWithTranslationEvent, PinchGestureEvent, PressEvent } from '../../interfaces/GestureEvent';
import { AndroidAction } from '../../interfaces/Action';
import { Pane } from '../../interfaces/Pane';
import { AndroidGridButton } from '../../interfaces/GridButton';
export interface AndroidNavigationBaseTemplateConfig extends TemplateConfig {
    /**
     * Your component to render inside Android Auto Map view
     * NavigationTemplate is required to have this, other templates might skip this if a NavigationTemplate is in place already
     */
    component?: React.ComponentType<any>;
    onDidShowPanningInterface?(): void;
    onDidDismissPanningInterface?(): void;
    /**
     * Fired when a pan gesture is happening
     * @param e coordinates for the pan event
     */
    onDidUpdatePanGestureWithTranslation?(e: PanGestureWithTranslationEvent): void;
    /**
     * Fired when a pinch gesture or a double tap happens
     * @param e PinchGestureEvent
     */
    onDidUpdatePinchGesture?(e: PinchGestureEvent): void;
    /**
     * Fired when a press event happens (single tap)
     * @param e PressEvent
     */
    onDidPress?(e: PressEvent): void;
    /**
     * Fired when the back button is pressed
     */
    onBackButtonPressed?(): void;
    /**
     * Fired when an alert dialog closes
     */
    onDidDismissAlert?(e: NavigationAlertHideEvent): void;
    /**
     * Fired when an alert dialog is about to be shown
     * @param id
     */
    onWillShowAlert?(e: NavigationAlertShowEvent): void;
}
export declare class AndroidNavigationBaseTemplate<T extends AndroidNavigationBaseTemplateConfig> extends Template<T> {
    config: T;
    get eventMap(): {
        didShowPanningInterface: string;
        didDismissPanningInterface: string;
        didUpdatePanGestureWithTranslation: string;
        didUpdatePinchGesture: string;
        didPress: string;
        didCancelNavigation: string;
        didEnableAutoDrive: string;
        didSelectListItem: string;
        backButtonPressed: string;
        didDismissNavigationAlert: string;
        willShowNavigationAlert: string;
    };
    private pressableCallbacks;
    constructor(config: T);
    parseConfig(config: TemplateConfig & {
        actions?: Array<AndroidAction>;
        mapButtons?: Array<AndroidAction>;
        navigateAction?: AndroidAction;
        pane?: Omit<Pane, 'actions'> & {
            actions?: Array<AndroidAction>;
        };
        buttons?: Array<AndroidGridButton & {
            id?: string;
        }>;
    }): any;
}
