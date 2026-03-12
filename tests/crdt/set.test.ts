import { describe, it, expect } from "vitest";

import {
    addSetValue,
    compareSetAddVersions,
    compareSetRemoveVersions,
    createSetState,
    deduplicateSetAdds,
    deduplicateSetRemoves,
    getLiveAdditionsForValue,
    getObservedAddTagsForValue,
    getPresentSetValues,
    getRemovedTagsForValue,
    hasSetValue,
    mergeSetStates,
    removeSetValue,
    type SetAddVersion,
    type SetRemoveInput,
    type SetRemoveVersion,
    type SetState,
    type SetValueAdapter,
} from "../../src/crdt/set";

type TestValue = string;

const adapter: SetValueAdapter<TestValue> = {
    equals(left, right) {
        return left === right;
    },
    compare(left, right) {
        return left < right ? -1 : left > right ? 1 : 0;
    },
};

function add(
    value: string,
    tag: string,
    replicaId: string,
    clock: Record<string, number>,
): SetAddVersion<string> {
    return {
        value,
        tag,
        replicaId,
        clock,
    };
}

function removeInput(
    value: string,
    opId: string,
    replicaId: string,
    clock: Record<string, number>,
): SetRemoveInput<string> {
    return {
        value,
        opId,
        replicaId,
        clock,
    };
}

function removeVersion(
    value: string,
    opId: string,
    replicaId: string,
    clock: Record<string, number>,
    removedTags: string[],
): SetRemoveVersion<string> {
    return {
        value,
        opId,
        replicaId,
        clock,
        removedTags,
    };
}

describe("crdt/set", () => {
    describe("createSetState", () => {
        it("creates empty set state", () => {
            expect(createSetState<string>()).toEqual({
                adds: [],
                removes: [],
            });
        });
    });

    describe("compareSetAddVersions", () => {
        it("returns 0 for identical tag", () => {
            const a = add("x", "A:1", "A", { A: 1 });
            const b = add("x", "A:1", "A", { A: 99 });

            expect(compareSetAddVersions(a, b)).toBe(0);
        });

        it("uses replicaId as first ordering key", () => {
            const a = add("x", "A:1", "A", { A: 1 });
            const b = add("x", "B:1", "B", { B: 1 });

            expect(compareSetAddVersions(a, b)).toBeLessThan(0);
            expect(compareSetAddVersions(b, a)).toBeGreaterThan(0);
        });

        it("uses tag as second ordering key", () => {
            const a = add("x", "A:1", "A", { A: 1 });
            const b = add("x", "A:2", "A", { A: 2 });

            expect(compareSetAddVersions(a, b)).toBeLessThan(0);
            expect(compareSetAddVersions(b, a)).toBeGreaterThan(0);
        });
    });

    describe("compareSetRemoveVersions", () => {
        it("returns 0 for identical opId", () => {
            const a = removeVersion("x", "A:1", "A", { A: 1 }, ["A:0"]);
            const b = removeVersion("x", "A:1", "A", { A: 9 }, ["A:7"]);

            expect(compareSetRemoveVersions(a, b)).toBe(0);
        });

        it("uses replicaId as first ordering key", () => {
            const a = removeVersion("x", "A:1", "A", { A: 1 }, []);
            const b = removeVersion("x", "B:1", "B", { B: 1 }, []);

            expect(compareSetRemoveVersions(a, b)).toBeLessThan(0);
            expect(compareSetRemoveVersions(b, a)).toBeGreaterThan(0);
        });

        it("uses opId as second ordering key", () => {
            const a = removeVersion("x", "A:1", "A", { A: 1 }, []);
            const b = removeVersion("x", "A:2", "A", { A: 2 }, []);

            expect(compareSetRemoveVersions(a, b)).toBeLessThan(0);
            expect(compareSetRemoveVersions(b, a)).toBeGreaterThan(0);
        });
    });

    describe("deduplicateSetAdds", () => {
        it("removes duplicate tags", () => {
            const adds = [
                add("x", "A:1", "A", { A: 1 }),
                add("x", "A:1", "A", { A: 1 }),
                add("y", "B:1", "B", { B: 1 }),
            ];

            expect(deduplicateSetAdds(adds)).toEqual([
                add("x", "A:1", "A", { A: 1 }),
                add("y", "B:1", "B", { B: 1 }),
            ]);
        });

        it("returns deterministically sorted adds", () => {
            const adds = [
                add("y", "B:1", "B", { B: 1 }),
                add("x", "A:1", "A", { A: 1 }),
            ];

            expect(deduplicateSetAdds(adds)).toEqual([
                add("x", "A:1", "A", { A: 1 }),
                add("y", "B:1", "B", { B: 1 }),
            ]);
        });
    });

    describe("deduplicateSetRemoves", () => {
        it("removes duplicate remove opIds", () => {
            const removes = [
                removeVersion("x", "A:2", "A", { A: 2 }, ["A:1"]),
                removeVersion("x", "A:2", "A", { A: 2 }, ["A:1"]),
                removeVersion("y", "B:2", "B", { B: 2 }, ["B:1"]),
            ];

            expect(deduplicateSetRemoves(removes)).toEqual([
                removeVersion("x", "A:2", "A", { A: 2 }, ["A:1"]),
                removeVersion("y", "B:2", "B", { B: 2 }, ["B:1"]),
            ]);
        });

        it("returns deterministically sorted removes", () => {
            const removes = [
                removeVersion("y", "B:2", "B", { B: 2 }, ["B:1"]),
                removeVersion("x", "A:2", "A", { A: 2 }, ["A:1"]),
            ];

            expect(deduplicateSetRemoves(removes)).toEqual([
                removeVersion("x", "A:2", "A", { A: 2 }, ["A:1"]),
                removeVersion("y", "B:2", "B", { B: 2 }, ["B:1"]),
            ]);
        });
    });

    describe("addSetValue", () => {
        it("adds a new add-version", () => {
            const state = createSetState<string>();

            const next = addSetValue(
                state,
                add("team", "A:1", "A", { A: 1 }),
            );

            expect(next).toEqual({
                adds: [add("team", "A:1", "A", { A: 1 })],
                removes: [],
            });
        });

        it("deduplicates duplicate add tags", () => {
            let state = createSetState<string>();

            state = addSetValue(state, add("team", "A:1", "A", { A: 1 }));
            state = addSetValue(state, add("team", "A:1", "A", { A: 1 }));

            expect(state.adds).toEqual([
                add("team", "A:1", "A", { A: 1 }),
            ]);
        });
    });

    describe("getObservedAddTagsForValue", () => {
        it("returns tags of matching value only", () => {
            const state: SetState<string> = {
                adds: [
                    add("team", "A:1", "A", { A: 1 }),
                    add("team", "B:1", "B", { B: 1 }),
                    add("urgent", "A:2", "A", { A: 2 }),
                ],
                removes: [],
            };

            expect(getObservedAddTagsForValue(state, "team", adapter)).toEqual([
                "A:1",
                "B:1",
            ]);
        });

        it("returns empty array when value has no adds", () => {
            const state = createSetState<string>();

            expect(getObservedAddTagsForValue(state, "team", adapter)).toEqual([]);
        });
    });

    describe("removeSetValue", () => {
        it("records removal of all observed add tags for value", () => {
            const state: SetState<string> = {
                adds: [
                    add("team", "A:1", "A", { A: 1 }),
                    add("team", "B:1", "B", { B: 1 }),
                    add("urgent", "A:2", "A", { A: 2 }),
                ],
                removes: [],
            };

            const next = removeSetValue(
                state,
                removeInput("team", "A:3", "A", { A: 3 }),
                adapter,
            );

            expect(next.removes).toEqual([
                removeVersion("team", "A:3", "A", { A: 3 }, ["A:1", "B:1"]),
            ]);
        });

        it("creates remove record with empty removedTags when nothing was observed", () => {
            const state = createSetState<string>();

            const next = removeSetValue(
                state,
                removeInput("team", "A:1", "A", { A: 1 }),
                adapter,
            );

            expect(next.removes).toEqual([
                removeVersion("team", "A:1", "A", { A: 1 }, []),
            ]);
        });

        it("deduplicates remove records by opId", () => {
            let state: SetState<string> = {
                adds: [add("team", "A:1", "A", { A: 1 })],
                removes: [],
            };

            state = removeSetValue(
                state,
                removeInput("team", "A:2", "A", { A: 2 }),
                adapter,
            );

            state = removeSetValue(
                state,
                removeInput("team", "A:2", "A", { A: 2 }),
                adapter,
            );

            expect(state.removes).toEqual([
                removeVersion("team", "A:2", "A", { A: 2 }, ["A:1"]),
            ]);
        });
    });

    describe("mergeSetStates", () => {
        it("unions and deduplicates adds and removes", () => {
            const left: SetState<string> = {
                adds: [
                    add("team", "A:1", "A", { A: 1 }),
                ],
                removes: [
                    removeVersion("team", "A:2", "A", { A: 2 }, ["A:1"]),
                ],
            };

            const right: SetState<string> = {
                adds: [
                    add("urgent", "B:1", "B", { B: 1 }),
                    add("team", "A:1", "A", { A: 1 }),
                ],
                removes: [
                    removeVersion("team", "A:2", "A", { A: 2 }, ["A:1"]),
                    removeVersion("urgent", "B:2", "B", { B: 2 }, ["B:1"]),
                ],
            };

            expect(mergeSetStates(left, right)).toEqual({
                adds: [
                    add("team", "A:1", "A", { A: 1 }),
                    add("urgent", "B:1", "B", { B: 1 }),
                ],
                removes: [
                    removeVersion("team", "A:2", "A", { A: 2 }, ["A:1"]),
                    removeVersion("urgent", "B:2", "B", { B: 2 }, ["B:1"]),
                ],
            });
        });

        it("is commutative", () => {
            const left: SetState<string> = {
                adds: [add("team", "A:1", "A", { A: 1 })],
                removes: [],
            };

            const right: SetState<string> = {
                adds: [add("urgent", "B:1", "B", { B: 1 })],
                removes: [],
            };

            expect(mergeSetStates(left, right)).toEqual(
                mergeSetStates(right, left),
            );
        });
    });

    describe("getRemovedTagsForValue", () => {
        it("returns removed tags only for matching value", () => {
            const state: SetState<string> = {
                adds: [],
                removes: [
                    removeVersion("team", "A:2", "A", { A: 2 }, ["A:1", "B:1"]),
                    removeVersion("urgent", "B:2", "B", { B: 2 }, ["B:1"]),
                ],
            };

            expect([...getRemovedTagsForValue(state, "team", adapter)].sort()).toEqual([
                "A:1",
                "B:1",
            ]);
        });

        it("returns empty set when value was not removed", () => {
            const state = createSetState<string>();

            expect([...getRemovedTagsForValue(state, "team", adapter)]).toEqual([]);
        });
    });

    describe("getLiveAdditionsForValue", () => {
        it("returns only live adds for value", () => {
            const state: SetState<string> = {
                adds: [
                    add("team", "A:1", "A", { A: 1 }),
                    add("team", "B:1", "B", { B: 1 }),
                    add("urgent", "A:2", "A", { A: 2 }),
                ],
                removes: [
                    removeVersion("team", "A:3", "A", { A: 3 }, ["A:1"]),
                ],
            };

            expect(getLiveAdditionsForValue(state, "team", adapter)).toEqual([
                add("team", "B:1", "B", { B: 1 }),
            ]);
        });

        it("returns empty array when all adds are removed", () => {
            const state: SetState<string> = {
                adds: [
                    add("team", "A:1", "A", { A: 1 }),
                ],
                removes: [
                    removeVersion("team", "A:2", "A", { A: 2 }, ["A:1"]),
                ],
            };

            expect(getLiveAdditionsForValue(state, "team", adapter)).toEqual([]);
        });
    });

    describe("hasSetValue", () => {
        it("returns true when at least one live add exists", () => {
            const state: SetState<string> = {
                adds: [add("team", "A:1", "A", { A: 1 })],
                removes: [],
            };

            expect(hasSetValue(state, "team", adapter)).toBe(true);
        });

        it("returns false when all adds are removed", () => {
            const state: SetState<string> = {
                adds: [add("team", "A:1", "A", { A: 1 })],
                removes: [
                    removeVersion("team", "A:2", "A", { A: 2 }, ["A:1"]),
                ],
            };

            expect(hasSetValue(state, "team", adapter)).toBe(false);
        });

        it("returns false when value was never added", () => {
            const state = createSetState<string>();

            expect(hasSetValue(state, "team", adapter)).toBe(false);
        });
    });

    describe("getPresentSetValues", () => {
        it("returns only present values with their live tags", () => {
            const state: SetState<string> = {
                adds: [
                    add("team", "A:1", "A", { A: 1 }),
                    add("team", "B:1", "B", { B: 1 }),
                    add("urgent", "A:2", "A", { A: 2 }),
                ],
                removes: [
                    removeVersion("team", "A:3", "A", { A: 3 }, ["A:1"]),
                ],
            };

            expect(getPresentSetValues(state, adapter)).toEqual([
                {
                    value: "team",
                    liveTags: ["B:1"],
                },
                {
                    value: "urgent",
                    liveTags: ["A:2"],
                },
            ]);
        });

        it("sorts values using adapter.compare when provided", () => {
            const state: SetState<string> = {
                adds: [
                    add("zeta", "A:1", "A", { A: 1 }),
                    add("alpha", "A:2", "A", { A: 2 }),
                ],
                removes: [],
            };

            expect(getPresentSetValues(state, adapter)).toEqual([
                {
                    value: "alpha",
                    liveTags: ["A:2"],
                },
                {
                    value: "zeta",
                    liveTags: ["A:1"],
                },
            ]);
        });

        it("returns each value only once even if it has multiple live adds", () => {
            const state: SetState<string> = {
                adds: [
                    add("team", "A:1", "A", { A: 1 }),
                    add("team", "B:1", "B", { B: 1 }),
                ],
                removes: [],
            };

            expect(getPresentSetValues(state, adapter)).toEqual([
                {
                    value: "team",
                    liveTags: ["A:1", "B:1"],
                },
            ]);
        });

        it("returns empty array when no values are present", () => {
            const state: SetState<string> = {
                adds: [add("team", "A:1", "A", { A: 1 })],
                removes: [
                    removeVersion("team", "A:2", "A", { A: 2 }, ["A:1"]),
                ],
            };

            expect(getPresentSetValues(state, adapter)).toEqual([]);
        });
    });
});