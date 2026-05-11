import type {Action} from "./action";
import {compareClocks, PartialOrderClockRelation, ReplicaId, type VectorClock,} from "../clock/clock";

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

export interface OperationTimestamp {
    opId: OperationId;
    replicaId: ReplicaId;
    clock: VectorClock;
}

export function cloneOperationTimestamp<T extends OperationTimestamp>(input: T): T {
    return {
        ...input,
        clock: {...input.clock},
    };
}

export function compareOperationTimestamps(
    a: OperationTimestamp,
    b: OperationTimestamp,
): number {
    if (a.opId === b.opId) {
        return 0;
    }

    const relation: PartialOrderClockRelation = compareClocks(a.clock, b.clock);

    if (relation === PartialOrderClockRelation.BEFORE) {
        return -1;
    }

    if (relation === PartialOrderClockRelation.AFTER) {
        return 1;
    }

    if (a.replicaId !== b.replicaId) {
        return a.replicaId < b.replicaId ? -1 : 1;
    }

    return a.opId < b.opId ? -1 : 1;
}
