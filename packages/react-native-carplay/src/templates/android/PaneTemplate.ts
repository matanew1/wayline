import { Action, HeaderAction } from '../../interfaces/Action';
import { Template, TemplateConfig } from '../Template';
import { Pane } from '../../interfaces/Pane';

export interface PaneTemplateConfig extends TemplateConfig {
  pane: Pane;
  headerAction?: HeaderAction;
  actions?: [Action, Action] | [Action];
  title?: string;

  /**
   * Fired when the back button is pressed
   */
  onBackButtonPressed?(): void;

  /**
   * Fired when one of the action buttons is pressed
   */
  onActionButtonPressed?({ buttonId }: { buttonId: string }): void;
}

export class PaneTemplate extends Template<PaneTemplateConfig> {
  public get type(): string {
    return 'pane';
  }

  get eventMap() {
    return {
      backButtonPressed: 'onBackButtonPressed',
      buttonPressed: 'onActionButtonPressed',
    };
  }
}
