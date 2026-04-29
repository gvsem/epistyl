import type {Action} from "./action";
import {ReplicaId, type VectorClock,} from "../clock/clock";

export type ObjectId = string;
export type TransactionId = string;
export type OperationId = string;

export interface Operation {
    /**
     * Globally unique operation identifier. (Replica Id + Operation counter). A:1. Replica A; Counter 1
     */
    operationId: OperationId;

    /**
     * Identifier of the transaction this operation belongs to.
     */
    transactionId: TransactionId;

    /**
     * Identifier of the root object this operation targets.
     */
    objectId: ObjectId;

    /**
     * Identifier of the replica that created the operation.
     */
    replicaId: ReplicaId;

    /**
     * Immutable snapshot of the vector clockSnapshot at creation time.
     */
    clockSnapshot: VectorClock;

    /**
     * Serialized domain action.
     */
    action: Action;
}
