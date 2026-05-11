import { describe, expect, it } from "vitest";

import { createReplicaClockState, tickClock, type ReplicaClockState } from "../../src/clock/clock";
import {
    createTransactionBuilder,
    type IssuedOperationData,
    type TransactionBuildContext,
} from "../../src/ops/transaction";
import {Operation} from "../../src/ops/operation";

function createBuildContext(replicaId = "A"): {
    context: TransactionBuildContext;
    getClockState(): ReplicaClockState;
} {
    let state = createReplicaClockState(replicaId);

    return {
        context: {
            replicaId,
            issueOperationData(): IssuedOperationData {
                const issued = tickClock(state);
                state = issued.state;

                return {
                    operationId: `${replicaId}:${issued.state.counter}`,
                    clockSnapshot: issued.state.clock,
                };
            },
        },
        getClockState(): ReplicaClockState {
            return state;
        },
    };
}

describe("ops/transaction", () => {
    it("creates empty transaction data", () => {
        const { context } = createBuildContext("A");

        const tx = createTransactionBuilder(
            "A:tx:1",
            "event-1",
            context,
        );

        expect(tx.txId).toBe("A:tx:1");
        expect(tx.objectId).toBe("event-1");
        expect(tx.replicaId).toBe("A");

        expect(tx.getOperations()).toEqual([]);
        expect(tx.toData()).toEqual({
            transactionId: "A:tx:1",
            objectId: "event-1",
            replicaId: "A",
            operations: [],
        });
    });

    it("stores transaction identifiers in data", () => {
        const { context } = createBuildContext("A");

        const tx = createTransactionBuilder(
            "A:tx:1",
            "event-1",
            context,
        );

        expect(tx.toData()).toEqual({
            transactionId: "A:tx:1",
            objectId: "event-1",
            replicaId: "A",
            operations: [],
        });
    });

    it("emits field.set operation", () => {
        const { context } = createBuildContext("A");

        const tx = createTransactionBuilder("A:tx:1", "event-1", context);
        tx.setField(["title"], "Team Sync");

        expect(tx.getOperations()).toEqual([
            {
                operationId: "A:1",
                transactionId: "A:tx:1",
                objectId: "event-1",
                replicaId: "A",
                clockSnapshot: { A: 1 },
                action: {
                    type: "field.set",
                    path: ["title"],
                    value: "Team Sync",
                }
            },
        ]);
    });

    it("emits field.delete operation", () => {
        const { context } = createBuildContext("A");

        const tx = createTransactionBuilder("A:tx:1", "event-1", context);
        tx.deleteField(["title"]);

        expect(tx.getOperations()).toEqual([
            {
                operationId: "A:1",
                transactionId: "A:tx:1",
                objectId: "event-1",
                replicaId: "A",
                clockSnapshot: { A: 1 },
                action: {
                    type: "field.delete",
                    path: ["title"],
                }
            },
        ]);
    });

    it("emits node init operations", () => {
        const { context } = createBuildContext("A");

        const tx = createTransactionBuilder("A:tx:1", "event-1", context);

        tx.initObject(["location"]);
        tx.initSet(["tags"]);
        tx.initArray(["attendees"]);

        expect(tx.getOperations()).toEqual([
            {
                operationId: "A:1",
                transactionId: "A:tx:1",
                objectId: "event-1",
                replicaId: "A",
                clockSnapshot: { A: 1 },
                action: {
                    type: "node.initObject",
                    path: ["location"],
                }
            },
            {
                operationId: "A:2",
                transactionId: "A:tx:1",
                objectId: "event-1",
                replicaId: "A",
                clockSnapshot: { A: 2 },
                action: {
                    type: "node.initSet",
                    path: ["tags"],
                }
            },
            {
                operationId: "A:3",
                transactionId: "A:tx:1",
                objectId: "event-1",
                replicaId: "A",
                clockSnapshot: { A: 3 },
                action: {
                    type: "node.initArray",
                    path: ["attendees"],
                }
            },
        ]);
    });

    it("emits object field operations for nested metadata", () => {
        const { context } = createBuildContext("A");

        const tx = createTransactionBuilder("A:tx:1", "event-1", context);

        tx.initObject(["metadata"]);
        tx.setField(["metadata", "color"], "blue");
        tx.initObject(["metadata", "nested"]);
        tx.deleteField(["metadata", "obsolete"]);

        expect(tx.getOperations()).toEqual([
            {
                operationId: "A:1",
                transactionId: "A:tx:1",
                objectId: "event-1",
                replicaId: "A",
                clockSnapshot: { A: 1 },
                action: {
                    type: "node.initObject",
                    path: ["metadata"],
                },
            },
            {
                operationId: "A:2",
                transactionId: "A:tx:1",
                objectId: "event-1",
                replicaId: "A",
                clockSnapshot: { A: 2 },
                action: {
                    type: "field.set",
                    path: ["metadata", "color"],
                    value: "blue",
                },
            },
            {
                operationId: "A:3",
                transactionId: "A:tx:1",
                objectId: "event-1",
                replicaId: "A",
                clockSnapshot: { A: 3 },
                action: {
                    type: "node.initObject",
                    path: ["metadata", "nested"],
                },
            },
            {
                operationId: "A:4",
                transactionId: "A:tx:1",
                objectId: "event-1",
                replicaId: "A",
                clockSnapshot: { A: 4 },
                action: {
                    type: "field.delete",
                    path: ["metadata", "obsolete"],
                },
            },
        ]);
    });

    it("emits set operations", () => {
        const { context } = createBuildContext("A");

        const tx = createTransactionBuilder("A:tx:1", "event-1", context);

        tx.setAdd(["tags"], "team");
        tx.setRemove(["tags"], "team");

        expect(tx.getOperations()).toEqual([
            {
                operationId: "A:1",
                transactionId: "A:tx:1",
                objectId: "event-1",
                replicaId: "A",
                clockSnapshot: { A: 1 },
                action: {
                    type: "set.add",
                    path: ["tags"],
                    value: "team",
                }
            },
            {
                operationId: "A:2",
                transactionId: "A:tx:1",
                objectId: "event-1",
                replicaId: "A",
                clockSnapshot: { A: 2 },
                action: {
                    type: "set.remove",
                    path: ["tags"],
                    value: "team",
                }
            },
        ]);
    });

    it("emits array operations", () => {
        const { context } = createBuildContext("A");

        const tx = createTransactionBuilder("A:tx:1", "event-1", context);

        tx.arrayInsert(["attendees"], 0, {
            type: "ref",
            objectId: "user-1",
        });
        tx.arrayRemove(["attendees"], 0);

        expect(tx.getOperations()).toEqual([
            {
                operationId: "A:1",
                transactionId: "A:tx:1",
                objectId: "event-1",
                replicaId: "A",
                clockSnapshot: { A: 1 },
                action: {
                    type: "array.insert",
                    path: ["attendees"],
                    index: 0,
                    value: {
                        type: "ref",
                        objectId: "user-1",
                    },
                },
            },
            {
                operationId: "A:2",
                transactionId: "A:tx:1",
                objectId: "event-1",
                replicaId: "A",
                clockSnapshot: { A: 2 },
                action: {
                    type: "array.remove",
                    path: ["attendees"],
                    index: 0,
                },
            },
        ]);
    });

    it("uses same transactionId for all operations in one transaction", () => {
        const { context } = createBuildContext("A");

        const tx = createTransactionBuilder("A:tx:1", "event-1", context);

        tx.setField(["title"], "Team Sync");
        tx.setField(["description"], "Weekly planning");
        tx.setAdd(["tags"], "team");

        expect(tx.getOperations().map((op) => op.transactionId)).toEqual([
            "A:tx:1",
            "A:tx:1",
            "A:tx:1",
        ]);
    });

    it("increments opIds and clocks in local order", () => {
        const { context, getClockState } = createBuildContext("A");

        const tx = createTransactionBuilder("A:tx:1", "event-1", context);

        tx.setField(["title"], "Team Sync");
        tx.setField(["description"], "Weekly planning");
        tx.setField(["startAt"], "2026-03-07T10:00:00Z");

        expect(tx.getOperations().map((op) => op.operationId)).toEqual([
            "A:1",
            "A:2",
            "A:3",
        ]);

        expect(tx.getOperations().map((op) => op.clockSnapshot)).toEqual([
            { A: 1 },
            { A: 2 },
            { A: 3 },
        ]);

        expect(getClockState()).toEqual({
            replicaId: "A",
            clock: { A: 3 },
            counter: 3,
        });
    });

    it("getOperations returns snapshot copy", () => {
        const { context } = createBuildContext("A");

        const tx = createTransactionBuilder("A:tx:1", "event-1", context);
        tx.setField(["title"], "Team Sync");

        const ops = tx.getOperations() as Operation[];
        ops.push({
            operationId: "fake",
            transactionId: "fake",
            objectId: "fake",
            replicaId: "A",
            clockSnapshot: { A: 999 },
            action: {
                type: "field.delete",
                path: ["title"],
            },
        });

        expect(tx.getOperations()).toHaveLength(1);
        expect(tx.getOperations()[0]?.operationId).toBe("A:1");
    });

    it("toData returns snapshot copy of operations", () => {
        const { context } = createBuildContext("A");

        const tx = createTransactionBuilder("A:tx:1", "event-1", context);
        tx.setField(["title"], "Team Sync");

        const record = tx.toData();
        record.operations.push({
            operationId: "fake",
            transactionId: "fake",
            objectId: "fake",
            replicaId: "A",
            clockSnapshot: { A: 999 },
            action: {
                type: "field.delete",
                path: ["title"],
            },
        });

        expect(tx.toData().operations).toHaveLength(1);
        expect(tx.toData().operations[0]?.operationId).toBe("A:1");
    });
});
