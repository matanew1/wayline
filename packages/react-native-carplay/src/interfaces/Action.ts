import { ColorValue, ImageSourcePropType } from 'react-native';

export type ActionType = 'appIcon' | 'back' | 'pan' | 'custom';

export interface Action<T extends ActionType = ActionType> {
  id?: string;
  title?: string;
  image?: ImageSourcePropType;
  backgroundColor?: ColorValue;
  visibility?: 'default' | 'persistent' | 'primary';
  enabled?: boolean;
  type?: T;
}

export type HeaderAction = Action<'appIcon' | 'back'>;

export type CallbackAction = Omit<Action, 'id'> & { onPress: () => void };

export type AndroidAction = CallbackAction | Action<'appIcon' | 'back' | 'pan'>;

export function getCallbackActionId() {
  return `${performance.now()}-${Math.round(Math.random() * Number.MAX_SAFE_INTEGER)}`;
}
