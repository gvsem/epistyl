import {
    createClockState,
    getClockValue,
    mergeClocks,
    observeClock,
    type ClockState, issueClock, ReplicaId,
} from "../core/clock";

import type {
    ObjectId,
    Operation, TxId,
} from "../ops/operation";

import {
    deduplicateOperations,
    sortOperations,
} from "../ops/operation";

import type { TransactionRecord } from "../ops/transaction";

import type { NodeState } from "../crdt/state";

import type { ApplyContext } from "./apply";

import {
    materializeObjectHistory,
    type MaterializeResult,
} from "./materializer";
import {Action} from "../ops/action";

export interface ObjectHistory {
    objectId: ObjectId;
    operations: Operation[];
}

export interface ReplicaState {
    replicaId: ReplicaId;
    clockState: ClockState;
    objects: Record<ObjectId, ObjectHistory>;
}

export interface MaterializeReplicaOptions {
    applyContext: ApplyContext;
    initialRoot?: NodeState;
}

export interface IssueReplicaOperationResult {
    replica: ReplicaState;
    operation: Operation;
}

export function createObjectHistory(
    objectId: ObjectId,
    operations: Operation[] = [],
): ObjectHistory {
    return {
        objectId,
        operations: sortOperations(deduplicateOperations(operations)),
    };
}

export function createReplicaState(
    replicaId: ReplicaId,
): ReplicaState {
    return {
        replicaId,
        clockState: createClockState(replicaId),
        objects: {},
    };
}

export function listReplicaObjectIds(
    replica: ReplicaState,
): ObjectId[] {
    return Object.keys(replica.objects).sort();
}

export function getObjectHistory(
    replica: ReplicaState,
    objectId: ObjectId,
): ObjectHistory | null {
    return replica.objects[objectId] ?? null;
}

export function upsertObjectHistory(
    replica: ReplicaState,
    history: ObjectHistory,
): ReplicaState {
    let nextClockState = replica.clockState;

    for (const operation of history.operations) {
        nextClockState = observeClock(nextClockState, operation.clock);
    }

    return {
        ...replica,
        clockState: nextClockState,
        objects: {
            ...replica.objects,
            [history.objectId]: createObjectHistory(
                history.objectId,
                history.operations,
            ),
        },
    };
}

export function appendOperation(
    replica: ReplicaState,
    operation: Operation,
): ReplicaState {
    const existingHistory =
        getObjectHistory(replica, operation.objectId) ??
        createObjectHistory(operation.objectId);

    const nextHistory = createObjectHistory(
        operation.objectId,
        [...existingHistory.operations, operation],
    );

    return {
        ...replica,
        clockState: observeClock(replica.clockState, operation.clock),
        objects: {
            ...replica.objects,
            [operation.objectId]: nextHistory,
        },
    };
}

export function appendOperations(
    replica: ReplicaState,
    operations: readonly Operation[],
): ReplicaState {
    let next = replica;

    for (const operation of operations) {
        next = appendOperation(next, operation);
    }

    return next;
}

export function appendTransaction(
    replica: ReplicaState,
    transaction: TransactionRecord,
): ReplicaState {
    return appendOperations(replica, transaction.operations);
}

export function mergeObjectHistories(
    left: ObjectHistory | null,
    right: ObjectHistory | null,
    objectId: ObjectId,
): ObjectHistory {
    const leftOps = left?.operations ?? [];
    const rightOps = right?.operations ?? [];

    return createObjectHistory(objectId, [...leftOps, ...rightOps]);
}

export function mergeReplicaStates(
    left: ReplicaState,
    right: ReplicaState,
    replicaId: ReplicaId = left.replicaId,
): ReplicaState {
    const objectIds = new Set<ObjectId>([
        ...Object.keys(left.objects),
        ...Object.keys(right.objects),
    ]);

    const objects: Record<ObjectId, ObjectHistory> = {};

    for (const objectId of objectIds) {
        objects[objectId] = mergeObjectHistories(
            left.objects[objectId] ?? null,
            right.objects[objectId] ?? null,
            objectId,
        );
    }

    const mergedClock = mergeClocks(
        left.clockState.clock,
        right.clockState.clock,
    );

    const mergedCounter = Math.max(
        getClockValue(mergedClock, replicaId),
        left.replicaId === replicaId ? left.clockState.counter : 0,
        right.replicaId === replicaId ? right.clockState.counter : 0,
    );

    return {
        replicaId,
        clockState: {
            replicaId,
            clock: mergedClock,
            counter: mergedCounter,
        },
        objects,
    };
}

export function exportReplicaState(
    replica: ReplicaState,
): ReplicaState {
    return {
        replicaId: replica.replicaId,
        clockState: {
            replicaId: replica.clockState.replicaId,
            clock: { ...replica.clockState.clock },
            counter: replica.clockState.counter,
        },
        objects: Object.fromEntries(
            Object.entries(replica.objects).map(([objectId, history]) => [
                objectId,
                {
                    objectId: history.objectId,
                    operations: [...history.operations],
                },
            ]),
        ),
    };
}

export function importReplicaState(
    data: ReplicaState,
): ReplicaState {
    let replica = createReplicaState(data.replicaId);

    for (const history of Object.values(data.objects)) {
        replica = upsertObjectHistory(replica, history);
    }

    replica = {
        ...replica,
        clockState: {
            replicaId: data.clockState.replicaId,
            clock: { ...data.clockState.clock },
            counter: data.clockState.counter,
        },
    };

    return replica;
}

export function materializeReplicaObject(
    replica: ReplicaState,
    objectId: ObjectId,
    options: MaterializeReplicaOptions,
): MaterializeResult {
    const history =
        getObjectHistory(replica, objectId) ??
        createObjectHistory(objectId);

    return materializeObjectHistory(history, {
        applyContext: options.applyContext,
        initialRoot: options.initialRoot,
    });
}

export function issueReplicaOperation(
    replica: ReplicaState,
    objectId: ObjectId,
    action: Action,
    txId?: TxId,
): IssueReplicaOperationResult {
    const issued = issueClock(replica.clockState);

    const operation: Operation = {
        opId: `${replica.replicaId}:${issued.counter}`,
        txId: txId ?? `${replica.replicaId}:tx:${issued.counter}`,
        objectId,
        replicaId: replica.replicaId,
        clock: issued.clock,
        action,
    };

    return {
        replica: {
            ...replica,
            clockState: issued.state,
        },
        operation,
    };
}

export function applyLocalAction(
    replica: ReplicaState,
    objectId: ObjectId,
    action: Action,
    txId?: TxId,
): ReplicaState {
    const issued = issueReplicaOperation(replica, objectId, action, txId);
    return appendOperation(issued.replica, issued.operation);
}