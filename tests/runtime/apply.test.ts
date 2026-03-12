import {describe, expect, it} from "vitest";

import type {Action} from "../../src/ops/action";
import type {Operation} from "../../src/ops/operation";

import {
    applyActionToRoot,
    type ApplyContext,
    type ApplyMetadata,
    applyOperationToRoot,
    createArrayElementVersionFromMetadata,
    createLeafNodeFromValue,
    createMapEntryVersionFromMetadata,
    createObjectSlotVersionFromMetadata,
    createRegisterVersionFromMetadata,
    isRefValue,
} from "../../src/runtime/apply";

import {
    createObjectNodeState,
    isArrayNodeState,
    isMapNodeState,
    isObjectNodeState,
    isPrimitiveNodeState,
    isRefNodeState,
    isSetNodeState,
    NodeState,
} from "../../src/crdt/state";

import {getObjectField} from "../../src/crdt/object";
import {getMapEntry} from "../../src/crdt/map";
import {getPresentSetValues} from "../../src/crdt/set";
import {getVisibleArrayElements} from "../../src/crdt/array";
import {getRegisterView} from "../../src/crdt/register";

const context: ApplyContext = {
    policy: {
        defaultPrimitiveSemantics: "mv",
        defaultRefSemantics: "lww",
    },
};

function metadata(
    opId = "A:1",
    replicaId = "A",
    clock: Record<string, number> = {A: 1},
): ApplyMetadata {
    return {
        opId,
        replicaId,
        clock,
    };
}

function operation(
    action: Action,
    overrides: Partial<Operation> = {},
): Operation {
    return {
        opId: "A:1",
        txId: "A:tx:1",
        objectId: "event-1",
        replicaId: "A",
        clock: {A: 1},
        action,
        ...overrides,
    };
}

describe("runtime/apply", () => {
    describe("helpers", () => {
        it("isRefValue returns true for ref value", () => {
            expect(isRefValue({type: "ref", objectId: "user-1"})).toBe(true);
        });

        it("isRefValue returns false for primitive value", () => {
            expect(isRefValue("hello")).toBe(false);
            expect(isRefValue(42)).toBe(false);
            expect(isRefValue(null)).toBe(false);
        });

        it("createLeafNodeFromValue creates primitive node for primitive value", () => {
            const node = createLeafNodeFromValue("hello", context);

            expect(isPrimitiveNodeState(node)).toBe(true);
            if (!isPrimitiveNodeState(node)) {
                throw new Error("Expected primitive node");
            }

            expect(node.semantics).toBe("mv");
            expect(node.state.versions).toEqual([]);
        });

        it("createLeafNodeFromValue creates ref node for ref value", () => {
            const node = createLeafNodeFromValue(
                {type: "ref", objectId: "user-1"},
                context,
            );

            expect(isRefNodeState(node)).toBe(true);
            if (!isRefNodeState(node)) {
                throw new Error("Expected ref node");
            }

            expect(node.semantics).toBe("lww");
            expect(node.state.versions).toEqual([]);
        });

        it("createRegisterVersionFromMetadata copies metadata into register version", () => {
            expect(
                createRegisterVersionFromMetadata("hello", {
                    opId: "A:1",
                    replicaId: "A",
                    clock: {A: 1},
                    timestamp: "ts",
                }),
            ).toEqual({
                value: "hello",
                opId: "A:1",
                replicaId: "A",
                clock: {A: 1},
                timestamp: "ts",
            });
        });

        it("createObjectSlotVersionFromMetadata copies metadata", () => {
            expect(
                createObjectSlotVersionFromMetadata({
                    opId: "A:1",
                    replicaId: "A",
                    clock: {A: 1},
                    timestamp: "ts",
                }),
            ).toEqual({
                opId: "A:1",
                replicaId: "A",
                clock: {A: 1},
                timestamp: "ts",
            });
        });

        it("createMapEntryVersionFromMetadata copies metadata", () => {
            expect(
                createMapEntryVersionFromMetadata({
                    opId: "A:1",
                    replicaId: "A",
                    clock: {A: 1},
                    timestamp: "ts",
                }),
            ).toEqual({
                opId: "A:1",
                replicaId: "A",
                clock: {A: 1},
                timestamp: "ts",
            });
        });

        it("createArrayElementVersionFromMetadata copies metadata", () => {
            expect(
                createArrayElementVersionFromMetadata({
                    opId: "A:1",
                    replicaId: "A",
                    clock: {A: 1},
                    timestamp: "ts",
                }),
            ).toEqual({
                opId: "A:1",
                replicaId: "A",
                clock: {A: 1},
                timestamp: "ts",
            });
        });
    });

    describe("applyOperationToRoot", () => {
        it("delegates operation action and metadata into applyActionToRoot", () => {
            const root = createObjectNodeState();

            const next = applyOperationToRoot(
                root,
                operation({
                    type: "field.set",
                    path: ["title"],
                    value: "Team Sync",
                }),
                context,
            );

            expect(isObjectNodeState(next)).toBe(true);
            if (!isObjectNodeState(next)) {
                throw new Error("Expected object root");
            }

            const slot = getObjectField(next.state, "title");
            expect(slot?.node).not.toBeNull();

            if (!slot?.node || !isPrimitiveNodeState(slot.node)) {
                throw new Error("Expected primitive child");
            }

            expect(getRegisterView(slot.node.state)).toEqual({
                semantics: "mv",
                values: [
                    {
                        value: "Team Sync",
                        opId: "A:1",
                        replicaId: "A",
                        clock: {A: 1},
                    },
                ],
            });
        });
    });

    describe("field.set", () => {
        it("creates missing primitive leaf and writes value", () => {
            const root = createObjectNodeState();

            const next = applyActionToRoot(
                root,
                {
                    type: "field.set",
                    path: ["title"],
                    value: "Team Sync",
                },
                metadata("A:1", "A", {A: 1}),
                context,
            );

            if (!isObjectNodeState(next)) {
                throw new Error("Expected object root");
            }

            const slot = getObjectField(next.state, "title");
            expect(slot?.slotVersion).toEqual({
                opId: "A:1",
                replicaId: "A",
                clock: {A: 1},
                timestamp: undefined,
            });

            if (!slot?.node || !isPrimitiveNodeState(slot.node)) {
                throw new Error("Expected primitive child node");
            }

            expect(getRegisterView(slot.node.state)).toEqual({
                semantics: "mv",
                values: [
                    {
                        value: "Team Sync",
                        opId: "A:1",
                        replicaId: "A",
                        clock: {A: 1},
                    },
                ],
            });
        });

        it("creates missing ref leaf and writes ref value", () => {
            const root = createObjectNodeState();

            const next = applyActionToRoot(
                root,
                {
                    type: "field.set",
                    path: ["owner"],
                    value: {type: "ref", objectId: "user-1"},
                },
                metadata("A:1", "A", {A: 1}),
                context,
            );

            if (!isObjectNodeState(next)) {
                throw new Error("Expected object root");
            }

            const slot = getObjectField(next.state, "owner");
            if (!slot?.node || !isRefNodeState(slot.node)) {
                throw new Error("Expected ref child node");
            }

            expect(getRegisterView(slot.node.state)).toEqual({
                semantics: "lww",
                winner: {
                    value: {type: "ref", objectId: "user-1"},
                    opId: "A:1",
                    replicaId: "A",
                    clock: {A: 1},
                },
            });
        });

        it("appends a new version to existing primitive leaf", () => {
            let root: NodeState = createObjectNodeState();

            root = applyActionToRoot(
                root,
                {type: "field.set", path: ["title"], value: "A"},
                metadata("A:1", "A", {A: 1}),
                context,
            );

            const next = applyActionToRoot(
                root,
                {type: "field.set", path: ["title"], value: "B"},
                metadata("B:1", "B", {B: 1}),
                context,
            );

            if (!isObjectNodeState(next)) {
                throw new Error("Expected object root");
            }

            const slot = getObjectField(next.state, "title");
            if (!slot?.node || !isPrimitiveNodeState(slot.node)) {
                throw new Error("Expected primitive child node");
            }

            expect(getRegisterView(slot.node.state)).toEqual({
                semantics: "mv",
                values: [
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
            });
        });

        it("throws when writing ref value into existing primitive node", () => {
            let root: NodeState = createObjectNodeState();

            root = applyActionToRoot(
                root,
                {type: "field.set", path: ["title"], value: "A"},
                metadata("A:1", "A", {A: 1}),
                context,
            );

            expect(() =>
                applyActionToRoot(
                    root,
                    {
                        type: "field.set",
                        path: ["title"],
                        value: {type: "ref", objectId: "user-1"},
                    },
                    metadata("A:2", "A", {A: 2}),
                    context,
                ),
            ).toThrow("Cannot write ref value into primitive register");
        });

        it("throws when target existing node is container", () => {
            let root: NodeState = createObjectNodeState();

            root = applyActionToRoot(
                root,
                {type: "node.initObject", path: ["location"]},
                metadata("A:1", "A", {A: 1}),
                context,
            );

            expect(() =>
                applyActionToRoot(
                    root,
                    {
                        type: "field.set",
                        path: ["location"],
                        value: "Room 1",
                    },
                    metadata("A:2", "A", {A: 2}),
                    context,
                ),
            ).toThrow('field.set can only target leaf register nodes');
        });
    });

    describe("field.delete", () => {
        it("tombstones an existing object field", () => {
            let root: NodeState = createObjectNodeState();

            root = applyActionToRoot(
                root,
                {type: "field.set", path: ["title"], value: "Team Sync"},
                metadata("A:1", "A", {A: 1}),
                context,
            );

            const next = applyActionToRoot(
                root,
                {type: "field.delete", path: ["title"]},
                metadata("A:2", "A", {A: 2}),
                context,
            );

            if (!isObjectNodeState(next)) {
                throw new Error("Expected object root");
            }

            expect(getObjectField(next.state, "title")).toEqual({
                node: null,
                slotVersion: {
                    opId: "A:2",
                    replicaId: "A",
                    clock: {A: 2},
                    timestamp: undefined,
                },
            });
        });
    });

    describe("node.init*", () => {
        it("initializes object node in object slot", () => {
            const root = createObjectNodeState();

            const next = applyActionToRoot(
                root,
                {type: "node.initObject", path: ["location"]},
                metadata("A:1", "A", {A: 1}),
                context,
            );

            if (!isObjectNodeState(next)) {
                throw new Error("Expected object root");
            }

            const slot = getObjectField(next.state, "location");
            expect(slot?.slotVersion?.opId).toBe("A:1");
            expect(isObjectNodeState(slot?.node as NodeState)).toBe(true);
        });

        it("initializes map node", () => {
            const root = createObjectNodeState();

            const next = applyActionToRoot(
                root,
                {type: "node.initMap", path: ["metadata"]},
                metadata("A:1", "A", {A: 1}),
                context,
            );

            if (!isObjectNodeState(next)) {
                throw new Error("Expected object root");
            }

            expect(isMapNodeState(getObjectField(next.state, "metadata")?.node as NodeState)).toBe(
                true,
            );
        });

        it("initializes set node", () => {
            const root = createObjectNodeState();

            const next = applyActionToRoot(
                root,
                {type: "node.initSet", path: ["tags"]},
                metadata("A:1", "A", {A: 1}),
                context,
            );

            if (!isObjectNodeState(next)) {
                throw new Error("Expected object root");
            }

            expect(isSetNodeState(getObjectField(next.state, "tags")?.node as NodeState)).toBe(
                true,
            );
        });

        it("initializes array node", () => {
            const root = createObjectNodeState();

            const next = applyActionToRoot(
                root,
                {type: "node.initArray", path: ["attendees"]},
                metadata("A:1", "A", {A: 1}),
                context,
            );

            if (!isObjectNodeState(next)) {
                throw new Error("Expected object root");
            }

            expect(
                isArrayNodeState(getObjectField(next.state, "attendees")?.node as NodeState),
            ).toBe(true);
        });
    });

    describe("map.*", () => {
        it("map.setValue writes primitive entry into map", () => {
            let root: NodeState = createObjectNodeState();

            root = applyActionToRoot(
                root,
                {type: "node.initMap", path: ["metadata"]},
                metadata("A:1", "A", {A: 1}),
                context,
            );

            const next = applyActionToRoot(
                root,
                {
                    type: "map.setValue",
                    path: ["metadata"],
                    key: "color",
                    value: "blue",
                },
                metadata("A:2", "A", {A: 2}),
                context,
            );

            if (!isObjectNodeState(next)) {
                throw new Error("Expected object root");
            }

            const mapNode = getObjectField(next.state, "metadata")?.node;
            if (!mapNode || !isMapNodeState(mapNode)) {
                throw new Error("Expected map node");
            }

            const entry = getMapEntry(mapNode.state, "color");
            expect(entry?.entryVersion?.opId).toBe("A:2");

            if (!entry?.node || !isPrimitiveNodeState(entry.node)) {
                throw new Error("Expected primitive map child");
            }

            expect(getRegisterView(entry.node.state)).toEqual({
                semantics: "mv",
                values: [
                    {
                        value: "blue",
                        opId: "A:2",
                        replicaId: "A",
                        clock: {A: 2},
                    },
                ],
            });
        });

        it("map.initEntry creates container entry", () => {
            let root: NodeState = createObjectNodeState();

            root = applyActionToRoot(
                root,
                {type: "node.initMap", path: ["metadata"]},
                metadata("A:1", "A", {A: 1}),
                context,
            );

            const next = applyActionToRoot(
                root,
                {
                    type: "map.initEntry",
                    path: ["metadata"],
                    key: "nested",
                    nodeKind: "object",
                },
                metadata("A:2", "A", {A: 2}),
                context,
            );

            if (!isObjectNodeState(next)) {
                throw new Error("Expected object root");
            }

            const mapNode = getObjectField(next.state, "metadata")?.node;
            if (!mapNode || !isMapNodeState(mapNode)) {
                throw new Error("Expected map node");
            }

            expect(isObjectNodeState(getMapEntry(mapNode.state, "nested")?.node as NodeState)).toBe(
                true,
            );
        });

        it("map.delete tombstones entry", () => {
            let root: NodeState = createObjectNodeState();

            root = applyActionToRoot(
                root,
                {type: "node.initMap", path: ["metadata"]},
                metadata("A:1", "A", {A: 1}),
                context,
            );

            root = applyActionToRoot(
                root,
                {
                    type: "map.setValue",
                    path: ["metadata"],
                    key: "color",
                    value: "blue",
                },
                metadata("A:2", "A", {A: 2}),
                context,
            );

            const next = applyActionToRoot(
                root,
                {
                    type: "map.delete",
                    path: ["metadata"],
                    key: "color",
                },
                metadata("A:3", "A", {A: 3}),
                context,
            );

            if (!isObjectNodeState(next)) {
                throw new Error("Expected object root");
            }

            const mapNode = getObjectField(next.state, "metadata")?.node;
            if (!mapNode || !isMapNodeState(mapNode)) {
                throw new Error("Expected map node");
            }

            expect(getMapEntry(mapNode.state, "color")).toEqual({
                node: null,
                entryVersion: {
                    opId: "A:3",
                    replicaId: "A",
                    clock: {A: 3},
                    timestamp: undefined,
                },
            });
        });

        it("throws when map.setValue targets non-map node", () => {
            const root = createObjectNodeState();

            expect(() =>
                applyActionToRoot(
                    root,
                    {
                        type: "map.setValue",
                        path: [],
                        key: "color",
                        value: "blue",
                    },
                    metadata("A:1", "A", {A: 1}),
                    context,
                ),
            ).toThrow('map.setValue expects map node, got "object"');
        });
    });

    describe("set.*", () => {
        it("set.add adds value into set", () => {
            let root: NodeState = createObjectNodeState();

            root = applyActionToRoot(
                root,
                {type: "node.initSet", path: ["tags"]},
                metadata("A:1", "A", {A: 1}),
                context,
            );

            const next = applyActionToRoot(
                root,
                {type: "set.add", path: ["tags"], value: "team"},
                metadata("A:2", "A", {A: 2}),
                context,
            );

            if (!isObjectNodeState(next)) {
                throw new Error("Expected object root");
            }

            const setNode = getObjectField(next.state, "tags")?.node;
            if (!setNode || !isSetNodeState(setNode)) {
                throw new Error("Expected set node");
            }

            expect(
                getPresentSetValues(setNode.state, {
                    equals: (l, r) =>
                        JSON.stringify(l) === JSON.stringify(r),
                    compare: (l, r) =>
                        JSON.stringify(l).localeCompare(JSON.stringify(r)),
                }),
            ).toEqual([
                {
                    value: "team",
                    liveTags: ["A:2"],
                },
            ]);
        });

        it("set.remove removes observed set value", () => {
            let root: NodeState = createObjectNodeState();

            root = applyActionToRoot(
                root,
                {type: "node.initSet", path: ["tags"]},
                metadata("A:1", "A", {A: 1}),
                context,
            );

            root = applyActionToRoot(
                root,
                {type: "set.add", path: ["tags"], value: "team"},
                metadata("A:2", "A", {A: 2}),
                context,
            );

            const next = applyActionToRoot(
                root,
                {type: "set.remove", path: ["tags"], value: "team"},
                metadata("A:3", "A", {A: 3}),
                context,
            );

            if (!isObjectNodeState(next)) {
                throw new Error("Expected object root");
            }

            const setNode = getObjectField(next.state, "tags")?.node;
            if (!setNode || !isSetNodeState(setNode)) {
                throw new Error("Expected set node");
            }

            expect(
                getPresentSetValues(setNode.state, {
                    equals: (l, r) =>
                        JSON.stringify(l) === JSON.stringify(r),
                    compare: (l, r) =>
                        JSON.stringify(l).localeCompare(JSON.stringify(r)),
                }),
            ).toEqual([]);
        });

        it("throws when set.add targets non-set node", () => {
            const root = createObjectNodeState();

            expect(() =>
                applyActionToRoot(
                    root,
                    {type: "set.add", path: [], value: "team"},
                    metadata("A:1", "A", {A: 1}),
                    context,
                ),
            ).toThrow('set.add expects set node, got "object"');
        });
    });

    describe("array.*", () => {
        it("array.insert inserts primitive leaf into array", () => {
            let root: NodeState = createObjectNodeState();

            root = applyActionToRoot(
                root,
                {type: "node.initArray", path: ["items"]},
                metadata("A:1", "A", {A: 1}),
                context,
            );

            const next = applyActionToRoot(
                root,
                {
                    type: "array.insert",
                    path: ["items"],
                    index: 0,
                    value: "first",
                },
                metadata("A:2", "A", {A: 2}),
                context,
            );

            if (!isObjectNodeState(next)) {
                throw new Error("Expected object root");
            }

            const arrayNode = getObjectField(next.state, "items")?.node;
            if (!arrayNode || !isArrayNodeState(arrayNode)) {
                throw new Error("Expected array node");
            }

            const visible = getVisibleArrayElements(arrayNode.state);
            expect(visible).toHaveLength(1);
            expect(visible[0]?.elementId).toBe("A:2");

            const child = visible[0]?.node;
            if (!child || !isPrimitiveNodeState(child)) {
                throw new Error("Expected primitive array child");
            }

            expect(getRegisterView(child.state)).toEqual({
                semantics: "mv",
                values: [
                    {
                        value: "first",
                        opId: "A:2",
                        replicaId: "A",
                        clock: {A: 2},
                    },
                ],
            });
        });

        it("array.insert inserts after previous visible element", () => {
            let root: NodeState = createObjectNodeState();

            root = applyActionToRoot(
                root,
                {type: "node.initArray", path: ["items"]},
                metadata("A:1", "A", {A: 1}),
                context,
            );

            root = applyActionToRoot(
                root,
                {
                    type: "array.insert",
                    path: ["items"],
                    index: 0,
                    value: "first",
                },
                metadata("A:2", "A", {A: 2}),
                context,
            );

            const next = applyActionToRoot(
                root,
                {
                    type: "array.insert",
                    path: ["items"],
                    index: 1,
                    value: "second",
                },
                metadata("A:3", "A", {A: 3}),
                context,
            );

            if (!isObjectNodeState(next)) {
                throw new Error("Expected object root");
            }

            const arrayNode = getObjectField(next.state, "items")?.node;
            if (!arrayNode || !isArrayNodeState(arrayNode)) {
                throw new Error("Expected array node");
            }

            const visible = getVisibleArrayElements(arrayNode.state);
            expect(visible.map((item) => item.elementId)).toEqual(["A:2", "A:3"]);
            expect(visible[1]?.afterElementId).toBe("A:2");
        });

        it("array.remove tombstones visible array element", () => {
            let root: NodeState = createObjectNodeState();

            root = applyActionToRoot(
                root,
                {type: "node.initArray", path: ["items"]},
                metadata("A:1", "A", {A: 1}),
                context,
            );

            root = applyActionToRoot(
                root,
                {
                    type: "array.insert",
                    path: ["items"],
                    index: 0,
                    value: "first",
                },
                metadata("A:2", "A", {A: 2}),
                context,
            );

            const next = applyActionToRoot(
                root,
                {
                    type: "array.remove",
                    path: ["items"],
                    index: 0,
                },
                metadata("A:3", "A", {A: 3}),
                context,
            );

            if (!isObjectNodeState(next)) {
                throw new Error("Expected object root");
            }

            const arrayNode = getObjectField(next.state, "items")?.node;
            if (!arrayNode || !isArrayNodeState(arrayNode)) {
                throw new Error("Expected array node");
            }

            expect(getVisibleArrayElements(arrayNode.state)).toEqual([]);
        });

        it("throws for out of bounds array insert after non-existing previous element", () => {
            let root: NodeState = createObjectNodeState();

            root = applyActionToRoot(
                root,
                {type: "node.initArray", path: ["items"]},
                metadata("A:1", "A", {A: 1}),
                context,
            );

            expect(() =>
                applyActionToRoot(
                    root,
                    {
                        type: "array.insert",
                        path: ["items"],
                        index: 2,
                        value: "x",
                    },
                    metadata("A:2", "A", {A: 2}),
                    context,
                ),
            ).toThrow("Cannot insert array element at index 2: index is out of bounds");
        });

        it("throws when array.remove index is out of bounds", () => {
            let root: NodeState = createObjectNodeState();

            root = applyActionToRoot(
                root,
                {type: "node.initArray", path: ["items"]},
                metadata("A:1", "A", {A: 1}),
                context,
            );

            expect(() =>
                applyActionToRoot(
                    root,
                    {
                        type: "array.remove",
                        path: ["items"],
                        index: 0,
                    },
                    metadata("A:2", "A", {A: 2}),
                    context,
                ),
            ).toThrow("Cannot remove array element at index 0: index is out of bounds");
        });
    });

    describe("path traversal and errors", () => {
        it("throws for number segment in traversal path", () => {
            const root = createObjectNodeState();

            expect(() =>
                applyActionToRoot(
                    root,
                    {
                        type: "field.set",
                        path: ["items", 0, "title"],
                        value: "x",
                    },
                    metadata("A:1", "A", {A: 1}),
                    context,
                ),
            ).toThrow("MVP apply.ts only supports string path segments for traversal");
        });

        it("throws when parent path does not resolve", () => {
            const root = createObjectNodeState();

            expect(() =>
                applyActionToRoot(
                    root,
                    {
                        type: "field.set",
                        path: ["location", "room"],
                        value: "A-101",
                    },
                    metadata("A:1", "A", {A: 1}),
                    context,
                ),
            ).toThrow("Path does not resolve to an existing node: location");
        });

        it("throws when traversing through non-container node", () => {
            let root: NodeState = createObjectNodeState();

            root = applyActionToRoot(
                root,
                {
                    type: "field.set",
                    path: ["title"],
                    value: "Team Sync",
                },
                metadata("A:1", "A", {A: 1}),
                context,
            );

            expect(() =>
                applyActionToRoot(
                    root,
                    {
                        type: "field.set",
                        path: ["title", "nested"],
                        value: "x",
                    },
                    metadata("A:2", "A", {A: 2}),
                    context,
                ),
            ).toThrow('Parent path must resolve to object or map. Got "primitive"');
        });

        it("throws when node.init* targets root path", () => {
            const root = createObjectNodeState();

            expect(() =>
                applyActionToRoot(
                    root,
                    {
                        type: "node.initObject",
                        path: [],
                    },
                    metadata("A:1", "A", {A: 1}),
                    context,
                ),
            ).toThrow("Path must not be empty");
        });
    });
});