import { GridTemplate } from './GridTemplate';
import { InformationTemplate } from './InformationTemplate';
import { ListTemplate } from './ListTemplate';
import { PointOfInterestTemplate } from './PointOfInterestTemplate';
import { Template, TemplateConfig } from './Template';
export type TabBarTemplates = ListTemplate | GridTemplate | InformationTemplate | PointOfInterestTemplate;
export interface TabBarTemplateConfig extends TemplateConfig {
    /**
     * The title displayed in the navigation bar while the tab bar template is visible.
     */
    title?: string;
    /**
     * The templates to show as tabs.
     */
    templates: TabBarTemplates[];
    onTemplateSelect(template: TabBarTemplates | undefined, e: {
        templateId: string;
        selectedTemplateId: string;
    }): void;
}
export declare class TabBarTemplate extends Template<TabBarTemplateConfig> {
    config: TabBarTemplateConfig;
    get type(): string;
    constructor(config: TabBarTemplateConfig);
    updateTemplates: (config: TabBarTemplateConfig) => void;
}
