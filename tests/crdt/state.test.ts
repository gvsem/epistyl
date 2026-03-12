import {describe, expect, it} from "vitest";

import {addRegisterVersion} from "../../src/crdt/register";
import {setObjectField} from "../../src/crdt/object";
import {setMapEntry} from "../../src/crdt/map";
import {addSetValue} from "../../src/crdt/set";
import {insertArrayElement} from "../../src/crdt/array";

import {
    assertSameNodeKind,
    createArrayNodeState,
    createMapNodeState,
    createObjectNodeState,
    createPrimitiveNodeState,
    createRefNodeState,
    createSetNodeState,
    isArrayNodeState,
    isContainerNodeState,
    isMapNodeState,
    isObjectNodeState,
    isPrimitiveNodeState,
    isRefNodeState,
    isRegisterNodeState,
    isSetNodeState,
    mergeNodes,
    type NodeState,
} from "../../src/crdt/state";

describe("crdt/state", () => {
    describe("type guards", () => {
        it("recognizes primitive node state", () => {
            const node = createPrimitiveNodeState("mv");

            expect(isPrimitiveNodeState(node)).toBe(true);
            expect(isRefNodeState(node)).toBe(false);
            expect(isRegisterNodeState(node)).toBe(true);
            expect(isContainerNodeState(node)).toBe(false);
        });

        it("recognizes ref node state", () => {
            const node = createRefNodeState("lww");

            expect(isRefNodeState(node)).toBe(true);
            expect(isPrimitiveNodeState(node)).toBe(false);
            expect(isRegisterNodeState(node)).toBe(true);
            expect(isContainerNodeState(node)).toBe(false);
        });

        it("recognizes object node state", () => {
            const node = createObjectNodeState();

            expect(isObjectNodeState(node)).toBe(true);
            expect(isMapNodeState(node)).toBe(false);
            expect(isContainerNodeState(node)).toBe(true);
            expect(isRegisterNodeState(node)).toBe(false);
        });

        it("recognizes map node state", () => {
            const node = createMapNodeState();

            expect(isMapNodeState(node)).toBe(true);
            expect(isSetNodeState(node)).toBe(false);
            expect(isContainerNodeState(node)).toBe(true);
        });

        it("recognizes set node state", () => {
            const node = createSetNodeState();

            expect(isSetNodeState(node)).toBe(true);
            expect(isArrayNodeState(node)).toBe(false);
            expect(isContainerNodeState(node)).toBe(true);
        });

        it("recognizes array node state", () => {
            const node = createArrayNodeState();

            expect(isArrayNodeState(node)).toBe(true);
            expect(isContainerNodeState(node)).toBe(true);
        });
    });

    describe("create*NodeState factories", () => {
        it("creates primitive node state", () => {
            expect(createPrimitiveNodeState("mv")).toEqual({
                kind: "primitive",
                semantics: "mv",
                state: {
                    semantics: "mv",
                    versions: [],
                },
            });
        });

        it("creates ref node state", () => {
            expect(createRefNodeState("lww")).toEqual({
                kind: "ref",
                semantics: "lww",
                state: {
                    semantics: "lww",
                    versions: [],
                },
            });
        });

        it("creates object node state", () => {
            expect(createObjectNodeState()).toEqual({
                kind: "object",
                state: {
                    fields: {},
                },
            });
        });

        it("creates map node state", () => {
            expect(createMapNodeState()).toEqual({
                kind: "map",
                state: {
                    entries: {},
                },
            });
        });

        it("creates set node state", () => {
            expect(createSetNodeState()).toEqual({
                kind: "set",
                state: {
                    adds: [],
                    removes: [],
                },
            });
        });

        it("creates array node state", () => {
            expect(createArrayNodeState()).toEqual({
                kind: "array",
                state: {
                    elements: {},
                },
            });
        });
    });

    describe("assertSameNodeKind", () => {
        it("does not throw for equal kinds", () => {
            expect(() =>
                assertSameNodeKind(
                    createPrimitiveNodeState("mv"),
                    createPrimitiveNodeState("mv"),
                ),
            ).not.toThrow();
        });

        it("throws for different kinds", () => {
            expect(() =>
                assertSameNodeKind(
                    createPrimitiveNodeState("mv"),
                    createObjectNodeState(),
                ),
            ).toThrow("Cannot merge nodes of different kinds");
        });
    });

    describe("mergeNodes", () => {
        it("merges primitive nodes", () => {
            let left = createPrimitiveNodeState("mv");
            let right = createPrimitiveNodeState("mv");

            left = {
                ...left,
                state: addRegisterVersion(left.state, {
                    value: "A",
                    opId: "A:1",
                    replicaId: "A",
                    clock: {A: 1},
                }),
            };

            right = {
                ...right,
                state: addRegisterVersion(right.state, {
                    value: "B",
                    opId: "B:1",
                    replicaId: "B",
                    clock: {B: 1},
                }),
            };

            expect(mergeNodes(left, right)).toEqual({
                kind: "primitive",
                semantics: "mv",
                state: {
                    semantics: "mv",
                    versions: [
                        {
                            value: "A",
                            opId: "A:1",
                            replicaId: "A",
                            clock: {A: 1},
                        },
                        {
                            value: "B",
                            opId: "B:1",
                            replicaId: "B",
                            clock: {B: 1},
                        },
                    ],
                },
            });
        });

        it("throws when primitive semantics differ", () => {
            expect(() =>
                mergeNodes(
                    createPrimitiveNodeState("mv"),
                    createPrimitiveNodeState("lww"),
                ),
            ).toThrow("Cannot merge primitive registers with different semantics");
        });

        it("merges ref nodes", () => {
            let left = createRefNodeState("lww");
            let right = createRefNodeState("lww");

            left = {
                ...left,
                state: addRegisterVersion(left.state, {
                    value: {type: "ref", objectId: "user-1"},
                    opId: "A:1",
                    replicaId: "A",
                    clock: {A: 1},
                }),
            };

            right = {
                ...right,
                state: addRegisterVersion(right.state, {
                    value: {type: "ref", objectId: "user-2"},
                    opId: "B:1",
                    replicaId: "B",
                    clock: {B: 1},
                }),
            };

            const merged = mergeNodes(left, right);

            expect(merged.kind).toBe("ref");
            if (merged.kind !== "ref") {
                throw new Error("Expected ref node");
            }

            expect(merged.semantics).toBe("lww");
            expect(merged.state.versions.length).toBeGreaterThan(0);
        });

        it("throws when ref semantics differ", () => {
            expect(() =>
                mergeNodes(
                    createRefNodeState("mv"),
                    createRefNodeState("lww"),
                ),
            ).toThrow("Cannot merge ref registers with different semantics");
        });

        it("merges object nodes recursively", () => {
            let left = createObjectNodeState();
            let right = createObjectNodeState();

            const leftChild = createPrimitiveNodeState("mv");
            const rightChild = createPrimitiveNodeState("mv");

            const leftChildState = {
                ...leftChild,
                state: addRegisterVersion(leftChild.state, {
                    value: "A",
                    opId: "A:1",
                    replicaId: "A",
                    clock: {A: 1},
                }),
            };

            const rightChildState = {
                ...rightChild,
                state: addRegisterVersion(rightChild.state, {
                    value: "B",
                    opId: "B:1",
                    replicaId: "B",
                    clock: {B: 1},
                }),
            };

            left = {
                kind: "object",
                state: setObjectField(
                    left.state,
                    "title",
                    leftChildState,
                    {
                        opId: "A:2",
                        replicaId: "A",
                        clock: {A: 2},
                    },
                ),
            };

            right = {
                kind: "object",
                state: setObjectField(
                    right.state,
                    "title",
                    rightChildState,
                    {
                        opId: "A:2",
                        replicaId: "A",
                        clock: {A: 2},
                    },
                ),
            };

            const merged = mergeNodes(left, right);

            expect(merged.kind).toBe("object");
            if (merged.kind !== "object") {
                throw new Error("Expected object node");
            }

            expect(merged.state.fields.title?.node).toEqual({
                kind: "primitive",
                semantics: "mv",
                state: {
                    semantics: "mv",
                    versions: [
                        {
                            value: "A",
                            opId: "A:1",
                            replicaId: "A",
                            clock: {A: 1},
                        },
                        {
                            value: "B",
                            opId: "B:1",
                            replicaId: "B",
                            clock: {B: 1},
                        },
                    ],
                },
            });
        });

        it("merges map nodes recursively", () => {
            let left = createMapNodeState();
            let right = createMapNodeState();

            const leftChild = {
                ...createPrimitiveNodeState("mv"),
                state: addRegisterVersion(createPrimitiveNodeState("mv").state, {
                    value: "blue",
                    opId: "A:1",
                    replicaId: "A",
                    clock: {A: 1},
                }),
            };

            const rightChild = {
                ...createPrimitiveNodeState("mv"),
                state: addRegisterVersion(createPrimitiveNodeState("mv").state, {
                    value: "green",
                    opId: "B:1",
                    replicaId: "B",
                    clock: {B: 1},
                }),
            };

            left = {
                kind: "map",
                state: setMapEntry(
                    left.state,
                    "color",
                    leftChild,
                    {
                        opId: "A:2",
                        replicaId: "A",
                        clock: {A: 2},
                    },
                ),
            };

            right = {
                kind: "map",
                state: setMapEntry(
                    right.state,
                    "color",
                    rightChild,
                    {
                        opId: "A:2",
                        replicaId: "A",
                        clock: {A: 2},
                    },
                ),
            };

            const merged = mergeNodes(left, right);

            expect(merged.kind).toBe("map");
            if (merged.kind !== "map") {
                throw new Error("Expected map node");
            }

            expect(merged.state.entries.color?.node).toEqual({
                kind: "primitive",
                semantics: "mv",
                state: {
                    semantics: "mv",
                    versions: [
                        {
                            value: "blue",
                            opId: "A:1",
                            replicaId: "A",
                            clock: {A: 1},
                        },
                        {
                            value: "green",
                            opId: "B:1",
                            replicaId: "B",
                            clock: {B: 1},
                        },
                    ],
                },
            });
        });

        it("merges set nodes", () => {
            let left = createSetNodeState();
            let right = createSetNodeState();

            left = {
                kind: "set",
                state: addSetValue(left.state, {
                    value: "team",
                    tag: "A:1",
                    replicaId: "A",
                    clock: {A: 1},
                }),
            };

            right = {
                kind: "set",
                state: addSetValue(right.state, {
                    value: "urgent",
                    tag: "B:1",
                    replicaId: "B",
                    clock: {B: 1},
                }),
            };

            expect(mergeNodes(left, right)).toEqual({
                kind: "set",
                state: {
                    adds: [
                        {
                            value: "team",
                            tag: "A:1",
                            replicaId: "A",
                            clock: {A: 1},
                        },
                        {
                            value: "urgent",
                            tag: "B:1",
                            replicaId: "B",
                            clock: {B: 1},
                        },
                    ],
                    removes: [],
                },
            });
        });

        it("merges array nodes", () => {
            let left = createArrayNodeState();
            let right = createArrayNodeState();

            const leftChild: NodeState = {
                ...createPrimitiveNodeState("mv"),
                state: addRegisterVersion(createPrimitiveNodeState("mv").state, {
                    value: "A",
                    opId: "A:1",
                    replicaId: "A",
                    clock: {A: 1},
                }),
            };

            const rightChild: NodeState = {
                ...createPrimitiveNodeState("mv"),
                state: addRegisterVersion(createPrimitiveNodeState("mv").state, {
                    value: "B",
                    opId: "B:1",
                    replicaId: "B",
                    clock: {B: 1},
                }),
            };

            left = {
                kind: "array",
                state: insertArrayElement(
                    left.state,
                    {
                        elementId: "e1",
                        afterElementId: null,
                        node: leftChild,
                        insertVersion: {
                            opId: "A:2",
                            replicaId: "A",
                            clock: {A: 2},
                        },
                        deleteVersion: null,
                    },
                    {mergeNodes},
                ),
            };

            right = {
                kind: "array",
                state: insertArrayElement(
                    right.state,
                    {
                        elementId: "e1",
                        afterElementId: null,
                        node: rightChild,
                        insertVersion: {
                            opId: "A:2",
                            replicaId: "A",
                            clock: {A: 2},
                        },
                        deleteVersion: null,
                    },
                    {mergeNodes},
                ),
            };

            const merged = mergeNodes(left, right);

            expect(merged.kind).toBe("array");
            if (merged.kind !== "array") {
                throw new Error("Expected array node");
            }

            expect(merged.state.elements.e1?.node).toEqual({
                kind: "primitive",
                semantics: "mv",
                state: {
                    semantics: "mv",
                    versions: [
                        {
                            value: "A",
                            opId: "A:1",
                            replicaId: "A",
                            clock: {A: 1},
                        },
                        {
                            value: "B",
                            opId: "B:1",
                            replicaId: "B",
                            clock: {B: 1},
                        },
                    ],
                },
            });
        });

        it("throws when node kinds differ", () => {
            expect(() =>
                mergeNodes(
                    createPrimitiveNodeState("mv"),
                    createSetNodeState(),
                ),
            ).toThrow("Cannot merge nodes of different kinds");
        });
    });
});