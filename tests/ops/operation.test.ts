import { describe, it, expect } from "vitest";

import {
    compareOperationCausality,
    compareOperations,
    deduplicateOperations,
    getOperationKey,
    isSameOperation,
    sortOperations,
    type Operation,
} from "../../src/ops/operation";
import type { Action } from "../../src/ops/action";

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
        opId,
        txId: `${replicaId}:tx:1`,
        objectId: "event-1",
        replicaId,
        clock,
        action: action(),
        ...overrides,
    };
}

describe("ops/operation", () => {
    describe("isSameOperation", () => {
        it("returns true when opId is the same", () => {
            const a = operation("A:1", "A", { A: 1 });
            const b = operation("A:1", "A", { A: 999 });

            expect(isSameOperation(a, b)).toBe(true);
        });

        it("returns false when opId differs", () => {
            const a = operation("A:1", "A", { A: 1 });
            const b = operation("A:2", "A", { A: 2 });

            expect(isSameOperation(a, b)).toBe(false);
        });
    });

    describe("getOperationKey", () => {
        it("returns operation opId", () => {
            const op = operation("A:7", "A", { A: 7 });

            expect(getOperationKey(op)).toBe("A:7");
        });
    });

    describe("compareOperationCausality", () => {
        it("returns equal for identical clocks", () => {
            const a = operation("A:1", "A", { A: 1, B: 2 });
            const b = operation("B:9", "B", { A: 1, B: 2 });

            expect(compareOperationCausality(a, b)).toBe("equal");
        });

        it("returns before when left clock is causally earlier", () => {
            const a = operation("A:1", "A", { A: 1 });
            const b = operation("A:2", "A", { A: 2 });

            expect(compareOperationCausality(a, b)).toBe("before");
        });

        it("returns after when left clock is causally later", () => {
            const a = operation("A:2", "A", { A: 2 });
            const b = operation("A:1", "A", { A: 1 });

            expect(compareOperationCausality(a, b)).toBe("after");
        });

        it("returns concurrent for incomparable clocks", () => {
            const a = operation("A:1", "A", { A: 1 });
            const b = operation("B:1", "B", { B: 1 });

            expect(compareOperationCausality(a, b)).toBe("concurrent");
        });
    });

    describe("compareOperations", () => {
        it("returns 0 for identical opId", () => {
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

        it("falls back to lexical opId ordering when counters cannot be parsed", () => {
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

            expect(sortOperations(ops).map((op) => op.opId)).toEqual([
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

            const sorted = sortOperations(ops);

            expect(sorted.map((op) => op.opId)).toEqual(["A:1", "B:1"]);
            expect(ops.map((op) => op.opId)).toEqual(["B:1", "A:1"]);
        });
    });

    describe("deduplicateOperations", () => {
        it("removes duplicate operations by opId", () => {
            const ops = [
                operation("A:1", "A", { A: 1 }),
                operation("A:1", "A", { A: 1 }, { timestamp: "later" }),
                operation("B:1", "B", { B: 1 }),
            ];

            expect(deduplicateOperations(ops).map((op) => op.opId)).toEqual([
                "A:1",
                "B:1",
            ]);
        });

        it("keeps the first occurrence of duplicate opId", () => {
            const first = operation("A:1", "A", { A: 1 }, { timestamp: "first" });
            const second = operation("A:1", "A", { A: 1 }, { timestamp: "second" });

            const result = deduplicateOperations([second, first]);

            expect(result).toHaveLength(1);
            expect(result[0]?.timestamp).toBe("second");
        });

        it("returns sorted unique operations", () => {
            const ops = [
                operation("A:10", "A", { A: 1, B: 1 }),
                operation("B:1", "B", { B: 1 }),
                operation("A:2", "A", { A: 1, B: 1 }),
                operation("A:1", "A", { A: 1 }),
                operation("A:2", "A", { A: 1, B: 1 }),
            ];

            expect(deduplicateOperations(ops).map((op) => op.opId)).toEqual([
                "A:1",
                "B:1",
                "A:2",
                "A:10",
            ]);
        });
    });
});