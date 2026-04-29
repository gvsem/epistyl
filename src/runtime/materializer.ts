import type {ObjectId, Operation} from "../ops/operation";
import {deduplicateOperations, sortOperationsCausally,} from "../ops/log";

import type {TransactionRecord} from "../ops/transaction";

import {createObjectNodeState, type NodeState,} from "../crdt/state";

import {type ApplyContext, applyOperationToRoot,} from "./apply";
import {ObjectHistory} from "./replica";

export interface TransactionHistory {
    objectId: ObjectId;
    transactions: TransactionRecord[];
}

export interface MaterializeOptions {
    applyContext: ApplyContext;
    initialRoot?: NodeState;
}

export interface MaterializeResult {
    objectId: ObjectId;
    root: NodeState;
    operations: Operation[];
}

export function filterOperationsByObjectId(
    operations: readonly Operation[],
    objectId: ObjectId,
): Operation[] {
    return operations.filter((operation) => operation.objectId === objectId);
}

export function normalizeOperationsForObject(
    operations: readonly Operation[],
    objectId: ObjectId,
): Operation[] {
    const filtered = filterOperationsByObjectId(operations, objectId);
    const deduplicated = deduplicateOperations(filtered);
    return sortOperationsCausally(deduplicated);
}

export function flattenTransactionHistory(
    history: TransactionHistory,
): Operation[] {
    const operations: Operation[] = [];

    for (const transaction of history.transactions) {
        for (const operation of transaction.operations) {
            operations.push(operation);
        }
    }

    return operations;
}

export function materializeOperations(
    objectId: ObjectId,
    operations: readonly Operation[],
    options: MaterializeOptions,
): MaterializeResult {
    const normalized = normalizeOperationsForObject(operations, objectId);

    let root: NodeState = options.initialRoot ?? createObjectNodeState();

    for (const operation of normalized) {
        root = applyOperationToRoot(root, operation, options.applyContext);
    }

    return {
        objectId,
        root,
        operations: normalized,
    };
}

export function materializeObjectHistory(
    history: ObjectHistory,
    options: MaterializeOptions,
): MaterializeResult {
    return materializeOperations(
        history.objectId,
        history.operations,
        options,
    );
}

export function materializeTransactionHistory(
    history: TransactionHistory,
    options: MaterializeOptions,
): MaterializeResult {
    return materializeOperations(
        history.objectId,
        flattenTransactionHistory(history),
        options,
    );
}
