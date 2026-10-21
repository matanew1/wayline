import { CallbackAction, HeaderAction } from '../../interfaces/Action';
import { Template, TemplateConfig } from '../Template';
type SignInMethodQr = {
    type: 'qr';
    /**
     * url that is placed in the QR code
     */
    url?: string;
};
type SignInMethodGoogle = {
    /**
     * make sure to check CarPlay.getPlayServicesAvailable first
     * in case play services are not available this will not work
     */
    type: 'google';
    serverClientId: string;
    /**
     * title that is shown on the button, something like "Sign in with Google"
     */
    actionTitle: string;
};
export declare enum InputType {
    DEFAULT = 1,
    PASSWORD = 2
}
type SignInMethodMail = {
    type: 'mail';
    /**
     * Sets the text explaining to the user what should be entered in this input box.
     */
    hint: string;
    inputType: InputType;
};
export interface SignInTemplateConfig extends TemplateConfig {
    headerAction?: HeaderAction;
    /**
     * Sets the title of the template.
     */
    title: string;
    /**
     * Sets the text to show as instructions of the template.
     */
    instructions: string;
    /**
     * Sets additional text, such as disclaimers, links to terms of services, to show in the template.
     */
    additionalText?: string;
    /**
     * Sign in method to use for this template
     */
    method: SignInMethodQr | SignInMethodMail | SignInMethodGoogle;
    actions?: [CallbackAction] | [CallbackAction, CallbackAction];
    /**
     * Fired when the back button is pressed
     */
    onBackButtonPressed?(): void;
    /**
     * callback that is triggered when user logged in with mail & password or Google
     * this is not triggered for QR sign in so it is optional
     * @param serverAuthCode returned when the user logged in with Google
     * @param text returned when either email or password are submitted by the user
     */
    onSignIn?(e: {
        templateId: string;
        serverAuthCode?: string;
        text?: string;
    }): void;
}
export declare class SignInTemplate extends Template<SignInTemplateConfig> {
    config: SignInTemplateConfig;
    get type(): string;
    private pressableCallbacks;
    constructor(config: SignInTemplateConfig);
    parseConfig(config: any): any;
    get eventMap(): {
        backButtonPressed: string;
        didSignIn: string;
    };
}
export {};
