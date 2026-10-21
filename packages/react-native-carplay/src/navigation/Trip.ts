import { CarPlay } from '../CarPlay';

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
export class Trip {
  public id!: string;

  constructor(config: TripConfig) {
    if (config.id) {
      this.id = config.id;
    }

    if (!this.id) {
      this.id = `trip-${Date.now()}-${Math.round(Math.random() * Number.MAX_SAFE_INTEGER)}`;
    }

    CarPlay.bridge.createTrip(this.id, config);
  }
}
