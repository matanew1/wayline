import type { ImageSourcePropType } from 'react-native';

export interface DashboardShortcutButtonConfig {
  titleVariants: Array<string>;
  subtitleVariants: Array<string>;
  image: ImageSourcePropType;
  onPress: () => void;
  /**
   * set to true so your CarPlay scene will be launched when the button is pressed
   */
  launchCarplayScene?: boolean;
}

export interface DashboardConfig {
  id: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  component: React.ComponentType<any>;
  /**
   * Buttons shown on the Dashboard when no navigation is active
   * up to 2 buttons can be placed in here according to Apple docs
   * https://developer.apple.com/documentation/carplay/cpdashboardcontroller/shortcutbuttons
   */
  shortcutButtons: Array<DashboardShortcutButtonConfig>;
  onStateChanged?: (isVisible: boolean) => void;
}
