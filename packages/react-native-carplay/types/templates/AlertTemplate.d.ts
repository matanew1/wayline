import { AlertAction } from '../interfaces/AlertAction';
import { Template, TemplateConfig } from './Template';
export interface AlertTemplateConfig extends TemplateConfig {
    titleVariants: string[];
    actions?: AlertAction[];
    onActionButtonPressed?(e: {
        id: string;
        templateId: string;
    }): void;
}
export declare class AlertTemplate extends Template<AlertTemplateConfig> {
    get type(): string;
    get eventMap(): {
        actionButtonPressed: string;
    };
}
