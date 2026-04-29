import {PartialOrderClockRelation, compareClocks,} from "../clock/clock";
import type {Operation, OperationId} from "./operation";

function getOperationCounterFromId(operationId: OperationId): number | null {
    const parts = operationId.split(":");
    const last = parts[parts.length - 1];
    if (!last) {
        return null;
    }

    const parsed = Number(last);
    return Number.isInteger(parsed) ? parsed : null;
}

export function compareOperations(a: Operation, b: Operation): number {
    if (a.operationId === b.operationId) {
        return 0;
    }

    const causal = compareClocks(a.clockSnapshot, b.clockSnapshot);

    if (causal === PartialOrderClockRelation.BEFORE) {
        return -1;
    }

    if (causal === PartialOrderClockRelation.AFTER) {
        return 1;
    }

    if (a.replicaId !== b.replicaId) {
        return a.replicaId < b.replicaId ? -1 : 1;
    }

    const aCounter = getOperationCounterFromId(a.operationId);
    const bCounter = getOperationCounterFromId(b.operationId);

    if (aCounter !== null && bCounter !== null && aCounter !== bCounter) {
        return aCounter - bCounter;
    }

    return a.operationId < b.operationId ? -1 : 1;
}

export function sortOperationsCausally(
    operations: readonly Operation[],
): Operation[] {
    return [...operations].sort(compareOperations);
}

export function deduplicateOperations(
    operations: readonly Operation[],
): Operation[] {
    const unique = new Map<OperationId, Operation>();

    for (const operation of operations) {
        if (!unique.has(operation.operationId)) {
            unique.set(operation.operationId, operation);
        }
    }

    return sortOperationsCausally([...unique.values()]);
}
