import { describe, it, expect } from "vitest";

import {
    compareClocks,
    createReplicaClockState,
    getClockValue,
    tickClock,
    mergeClocks,
    acceptClock,
    setClockValue,
    type ReplicaClockState,
    type VectorClock, PartialOrderClockRelation,
} from "../../src/clock/clock";

describe("clock/clock", () => {

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
            expect(compareClocks({ A: 1, B: 2 }, { A: 1, B: 2 })).toBe(PartialOrderClockRelation.EQUAL);
        });

        it("returns equal when missing replicas are equivalent to zero", () => {
            expect(compareClocks({}, { A: 0 })).toBe(PartialOrderClockRelation.EQUAL);
            expect(compareClocks({ A: 1 }, { A: 1, B: 0 })).toBe(PartialOrderClockRelation.EQUAL);
        });

        it("returns before when left is causally earlier", () => {
            expect(compareClocks({ A: 1 }, { A: 2 })).toBe(PartialOrderClockRelation.BEFORE);
            expect(compareClocks({ A: 1, B: 2 }, { A: 1, B: 3 })).toBe(PartialOrderClockRelation.BEFORE);
            expect(compareClocks({ A: 1 }, { A: 1, B: 1 })).toBe(PartialOrderClockRelation.BEFORE);
        });

        it("returns after when left is causally later", () => {
            expect(compareClocks({ A: 3 }, { A: 2 })).toBe(PartialOrderClockRelation.AFTER);
            expect(compareClocks({ A: 1, B: 4 }, { A: 1, B: 3 })).toBe(PartialOrderClockRelation.AFTER);
            expect(compareClocks({ A: 1, B: 1 }, { A: 1 })).toBe(PartialOrderClockRelation.AFTER);
        });

        it("returns concurrent when clocks are incomparable", () => {
            expect(compareClocks({ A: 2, B: 1 }, { A: 1, B: 2 })).toBe(PartialOrderClockRelation.CONCURRENT);
            expect(compareClocks({ A: 3, C: 1 }, { A: 2, B: 5 })).toBe(PartialOrderClockRelation.CONCURRENT);
        });
    });

    describe("createClockState", () => {
        it("creates initial state for replica", () => {
            expect(createReplicaClockState("A")).toEqual({
                replicaId: "A",
                clock: {},
                counter: 0,
            });
        });
    });

    describe("issueClock", () => {
        it("increments local counter and local clock component", () => {
            const state: ReplicaClockState = {
                replicaId: "A",
                clock: { A: 2, B: 5 },
                counter: 2,
            };

            const issued = tickClock(state);

            expect(issued.state.counter).toBe(3);
            expect(issued.state.clock).toEqual({ A: 3, B: 5 });
            expect(issued.state).toEqual({
                replicaId: "A",
                clock: { A: 3, B: 5 },
                counter: 3,
            });
        });

        it("does not mutate original state", () => {
            const state: ReplicaClockState = {
                replicaId: "A",
                clock: { A: 1 },
                counter: 1,
            };

            const issued = tickClock(state);

            expect(state).toEqual({
                replicaId: "A",
                clock: { A: 1 },
                counter: 1,
            });

            expect(issued.state).not.toBe(state);
            expect(issued.state.clock).not.toBe(state.clock);
        });

        it("starts local component from 1 when missing", () => {
            const state: ReplicaClockState = {
                replicaId: "A",
                clock: { B: 4 },
                counter: 0,
            };

            const issued = tickClock(state);

            expect(issued.state.clock).toEqual({ A: 1, B: 4 });
            expect(issued.state.counter).toBe(1);
        });
    });

    describe("observeClock", () => {
        it("merges observed clock into local knowledge", () => {
            const state: ReplicaClockState = {
                replicaId: "A",
                clock: { A: 2, B: 1 },
                counter: 2,
            };

            const next = acceptClock(state, { A: 1, B: 5, C: 3 });

            expect(next).toEqual({
                replicaId: "A",
                clock: { A: 2, B: 5, C: 3 },
                counter: 2,
            });
        });

        it("bumps local counter if observed clock knows a later local event", () => {
            const state: ReplicaClockState = {
                replicaId: "A",
                clock: { A: 2, B: 1 },
                counter: 2,
            };

            const next = acceptClock(state, { A: 7, B: 1 });

            expect(next).toEqual({
                replicaId: "A",
                clock: { A: 7, B: 1 },
                counter: 7,
            });
        });

        it("does not decrease local counter", () => {
            const state: ReplicaClockState = {
                replicaId: "A",
                clock: { A: 5, B: 2 },
                counter: 5,
            };

            const next = acceptClock(state, { A: 3, B: 10 });

            expect(next).toEqual({
                replicaId: "A",
                clock: { A: 5, B: 10 },
                counter: 5,
            });
        });

        it("works with empty observed clock", () => {
            const state: ReplicaClockState = {
                replicaId: "A",
                clock: { A: 2 },
                counter: 2,
            };

            expect(acceptClock(state, {})).toEqual({
                replicaId: "A",
                clock: { A: 2 },
                counter: 2,
            });
        });
    });
});