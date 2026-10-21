import { Action } from '../interfaces/Action';
import { GridButton } from '../interfaces/GridButton';
import { BaseEvent, Template, TemplateConfig } from './Template';

export interface ButtonPressedEvent extends BaseEvent {
  /**
   * Button ID
   */
  id: string;
  /**
   * Button Index
   */
  index: number;
}

export interface GridTemplateConfig extends TemplateConfig {
  /**
   * The title displayed in the navigation bar while the list template is visible.
   */
  title?: string;
  /**
   * The array of grid buttons displayed on the template.
   */
  buttons: GridButton[];
  /**
   * Fired when a button is pressed
   */
  onButtonPressed?(e: ButtonPressedEvent): void;
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
   * Sets the Action that will be displayed in the header of the template.
   * @namespace Android
   */
  headerAction?: Action<'appIcon' | 'back'>;

  /**
   * Sets the ActionStrip for this template or null to not display any.
   * This template allows up to 2 Actions. Of the 2 allowed Actions, one of them can contain a title as set via setTitle. Otherwise, only Actions with icons are allowed.
   */
  actions?: [Action<'custom'>] | [Action<'custom'>, Action<'custom'>];
}

export class GridTemplate extends Template<GridTemplateConfig> {
  public get type(): string {
    return 'grid';
  }

  get eventMap() {
    return {
      gridButtonPressed: 'onButtonPressed',
      backButtonPressed: 'onBackButtonPressed',
    };
  }
}
