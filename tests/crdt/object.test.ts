import {describe, expect, it} from "vitest";

import {
    createObjectState, createObjectVersion,
    deleteObjectField,
    getObjectField,
    hasObjectField,
    listObjectFields, ObjectEntryState,
    type ObjectState, ObjectCausalVersionStamp,
    setObjectField,
} from "../../src/crdt/object";

type TestNode = {
    value: string;
};
function version(
    opId: string,
    replicaId: string,
    clock: Record<string, number>,
): ObjectCausalVersionStamp {
    return {
        opId,
        replicaId,
        clock,
    };
}

function fieldState(
    nodeValue: string | null,
    version: ObjectCausalVersionStamp | null,
): ObjectEntryState<TestNode> {
    return {
        node: nodeValue === null ? null : {value: nodeValue},
        causalVersionStamp: version,
    };
}

describe("crdt/object", () => {
    describe("createObjectState", () => {
        it("creates an empty object state", () => {
            expect(createObjectState<TestNode>()).toEqual({
                items: {},
            });
        });
    });

    describe("createKeyedVersion", () => {
        it("clones the clock object", () => {
            const input = version("A:1", "A", {A: 1});
            const created = createObjectVersion(input);

            expect(created).toEqual(input);
            expect(created).not.toBe(input);
            expect(created.clock).not.toBe(input.clock);
        });
    });

    describe("getObjectField", () => {
        it("returns existing field by name", () => {
            const state: ObjectState<TestNode> = {
                items: {
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
                items: {
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
                items: {
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
                items: {
                    title: {
                        node: {value: "Team Sync"},
                        causalVersionStamp: version("A:1", "A", {A: 1}),
                    },
                },
            });

            expect(state).toEqual({items: {}});
        });

        it("overwrites an existing field", () => {
            const state: ObjectState<TestNode> = {
                items: {
                    title: fieldState("Old", version("A:1", "A", {A: 1})),
                },
            };

            const next = setObjectField(
                state,
                "title",
                {value: "New"},
                version("A:2", "A", {A: 2}),
            );

            expect(next.items.title).toEqual({
                node: {value: "New"},
                causalVersionStamp: version("A:2", "A", {A: 2}),
            });
        });
    });

    describe("deleteObjectField", () => {
        it("creates tombstone for existing field", () => {
            const state: ObjectState<TestNode> = {
                items: {
                    title: fieldState("Team Sync", version("A:1", "A", {A: 1})),
                },
            };

            const next = deleteObjectField(
                state,
                "title",
                version("A:2", "A", {A: 2}),
            );

            expect(next.items.title).toEqual({
                node: null,
                causalVersionStamp: version("A:2", "A", {A: 2}),
            });
        });

        it("creates tombstone even when field did not previously exist", () => {
            const state = createObjectState<TestNode>();

            const next = deleteObjectField(
                state,
                "missing",
                version("A:1", "A", {A: 1}),
            );

            expect(next.items.missing).toEqual({
                node: null,
                causalVersionStamp: version("A:1", "A", {A: 1}),
            });
        });
    });

    describe("listObjectFields", () => {
        it("returns only visible fields sorted lexicographically", () => {
            const state: ObjectState<TestNode> = {
                items: {
                    zeta: fieldState("z", version("A:1", "A", {A: 1})),
                    alpha: fieldState("a", version("A:2", "A", {A: 2})),
                    beta: fieldState(null, version("A:3", "A", {A: 3})),
                },
            };

            expect(listObjectFields(state)).toEqual(["alpha", "zeta"]);
        });

        it("returns empty array when no visible fields exist", () => {
            const state: ObjectState<TestNode> = {
                items: {
                    deleted: fieldState(null, version("A:1", "A", {A: 1})),
                },
            };

            expect(listObjectFields(state)).toEqual([]);
        });
    });
});
