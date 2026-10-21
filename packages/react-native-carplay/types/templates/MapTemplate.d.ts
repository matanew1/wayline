import { ProcessedColorValue } from 'react-native';
import { MapButton } from '../interfaces/MapButton';
import { NavigationAlert } from '../interfaces/NavigationAlert';
import { TextConfiguration } from '../interfaces/TextConfiguration';
import { TimeRemainingColor } from '../interfaces/TimeRemainingColor';
import { TravelEstimates } from '../interfaces/TravelEstimates';
import { Trip } from '../navigation/Trip';
import { BaseEvent, NavigationAlertHideEvent, NavigationAlertShowEvent, Template, TemplateConfig } from './Template';
import { ListItem } from '../interfaces/ListItem';
import { Action } from '../interfaces/Action';
import { Header } from '../interfaces/Header';
import { Pane } from '../interfaces/Pane';
import { PanGestureWithTranslationEvent } from '../interfaces/GestureEvent';
import { PauseReason } from '../interfaces/PauseReason';
import { Maneuver } from '../interfaces/Maneuver';
export interface MapButtonEvent extends BaseEvent {
    id: string;
}
export interface AlertActionEvent extends BaseEvent {
    secondary?: boolean;
    primary?: boolean;
    navigationAlertId: number;
}
export interface PanEvent {
    direction: string;
}
export interface TripEvent {
    tripId: string;
    routeIndex: number;
}
export interface MapTemplateConfig extends TemplateConfig {
    /**
     * The background color the map template uses when displaying guidance.
     * @namespace iOS
     */
    guidanceBackgroundColor?: ProcessedColorValue;
    /**
     * The style that the map template uses when displaying trip estimates during active nagivation.
     * @default dark
     * @namespace iOS
     */
    tripEstimateStyle?: 'dark' | 'light';
    /**
     * Your component to render inside CarPlay/Android Auto
     * Example `component: MyComponent`
     */
    component: React.ComponentType<any>;
    /**
     * An array of map buttons displayed on the trailing bottom corner of the map template.
     * If the array contains more than three buttons, the map template displays only the first three buttons, ignoring the remaining buttons.
     * @namespace iOS
     * @namespace Android
     */
    mapButtons?: MapButton[];
    /**
     * A Boolean value that indicates whether the navigation bar hides automatically.
     * @namespace iOS
     */
    automaticallyHidesNavigationBar?: boolean;
    /**
     * A Boolean value that tells the system to hide the map buttons when hiding the navigation bar.
     * @namespace iOS
     */
    hidesButtonsWithNavigationBar?: boolean;
    /**
     * A component that holds onto data associated with a template's header.
     * @namespace Android
     */
    header?: Header;
    /**
     * Sets an ItemList to show in a list view along with the map.
     * - To show a marker corresponding to a point of interest represented by a row, set the Place instance via setMetadata. The host will display the PlaceMarker in both the map and the list view as the row becomes visible.
     * - Images of type IMAGE_TYPE_LARGE are not allowed in this template.
     * - Rows are not allowed to have both an image and a place marker.
     * @limit The number of items in the ItemList should be smaller or equal than the limit provided by CONTENT_LIMIT_TYPE_PLACE_LIST. The host will ignore any items over that limit. The list itself cannot be selectable as set via setOnSelectedListener. Each Row can add up to 2 lines of texts via addText and cannot contain a Toggle.
     * @namespace Android
     */
    items?: ListItem[];
    /**
     * Sets the ActionStrip for this template.
     * Unless set with this method, the template will not have an action strip.
     * The Action buttons in Map Based Template are automatically adjusted based on the screen size. On narrow width screen, icon Actions show by default. If no icon specify, showing title Actions instead. On wider width screen, title Actions show by default. If no title specify, showing icon Actions instead.
     * @limit This template allows up to 4 Actions in its ActionStrip. Of the 4 allowed Actions, it can either be a title Action as set via setTitle, or a icon Action as set via setIcon.
     * @namespace Android
     */
    actions?: Action[];
    /**
     * Sets the Pane for this template. getImage for pane will not be shown in MapTemplate.
     * Unless set with this method, the template will not show a pane.
     * @limit The number of items in the Pane should be smaller or equal than the limit provided by CONTENT_LIMIT_TYPE_PANE. The host via addText and cannot contain either a Toggle or a OnClickListener.
     * Up to 2 Actions are allowed in the Pane. Each action's title color can be customized with ForegroundCarColorSpan instances. Any other span is not supported.
     * If none of the header Action, the header title or the action strip have been set on the template, the header is hidden.
     */
    pane?: Pane;
    /**
     * Fired when Alert Action button is pressed
     * @param e Event
     */
    onAlertActionPressed?(e: AlertActionEvent): void;
    /**
     * Fired when a navigation alert will disappear
     * @param e Event providing the templateId, navigationAlertId and a reason why the alert is disappearing
     */
    onWillDismissNavigationAlert?(e: NavigationAlertHideEvent): void;
    /**
     * Fired when a navigation alert did disappear
     * @param e Event providing the templateId, navigationAlertId and a reason why the alert did disappear
     */
    onDidDismissNavigationAlert?(e: NavigationAlertHideEvent): void;
    /**
     * Fired when a navigation alert will be shown
     * @param e Event providing the templateId and the navigationAlertId
     */
    onWillShowNavigationAlert?(e: NavigationAlertShowEvent): void;
    /**
     * Fired when a navigation alert is shown
     * @param e Event providing the templateId and the navigationAlertId
     */
    onDidShowNavigationAlert?(e: NavigationAlertShowEvent): void;
    onMapButtonPressed?(e: MapButtonEvent): void;
    onPanWithDirection?(e: PanEvent): void;
    onPanBeganWithDirection?(e: PanEvent): void;
    onPanEndedWithDirection?(e: PanEvent): void;
    onDidBeginPanGesture?(): void;
    onDidUpdatePanGestureWithTranslation?(e: PanGestureWithTranslationEvent): void;
    onDidEndPanGestureWithVelocity?(e: {
        velocity: PanGestureWithTranslationEvent['velocity'];
    }): void;
    onSelectedPreviewForTrip?(e: TripEvent): void;
    /**
     * Fired when the vehicles built in navigation system is started by the user,
     * any ongoing navigation session is canceled on native side when this happens
     */
    onDidCancelNavigation?(): void;
    onStartedTrip?(e: TripEvent): void;
    /**
     * Fired when the back button is pressed
     */
    onBackButtonPressed?(): void;
    /**
     * Option to hide back button
     * @default false
     */
    backButtonHidden?: boolean;
    /**
     * Title to be shown on the back button, defaults to no text so only the < icon is shown
     */
    backButtonTitle?: string;
    /**
     * fired when the scene hosting the map template changes its state
     * @param isVisible
     */
    onStateChanged?: (isVisible: boolean) => void;
}
/**
 * The Map Template is a control layer that appears as an overlay over the base view and allows you to present user controls.
 *
 * The control layer consists of a navigation bar and map buttons. By default, the navigation bar appears when the user interacts with the app, and disappears after a period of inactivity.
 *
 * The navigation bar includes up to two leading buttons and two trailing buttons. You can customize the appearance of these buttons with icons or text.
 *
 * The control layer may also include up to four map buttons. The map buttons are always shown as icons.
 *
 * Navigation apps enter panning mode, zoom in or out, and perform other functions by responding to user actions on these buttons.
 */
export declare class MapTemplate extends Template<MapTemplateConfig> {
    config: MapTemplateConfig;
    get type(): string;
    get eventMap(): {
        alertActionPressed: string;
        willDismissNavigationAlert: string;
        didDismissNavigationAlert: string;
        willShowNavigationAlert: string;
        didShowNavigationAlert: string;
        mapButtonPressed: string;
        panWithDirection: string;
        panBeganWithDirection: string;
        panEndedWithDirection: string;
        didBeginPanGesture: string;
        didUpdatePanGestureWithTranslation: string;
        didEndPanGestureWithVelocity: string;
        selectedPreviewForTrip: string;
        didCancelNavigation: string;
        startedTrip: string;
        backButtonPressed: string;
        stateDidChange: string;
    };
    constructor(config: MapTemplateConfig);
    /**
     * Begins guidance for a trip.
     *
     * Keep a reference to the navigation session to perform guidance updates.
     * @param trip Trip class instance
     */
    startNavigationSession(trip: Trip): Promise<void>;
    cancelNavigationSession(): Promise<void>;
    finishNavigationSession(): Promise<void>;
    pauseNavigationSession(reason: PauseReason, description?: string): Promise<void>;
    updateManeuvers(maneuvers: Maneuver[]): void;
    updateTravelEstimates(maneuverIndex: number, travelEstimates: TravelEstimates): void;
    updateTravelEstimatesForTrip(trip: Trip, travelEstimates: TravelEstimates, timeRemainingColor?: TimeRemainingColor): void;
    /**
     * Update MapTemplate configuration
     */
    updateConfig(config: MapTemplateConfig): void;
    updateMapButtons(mapButtons: MapButton[]): void;
    /**
     * Hides the display of trip previews.
     */
    hideTripPreviews(): void;
    showTripPreviews(tripPreviews: Trip[], textConfiguration?: TextConfiguration): void;
    showTripPreview(tripPreviews: Trip[], selectedTripId: string, textConfiguration?: TextConfiguration): void;
    showRouteChoicesPreviewForTrip(trip: Trip, textConfiguration?: TextConfiguration): void;
    presentNavigationAlert(config: NavigationAlert, animated?: boolean): void;
    /**
     * Dismisses the currently shown navigation alert. This function is async and should be awaited before showing a new alert dialog.
     * @param animated A Boolean value that determines whether to animate the dismissal of the alert dialog.
     * @returns A Promise that indicates if the alert dialog dismissal was successful
     */
    dismissNavigationAlert(animated?: boolean): Promise<boolean>;
    /**
     * Shows the panning interface over the map.
     *
     * Calling this method while displaying the panning interface has no effect.
     *
     * While showing the panning interface, the system hides all map buttons. The system doesn't provide a button to dismiss the panning interface. Instead, you must provide a map button in the navigation bar that the user taps to dismiss the panning interface.
     * @param animated A Boolean value that determines whether to animate the panning interface.
     */
    showPanningInterface(animated?: boolean): void;
    /**
     * Dismisses the panning interface.
     *
     * When dismissing the panning interface, the system shows the previously hidden map buttons.
     * @param animated A Boolean value that determines whether to animate the dismissal of the panning interface.
     */
    dismissPanningInterface(animated?: boolean): void;
}
