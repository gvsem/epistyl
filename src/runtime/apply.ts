import type {
    Action,
    ArrayInsertAction,
    ArrayRemoveAction,
    DeleteFieldAction,
    InitArrayAction,
    InitObjectAction,
    InitSetAction,
    ObjectPath,
    SetAddAction,
    SetFieldAction,
    SetRemoveAction,
} from "../ops/action";
import {ContainerNodeKind} from "../ops/action";

import type {Operation, OperationId} from "../ops/operation";

import type {ReplicaId, VectorClock} from "../clock/clock";

import {addRegisterVersion, RegisterSemantics, type RegisterVersion,} from "../crdt/register";

import {deleteObjectField, getObjectField, setObjectField,} from "../crdt/object";

import {addSetValue, removeSetValue, type SetAddVersion, type SetRemoveInput,} from "../crdt/set";

import {
    type ArrayElementState,
    deleteArrayElement,
    findVisibleElementIdAtIndex,
    insertArrayElement,
} from "../crdt/array";

import {
    createArrayNodeState,
    createObjectNodeState,
    createSetNodeState,
    isArrayNodeState,
    isObjectNodeState,
    isPrimitiveNodeState,
    isRefNodeState,
    isSetNodeState,
    type NodeState,
} from "../crdt/state";
import {OperationTimestamp} from "../ops/operation";
import {assertStringPath, getChildFromContainer, splitParentPath} from "./pathHelpers";
import {areLeafValuesEqual, createLeafNodeFromValue, isRefValue, LeafValue} from "./leafUtils";

export interface ApplyPolicy {
    defaultPrimitiveSemantics: RegisterSemantics;
    defaultRefSemantics: RegisterSemantics;
}

export interface ApplyContext {
    policy: ApplyPolicy;
}

export interface ApplyMetadata {
    opId: OperationId;
    replicaId: ReplicaId;
    clock: VectorClock;
}

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
            opId: operation.operationId,
            replicaId: operation.replicaId,
            clock: operation.clockSnapshot,
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

        case "node.initSet":
            return applyNodeInit(root, action, "set", metadata);

        case "node.initArray":
            return applyNodeInit(root, action, "array", metadata);

        default: {
            throw new Error(`Unsupported action: ${JSON.stringify(action)}`);
        }
    }
}

/* ============================================================================
 * Value / operation timestamp helpers
 * ========================================================================== */

export function createRegisterVersionFromMetadata<T>(
    value: T,
    metadata: ApplyMetadata,
): RegisterVersion<T> {
    return {
        value,
        opId: metadata.opId,
        replicaId: metadata.replicaId,
        clock: {...metadata.clock}
    };
}

export function createOperationTimestampFromMetadata(metadata: ApplyMetadata): OperationTimestamp {
    return {
        opId: metadata.opId,
        replicaId: metadata.replicaId,
        clock: {...metadata.clock}
    };
}

export function createContainerNode(kind: ContainerNodeKind): NodeState {
    switch (kind) {
        case "object":
            return createObjectNodeState();
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
                items: {
                    ...parent.state.items,
                    [field]: {
                        node: child,
                        operationTimestamp: null,
                    },
                },
            },
        };
    }

    return {
        kind: "object",
        state: {
            items: {
                ...parent.state.items,
                [field]: {
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

    throw new Error(
        `Cannot technically rewrite child in node kind "${container.kind}"`,
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
    if (!isObjectNodeState(parent)) {
        throw new Error(
            `Parent path must resolve to object. Got "${parent.kind}"`,
        );
    }

    const existing = getChildFromContainer(parent, segment);
    const next = rewriter(existing);

    return {
        kind: "object",
        state:
            next !== null
                ? setObjectField(
                    parent.state,
                    segment,
                    next,
                    createOperationTimestampFromMetadata(metadata),
                )
                : deleteObjectField(
                    parent.state,
                    segment,
                    createOperationTimestampFromMetadata(metadata),
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
        | InitSetAction
        | InitArrayAction,
    kind: ContainerNodeKind,
    metadata: ApplyMetadata,
): NodeState {
    return rewriteSlotAtPath(root, action.path, metadata, (existing) => {
        if (existing !== null) {
            if (
                (kind === "object" && isObjectNodeState(existing)) ||
                (kind === "set" && isSetNodeState(existing)) ||
                (kind === "array" && isArrayNodeState(existing))
            ) {
                return existing;
            }

            throw new Error(
                `Cannot initialize ${kind} node at path "${action.path.join(".")}": ` +
                `slot already contains "${existing.kind}"`,
            );
        }

        return createContainerNode(kind);
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
            clock: {...metadata.clock}
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
            clock: {...metadata.clock}
        };

        return {
            kind: "set",
            state: removeSetValue(target.state, removeInput, {
                equals: areLeafValuesEqual,
            })
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
            insertVersion: createOperationTimestampFromMetadata(metadata),
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
                createOperationTimestampFromMetadata(metadata),
            ),
        };
    });
}
