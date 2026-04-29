import {
    type ReplicaClockState,
    createReplicaClockState,
    getClockValue,
    tickClock,
    mergeClocks,
    acceptClock,
    ReplicaId,
} from "../clock/clock";

import type {ObjectId, Operation, TransactionId,} from "../ops/operation";
import {deduplicateOperations, sortOperationsCausally,} from "../ops/log";

import type {TransactionBuilder, TransactionData} from "../ops/transaction";
import {createTransactionBuilder} from "../ops/transaction";

import type {NodeState} from "../crdt/state";

import type {ApplyContext} from "./apply";

import {materializeObjectHistory, type MaterializeResult,} from "./materializer";
import {Action} from "../ops/action";

export interface ObjectHistory {
    objectId: ObjectId;
    operations: Operation[];
}

export interface ReplicaState {
    replicaId: ReplicaId;
    clockState: ReplicaClockState;
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
        operations: sortOperationsCausally(deduplicateOperations(operations)),
    };
}

export function createReplicaState(
    replicaId: ReplicaId,
): ReplicaState {
    return {
        replicaId,
        clockState: createReplicaClockState(replicaId),
        objects: {},
    };
}

export function getObjectHistory(
    replica: ReplicaState,
    objectId: ObjectId,
): ObjectHistory | null {
    return replica.objects[objectId] ?? null;
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
        clockState: acceptClock(replica.clockState, operation.clockSnapshot),
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
    transaction: TransactionData,
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

export function materializeReplicaObject(
    replica: ReplicaState,
    objectId: ObjectId,
    options: MaterializeReplicaOptions,
): MaterializeResult {
    const history =
        getObjectHistory(replica, objectId) ??
        createObjectHistory(objectId);

    return materializeObjectHistory(history, options);
}

export function issueReplicaOperation(
    replica: ReplicaState,
    objectId: ObjectId,
    action: Action,
    txId?: TransactionId,
): IssueReplicaOperationResult {
    const issued = tickClock(replica.clockState);

    const operation: Operation = {
        operationId: `${replica.replicaId}:${issued.state.counter}`,
        transactionId: txId ?? `${replica.replicaId}:tx:${issued.state.counter}`,
        objectId,
        replicaId: replica.replicaId,
        clockSnapshot: issued.state.clock,
        action,
    };

    return {
        replica: {
            ...replica,
            clockState: issued.state
        },
        operation,
    };
}

export function applyLocalAction(
    replica: ReplicaState,
    objectId: ObjectId,
    action: Action,
    txId?: TransactionId,
): ReplicaState {
    const issued = issueReplicaOperation(replica, objectId, action, txId);
    return appendOperation(issued.replica, issued.operation);
}

export interface IssueTransactionResult {
    replica: ReplicaState;
    transaction: TransactionData;
}

export function issueTransaction(
    replica: ReplicaState,
    objectId: ObjectId,
    build: (tx: TransactionBuilder) => void
): IssueTransactionResult {
    let workingReplica = replica;

    const txId = `${replica.replicaId}:tx:${replica.clockState.counter + 1}`;

    const builder = createTransactionBuilder(
        txId,
        objectId,
        {
            replicaId: replica.replicaId,
            issueOperationData() {
                const issued = tickClock(workingReplica.clockState);

                workingReplica = {
                    ...workingReplica,
                    clockState: issued.state,
                };

                return {
                    operationId: `${replica.replicaId}:${issued.state.counter}`,
                    clockSnapshot: issued.state.clock,
                };
            }
        }
    );

    build(builder);

    return {
        replica: workingReplica,
        transaction: builder.toData(),
    };
}

export function applyLocalTransaction(
    replica: ReplicaState,
    objectId: ObjectId,
    build: (tx: TransactionBuilder) => void
): ReplicaState {
    const issued = issueTransaction(replica, objectId, build);
    return appendTransaction(issued.replica, issued.transaction);
}
