import { type NativeEventEmitter } from 'react-native';
import { AndroidClusterConfig, ClusterConfig } from '../interfaces/Cluster';
import type { InternalCarPlay } from '../interfaces/InternalCarPlay';
export declare class Cluster {
    private readonly bridge;
    private subscriptions;
    private clusterIds;
    /**
     * @returns ids of all connected clusters
     */
    getClusterIds(): string[];
    constructor(bridge: InternalCarPlay, emitter: NativeEventEmitter);
    create(config: ClusterConfig | AndroidClusterConfig): void;
    checkForConnection(id: string): void;
}
