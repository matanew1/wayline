import { AlertAction } from '../interfaces/AlertAction';
import { Template, TemplateConfig } from './Template';
export interface ActionSheetTemplateConfig extends TemplateConfig {
    title: string;
    message?: string;
    actions: AlertAction[];
    onActionButtonPressed?(e: {
        id: string;
        templateId: string;
    }): void;
}
export declare class ActionSheetTemplate extends Template<ActionSheetTemplateConfig> {
    get type(): string;
    get eventMap(): {
        actionButtonPressed: string;
    };
}
