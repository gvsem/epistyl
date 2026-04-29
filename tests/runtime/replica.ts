import {describe, expect, it} from "vitest";

import type {Action} from "../../src/ops/action";
import type {Operation} from "../../src/ops/operation";
import type {TransactionRecord} from "../../src/ops/transaction";
import type {ApplyContext} from "../../src/runtime/apply";

import {
    appendOperation,
    appendOperations,
    appendTransaction,
    createObjectHistory,
    createReplicaState,
    exportReplicaState,
    getObjectHistory,
    importReplicaState,
    materializeReplicaObject,
    mergeObjectHistories,
    mergeReplicaStates,
    type ReplicaState,
    upsertObjectHistory,
} from "../../src/runtime/replica";

import {viewNode} from "../../src/runtime/view";

function action(value = "x"): Action {
    return {
        type: "field.set",
        path: ["title"],
        value,
    };
}

function operation(
    opId: string,
    replicaId: string,
    clock: Record<string, number>,
    overrides: Partial<Operation> = {},
): Operation {
    return {
        operationId: opId,
        transactionId: `${replicaId}:tx:1`,
        objectId: "event-1",
        replicaId,
        clock,
        action: action(),
        ...overrides,
    };
}

const applyContext: ApplyContext = {
    policy: {
        defaultPrimitiveSemantics: "mv" as const,
        defaultRefSemantics: "lww" as const,
    },
};

describe("runtime/replica", () => {
    describe("createObjectHistory", () => {
        it("creates empty history by default", () => {
            expect(createObjectHistory("event-1")).toEqual({
                objectId: "event-1",
                operations: [],
            });
        });

        it("deduplicates and sorts operations", () => {
            const history = createObjectHistory("event-1", [
                operation("A:10", "A", {A: 1, B: 1}),
                operation("B:1", "B", {B: 1}),
                operation("A:2", "A", {A: 1, B: 1}),
                operation("A:1", "A", {A: 1}),
                operation("A:2", "A", {A: 1, B: 1}),
            ]);

            expect(history.operations.map((op) => op.operationId)).toEqual([
                "A:1",
                "B:1",
                "A:2",
                "A:10",
            ]);
        });
    });

    describe("createReplicaState", () => {
        it("creates empty replica state with initialized clock", () => {
            expect(createReplicaState("A")).toEqual({
                replicaId: "A",
                clockState: {
                    replicaId: "A",
                    clock: {},
                    counter: 0,
                },
                objects: {},
            });
        });
    });

    describe("getObjectHistory", () => {
        it("returns object history when present", () => {
            const history = createObjectHistory("event-1");
            const replica: ReplicaState = {
                replicaId: "A",
                clockState: {
                    replicaId: "A",
                    clock: {},
                    counter: 0,
                },
                objects: {
                    "event-1": history,
                },
            };

            expect(getObjectHistory(replica, "event-1")).toEqual(history);
        });

        it("returns null when object history is missing", () => {
            const replica = createReplicaState("A");

            expect(getObjectHistory(replica, "event-1")).toBeNull();
        });
    });

    describe("appendOperation", () => {
        it("appends operation into object history", () => {
            const replica = createReplicaState("A");

            const next = appendOperation(
                replica,
                operation("A:1", "A", {A: 1}),
            );

            expect(next.objects["event-1"]?.operations.map((op) => op.operationId)).toEqual([
                "A:1",
            ]);
        });

        it("observes operation clock into replica clock state", () => {
            const replica = createReplicaState("A");

            const next = appendOperation(
                replica,
                operation("B:1", "B", {A: 2, B: 1}),
            );

            expect(next.clockState).toEqual({
                replicaId: "A",
                clock: {A: 2, B: 1},
                counter: 2,
            });
        });

        it("deduplicates repeated operation by operationId", () => {
            let replica = createReplicaState("A");
            const op = operation("A:1", "A", {A: 1});

            replica = appendOperation(replica, op);
            replica = appendOperation(replica, op);

            expect(replica.objects["event-1"]?.operations.map((item) => item.operationId)).toEqual([
                "A:1",
            ]);
        });
    });

    describe("appendOperations", () => {
        it("appends multiple operations", () => {
            const replica = createReplicaState("A");

            const next = appendOperations(replica, [
                operation("A:1", "A", {A: 1}),
                operation("B:1", "B", {A: 1, B: 1}),
            ]);

            expect(next.objects["event-1"]?.operations.map((op) => op.operationId)).toEqual([
                "A:1",
                "B:1",
            ]);

            expect(next.clockState).toEqual({
                replicaId: "A",
                clock: {A: 1, B: 1},
                counter: 1,
            });
        });
    });

    describe("appendTransaction", () => {
        it("appends all transaction operations", () => {
            const replica = createReplicaState("A");

            const transaction: TransactionRecord = {
                txId: "A:tx:1",
                objectId: "event-1",
                replicaId: "A",
                operations: [
                    operation("A:1", "A", { A: 1 }),
                    operation("A:2", "A", { A: 2 }),
                ],
            };

            const next = appendTransaction(replica, transaction);

            expect(next.objects["event-1"]?.objectId).toBe("event-1");
            expect(next.objects["event-1"]?.operations.map((op) => op.operationId)).toEqual([
                "A:1",
                "A:2",
            ]);
        });
    });

    describe("mergeObjectHistories", () => {
        it("merges two histories into normalized history", () => {
            const left = createObjectHistory("event-1", [
                operation("A:1", "A", {A: 1}),
            ]);

            const right = createObjectHistory("event-1", [
                operation("B:1", "B", {B: 1}),
                operation("A:1", "A", {A: 1}),
            ]);

            const merged = mergeObjectHistories(left, right, "event-1");

            expect(merged.objectId).toBe("event-1");
            expect(merged.operations.map((op) => op.operationId)).toEqual([
                "A:1",
                "B:1",
            ]);
        });

        it("works when one side is null", () => {
            const right = createObjectHistory("event-1", [
                operation("B:1", "B", {B: 1}),
            ]);

            expect(mergeObjectHistories(null, right, "event-1")).toEqual(right);
            expect(mergeObjectHistories(right, null, "event-1")).toEqual(right);
        });
    });

    describe("mergeReplicaStates", () => {
        it("merges object histories by object id", () => {
            const left = appendOperation(
                createReplicaState("A"),
                operation("A:1", "A", {A: 1}),
            );

            const right = appendOperation(
                createReplicaState("B"),
                operation("B:1", "B", {B: 1}),
            );

            const merged = mergeReplicaStates(left, right, "M");

            expect(merged.replicaId).toBe("M");
            expect(merged.objects["event-1"]?.operations.map((op) => op.operationId)).toEqual([
                "A:1",
                "B:1",
            ]);
        });

        it("merges clock knowledge from both replicas", () => {
            const left = appendOperation(
                createReplicaState("A"),
                operation("A:3", "A", {A: 3}),
            );

            const right = appendOperation(
                createReplicaState("B"),
                operation("B:2", "B", {A: 1, B: 2}),
            );

            const merged = mergeReplicaStates(left, right, "M");

            expect(merged.clockState).toEqual({
                replicaId: "M",
                clock: {A: 3, B: 2},
                counter: 0,
            });
        });

        it("preserves local counter when merged replica id matches left replica id", () => {
            const left: ReplicaState = {
                replicaId: "A",
                clockState: {
                    replicaId: "A",
                    clock: {A: 5, B: 1},
                    counter: 5,
                },
                objects: {},
            };

            const right: ReplicaState = {
                replicaId: "B",
                clockState: {
                    replicaId: "B",
                    clock: {A: 2, B: 4},
                    counter: 4,
                },
                objects: {},
            };

            const merged = mergeReplicaStates(left, right, "A");

            expect(merged.clockState).toEqual({
                replicaId: "A",
                clock: {A: 5, B: 4},
                counter: 5,
            });
        });

        it("is commutative on merged histories", () => {
            const left = appendOperation(
                createReplicaState("A"),
                operation("A:1", "A", {A: 1}),
            );

            const right = appendOperation(
                createReplicaState("B"),
                operation("B:1", "B", {B: 1}),
            );

            const ab = mergeReplicaStates(left, right, "M");
            const ba = mergeReplicaStates(right, left, "M");

            expect(ab.objects).toEqual(ba.objects);
            expect(ab.clockState).toEqual(ba.clockState);
        });
    });

    describe("materializeReplicaObject", () => {
        it("materializes existing object history", () => {
            let replica = createReplicaState("A");

            replica = appendOperation(
                replica,
                operation("A:1", "A", {A: 1}, {
                    action: {
                        type: "field.set",
                        path: ["title"],
                        value: "Team Sync",
                    },
                }),
            );

            const result = materializeReplicaObject(replica, "event-1", {
                applyContext,
            });

            expect(result.objectId).toBe("event-1");
            expect(result.operations.map((op) => op.operationId)).toEqual(["A:1"]);
            expect(viewNode(result.root)).toEqual({
                title: {
                    kind: "mv",
                    values: ["Team Sync"],
                },
            });
        });

        it("materializes empty object when history is missing", () => {
            const replica = createReplicaState("A");

            const result = materializeReplicaObject(replica, "missing-object", {
                applyContext,
            });

            expect(result.objectId).toBe("missing-object");
            expect(result.operations).toEqual([]);
            expect(viewNode(result.root)).toEqual({});
        });
    });
});