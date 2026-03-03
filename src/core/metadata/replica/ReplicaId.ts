import { v4 as uuidv4 } from 'uuid';

/**
 * ReplicaId is a globally unique identifier for a replica.
 */
export type ReplicaId = string & { __brand: 'ReplicaId' };

export namespace ReplicaId {
    export function create(): ReplicaId {
        return uuidv4() as ReplicaId;
    }
}