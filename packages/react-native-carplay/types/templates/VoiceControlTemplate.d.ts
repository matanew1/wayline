import { VoiceControlState } from '../interfaces/VoiceControlState';
import { Template } from './Template';
export interface VoiceControlTemplateConfig {
    /**
     * The array of voice control states that can be used by your voice control template.
     */
    voiceControlStates: VoiceControlState[];
}
/**
 * Displays a voice control indicator on the CarPlay screen.
 *
 * CarPlay navigation apps must show the voice control template during audio input.
 */
export declare class VoiceControlTemplate extends Template<VoiceControlTemplateConfig> {
    get type(): string;
    activateVoiceControlState(identifier: string): void;
}
