import { describe, it, expect } from "vitest";

import {
    cloneClock,
    compareClocks,
    createClockState,
    emptyClock,
    getClockValue,
    issueClock,
    mergeClocks,
    observeClock,
    setClockValue,
    tickClock,
    type ClockState,
    type VectorClock,
} from "../../src/core/clock";

describe("core/clock", () => {
    describe("emptyClock", () => {
        it("returns an empty vector clock", () => {
            expect(emptyClock()).toEqual({});
        });
    });

    describe("cloneClock", () => {
        it("returns a shallow copy with the same values", () => {
            const original: VectorClock = { A: 1, B: 2 };

            const cloned = cloneClock(original);

            expect(cloned).toEqual({ A: 1, B: 2 });
            expect(cloned).not.toBe(original);
        });

        it("does not mutate when the clone is changed", () => {
            const original: VectorClock = { A: 1 };
            const cloned = cloneClock(original);

            cloned.A = 10;

            expect(original).toEqual({ A: 1 });
            expect(cloned).toEqual({ A: 10 });
        });
    });

    describe("getClockValue", () => {
        it("returns stored value for known replica", () => {
            const clock: VectorClock = { A: 3, B: 1 };

            expect(getClockValue(clock, "A")).toBe(3);
            expect(getClockValue(clock, "B")).toBe(1);
        });

        it("returns 0 for unknown replica", () => {
            const clock: VectorClock = { A: 3 };

            expect(getClockValue(clock, "B")).toBe(0);
        });
    });

    describe("setClockValue", () => {
        it("sets a replica value immutably", () => {
            const original: VectorClock = { A: 1 };

            const next = setClockValue(original, "B", 5);

            expect(next).toEqual({ A: 1, B: 5 });
            expect(original).toEqual({ A: 1 });
        });

        it("overwrites an existing replica value", () => {
            const original: VectorClock = { A: 1, B: 2 };

            const next = setClockValue(original, "B", 7);

            expect(next).toEqual({ A: 1, B: 7 });
        });
    });

    describe("tickClock", () => {
        it("increments existing replica value", () => {
            const clock: VectorClock = { A: 2, B: 4 };

            const next = tickClock(clock, "A");

            expect(next).toEqual({ A: 3, B: 4 });
            expect(clock).toEqual({ A: 2, B: 4 });
        });

        it("starts missing replica value from 1", () => {
            const clock: VectorClock = { A: 2 };

            const next = tickClock(clock, "B");

            expect(next).toEqual({ A: 2, B: 1 });
        });
    });

    describe("mergeClocks", () => {
        it("takes element-wise maximum for all replicas", () => {
            const a: VectorClock = { A: 1, B: 5 };
            const b: VectorClock = { A: 3, C: 2 };

            expect(mergeClocks(a, b)).toEqual({
                A: 3,
                B: 5,
                C: 2,
            });
        });

        it("works with empty clocks", () => {
            expect(mergeClocks({}, {})).toEqual({});
            expect(mergeClocks({ A: 1 }, {})).toEqual({ A: 1 });
            expect(mergeClocks({}, { B: 2 })).toEqual({ B: 2 });
        });

        it("is commutative", () => {
            const a: VectorClock = { A: 2, B: 1 };
            const b: VectorClock = { A: 1, C: 5 };

            expect(mergeClocks(a, b)).toEqual(mergeClocks(b, a));
        });
    });

    describe("compareClocks", () => {
        it("returns equal for identical clocks", () => {
            expect(compareClocks({ A: 1, B: 2 }, { A: 1, B: 2 })).toBe("equal");
        });

        it("returns equal when missing replicas are equivalent to zero", () => {
            expect(compareClocks({}, { A: 0 })).toBe("equal");
            expect(compareClocks({ A: 1 }, { A: 1, B: 0 })).toBe("equal");
        });

        it("returns before when left is causally earlier", () => {
            expect(compareClocks({ A: 1 }, { A: 2 })).toBe("before");
            expect(compareClocks({ A: 1, B: 2 }, { A: 1, B: 3 })).toBe("before");
            expect(compareClocks({ A: 1 }, { A: 1, B: 1 })).toBe("before");
        });

        it("returns after when left is causally later", () => {
            expect(compareClocks({ A: 3 }, { A: 2 })).toBe("after");
            expect(compareClocks({ A: 1, B: 4 }, { A: 1, B: 3 })).toBe("after");
            expect(compareClocks({ A: 1, B: 1 }, { A: 1 })).toBe("after");
        });

        it("returns concurrent when clocks are incomparable", () => {
            expect(compareClocks({ A: 2, B: 1 }, { A: 1, B: 2 })).toBe("concurrent");
            expect(compareClocks({ A: 3, C: 1 }, { A: 2, B: 5 })).toBe("concurrent");
        });
    });

    describe("createClockState", () => {
        it("creates initial state for replica", () => {
            expect(createClockState("A")).toEqual({
                replicaId: "A",
                clock: {},
                counter: 0,
            });
        });
    });

    describe("issueClock", () => {
        it("increments local counter and local clock component", () => {
            const state: ClockState = {
                replicaId: "A",
                clock: { A: 2, B: 5 },
                counter: 2,
            };

            const issued = issueClock(state);

            expect(issued.counter).toBe(3);
            expect(issued.clock).toEqual({ A: 3, B: 5 });
            expect(issued.state).toEqual({
                replicaId: "A",
                clock: { A: 3, B: 5 },
                counter: 3,
            });
        });

        it("does not mutate original state", () => {
            const state: ClockState = {
                replicaId: "A",
                clock: { A: 1 },
                counter: 1,
            };

            const issued = issueClock(state);

            expect(state).toEqual({
                replicaId: "A",
                clock: { A: 1 },
                counter: 1,
            });

            expect(issued.state).not.toBe(state);
            expect(issued.clock).not.toBe(state.clock);
        });

        it("starts local component from 1 when missing", () => {
            const state: ClockState = {
                replicaId: "A",
                clock: { B: 4 },
                counter: 0,
            };

            const issued = issueClock(state);

            expect(issued.clock).toEqual({ A: 1, B: 4 });
            expect(issued.counter).toBe(1);
        });
    });

    describe("observeClock", () => {
        it("merges observed clock into local knowledge", () => {
            const state: ClockState = {
                replicaId: "A",
                clock: { A: 2, B: 1 },
                counter: 2,
            };

            const next = observeClock(state, { A: 1, B: 5, C: 3 });

            expect(next).toEqual({
                replicaId: "A",
                clock: { A: 2, B: 5, C: 3 },
                counter: 2,
            });
        });

        it("bumps local counter if observed clock knows a later local event", () => {
            const state: ClockState = {
                replicaId: "A",
                clock: { A: 2, B: 1 },
                counter: 2,
            };

            const next = observeClock(state, { A: 7, B: 1 });

            expect(next).toEqual({
                replicaId: "A",
                clock: { A: 7, B: 1 },
                counter: 7,
            });
        });

        it("does not decrease local counter", () => {
            const state: ClockState = {
                replicaId: "A",
                clock: { A: 5, B: 2 },
                counter: 5,
            };

            const next = observeClock(state, { A: 3, B: 10 });

            expect(next).toEqual({
                replicaId: "A",
                clock: { A: 5, B: 10 },
                counter: 5,
            });
        });

        it("works with empty observed clock", () => {
            const state: ClockState = {
                replicaId: "A",
                clock: { A: 2 },
                counter: 2,
            };

            expect(observeClock(state, {})).toEqual({
                replicaId: "A",
                clock: { A: 2 },
                counter: 2,
            });
        });
    });
});