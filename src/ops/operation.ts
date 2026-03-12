import type {Action} from "./action";
import {type ClockRelation, compareClocks, ReplicaId, type VectorClock,} from "../core/clock";

export type ObjectId = string;
export type TxId = string;
export type OpId = string;

export interface Operation {
    /**
     * Globally unique operation identifier.
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

    /**
     * Optional wall-clock timestamp for diagnostics only.
     */
    timestamp?: string;
}

export function isSameOperation(a: Operation, b: Operation): boolean {
    return a.opId === b.opId;
}

export function getOperationKey(operation: Operation): string {
    return operation.opId;
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

    const causal = compareOperationCausality(a, b);

    if (causal === "before") {
        return -1;
    }

    if (causal === "after") {
        return 1;
    }

    if (a.replicaId !== b.replicaId) {
        return a.replicaId < b.replicaId ? -1 : 1;
    }

    const aCounter = parseOperationCounter(a.opId);
    const bCounter = parseOperationCounter(b.opId);

    if (aCounter !== null && bCounter !== null && aCounter !== bCounter) {
        return aCounter - bCounter;
    }

    return a.opId < b.opId ? -1 : 1;
}

export function compareOperationCausality(
    a: Operation,
    b: Operation,
): ClockRelation {
    return compareClocks(a.clock, b.clock);
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
