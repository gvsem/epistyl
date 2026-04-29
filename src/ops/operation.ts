import type {Action} from "./action";
import {PartialOrderClockRelation, compareClocks, ReplicaId, type VectorClock,} from "../clock/clock";

export type ObjectId = string;
export type TxId = string;
export type OpId = string;

export interface Operation {
    /**
     * Globally unique operation identifier. (Replica Id + Operation counter). A:1. Replica A; Counter 1
     */
    opId: OpId;

    /**
     * Identifier of the transaction this operation belongs to.
     */
    txId: TxId;

    /**
     * Identifier of the root object this operation targets.
     */
    objectId: ObjectId;

    /**
     * Identifier of the replica that created the operation.
     */
    replicaId: ReplicaId;

    /**
     * Immutable snapshot of the vector clock at creation time.
     */
    clock: VectorClock;

    /**
     * Serialized domain action.
     */
    action: Action;
}

function parseOperationCounter(opId: OpId): number | null {
    const parts = opId.split(":");
    const last = parts[parts.length - 1];
    if (!last) {
        return null;
    }

    const parsed = Number(last);
    return Number.isInteger(parsed) ? parsed : null;
}

export function compareOperations(a: Operation, b: Operation): number {
    if (a.opId === b.opId) {
        return 0;
    }

    const causal = compareClocks(a.clock, b.clock);

    if (causal === PartialOrderClockRelation.BEFORE) {
        return -1;
    }

    if (causal === PartialOrderClockRelation.AFTER) {
        return 1;
    }

    if (a.replicaId !== b.replicaId) {
        // детерминированно выводим на основе лексикографического сравнения по replicaId
        return a.replicaId < b.replicaId ? -1 : 1;
    }

    const aCounter = parseOperationCounter(a.opId);
    const bCounter = parseOperationCounter(b.opId);

    if (aCounter !== null && bCounter !== null && aCounter !== bCounter) {
        return aCounter - bCounter;
    }

    return a.opId < b.opId ? -1 : 1;
}

export function sortOperations(
    operations: readonly Operation[],
): Operation[] {
    return [...operations].sort(compareOperations);
}

export function deduplicateOperations(
    operations: readonly Operation[],
): Operation[] {
    const unique = new Map<OpId, Operation>();

    for (const operation of operations) {
        if (!unique.has(operation.opId)) {
            unique.set(operation.opId, operation);
        }
    }

    return sortOperations([...unique.values()]);
}
