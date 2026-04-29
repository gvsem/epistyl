import {describe, expect, it} from "vitest";

import type {Operation} from "../../src/ops/operation";
import {compareOperations, deduplicateOperations, sortOperationsCausally,} from "../../src/ops/log";
import type {Action} from "../../src/ops/action";

function action(): Action {
    return {
        type: "field.set",
        path: ["title"],
        value: "x",
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

describe("ops/operation", () => {

    describe("compareOperations", () => {
        it("returns 0 for identical operationId", () => {
            const a = operation("A:1", "A", { A: 1 });
            const b = operation("A:1", "A", { A: 999 });

            expect(compareOperations(a, b)).toBe(0);
        });

        it("orders causally earlier operation before later operation", () => {
            const earlier = operation("A:1", "A", { A: 1 });
            const later = operation("A:2", "A", { A: 2 });

            expect(compareOperations(earlier, later)).toBeLessThan(0);
            expect(compareOperations(later, earlier)).toBeGreaterThan(0);
        });

        it("uses replicaId as tie-breaker for concurrent operations", () => {
            const a = operation("A:1", "A", { A: 1 });
            const b = operation("B:1", "B", { B: 1 });

            expect(compareOperations(a, b)).toBeLessThan(0);
            expect(compareOperations(b, a)).toBeGreaterThan(0);
        });

        it("uses parsed numeric counter when replicaId is the same", () => {
            const a = operation("A:2", "A", { A: 1, B: 1 });
            const b = operation("A:10", "A", { A: 1, B: 1 });

            expect(compareOperations(a, b)).toBeLessThan(0);
            expect(compareOperations(b, a)).toBeGreaterThan(0);
        });

        it("falls back to lexical operationId ordering when counters cannot be parsed", () => {
            const a = operation("A:foo", "A", { A: 1, B: 1 });
            const b = operation("A:bar", "A", { A: 1, B: 1 });

            expect(compareOperations(a, b)).toBeGreaterThan(0);
            expect(compareOperations(b, a)).toBeLessThan(0);
        });

        it("prefers causal ordering over replicaId ordering", () => {
            const earlier = operation("Z:1", "Z", { A: 1 });
            const later = operation("A:2", "A", { A: 2 });

            expect(compareOperations(earlier, later)).toBeLessThan(0);
            expect(compareOperations(later, earlier)).toBeGreaterThan(0);
        });
    });

    describe("sortOperations", () => {
        it("returns operations in deterministic sorted order", () => {
            const ops = [
                operation("A:10", "A", { A: 1, B: 1 }),
                operation("B:1", "B", { B: 1 }),
                operation("A:2", "A", { A: 1, B: 1 }),
                operation("A:1", "A", { A: 1 }),
            ];

            expect(sortOperationsCausally(ops).map((op) => op.operationId)).toEqual([
                "A:1",
                "B:1",
                "A:2",
                "A:10",
            ]);
        });

        it("does not mutate original array", () => {
            const ops = [
                operation("B:1", "B", { B: 1 }),
                operation("A:1", "A", { A: 1 }),
            ];

            const sorted = sortOperationsCausally(ops);

            expect(sorted.map((op) => op.operationId)).toEqual(["A:1", "B:1"]);
            expect(ops.map((op) => op.operationId)).toEqual(["B:1", "A:1"]);
        });
    });

    describe("deduplicateOperations", () => {
        it("removes duplicate operations by operationId", () => {
            const ops = [
                operation("A:1", "A", { A: 1 }),
                operation("A:1", "A", { A: 1 }),
                operation("B:1", "B", { B: 1 }),
            ];

            expect(deduplicateOperations(ops).map((op) => op.operationId)).toEqual([
                "A:1",
                "B:1",
            ]);
        });

        it("returns sorted unique operations", () => {
            const ops = [
                operation("A:10", "A", { A: 1, B: 1 }),
                operation("B:1", "B", { B: 1 }),
                operation("A:2", "A", { A: 1, B: 1 }),
                operation("A:1", "A", { A: 1 }),
                operation("A:2", "A", { A: 1, B: 1 }),
            ];

            expect(deduplicateOperations(ops).map((op) => op.operationId)).toEqual([
                "A:1",
                "B:1",
                "A:2",
                "A:10",
            ]);
        });
    });
});
