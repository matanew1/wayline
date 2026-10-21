import { Template, TemplateConfig } from './Template';
export interface InformationItem {
    title: string;
    detail: string;
}
export interface InformationAction {
    id: string;
    title: string;
}
export interface InformationTemplateConfig extends TemplateConfig {
    title: string;
    leading?: boolean;
    items: InformationItem[];
    actions: InformationAction[];
    onActionButtonPressed(e: {
        id: string;
        templateId: string;
    }): void;
    /**
     * Option to hide back button
     * @default false
     */
    backButtonHidden?: boolean;
    /**
     * Title to be shown on the back button, defaults to no text so only the < icon is shown
     */
    backButtonTitle?: string;
}
export declare class InformationTemplate extends Template<InformationTemplateConfig> {
    get type(): string;
    get eventMap(): {
        actionButtonPressed: string;
    };
    updateInformationTemplateItems: (items: InformationItem[]) => void;
    updateInformationTemplateActions: (actions: InformationAction[]) => void;
}
