import type { ImageSourcePropType } from 'react-native';
import { WindowInformation } from './WindowInformation';

export interface ClusterConfig {
  /**
   * the id you got from the onClusterConnect callback using CarPlay.registerOnClusterConnect or from your AndroidAutoCluster runnable
   */
  id: string;
  /**
   * the component to be rendered, works only for cluster type "Map" & "Navigation App"
   * register onWindowDidConnect to know if the cluster can render your component
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  component: React.ComponentType<any>;
  /**
   * inactiveDescriptionVariants is an array of a string and an optional image to be displayed when the user is not actively navigating arranged from most to least preferred.
   */
  inactiveDescriptionVariants: InactiveDescriptionVariant[];
  onDisconnect?: () => void;
  onZoomIn?: () => void;
  onZoomOut?: () => void;
  onDidChangeCompassSetting?: (setting: InstrumentClusterSetting) => void;
  onDidChangeSpeedLimitSetting?: (setting: InstrumentClusterSetting) => void;
  onWindowDidConnect?: (window: ClusterWindowInformation) => void;
  onContentStyleDidChange?: (contentStyle: ContentStyle) => void;
  onStateChanged?: (isVisible: boolean) => void;
}

export type AndroidClusterConfig = Omit<
  ClusterConfig,
  | 'inactiveDescriptionVariants'
  | 'onZoomIn'
  | 'onZoomOut'
  | 'onDidChangeCompassSetting'
  | 'onDidChangeSpeedLimitSetting'
>;

export type OnClusterControllerConnectCallback = ({ id }: { id: string }) => void;

export interface InactiveDescriptionVariant {
  text: string;
  /**
   * attachment image size can be up to 64x25 points.
   */
  image?: ImageSourcePropType;
  /**
   * position of the image in the text, if missing the image will be appended to the text
   */
  imagePosition?: number;
}

export enum InstrumentClusterSetting {
  Unspecified = 0,
  Enabled = 1,
  Disabled = 2,
  UserPreference = 3,
}

export enum ContentStyle {
  Unspecified = 0,
  Light = 1,
  Dark = 2,
}

export interface ClusterWindowInformation extends WindowInformation {
  contentStyle: ContentStyle;
}
