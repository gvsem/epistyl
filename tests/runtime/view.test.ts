import { describe, it, expect } from "vitest";

import { addRegisterVersion } from "../../src/crdt/register";
import { setObjectField, deleteObjectField } from "../../src/crdt/object";
import { setMapEntry, deleteMapEntry } from "../../src/crdt/map";
import { addSetValue, removeSetValue } from "../../src/crdt/set";
import { insertArrayElement, deleteArrayElement } from "../../src/crdt/array";

import {
    createArrayNodeState,
    createMapNodeState,
    createObjectNodeState,
    createPrimitiveNodeState,
    createRefNodeState,
    createSetNodeState,
    type NodeState,
} from "../../src/crdt/state";

import {
    viewArrayNode,
    viewMapNode,
    viewNode,
    viewObjectNode,
    viewPrimitiveNode,
    viewRefNode,
    viewSetNode,
} from "../../src/runtime/view";

function primitiveMvNode(values: Array<{ value: string | number | boolean | null; opId: string; replicaId: string; clock: Record<string, number> }>): NodeState {
    let node = createPrimitiveNodeState("mv");
    for (const item of values) {
        node = {
            ...node,
            state: addRegisterVersion(node.state, item),
        };
    }
    return node;
}

type RefRegisterInput = {
    value: { type: "ref"; objectId: string | null };
    opId: string;
    replicaId: string;
    clock: Record<string, number>;
};

function primitiveLwwNode(values: Array<{ value: string | number | boolean | null; opId: string; replicaId: string; clock: Record<string, number> }>): NodeState {
    let node = createPrimitiveNodeState("lww");
    for (const item of values) {
        node = {
            ...node,
            state: addRegisterVersion(node.state, item),
        };
    }
    return node;
}

function refLwwNode(values: RefRegisterInput[]): NodeState {
    let node = createRefNodeState("lww");
    for (const item of values) {
        node = {
            ...node,
            state: addRegisterVersion(node.state, item),
        };
    }
    return node;
}

function refMvNode(values: RefRegisterInput[]): NodeState {
    let node = createRefNodeState("mv");
    for (const item of values) {
        node = {
            ...node,
            state: addRegisterVersion(node.state, item),
        };
    }
    return node;
}

describe("runtime/view", () => {
    describe("viewPrimitiveNode", () => {
        it("returns null for empty lww primitive register", () => {
            const node = createPrimitiveNodeState("lww");
            expect(viewPrimitiveNode(node)).toBeNull();
        });

        it("returns lww winner value for primitive register", () => {
            const node = primitiveLwwNode([
                { value: "old", opId: "A:1", replicaId: "A", clock: { A: 1 } },
                { value: "new", opId: "A:2", replicaId: "A", clock: { A: 2 } },
            ]);

            expect(viewPrimitiveNode(node)).toBe("new");
        });

        it("returns mv wrapper for mv primitive register", () => {
            const node = primitiveMvNode([
                { value: "left", opId: "A:1", replicaId: "A", clock: { A: 1 } },
                { value: "right", opId: "B:1", replicaId: "B", clock: { B: 1 } },
            ]);

            expect(viewPrimitiveNode(node)).toEqual({
                kind: "mv",
                values: ["left", "right"],
            });
        });
    });

    describe("viewRefNode", () => {
        it("returns null for empty lww ref register", () => {
            const node = createRefNodeState("lww");
            expect(viewRefNode(node)).toBeNull();
        });

        it("returns lww winner ref value", () => {
            const node = refLwwNode([
                {
                    value: { type: "ref", objectId: "user-1" },
                    opId: "A:1",
                    replicaId: "A",
                    clock: { A: 1 },
                },
                {
                    value: { type: "ref", objectId: "user-2" },
                    opId: "A:2",
                    replicaId: "A",
                    clock: { A: 2 },
                },
            ] as RefRegisterInput[]);

            expect(viewRefNode(node)).toEqual({ type: "ref", objectId: "user-2" });
        });

        it("returns mv wrapper for mv ref register", () => {
            const node = refMvNode([
                {
                    value: { type: "ref", objectId: "user-1" },
                    opId: "A:1",
                    replicaId: "A",
                    clock: { A: 1 },
                },
                {
                    value: { type: "ref", objectId: "user-2" },
                    opId: "B:1",
                    replicaId: "B",
                    clock: { B: 1 },
                },
            ] as RefRegisterInput[]);

            expect(viewRefNode(node)).toEqual({
                kind: "mv",
                values: [
                    { type: "ref", objectId: "user-1" },
                    { type: "ref", objectId: "user-2" },
                ],
            });
        });
    });

    describe("viewObjectNode", () => {
        it("returns empty object for empty object node", () => {
            const node = createObjectNodeState();
            expect(viewObjectNode(node)).toEqual({});
        });

        it("renders visible fields recursively", () => {
            let node = createObjectNodeState();

            node = {
                kind: "object",
                state: setObjectField(
                    node.state,
                    "title",
                    primitiveMvNode([
                        { value: "Team Sync", opId: "A:1", replicaId: "A", clock: { A: 1 } },
                    ]),
                    { opId: "A:2", replicaId: "A", clock: { A: 2 } },
                ),
            };

            node = {
                kind: "object",
                state: setObjectField(
                    node.state,
                    "owner",
                    refLwwNode([
                        {
                            value: { type: "ref", objectId: "user-1" },
                            opId: "A:3",
                            replicaId: "A",
                            clock: { A: 3 },
                        },
                    ]),
                    { opId: "A:4", replicaId: "A", clock: { A: 4 } },
                ),
            };

            expect(viewObjectNode(node)).toEqual({
                owner: { type: "ref", objectId: "user-1" },
                title: {
                    kind: "mv",
                    values: ["Team Sync"],
                },
            });
        });

        it("skips tombstoned fields", () => {
            let node = createObjectNodeState();

            node = {
                kind: "object",
                state: setObjectField(
                    node.state,
                    "title",
                    primitiveMvNode([
                        { value: "Team Sync", opId: "A:1", replicaId: "A", clock: { A: 1 } },
                    ]),
                    { opId: "A:2", replicaId: "A", clock: { A: 2 } },
                ),
            };

            node = {
                kind: "object",
                state: deleteObjectField(
                    node.state,
                    "title",
                    { opId: "A:3", replicaId: "A", clock: { A: 3 } },
                ),
            };

            expect(viewObjectNode(node)).toEqual({});
        });
    });

    describe("viewMapNode", () => {
        it("returns empty object for empty map node", () => {
            const node = createMapNodeState();
            expect(viewMapNode(node)).toEqual({});
        });

        it("renders visible entries recursively", () => {
            let node = createMapNodeState();

            node = {
                kind: "map",
                state: setMapEntry(
                    node.state,
                    "color",
                    primitiveMvNode([
                        { value: "blue", opId: "A:1", replicaId: "A", clock: { A: 1 } },
                    ]),
                    { opId: "A:2", replicaId: "A", clock: { A: 2 } },
                ),
            };

            node = {
                kind: "map",
                state: setMapEntry(
                    node.state,
                    "owner",
                    refLwwNode([
                        {
                            value: { type: "ref", objectId: "user-1" },
                            opId: "A:3",
                            replicaId: "A",
                            clock: { A: 3 },
                        },
                    ]),
                    { opId: "A:4", replicaId: "A", clock: { A: 4 } },
                ),
            };

            expect(viewMapNode(node)).toEqual({
                color: {
                    kind: "mv",
                    values: ["blue"],
                },
                owner: { type: "ref", objectId: "user-1" },
            });
        });

        it("skips tombstoned entries", () => {
            let node = createMapNodeState();

            node = {
                kind: "map",
                state: setMapEntry(
                    node.state,
                    "color",
                    primitiveMvNode([
                        { value: "blue", opId: "A:1", replicaId: "A", clock: { A: 1 } },
                    ]),
                    { opId: "A:2", replicaId: "A", clock: { A: 2 } },
                ),
            };

            node = {
                kind: "map",
                state: deleteMapEntry(
                    node.state,
                    "color",
                    { opId: "A:3", replicaId: "A", clock: { A: 3 } },
                ),
            };

            expect(viewMapNode(node)).toEqual({});
        });
    });

    describe("viewSetNode", () => {
        it("returns empty array for empty set", () => {
            const node = createSetNodeState();
            expect(viewSetNode(node)).toEqual([]);
        });

        it("returns present primitive values sorted", () => {
            let node = createSetNodeState();

            node = {
                kind: "set",
                state: addSetValue(node.state, {
                    value: "zeta",
                    tag: "A:1",
                    replicaId: "A",
                    clock: { A: 1 },
                }),
            };

            node = {
                kind: "set",
                state: addSetValue(node.state, {
                    value: "alpha",
                    tag: "A:2",
                    replicaId: "A",
                    clock: { A: 2 },
                }),
            };

            expect(viewSetNode(node)).toEqual(["alpha", "zeta"]);
        });

        it("returns present ref values", () => {
            let node = createSetNodeState();

            node = {
                kind: "set",
                state: addSetValue(node.state, {
                    value: { type: "ref", objectId: "user-1" },
                    tag: "A:1",
                    replicaId: "A",
                    clock: { A: 1 },
                }),
            };

            expect(viewSetNode(node)).toEqual([
                { type: "ref", objectId: "user-1" },
            ]);
        });

        it("skips removed values", () => {
            let node = createSetNodeState();

            node = {
                kind: "set",
                state: addSetValue(node.state, {
                    value: "team",
                    tag: "A:1",
                    replicaId: "A",
                    clock: { A: 1 },
                }),
            };

            node = {
                kind: "set",
                state: removeSetValue(
                    node.state,
                    {
                        value: "team",
                        opId: "A:2",
                        replicaId: "A",
                        clock: { A: 2 },
                    },
                    {
                        equals: (l, r) => JSON.stringify(l) === JSON.stringify(r),
                        compare: (l, r) => JSON.stringify(l).localeCompare(JSON.stringify(r)),
                    },
                ),
            };

            expect(viewSetNode(node)).toEqual([]);
        });
    });

    describe("viewArrayNode", () => {
        it("returns empty array for empty array node", () => {
            const node = createArrayNodeState();
            expect(viewArrayNode(node)).toEqual([]);
        });

        it("renders visible elements recursively in order", () => {
            let node = createArrayNodeState();

            node = {
                kind: "array",
                state: insertArrayElement(
                    node.state,
                    {
                        elementId: "e1",
                        afterElementId: null,
                        node: primitiveMvNode([
                            { value: "first", opId: "A:1", replicaId: "A", clock: { A: 1 } },
                        ]),
                        insertVersion: { opId: "A:2", replicaId: "A", clock: { A: 2 } },
                        deleteVersion: null,
                    },
                    {
                        mergeNodes(left, _right) {
                            return left;
                        },
                    },
                ),
            };

            node = {
                kind: "array",
                state: insertArrayElement(
                    node.state,
                    {
                        elementId: "e2",
                        afterElementId: "e1",
                        node: refLwwNode([
                            {
                                value: { type: "ref", objectId: "user-1" },
                                opId: "A:3",
                                replicaId: "A",
                                clock: { A: 3 },
                            },
                        ]),
                        insertVersion: { opId: "A:4", replicaId: "A", clock: { A: 4 } },
                        deleteVersion: null,
                    },
                    {
                        mergeNodes(left, _right) {
                            return left;
                        },
                    },
                ),
            };

            expect(viewArrayNode(node)).toEqual([
                {
                    kind: "mv",
                    values: ["first"],
                },
                { type: "ref", objectId: "user-1" },
            ]);
        });

        it("skips deleted array elements", () => {
            let node = createArrayNodeState();

            node = {
                kind: "array",
                state: insertArrayElement(
                    node.state,
                    {
                        elementId: "e1",
                        afterElementId: null,
                        node: primitiveMvNode([
                            { value: "first", opId: "A:1", replicaId: "A", clock: { A: 1 } },
                        ]),
                        insertVersion: { opId: "A:2", replicaId: "A", clock: { A: 2 } },
                        deleteVersion: null,
                    },
                    {
                        mergeNodes(left, _right) {
                            return left;
                        },
                    },
                ),
            };

            node = {
                kind: "array",
                state: deleteArrayElement(
                    node.state,
                    "e1",
                    { opId: "A:3", replicaId: "A", clock: { A: 3 } },
                ),
            };

            expect(viewArrayNode(node)).toEqual([]);
        });
    });

    describe("viewNode", () => {
        it("dispatches primitive node", () => {
            expect(
                viewNode(
                    primitiveMvNode([
                        { value: "hello", opId: "A:1", replicaId: "A", clock: { A: 1 } },
                    ]),
                ),
            ).toEqual({
                kind: "mv",
                values: ["hello"],
            });
        });

        it("dispatches ref node", () => {
            expect(
                viewNode(
                    refLwwNode([
                        {
                            value: { type: "ref", objectId: "user-1" },
                            opId: "A:1",
                            replicaId: "A",
                            clock: { A: 1 },
                        },
                    ]),
                ),
            ).toEqual({ type: "ref", objectId: "user-1" });
        });

        it("dispatches object node", () => {
            const node = createObjectNodeState();
            expect(viewNode(node)).toEqual({});
        });

        it("dispatches map node", () => {
            const node = createMapNodeState();
            expect(viewNode(node)).toEqual({});
        });

        it("dispatches set node", () => {
            const node = createSetNodeState();
            expect(viewNode(node)).toEqual([]);
        });

        it("dispatches array node", () => {
            const node = createArrayNodeState();
            expect(viewNode(node)).toEqual([]);
        });
    });
});