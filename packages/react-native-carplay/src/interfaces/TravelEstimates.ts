import { CarColor } from './CarColor';

export type DistanceUnits = 'meters' | 'miles' | 'kilometers' | 'yards' | 'feet';

export interface TravelEstimates {
  /**
   * Distance remaining, setting it to a negative number will put the timeRemaining in the maneuver
   */
  distanceRemaining: number;
  /**
   * Time remaining in seconds
   */
  timeRemaining: number;
  /**
   * unit of measurement for the
   * distance, defaults to kilometer
   * @namespace iOS
   */
  distanceUnits: DistanceUnits;

  /**
   * Color of the distance remaining
   * @namespace Android
   */
  distanceRemainingColor?: CarColor;
  /**
   * Color of the time remaining
   * @namespace Android
   */
  timeRemainingColor?: CarColor;
}
