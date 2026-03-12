import {describe, expect, it} from "vitest";

import {
    compareObjectSlotVersions,
    createObjectSlotVersion,
    createObjectState,
    deleteObjectField,
    getObjectField,
    hasObjectField,
    listObjectFields,
    mergeObjectFieldStates,
    mergeObjectStates,
    type ObjectFieldState,
    type ObjectNodeAdapter,
    type ObjectSlotVersion,
    type ObjectState,
    setObjectField,
} from "../../src/crdt/object";

type TestNode = {
    value: string;
};

const adapter: ObjectNodeAdapter<TestNode> = {
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
): ObjectSlotVersion {
    return {
        opId,
        replicaId,
        clock,
    };
}

function fieldState(
    nodeValue: string | null,
    slotVersion: ObjectSlotVersion | null,
): ObjectFieldState<TestNode> {
    return {
        node: nodeValue === null ? null : {value: nodeValue},
        slotVersion,
    };
}

describe("crdt/object", () => {
    describe("createObjectState", () => {
        it("creates an empty object state", () => {
            expect(createObjectState<TestNode>()).toEqual({
                fields: {},
            });
        });
    });

    describe("createObjectSlotVersion", () => {
        it("clones the clock object", () => {
            const input = version("A:1", "A", {A: 1});
            const created = createObjectSlotVersion(input);

            expect(created).toEqual(input);
            expect(created).not.toBe(input);
            expect(created.clock).not.toBe(input.clock);
        });
    });

    describe("compareObjectSlotVersions", () => {
        it("returns 0 for identical opId", () => {
            const a = version("A:1", "A", {A: 1});
            const b = version("A:1", "A", {A: 999});

            expect(compareObjectSlotVersions(a, b)).toBe(0);
        });

        it("orders causally earlier version before later version", () => {
            const earlier = version("A:1", "A", {A: 1});
            const later = version("A:2", "A", {A: 2});

            expect(compareObjectSlotVersions(earlier, later)).toBeLessThan(0);
            expect(compareObjectSlotVersions(later, earlier)).toBeGreaterThan(0);
        });

        it("uses replicaId as tie-breaker for concurrent versions", () => {
            const a = version("A:1", "A", {A: 1});
            const b = version("B:1", "B", {B: 1});

            expect(compareObjectSlotVersions(a, b)).toBeLessThan(0);
            expect(compareObjectSlotVersions(b, a)).toBeGreaterThan(0);
        });

        it("uses opId as final tie-breaker when replicaId is the same", () => {
            const a = version("A:1", "A", {A: 1, B: 1});
            const b = version("A:2", "A", {A: 1, B: 1});

            expect(compareObjectSlotVersions(a, b)).toBeLessThan(0);
            expect(compareObjectSlotVersions(b, a)).toBeGreaterThan(0);
        });
    });

    describe("getObjectField", () => {
        it("returns existing field by name", () => {
            const state: ObjectState<TestNode> = {
                fields: {
                    title: fieldState("Team Sync", version("A:1", "A", {A: 1})),
                },
            };

            expect(getObjectField(state, "title")).toEqual(
                fieldState("Team Sync", version("A:1", "A", {A: 1})),
            );
        });

        it("returns null for unknown field", () => {
            const state = createObjectState<TestNode>();

            expect(getObjectField(state, "missing")).toBeNull();
        });
    });

    describe("hasObjectField", () => {
        it("returns true when field exists and node is not null", () => {
            const state: ObjectState<TestNode> = {
                fields: {
                    title: fieldState("Team Sync", version("A:1", "A", {A: 1})),
                },
            };

            expect(hasObjectField(state, "title")).toBe(true);
        });

        it("returns false when field does not exist", () => {
            const state = createObjectState<TestNode>();

            expect(hasObjectField(state, "title")).toBe(false);
        });

        it("returns false for tombstoned field", () => {
            const state: ObjectState<TestNode> = {
                fields: {
                    title: fieldState(null, version("A:2", "A", {A: 2})),
                },
            };

            expect(hasObjectField(state, "title")).toBe(false);
        });
    });

    describe("setObjectField", () => {
        it("sets a field immutably", () => {
            const state = createObjectState<TestNode>();

            const next = setObjectField(
                state,
                "title",
                {value: "Team Sync"},
                version("A:1", "A", {A: 1}),
            );

            expect(next).toEqual({
                fields: {
                    title: {
                        node: {value: "Team Sync"},
                        slotVersion: version("A:1", "A", {A: 1}),
                    },
                },
            });

            expect(state).toEqual({fields: {}});
        });

        it("overwrites an existing field", () => {
            const state: ObjectState<TestNode> = {
                fields: {
                    title: fieldState("Old", version("A:1", "A", {A: 1})),
                },
            };

            const next = setObjectField(
                state,
                "title",
                {value: "New"},
                version("A:2", "A", {A: 2}),
            );

            expect(next.fields.title).toEqual({
                node: {value: "New"},
                slotVersion: version("A:2", "A", {A: 2}),
            });
        });
    });

    describe("deleteObjectField", () => {
        it("creates tombstone for existing field", () => {
            const state: ObjectState<TestNode> = {
                fields: {
                    title: fieldState("Team Sync", version("A:1", "A", {A: 1})),
                },
            };

            const next = deleteObjectField(
                state,
                "title",
                version("A:2", "A", {A: 2}),
            );

            expect(next.fields.title).toEqual({
                node: null,
                slotVersion: version("A:2", "A", {A: 2}),
            });
        });

        it("creates tombstone even when field did not previously exist", () => {
            const state = createObjectState<TestNode>();

            const next = deleteObjectField(
                state,
                "missing",
                version("A:1", "A", {A: 1}),
            );

            expect(next.fields.missing).toEqual({
                node: null,
                slotVersion: version("A:1", "A", {A: 1}),
            });
        });
    });

    describe("mergeObjectFieldStates", () => {
        it("returns right when left is null", () => {
            const right = fieldState("right", version("B:1", "B", {B: 1}));

            expect(mergeObjectFieldStates(null, right, adapter)).toEqual(right);
        });

        it("returns left when right is null", () => {
            const left = fieldState("left", version("A:1", "A", {A: 1}));

            expect(mergeObjectFieldStates(left, null, adapter)).toEqual(left);
        });

        it("merges nodes when both slot versions are null", () => {
            const left = fieldState("left", null);
            const right = fieldState("right", null);

            const merged = mergeObjectFieldStates(left, right, adapter);

            expect(merged).toEqual({
                node: {value: "left|right"},
                slotVersion: null,
            });
        });

        it("returns the non-null node when both slot versions are null and one node is missing", () => {
            const left = fieldState("left", null);
            const right = fieldState(null, null);

            const merged = mergeObjectFieldStates(left, right, adapter);

            expect(merged).toEqual(left);
        });

        it("returns right when left slotVersion is null and right has version", () => {
            const left = fieldState("left", null);
            const right = fieldState("right", version("B:1", "B", {B: 1}));

            const merged = mergeObjectFieldStates(left, right, adapter);

            expect(merged).toEqual(right);
        });

        it("returns left when right slotVersion is null and left has version", () => {
            const left = fieldState("left", version("A:1", "A", {A: 1}));
            const right = fieldState("right", null);

            const merged = mergeObjectFieldStates(left, right, adapter);

            expect(merged).toEqual(left);
        });

        it("returns causally later field state", () => {
            const left = fieldState("old", version("A:1", "A", {A: 1}));
            const right = fieldState("new", version("A:2", "A", {A: 2}));

            const merged = mergeObjectFieldStates(left, right, adapter);

            expect(merged).toEqual(right);
        });

        it("returns causally later tombstone field state", () => {
            const left = fieldState("value", version("A:1", "A", {A: 1}));
            const right = fieldState(null, version("A:2", "A", {A: 2}));

            const merged = mergeObjectFieldStates(left, right, adapter);

            expect(merged).toEqual(right);
        });

        it("merges nodes when slot versions compare equal", () => {
            const sameVersion = version("A:1", "A", {A: 1});

            const left = fieldState("left", sameVersion);
            const right = fieldState("right", sameVersion);

            const merged = mergeObjectFieldStates(left, right, adapter);

            expect(merged).toEqual({
                node: {value: "left|right"},
                slotVersion: version("A:1", "A", {A: 1}),
            });
        });

        it("returns the side with non-null node when slot versions compare equal and one side is tombstoned", () => {
            const sameVersion = version("A:1", "A", {A: 1});

            const left = fieldState("left", sameVersion);
            const right = fieldState(null, sameVersion);

            const merged = mergeObjectFieldStates(left, right, adapter);

            expect(merged).toEqual(left);
        });
    });

    describe("mergeObjectStates", () => {
        it("merges fields by name", () => {
            const left: ObjectState<TestNode> = {
                fields: {
                    title: fieldState("Team Sync", version("A:1", "A", {A: 1})),
                },
            };

            const right: ObjectState<TestNode> = {
                fields: {
                    title: fieldState("Weekly Team Sync", version("B:1", "B", {B: 1})),
                    room: fieldState("A-101", version("B:2", "B", {B: 2})),
                },
            };

            const merged = mergeObjectStates(left, right, adapter);

            expect(merged.fields.title).toEqual({
                node: {value: "Weekly Team Sync"},
                slotVersion: version("B:1", "B", {B: 1}),
            });

            expect(merged.fields.room).toEqual(
                fieldState("A-101", version("B:2", "B", {B: 2})),
            );
        });

        it("is commutative", () => {
            const left: ObjectState<TestNode> = {
                fields: {
                    title: fieldState("A", version("A:1", "A", {A: 1})),
                },
            };

            const right: ObjectState<TestNode> = {
                fields: {
                    room: fieldState("B", version("B:1", "B", {B: 1})),
                },
            };

            expect(mergeObjectStates(left, right, adapter)).toEqual(
                mergeObjectStates(right, left, adapter),
            );
        });
    });

    describe("listObjectFields", () => {
        it("returns only visible fields sorted lexicographically", () => {
            const state: ObjectState<TestNode> = {
                fields: {
                    zeta: fieldState("z", version("A:1", "A", {A: 1})),
                    alpha: fieldState("a", version("A:2", "A", {A: 2})),
                    beta: fieldState(null, version("A:3", "A", {A: 3})),
                },
            };

            expect(listObjectFields(state)).toEqual(["alpha", "zeta"]);
        });

        it("returns empty array when no visible fields exist", () => {
            const state: ObjectState<TestNode> = {
                fields: {
                    deleted: fieldState(null, version("A:1", "A", {A: 1})),
                },
            };

            expect(listObjectFields(state)).toEqual([]);
        });
    });
});