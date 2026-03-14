import type {
    Action,
    ArrayInsertAction,
    ArrayRemoveAction,
    DeleteFieldAction,
    InitArrayAction,
    InitMapAction,
    InitObjectAction,
    InitSetAction,
    LeafValue,
    MapDeleteAction,
    MapInitEntryAction,
    MapSetValueAction,
    ObjectPath,
    RefValue,
    SetAddAction,
    SetFieldAction,
    SetRemoveAction,
} from "../ops/action";

import type {Operation, OpId} from "../ops/operation";

import type {ReplicaId, VectorClock} from "../core/clock";

import {addRegisterVersion, RegisterSemantics, type RegisterVersion,} from "../crdt/register";

import {deleteObjectField, getObjectField, type ObjectSlotVersion, setObjectField,} from "../crdt/object";

import {deleteMapEntry, getMapEntry, type MapEntryVersion, setMapEntry,} from "../crdt/map";

import {addSetValue, removeSetValue, type SetAddVersion, type SetRemoveInput,} from "../crdt/set";

import {
    type ArrayElementState,
    type ArrayElementVersion,
    deleteArrayElement,
    findVisibleElementIdAtIndex,
    insertArrayElement,
} from "../crdt/array";

import {
    createArrayNodeState,
    createMapNodeState,
    createObjectNodeState,
    createPrimitiveNodeState,
    createRefNodeState,
    createSetNodeState,
    isArrayNodeState,
    isMapNodeState,
    isObjectNodeState,
    isPrimitiveNodeState,
    isRefNodeState,
    isSetNodeState,
    type NodeState,
} from "../crdt/state";

export interface ApplyPolicy {
    defaultPrimitiveSemantics: RegisterSemantics;
    defaultRefSemantics: RegisterSemantics;
}

export interface ApplyContext {
    policy: ApplyPolicy;
}

export interface ApplyMetadata {
    opId: OpId;
    replicaId: ReplicaId;
    clock: VectorClock;
    timestamp?: string;
}

type ContainerInitKind = "object" | "map" | "set" | "array";
type SlotRewriter = (existing: NodeState | null) => NodeState | null;

export function applyOperationToRoot(
    root: NodeState,
    operation: Operation,
    context: ApplyContext,
): NodeState {
    return applyActionToRoot(
        root,
        operation.action,
        {
            opId: operation.opId,
            replicaId: operation.replicaId,
            clock: operation.clock,
            timestamp: operation.timestamp,
        },
        context,
    );
}

export function applyActionToRoot(
    root: NodeState,
    action: Action,
    metadata: ApplyMetadata,
    context: ApplyContext,
): NodeState {
    switch (action.type) {
        case "field.set":
            return applyFieldSet(root, action, metadata, context);

        case "field.delete":
            return applyFieldDelete(root, action, metadata);

        case "map.setValue":
            return applyMapSetValue(root, action, metadata, context);

        case "map.initEntry":
            return applyMapInitEntry(root, action, metadata);

        case "map.delete":
            return applyMapDelete(root, action, metadata);

        case "set.add":
            return applySetAdd(root, action, metadata);

        case "set.remove":
            return applySetRemove(root, action, metadata);

        case "array.insert":
            return applyArrayInsert(root, action, metadata, context);

        case "array.remove":
            return applyArrayRemove(root, action, metadata);

        case "node.initObject":
            return applyNodeInit(root, action, "object", metadata);

        case "node.initMap":
            return applyNodeInit(root, action, "map", metadata);

        case "node.initSet":
            return applyNodeInit(root, action, "set", metadata);

        case "node.initArray":
            return applyNodeInit(root, action, "array", metadata);

        default: {
            const exhaustive: never = action;
            throw new Error(`Unsupported action: ${JSON.stringify(exhaustive)}`);
        }
    }
}

/* ============================================================================
 * Value / version helpers
 * ========================================================================== */

export function isRefValue(value: LeafValue): value is RefValue {
    return (
        typeof value === "object" &&
        value !== null &&
        "type" in value &&
        value.type === "ref"
    );
}

export function createLeafNodeFromValue(
    value: LeafValue,
    context: ApplyContext,
): NodeState {
    return isRefValue(value)
        ? createRefNodeState(context.policy.defaultRefSemantics)
        : createPrimitiveNodeState(context.policy.defaultPrimitiveSemantics);
}

export function createRegisterVersionFromMetadata<T>(
    value: T,
    metadata: ApplyMetadata,
): RegisterVersion<T> {
    return {
        value,
        opId: metadata.opId,
        replicaId: metadata.replicaId,
        clock: {...metadata.clock},
        timestamp: metadata.timestamp,
    };
}

export function createObjectSlotVersionFromMetadata(
    metadata: ApplyMetadata,
): ObjectSlotVersion {
    return {
        opId: metadata.opId,
        replicaId: metadata.replicaId,
        clock: {...metadata.clock},
        timestamp: metadata.timestamp,
    };
}

export function createMapEntryVersionFromMetadata(
    metadata: ApplyMetadata,
): MapEntryVersion {
    return {
        opId: metadata.opId,
        replicaId: metadata.replicaId,
        clock: {...metadata.clock},
        timestamp: metadata.timestamp,
    };
}

export function createArrayElementVersionFromMetadata(
    metadata: ApplyMetadata,
): ArrayElementVersion {
    return {
        opId: metadata.opId,
        replicaId: metadata.replicaId,
        clock: {...metadata.clock},
        timestamp: metadata.timestamp,
    };
}

export function createContainerNode(kind: ContainerInitKind): NodeState {
    switch (kind) {
        case "object":
            return createObjectNodeState();
        case "map":
            return createMapNodeState();
        case "set":
            return createSetNodeState();
        case "array":
            return createArrayNodeState();
    }
}

function replaceObjectChildWithoutSlotRewriteVersion(
    parent: NodeState,
    field: string,
    child: NodeState | null,
): NodeState {
    if (!isObjectNodeState(parent)) {
        throw new Error(
            `replaceObjectChildWithoutSlotRewriteVersion expects object node, got "${parent.kind}"`,
        );
    }

    const existing = getObjectField(parent.state, field);

    if (existing === null) {
        if (child === null) {
            return parent;
        }

        return {
            kind: "object",
            state: {
                fields: {
                    ...parent.state.fields,
                    [field]: {
                        node: child,
                        slotVersion: null,
                    },
                },
            },
        };
    }

    return {
        kind: "object",
        state: {
            fields: {
                ...parent.state.fields,
                [field]: {
                    ...existing,
                    node: child,
                },
            },
        },
    };
}

function replaceMapChildWithoutEntryRewriteVersion(
    parent: NodeState,
    key: string,
    child: NodeState | null,
): NodeState {
    if (!isMapNodeState(parent)) {
        throw new Error(
            `replaceMapChildWithoutEntryRewriteVersion expects map node, got "${parent.kind}"`,
        );
    }

    const existing = getMapEntry(parent.state, key);

    if (existing === null) {
        if (child === null) {
            return parent;
        }

        return {
            kind: "map",
            state: {
                entries: {
                    ...parent.state.entries,
                    [key]: {
                        node: child,
                        entryVersion: null,
                    },
                },
            },
        };
    }

    return {
        kind: "map",
        state: {
            entries: {
                ...parent.state.entries,
                [key]: {
                    ...existing,
                    node: child,
                },
            },
        },
    };
}

function replaceChildInContainerWithoutRewriteVersion(
    container: NodeState,
    segment: string,
    child: NodeState | null,
): NodeState {
    if (isObjectNodeState(container)) {
        return replaceObjectChildWithoutSlotRewriteVersion(
            container,
            segment,
            child,
        );
    }

    if (isMapNodeState(container)) {
        return replaceMapChildWithoutEntryRewriteVersion(
            container,
            segment,
            child,
        );
    }

    throw new Error(
        `Cannot technically rewrite child in node kind "${container.kind}"`,
    );
}

/* ============================================================================
 * Path helpers
 * ========================================================================== */

function assertStringPath(path: ObjectPath): string[] {
    for (const segment of path) {
        if (typeof segment !== "string") {
            throw new Error(
                `MVP apply.ts only supports string path segments for traversal. Got: ${String(
                    segment,
                )}`,
            );
        }
    }

    return path as string[];
}

function splitParentPath(path: ObjectPath): {
    parentPath: string[];
    lastSegment: string;
} {
    const normalized = assertStringPath(path);

    if (normalized.length === 0) {
        throw new Error("Path must not be empty");
    }

    return {
        parentPath: normalized.slice(0, -1),
        lastSegment: normalized[normalized.length - 1]!,
    };
}

function getChildFromContainer(
    container: NodeState,
    segment: string,
): NodeState | null {
    if (isObjectNodeState(container)) {
        const slot = getObjectField(container.state, segment);
        return slot?.node ?? null;
    }

    if (isMapNodeState(container)) {
        const entry = getMapEntry(container.state, segment);
        return entry?.node ?? null;
    }

    throw new Error(
        `Cannot traverse through node kind "${container.kind}" using string segment "${segment}"`,
    );
}

/* ============================================================================
 * Recursive immutable rewrite
 * ========================================================================== */

function rewriteExistingNodeAtPath(
    node: NodeState,
    path: ObjectPath,
    rewriter: (target: NodeState) => NodeState,
): NodeState {
    const normalized = assertStringPath(path);

    if (normalized.length === 0) {
        return rewriter(node);
    }

    const [head, ...tail] = normalized;
    const child = getChildFromContainer(node, head);

    if (child === null) {
        throw new Error(
            `Path does not resolve to an existing node: ${normalized.join(".")}`,
        );
    }

    const rewrittenChild = rewriteExistingNodeAtPath(child, tail, rewriter);

    return replaceChildInContainerWithoutRewriteVersion(
        node,
        head,
        rewrittenChild,
    );
}

function rewriteSlotAtPath(
    root: NodeState,
    path: ObjectPath,
    metadata: ApplyMetadata,
    rewriter: SlotRewriter,
): NodeState {
    const {parentPath, lastSegment} = splitParentPath(path);

    if (parentPath.length === 0) {
        return rewriteChildSlotOnContainer(root, lastSegment, metadata, rewriter);
    }

    return rewriteExistingNodeAtPath(root, parentPath, (parent) =>
        rewriteChildSlotOnContainer(parent, lastSegment, metadata, rewriter),
    );
}

function rewriteChildSlotOnContainer(
    parent: NodeState,
    segment: string,
    metadata: ApplyMetadata,
    rewriter: SlotRewriter,
): NodeState {
    if (!isObjectNodeState(parent) && !isMapNodeState(parent)) {
        throw new Error(
            `Parent path must resolve to object or map. Got "${parent.kind}"`,
        );
    }

    const existing = getChildFromContainer(parent, segment);
    const next = rewriter(existing);

    if (isObjectNodeState(parent)) {
        return {
            kind: "object",
            state:
                next !== null
                    ? setObjectField(
                        parent.state,
                        segment,
                        next,
                        createObjectSlotVersionFromMetadata(metadata),
                    )
                    : deleteObjectField(
                        parent.state,
                        segment,
                        createObjectSlotVersionFromMetadata(metadata),
                    ),
        };
    }

    return {
        kind: "map",
        state:
            next !== null
                ? setMapEntry(
                    parent.state,
                    segment,
                    next,
                    createMapEntryVersionFromMetadata(metadata),
                )
                : deleteMapEntry(
                    parent.state,
                    segment,
                    createMapEntryVersionFromMetadata(metadata),
                ),
    };
}

/* ============================================================================
 * Action application: field.set / field.delete / node.init*
 * ========================================================================== */

function applyFieldSet(
    root: NodeState,
    action: SetFieldAction,
    metadata: ApplyMetadata,
    context: ApplyContext,
): NodeState {
    return rewriteSlotAtPath(root, action.path, metadata, (existing) => {
        const target = existing ?? createLeafNodeFromValue(action.value, context);

        if (isPrimitiveNodeState(target)) {
            if (isRefValue(action.value)) {
                throw new Error("Cannot write ref value into primitive register");
            }

            return {
                kind: "primitive",
                semantics: target.semantics,
                state: addRegisterVersion(
                    target.state,
                    createRegisterVersionFromMetadata(action.value, metadata),
                ),
            };
        }

        if (isRefNodeState(target)) {
            if (!isRefValue(action.value)) {
                throw new Error("Cannot write primitive value into ref register");
            }

            return {
                kind: "ref",
                semantics: target.semantics,
                state: addRegisterVersion(
                    target.state,
                    createRegisterVersionFromMetadata(action.value, metadata),
                ),
            };
        }

        throw new Error(
            `field.set can only target leaf register nodes, got "${target.kind}"`,
        );
    });
}

function applyFieldDelete(
    root: NodeState,
    action: DeleteFieldAction,
    metadata: ApplyMetadata,
): NodeState {
    return rewriteSlotAtPath(root, action.path, metadata, () => null);
}

function applyNodeInit(
    root: NodeState,
    action:
        | InitObjectAction
        | InitMapAction
        | InitSetAction
        | InitArrayAction,
    kind: ContainerInitKind,
    metadata: ApplyMetadata,
): NodeState {
    return rewriteSlotAtPath(root, action.path, metadata, () => createContainerNode(kind));
}

/* ============================================================================
 * Action application: map.*
 * ========================================================================== */

function applyMapSetValue(
    root: NodeState,
    action: MapSetValueAction,
    metadata: ApplyMetadata,
    context: ApplyContext,
): NodeState {
    return rewriteExistingNodeAtPath(root, action.path, (target) => {
        if (!isMapNodeState(target)) {
            throw new Error(`map.setValue expects map node, got "${target.kind}"`);
        }

        const existingEntry = getMapEntry(target.state, action.key);
        const existingChild = existingEntry?.node ?? null;
        const child = existingChild ?? createLeafNodeFromValue(action.value, context);

        let nextChild: NodeState;

        if (isPrimitiveNodeState(child)) {
            if (isRefValue(action.value)) {
                throw new Error("Cannot write ref value into primitive register");
            }

            nextChild = {
                kind: "primitive",
                semantics: child.semantics,
                state: addRegisterVersion(
                    child.state,
                    createRegisterVersionFromMetadata(action.value, metadata),
                ),
            };
        } else if (isRefNodeState(child)) {
            if (!isRefValue(action.value)) {
                throw new Error("Cannot write primitive value into ref register");
            }

            nextChild = {
                kind: "ref",
                semantics: child.semantics,
                state: addRegisterVersion(
                    child.state,
                    createRegisterVersionFromMetadata(action.value, metadata),
                ),
            };
        } else {
            throw new Error(
                `map.setValue can only target leaf entries, got "${child.kind}" at key "${action.key}"`,
            );
        }

        return {
            kind: "map",
            state: setMapEntry(
                target.state,
                action.key,
                nextChild,
                createMapEntryVersionFromMetadata(metadata),
            ),
        };
    });
}

function applyMapInitEntry(
    root: NodeState,
    action: MapInitEntryAction,
    metadata: ApplyMetadata,
): NodeState {
    return rewriteExistingNodeAtPath(root, action.path, (target) => {
        if (!isMapNodeState(target)) {
            throw new Error(`map.initEntry expects map node, got "${target.kind}"`);
        }

        const child = createContainerNode(action.nodeKind);

        return {
            kind: "map",
            state: setMapEntry(
                target.state,
                action.key,
                child,
                createMapEntryVersionFromMetadata(metadata),
            ),
        };
    });
}

function applyMapDelete(
    root: NodeState,
    action: MapDeleteAction,
    metadata: ApplyMetadata,
): NodeState {
    return rewriteExistingNodeAtPath(root, action.path, (target) => {
        if (!isMapNodeState(target)) {
            throw new Error(`map.delete expects map node, got "${target.kind}"`);
        }

        return {
            kind: "map",
            state: deleteMapEntry(
                target.state,
                action.key,
                createMapEntryVersionFromMetadata(metadata),
            ),
        };
    });
}

/* ============================================================================
 * Action application: set.*
 * ========================================================================== */

function applySetAdd(
    root: NodeState,
    action: SetAddAction,
    metadata: ApplyMetadata,
): NodeState {
    return rewriteExistingNodeAtPath(root, action.path, (target) => {
        if (!isSetNodeState(target)) {
            throw new Error(`set.add expects set node, got "${target.kind}"`);
        }

        const addVersion: SetAddVersion<LeafValue> = {
            value: action.value,
            tag: metadata.opId,
            replicaId: metadata.replicaId,
            clock: {...metadata.clock},
            timestamp: metadata.timestamp,
        };

        return {
            kind: "set",
            state: addSetValue(target.state, addVersion),
        };
    });
}

function applySetRemove(
    root: NodeState,
    action: SetRemoveAction,
    metadata: ApplyMetadata,
): NodeState {
    return rewriteExistingNodeAtPath(root, action.path, (target) => {
        if (!isSetNodeState(target)) {
            throw new Error(`set.remove expects set node, got "${target.kind}"`);
        }

        const removeInput: SetRemoveInput<LeafValue> = {
            value: action.value,
            opId: metadata.opId,
            replicaId: metadata.replicaId,
            clock: {...metadata.clock},
            timestamp: metadata.timestamp,
        };

        return {
            kind: "set",
            state: removeSetValue(target.state, removeInput, {
                equals: areLeafValuesEqual,
                compare: compareLeafValues,
            }),
        };
    });
}

/* ============================================================================
 * Action application: array.*
 * ========================================================================== */

function applyArrayInsert(
    root: NodeState,
    action: ArrayInsertAction,
    metadata: ApplyMetadata,
    context: ApplyContext,
): NodeState {
    return rewriteExistingNodeAtPath(root, action.path, (target) => {
        if (!isArrayNodeState(target)) {
            throw new Error(`array.insert expects array node, got "${target.kind}"`);
        }

        const visibleBefore = action.index - 1;
        const afterElementId =
            visibleBefore >= 0
                ? findVisibleElementIdAtIndex(target.state, visibleBefore)
                : null;

        if (action.index > 0 && afterElementId === null) {
            throw new Error(
                `Cannot insert array element at index ${action.index}: index is out of bounds`,
            );
        }

        const child = createLeafNodeFromValue(action.value, context);

        let initializedChild: NodeState;

        if (isPrimitiveNodeState(child)) {
            if (isRefValue(action.value)) {
                throw new Error("Cannot insert ref value into primitive register");
            }

            initializedChild = {
                kind: "primitive",
                semantics: child.semantics,
                state: addRegisterVersion(
                    child.state,
                    createRegisterVersionFromMetadata(action.value, metadata),
                ),
            };
        } else if (isRefNodeState(child)) {
            if (!isRefValue(action.value)) {
                throw new Error("Cannot insert primitive value into ref register");
            }

            initializedChild = {
                kind: "ref",
                semantics: child.semantics,
                state: addRegisterVersion(
                    child.state,
                    createRegisterVersionFromMetadata(action.value, metadata),
                ),
            };
        } else {
            throw new Error("Array MVP insert currently supports only leaf values");
        }

        const element: ArrayElementState<NodeState> = {
            elementId: metadata.opId,
            afterElementId,
            node: initializedChild,
            insertVersion: createArrayElementVersionFromMetadata(metadata),
            deleteVersion: null,
        };

        return {
            kind: "array",
            state: insertArrayElement(target.state, element, {
                mergeNodes: (_left, _right): NodeState => {
                    throw new Error(
                        `Unexpected duplicate array element id during local apply: ${metadata.opId}`,
                    );
                },
            }),
        };
    });
}

function applyArrayRemove(
    root: NodeState,
    action: ArrayRemoveAction,
    metadata: ApplyMetadata,
): NodeState {
    return rewriteExistingNodeAtPath(root, action.path, (target) => {
        if (!isArrayNodeState(target)) {
            throw new Error(`array.remove expects array node, got "${target.kind}"`);
        }

        const elementId = findVisibleElementIdAtIndex(target.state, action.index);

        if (elementId === null) {
            throw new Error(
                `Cannot remove array element at index ${action.index}: index is out of bounds`,
            );
        }

        return {
            kind: "array",
            state: deleteArrayElement(
                target.state,
                elementId,
                createArrayElementVersionFromMetadata(metadata),
            ),
        };
    });
}

/* ============================================================================
 * Leaf value equality / ordering
 * ========================================================================== */

function areLeafValuesEqual(left: LeafValue, right: LeafValue): boolean {
    if (isRefValue(left) && isRefValue(right)) {
        return left.objectId === right.objectId;
    }

    if (isRefValue(left) || isRefValue(right)) {
        return false;
    }

    return left === right;
}

function compareLeafValues(left: LeafValue, right: LeafValue): number {
    const leftKey = leafValueSortKey(left);
    const rightKey = leafValueSortKey(right);

    if (leftKey < rightKey) {
        return -1;
    }

    if (leftKey > rightKey) {
        return 1;
    }

    return 0;
}

function leafValueSortKey(value: LeafValue): string {
    if (isRefValue(value)) {
        return `ref:${value.objectId ?? "null"}`;
    }

    return `${typeof value}:${String(value)}`;
}

