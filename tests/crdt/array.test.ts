import {describe, expect, it} from "vitest";

import {
    type ArrayElementState,
    type ArrayElementCausalVersionStamp,
    type ArrayNodeAdapter,
    type ArrayState,
    compareArrayElementCausalVersionStamps,
    createArrayElementCausalVersionStamp,
    createArrayState,
    deleteArrayElement,
    findVisibleElementIdAtIndex,
    getArrayElement,
    getVisibleArrayElements,
    insertArrayElement,
    isArrayElementVisible,
    mergeArrayElementStates,
} from "../../src/crdt/array";

type TestNode = {
    value: string;
};

const adapter: ArrayNodeAdapter<TestNode> = {
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
): ArrayElementCausalVersionStamp {
    return {
        opId,
        replicaId,
        clock,
    };
}

function element(
    elementId: string,
    afterElementId: string | null,
    nodeValue: string | null,
    insertVersion: ArrayElementCausalVersionStamp,
    deleteVersion: ArrayElementCausalVersionStamp | null = null,
): ArrayElementState<TestNode> {
    return {
        elementId,
        afterElementId,
        node: nodeValue === null ? null : {value: nodeValue},
        insertVersion,
        deleteVersion,
    };
}

describe("crdt/array", () => {
    describe("createArrayState", () => {
        it("creates an empty array state", () => {
            expect(createArrayState<TestNode>()).toEqual({
                elements: {},
            });
        });
    });

    describe("createArrayElementVersion", () => {
        it("clones the clockSnapshot object", () => {
            const input = version("A:1", "A", {A: 1});
            const created = createArrayElementCausalVersionStamp(input);

            expect(created).toEqual(input);
            expect(created).not.toBe(input);
            expect(created.clock).not.toBe(input.clock);
        });
    });

    describe("compareArrayElementVersions", () => {
        it("returns 0 for identical operationId", () => {
            const a = version("A:1", "A", {A: 1});
            const b = version("A:1", "A", {A: 999});

            expect(compareArrayElementCausalVersionStamps(a, b)).toBe(0);
        });

        it("orders causally earlier version before later version", () => {
            const earlier = version("A:1", "A", {A: 1});
            const later = version("A:2", "A", {A: 2});

            expect(compareArrayElementCausalVersionStamps(earlier, later)).toBeLessThan(0);
            expect(compareArrayElementCausalVersionStamps(later, earlier)).toBeGreaterThan(0);
        });

        it("uses replicaId as tie-breaker for concurrent versions", () => {
            const a = version("A:1", "A", {A: 1});
            const b = version("B:1", "B", {B: 1});

            expect(compareArrayElementCausalVersionStamps(a, b)).toBeLessThan(0);
            expect(compareArrayElementCausalVersionStamps(b, a)).toBeGreaterThan(0);
        });

        it("uses operationId as final tie-breaker when replicaId is the same", () => {
            const a = version("A:1", "A", {A: 1, B: 1});
            const b = version("A:2", "A", {A: 1, B: 1});

            expect(compareArrayElementCausalVersionStamps(a, b)).toBeLessThan(0);
            expect(compareArrayElementCausalVersionStamps(b, a)).toBeGreaterThan(0);
        });
    });

    describe("getArrayElement", () => {
        it("returns existing element by id", () => {
            const state: ArrayState<TestNode> = {
                elements: {
                    e1: element("e1", null, "A", version("A:1", "A", {A: 1})),
                },
            };

            expect(getArrayElement(state, "e1")).toEqual(
                element("e1", null, "A", version("A:1", "A", {A: 1})),
            );
        });

        it("returns null for unknown element id", () => {
            const state = createArrayState<TestNode>();

            expect(getArrayElement(state, "missing")).toBeNull();
        });
    });

    describe("isArrayElementVisible", () => {
        it("returns true when node exists and deleteVersion is null", () => {
            const e = element("e1", null, "A", version("A:1", "A", {A: 1}));

            expect(isArrayElementVisible(e)).toBe(true);
        });

        it("returns false when node is null", () => {
            const e = element("e1", null, null, version("A:1", "A", {A: 1}));

            expect(isArrayElementVisible(e)).toBe(false);
        });

        it("returns false when deleteVersion exists", () => {
            const e = element(
                "e1",
                null,
                "A",
                version("A:1", "A", {A: 1}),
                version("A:2", "A", {A: 2}),
            );

            expect(isArrayElementVisible(e)).toBe(false);
        });
    });

    describe("mergeArrayElementStates", () => {
        it("returns right when left is null", () => {
            const right = element("e1", null, "B", version("B:1", "B", {B: 1}));

            expect(mergeArrayElementStates(null, right, adapter)).toEqual(right);
        });

        it("returns left when right is null", () => {
            const left = element("e1", null, "A", version("A:1", "A", {A: 1}));

            expect(mergeArrayElementStates(left, null, adapter)).toEqual(left);
        });

        it("merges node payload when both sides contain the same element", () => {
            const left = element("e1", null, "left", version("A:1", "A", {A: 1}));
            const right = element("e1", null, "right", version("B:1", "B", {B: 1}));

            const merged = mergeArrayElementStates(left, right, adapter);

            expect(merged).toEqual({
                elementId: "e1",
                afterElementId: null,
                node: {value: "left|right"},
                insertVersion: version("B:1", "B", {B: 1}),
                deleteVersion: null,
            });
        });

        it("keeps the causally later deleteVersion", () => {
            const left = element(
                "e1",
                null,
                "A",
                version("A:1", "A", {A: 1}),
                version("A:2", "A", {A: 2}),
            );

            const right = element(
                "e1",
                null,
                "A",
                version("A:1", "A", {A: 1}),
                version("B:1", "B", {A: 2, B: 1}),
            );

            const merged = mergeArrayElementStates(left, right, adapter);

            expect(merged?.deleteVersion).toEqual(version("B:1", "B", {A: 2, B: 1}));
        });

        it("keeps non-null node when only one side has a node", () => {
            const left = element("e1", null, "A", version("A:1", "A", {A: 1}));
            const right = element("e1", null, null, version("B:1", "B", {B: 1}));

            const merged = mergeArrayElementStates(left, right, adapter);

            expect(merged?.node).toEqual({value: "A"});
        });
    });

    describe("insertArrayElement", () => {
        it("inserts a new element into empty state", () => {
            const state = createArrayState<TestNode>();
            const e1 = element("e1", null, "A", version("A:1", "A", {A: 1}));

            const next = insertArrayElement(state, e1, adapter);

            expect(next.elements.e1).toEqual(e1);
        });

        it("merges with existing element when elementId already exists", () => {
            let state = createArrayState<TestNode>();

            state = insertArrayElement(
                state,
                element("e1", null, "left", version("A:1", "A", {A: 1})),
                adapter,
            );

            state = insertArrayElement(
                state,
                element("e1", null, "right", version("B:1", "B", {B: 1})),
                adapter,
            );

            expect(state.elements.e1).toEqual({
                elementId: "e1",
                afterElementId: null,
                node: {value: "left|right"},
                insertVersion: version("B:1", "B", {B: 1}),
                deleteVersion: null,
            });
        });
    });

    describe("deleteArrayElement", () => {
        it("marks an existing element as deleted", () => {
            let state = createArrayState<TestNode>();

            state = insertArrayElement(
                state,
                element("e1", null, "A", version("A:1", "A", {A: 1})),
                adapter,
            );

            const next = deleteArrayElement(
                state,
                "e1",
                version("A:2", "A", {A: 2}),
            );

            expect(next.elements.e1).toEqual({
                elementId: "e1",
                afterElementId: null,
                node: null,
                insertVersion: version("A:1", "A", {A: 1}),
                deleteVersion: version("A:2", "A", {A: 2}),
            });
        });

        it("keeps the stronger existing deleteVersion", () => {
            const state: ArrayState<TestNode> = {
                elements: {
                    e1: element(
                        "e1",
                        null,
                        "A",
                        version("A:1", "A", {A: 1}),
                        version("A:3", "A", {A: 3}),
                    ),
                },
            };

            const next = deleteArrayElement(
                state,
                "e1",
                version("A:2", "A", {A: 2}),
            );

            expect(next.elements.e1?.deleteVersion).toEqual(
                version("A:3", "A", {A: 3}),
            );
        });

        it("returns unchanged state when element does not exist", () => {
            const state = createArrayState<TestNode>();
            const next = deleteArrayElement(
                state,
                "missing",
                version("A:1", "A", {A: 1}),
            );

            expect(next).toEqual(state);
        });
    });

    describe("getVisibleArrayElements", () => {
        it("returns visible elements in insertion order", () => {
            let state = createArrayState<TestNode>();

            state = insertArrayElement(
                state,
                element("e1", null, "A", version("A:1", "A", {A: 1})),
                adapter,
            );

            state = insertArrayElement(
                state,
                element("e2", "e1", "B", version("A:2", "A", {A: 2})),
                adapter,
            );

            state = insertArrayElement(
                state,
                element("e3", "e2", "C", version("A:3", "A", {A: 3})),
                adapter,
            );

            expect(getVisibleArrayElements(state).map((item) => item.elementId)).toEqual([
                "e1",
                "e2",
                "e3",
            ]);
        });

        it("skips deleted elements", () => {
            let state = createArrayState<TestNode>();

            state = insertArrayElement(
                state,
                element("e1", null, "A", version("A:1", "A", {A: 1})),
                adapter,
            );

            state = insertArrayElement(
                state,
                element("e2", "e1", "B", version("A:2", "A", {A: 2})),
                adapter,
            );

            state = deleteArrayElement(
                state,
                "e1",
                version("A:3", "A", {A: 3}),
            );

            expect(getVisibleArrayElements(state).map((item) => item.elementId)).toEqual([
                "e2",
            ]);
        });

        it("still traverses children of deleted elements", () => {
            let state = createArrayState<TestNode>();

            state = insertArrayElement(
                state,
                element("e1", null, "A", version("A:1", "A", {A: 1})),
                adapter,
            );

            state = insertArrayElement(
                state,
                element("e2", "e1", "B", version("A:2", "A", {A: 2})),
                adapter,
            );

            state = insertArrayElement(
                state,
                element("e3", "e2", "C", version("A:3", "A", {A: 3})),
                adapter,
            );

            state = deleteArrayElement(
                state,
                "e2",
                version("A:4", "A", {A: 4}),
            );

            expect(getVisibleArrayElements(state).map((item) => item.elementId)).toEqual([
                "e1",
                "e3",
            ]);
        });

        it("treats unknown afterElementId as insertion from head", () => {
            let state = createArrayState<TestNode>();

            state = insertArrayElement(
                state,
                element("e1", "missing", "A", version("A:1", "A", {A: 1})),
                adapter,
            );

            state = insertArrayElement(
                state,
                element("e2", null, "B", version("B:1", "B", {B: 1})),
                adapter,
            );

            const ids = getVisibleArrayElements(state).map((item) => item.elementId);

            expect(ids).toEqual(["e1", "e2"]);
        });
    });

    describe("findVisibleElementIdAtIndex", () => {
        it("returns element id for visible index", () => {
            let state = createArrayState<TestNode>();

            state = insertArrayElement(
                state,
                element("e1", null, "A", version("A:1", "A", {A: 1})),
                adapter,
            );

            state = insertArrayElement(
                state,
                element("e2", "e1", "B", version("A:2", "A", {A: 2})),
                adapter,
            );

            expect(findVisibleElementIdAtIndex(state, 0)).toBe("e1");
            expect(findVisibleElementIdAtIndex(state, 1)).toBe("e2");
        });

        it("returns null for negative index", () => {
            const state = createArrayState<TestNode>();

            expect(findVisibleElementIdAtIndex(state, -1)).toBeNull();
        });

        it("returns null for out of bounds index", () => {
            const state = createArrayState<TestNode>();

            expect(findVisibleElementIdAtIndex(state, 0)).toBeNull();
        });
    });
});