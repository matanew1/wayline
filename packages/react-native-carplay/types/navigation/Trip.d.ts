export interface RouteChoice {
    /**
     * Content shown on the overview, only property visible when providing a single routeChoice
     */
    additionalInformationVariants?: string[];
    /**
     * Subtitle on the alternatives, only visible when providing more then one routeChoices
     */
    selectionSummaryVariants?: string[];
    /**
     * Title on the alternatives, only visible when providing more then one routeChoices
     */
    summaryVariants: string[];
}
export interface TripPoint {
    latitude: number;
    longitude: number;
    name: string;
}
export interface TripConfig {
    id?: string;
    origin: TripPoint;
    destination: TripPoint;
    routeChoices: RouteChoice[];
}
/**
 * in case you do not pass an id on the config it will be auto generated.
 * make sure to keep a reference since it is required for startNavigationSession, updateTravelEstimatesForTrip, showTripPreviews, showTripPreview, showRouteChoicesPreviewForTrip
 */
export declare class Trip {
    id: string;
    constructor(config: TripConfig);
}
