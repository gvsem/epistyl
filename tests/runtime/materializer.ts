import { describe, it, expect } from "vitest";

import type { Action } from "../../src/ops/action";
import type { Operation } from "../../src/ops/operation";
import type { TransactionData } from "../../src/ops/transaction";

import {
    filterOperationsByObjectId,
    flattenTransactionHistory,
    materializeObjectHistory,
    materializeOperations,
    materializeTransactionHistory,
    normalizeOperationsForObject,
} from "../../src/runtime/materializer";

import type { ApplyContext } from "../../src/runtime/apply";
import { createObjectNodeState } from "../../src/crdt/state";
import { viewNode } from "../../src/runtime/view";
import type { ObjectHistory } from "../../src/runtime/replica";

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
        clockSnapshot: clock,
        action: action(),
        ...overrides,
    };
}

const applyContext: ApplyContext = {
    policy: {
        defaultPrimitiveSemantics: "mv",
        defaultRefSemantics: "lww",
    },
};

describe("runtime/materializer", () => {
    describe("filterOperationsByObjectId", () => {
        it("keeps only operations for requested object", () => {
            const ops = [
                operation("A:1", "A", { A: 1 }, { objectId: "event-1" }),
                operation("A:2", "A", { A: 2 }, { objectId: "event-2" }),
                operation("B:1", "B", { B: 1 }, { objectId: "event-1" }),
            ];

            expect(filterOperationsByObjectId(ops, "event-1").map((op) => op.operationId)).toEqual([
                "A:1",
                "B:1",
            ]);
        });

        it("returns empty array when no operations match object id", () => {
            const ops = [
                operation("A:1", "A", { A: 1 }, { objectId: "event-2" }),
            ];

            expect(filterOperationsByObjectId(ops, "event-1")).toEqual([]);
        });
    });

    describe("normalizeOperationsForObject", () => {
        it("filters, deduplicates and sorts operations", () => {
            const ops = [
                operation("A:10", "A", { A: 1, B: 1 }, { objectId: "event-1" }),
                operation("A:2", "A", { A: 1, B: 1 }, { objectId: "event-1" }),
                operation("B:1", "B", { B: 1 }, { objectId: "event-1" }),
                operation("A:1", "A", { A: 1 }, { objectId: "event-1" }),
                operation("A:2", "A", { A: 1, B: 1 }, { objectId: "event-1" }),
                operation("X:1", "X", { X: 1 }, { objectId: "other-object" }),
            ];

            expect(normalizeOperationsForObject(ops, "event-1").map((op) => op.operationId)).toEqual([
                "A:1",
                "B:1",
                "A:2",
                "A:10",
            ]);
        });
    });

    describe("flattenTransactionHistory", () => {
        it("flattens operations from all transactions in order", () => {
            const history = {
                objectId: "event-1",
                transactions: [
                    {
                        txId: "A:tx:1",
                        objectId: "event-1",
                        replicaId: "A",
                        operations: [
                            operation("A:1", "A", { A: 1 }),
                            operation("A:2", "A", { A: 2 }),
                        ],
                    },
                    {
                        txId: "B:tx:1",
                        objectId: "event-1",
                        replicaId: "B",
                        operations: [
                            operation("B:1", "B", { B: 1 }),
                        ],
                    },
                ] satisfies TransactionData[],
            };

            expect(flattenTransactionHistory(history).map((op) => op.operationId)).toEqual([
                "A:1",
                "A:2",
                "B:1",
            ]);
        });

        it("returns empty array for empty transaction history", () => {
            const history = {
                objectId: "event-1",
                transactions: [],
            };

            expect(flattenTransactionHistory(history)).toEqual([]);
        });
    });

    describe("materializeOperations", () => {
        it("materializes filtered and normalized operations into default object root", () => {
            const ops = [
                operation("A:2", "A", { A: 2 }, {
                    action: { type: "field.set", path: ["title"], value: "second" },
                }),
                operation("A:1", "A", { A: 1 }, {
                    action: { type: "field.set", path: ["title"], value: "first" },
                }),
                operation("A:3", "A", { A: 3 }, {
                    objectId: "other-object",
                    action: { type: "field.set", path: ["title"], value: "ignored" },
                }),
            ];

            const result = materializeOperations("event-1", ops, { applyContext });

            expect(result.objectId).toBe("event-1");
            expect(result.operations.map((op) => op.operationId)).toEqual(["A:1", "A:2"]);
            expect(viewNode(result.root)).toEqual({
                title: {
                    kind: "mv",
                    values: ["second"],
                },
            });
        });

        it("uses provided initialRoot when specified", () => {
            const initialRoot = createObjectNodeState();

            const result = materializeOperations("event-1", [], {
                applyContext,
                initialRoot,
            });

            expect(result.root).toEqual(initialRoot);
            expect(viewNode(result.root)).toEqual({});
        });

        it("preserves concurrent mv updates", () => {
            const ops = [
                operation("A:1", "A", { A: 1 }, {
                    action: { type: "field.set", path: ["title"], value: "left" },
                }),
                operation("B:1", "B", { B: 1 }, {
                    action: { type: "field.set", path: ["title"], value: "right" },
                }),
            ];

            const result = materializeOperations("event-1", ops, { applyContext });

            expect(viewNode(result.root)).toEqual({
                title: {
                    kind: "mv",
                    values: ["left", "right"],
                },
            });
        });

        it("replays init + collection operations correctly", () => {
            const ops = [
                operation("A:1", "A", { A: 1 }, {
                    action: { type: "node.initSet", path: ["tags"] },
                }),
                operation("A:2", "A", { A: 2 }, {
                    action: { type: "set.add", path: ["tags"], value: "team" },
                }),
                operation("B:1", "B", { A: 2, B: 1 }, {
                    action: { type: "set.add", path: ["tags"], value: "urgent" },
                }),
            ];

            const result = materializeOperations("event-1", ops, { applyContext });

            expect(viewNode(result.root)).toEqual({
                tags: ["team", "urgent"],
            });
        });
    });

    describe("materializeObjectHistory", () => {
        it("materializes object history through materializeOperations", () => {
            const history: ObjectHistory = {
                objectId: "event-1",
                operations: [
                    operation("A:1", "A", { A: 1 }, {
                        action: { type: "field.set", path: ["title"], value: "Team Sync" },
                    }),
                ],
            };

            const result = materializeObjectHistory(history, { applyContext });

            expect(result.objectId).toBe("event-1");
            expect(result.operations.map((op) => op.operationId)).toEqual(["A:1"]);
            expect(viewNode(result.root)).toEqual({
                title: {
                    kind: "mv",
                    values: ["Team Sync"],
                },
            });
        });
    });

    describe("materializeTransactionHistory", () => {
        it("flattens transaction history and materializes operations", () => {
            const history = {
                objectId: "event-1",
                transactions: [
                    {
                        txId: "A:tx:1",
                        objectId: "event-1",
                        replicaId: "A",
                        operations: [
                            operation("A:1", "A", { A: 1 }, {
                                action: { type: "node.initMap", path: ["metadata"] },
                            }),
                            operation("A:2", "A", { A: 2 }, {
                                action: {
                                    type: "map.setValue",
                                    path: ["metadata"],
                                    key: "color",
                                    value: "blue",
                                },
                            }),
                        ],
                    },
                    {
                        txId: "B:tx:1",
                        objectId: "event-1",
                        replicaId: "B",
                        operations: [
                            operation("B:1", "B", { A: 2, B: 1 }, {
                                action: {
                                    type: "map.setValue",
                                    path: ["metadata"],
                                    key: "owner",
                                    value: "team-a",
                                },
                            }),
                        ],
                    },
                ] satisfies TransactionData[],
            };

            const result = materializeTransactionHistory(history, { applyContext });

            expect(result.operations.map((op) => op.operationId)).toEqual([
                "A:1",
                "A:2",
                "B:1",
            ]);

            expect(viewNode(result.root)).toEqual({
                metadata: {
                    color: {
                        kind: "mv",
                        values: ["blue"],
                    },
                    owner: {
                        kind: "mv",
                        values: ["team-a"],
                    },
                },
            });
        });

        it("ignores operations for other object ids after flattening", () => {
            const history = {
                objectId: "event-1",
                transactions: [
                    {
                        txId: "A:tx:1",
                        objectId: "event-1",
                        replicaId: "A",
                        operations: [
                            operation("A:1", "A", { A: 1 }, {
                                objectId: "event-1",
                                action: { type: "field.set", path: ["title"], value: "ok" },
                            }),
                            operation("A:2", "A", { A: 2 }, {
                                objectId: "other-object",
                                action: { type: "field.set", path: ["title"], value: "ignored" },
                            }),
                        ],
                    },
                ] satisfies TransactionData[],
            };

            const result = materializeTransactionHistory(history, { applyContext });

            expect(result.operations.map((op) => op.operationId)).toEqual(["A:1"]);
            expect(viewNode(result.root)).toEqual({
                title: {
                    kind: "mv",
                    values: ["ok"],
                },
            });
        });
    });
});