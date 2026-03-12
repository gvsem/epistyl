import {describe, expect, it} from "vitest";

import {
    compareMapEntryVersions,
    createMapEntryVersion,
    createMapState,
    deleteMapEntry,
    getMapEntry,
    hasMapEntry,
    listMapKeys,
    type MapEntryState,
    type MapEntryVersion,
    type MapNodeAdapter,
    type MapState,
    mergeMapEntryStates,
    mergeMapStates,
    setMapEntry,
} from "../../src/crdt/map";

type TestNode = {
    value: string;
};

const adapter: MapNodeAdapter<TestNode> = {
    mergeNodes(left, right) {
        return {
            value: `${left.value}|${right.value}`,
        };
    },
};

function version(
    opId: string,
    replicaId: string,
    clock: Record<string, number>,
): MapEntryVersion {
    return {
        opId,
        replicaId,
        clock,
    };
}

function entry(
    nodeValue: string | null,
    entryVersion: MapEntryVersion | null,
): MapEntryState<TestNode> {
    return {
        node: nodeValue === null ? null : {value: nodeValue},
        entryVersion,
    };
}

describe("crdt/map", () => {
    describe("createMapState", () => {
        it("creates an empty map state", () => {
            expect(createMapState<TestNode>()).toEqual({
                entries: {},
            });
        });
    });

    describe("createMapEntryVersion", () => {
        it("clones the clock object", () => {
            const input = version("A:1", "A", {A: 1});
            const created = createMapEntryVersion(input);

            expect(created).toEqual(input);
            expect(created).not.toBe(input);
            expect(created.clock).not.toBe(input.clock);
        });
    });

    describe("compareMapEntryVersions", () => {
        it("returns 0 for identical opId", () => {
            const a = version("A:1", "A", {A: 1});
            const b = version("A:1", "A", {A: 999});

            expect(compareMapEntryVersions(a, b)).toBe(0);
        });

        it("orders causally earlier version before later version", () => {
            const earlier = version("A:1", "A", {A: 1});
            const later = version("A:2", "A", {A: 2});

            expect(compareMapEntryVersions(earlier, later)).toBeLessThan(0);
            expect(compareMapEntryVersions(later, earlier)).toBeGreaterThan(0);
        });

        it("uses replicaId as tie-breaker for concurrent versions", () => {
            const a = version("A:1", "A", {A: 1});
            const b = version("B:1", "B", {B: 1});

            expect(compareMapEntryVersions(a, b)).toBeLessThan(0);
            expect(compareMapEntryVersions(b, a)).toBeGreaterThan(0);
        });

        it("uses opId as final tie-breaker when replicaId is the same", () => {
            const a = version("A:1", "A", {A: 1, B: 1});
            const b = version("A:2", "A", {A: 1, B: 1});

            expect(compareMapEntryVersions(a, b)).toBeLessThan(0);
            expect(compareMapEntryVersions(b, a)).toBeGreaterThan(0);
        });
    });

    describe("getMapEntry", () => {
        it("returns existing entry by key", () => {
            const state: MapState<TestNode> = {
                entries: {
                    color: entry("blue", version("A:1", "A", {A: 1})),
                },
            };

            expect(getMapEntry(state, "color")).toEqual(
                entry("blue", version("A:1", "A", {A: 1})),
            );
        });

        it("returns null for unknown key", () => {
            const state = createMapState<TestNode>();

            expect(getMapEntry(state, "missing")).toBeNull();
        });
    });

    describe("hasMapEntry", () => {
        it("returns true when entry exists and node is not null", () => {
            const state: MapState<TestNode> = {
                entries: {
                    color: entry("blue", version("A:1", "A", {A: 1})),
                },
            };

            expect(hasMapEntry(state, "color")).toBe(true);
        });

        it("returns false when entry does not exist", () => {
            const state = createMapState<TestNode>();

            expect(hasMapEntry(state, "color")).toBe(false);
        });

        it("returns false for tombstoned entry", () => {
            const state: MapState<TestNode> = {
                entries: {
                    color: entry(null, version("A:2", "A", {A: 2})),
                },
            };

            expect(hasMapEntry(state, "color")).toBe(false);
        });
    });

    describe("setMapEntry", () => {
        it("sets an entry immutably", () => {
            const state = createMapState<TestNode>();

            const next = setMapEntry(
                state,
                "color",
                {value: "blue"},
                version("A:1", "A", {A: 1}),
            );

            expect(next).toEqual({
                entries: {
                    color: {
                        node: {value: "blue"},
                        entryVersion: version("A:1", "A", {A: 1}),
                    },
                },
            });

            expect(state).toEqual({entries: {}});
        });

        it("overwrites an existing key", () => {
            const state: MapState<TestNode> = {
                entries: {
                    color: entry("blue", version("A:1", "A", {A: 1})),
                },
            };

            const next = setMapEntry(
                state,
                "color",
                {value: "green"},
                version("A:2", "A", {A: 2}),
            );

            expect(next.entries.color).toEqual({
                node: {value: "green"},
                entryVersion: version("A:2", "A", {A: 2}),
            });
        });
    });

    describe("deleteMapEntry", () => {
        it("creates tombstone for existing key", () => {
            const state: MapState<TestNode> = {
                entries: {
                    color: entry("blue", version("A:1", "A", {A: 1})),
                },
            };

            const next = deleteMapEntry(
                state,
                "color",
                version("A:2", "A", {A: 2}),
            );

            expect(next.entries.color).toEqual({
                node: null,
                entryVersion: version("A:2", "A", {A: 2}),
            });
        });

        it("creates tombstone even when key did not previously exist", () => {
            const state = createMapState<TestNode>();

            const next = deleteMapEntry(
                state,
                "missing",
                version("A:1", "A", {A: 1}),
            );

            expect(next.entries.missing).toEqual({
                node: null,
                entryVersion: version("A:1", "A", {A: 1}),
            });
        });
    });

    describe("mergeMapEntryStates", () => {
        it("returns right when left is null", () => {
            const right = entry("green", version("B:1", "B", {B: 1}));

            expect(mergeMapEntryStates(null, right, adapter)).toEqual(right);
        });

        it("returns left when right is null", () => {
            const left = entry("blue", version("A:1", "A", {A: 1}));

            expect(mergeMapEntryStates(left, null, adapter)).toEqual(left);
        });

        it("merges nodes when both entry versions are null", () => {
            const left = entry("left", null);
            const right = entry("right", null);

            const merged = mergeMapEntryStates(left, right, adapter);

            expect(merged).toEqual({
                node: {value: "left|right"},
                entryVersion: null,
            });
        });

        it("returns the non-null node when both entry versions are null and one node is missing", () => {
            const left = entry("left", null);
            const right = entry(null, null);

            const merged = mergeMapEntryStates(left, right, adapter);

            expect(merged).toEqual(left);
        });

        it("returns right when left entryVersion is null and right has version", () => {
            const left = entry("left", null);
            const right = entry("right", version("B:1", "B", {B: 1}));

            const merged = mergeMapEntryStates(left, right, adapter);

            expect(merged).toEqual(right);
        });

        it("returns left when right entryVersion is null and left has version", () => {
            const left = entry("left", version("A:1", "A", {A: 1}));
            const right = entry("right", null);

            const merged = mergeMapEntryStates(left, right, adapter);

            expect(merged).toEqual(left);
        });

        it("returns causally later entry state", () => {
            const left = entry("blue", version("A:1", "A", {A: 1}));
            const right = entry("green", version("A:2", "A", {A: 2}));

            const merged = mergeMapEntryStates(left, right, adapter);

            expect(merged).toEqual(right);
        });

        it("returns causally later tombstone entry state", () => {
            const left = entry("blue", version("A:1", "A", {A: 1}));
            const right = entry(null, version("A:2", "A", {A: 2}));

            const merged = mergeMapEntryStates(left, right, adapter);

            expect(merged).toEqual(right);
        });

        it("merges nodes when entry versions compare equal", () => {
            const sameVersion = version("A:1", "A", {A: 1});

            const left = entry("left", sameVersion);
            const right = entry("right", sameVersion);

            const merged = mergeMapEntryStates(left, right, adapter);

            expect(merged).toEqual({
                node: {value: "left|right"},
                entryVersion: version("A:1", "A", {A: 1}),
            });
        });

        it("returns the side with non-null node when entry versions compare equal and one side is tombstoned", () => {
            const sameVersion = version("A:1", "A", {A: 1});

            const left = entry("left", sameVersion);
            const right = entry(null, sameVersion);

            const merged = mergeMapEntryStates(left, right, adapter);

            expect(merged).toEqual(left);
        });
    });

    describe("mergeMapStates", () => {
        it("merges entries by key", () => {
            const left: MapState<TestNode> = {
                entries: {
                    color: entry("blue", version("A:1", "A", {A: 1})),
                },
            };

            const right: MapState<TestNode> = {
                entries: {
                    color: entry("green", version("B:1", "B", {B: 1})),
                    size: entry("large", version("B:2", "B", {B: 2})),
                },
            };

            const merged = mergeMapStates(left, right, adapter);

            expect(merged.entries.color).toEqual({
                node: {value: "green"},
                entryVersion: version("B:1", "B", {B: 1}),
            });

            expect(merged.entries.size).toEqual(
                entry("large", version("B:2", "B", {B: 2})),
            );
        });

        it("is commutative", () => {
            const left: MapState<TestNode> = {
                entries: {
                    color: entry("blue", version("A:1", "A", {A: 1})),
                },
            };

            const right: MapState<TestNode> = {
                entries: {
                    size: entry("large", version("B:1", "B", {B: 1})),
                },
            };

            expect(mergeMapStates(left, right, adapter)).toEqual(
                mergeMapStates(right, left, adapter),
            );
        });
    });

    describe("listMapKeys", () => {
        it("returns only visible keys sorted lexicographically", () => {
            const state: MapState<TestNode> = {
                entries: {
                    zeta: entry("z", version("A:1", "A", {A: 1})),
                    alpha: entry("a", version("A:2", "A", {A: 2})),
                    beta: entry(null, version("A:3", "A", {A: 3})),
                },
            };

            expect(listMapKeys(state)).toEqual(["alpha", "zeta"]);
        });

        it("returns empty array when no visible entries exist", () => {
            const state: MapState<TestNode> = {
                entries: {
                    deleted: entry(null, version("A:1", "A", {A: 1})),
                },
            };

            expect(listMapKeys(state)).toEqual([]);
        });
    });
});