import { CallbackAction, HeaderAction } from '../../interfaces/Action';
import { Template, TemplateConfig } from '../Template';
import { ImageSourcePropType } from 'react-native';
export interface MessageTemplateConfig extends TemplateConfig {
    message?: string;
    loading?: boolean;
    headerAction?: HeaderAction;
    actions?: [CallbackAction, CallbackAction] | [CallbackAction];
    image?: ImageSourcePropType;
    title?: string;
    debugMessage?: string;
}
export declare class MessageTemplate extends Template<MessageTemplateConfig> {
    config: MessageTemplateConfig;
    private pressableCallbacks;
    get type(): string;
    constructor(config: MessageTemplateConfig);
    parseConfig(config: any): any;
}
