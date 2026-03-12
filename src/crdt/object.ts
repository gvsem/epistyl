import {type ClockRelation, compareClocks, ReplicaId, type VectorClock,} from "../core/clock";
import type {OpId} from "../ops/operation";

export interface ObjectSlotVersion {
    opId: OpId;
    replicaId: ReplicaId;
    clock: VectorClock;
    timestamp?: string;
}

export interface ObjectFieldState<TNode> {
    /**
     * Child node bound to the field.
     * null means the field is tombstoned / deleted.
     */
    node: TNode | null;

    /**
     * Version of the field binding itself.
     * Controls presence/absence of the field slot.
     */
    slotVersion: ObjectSlotVersion | null;
}

export interface ObjectState<TNode> {
    fields: Record<string, ObjectFieldState<TNode>>;
}

export interface ObjectNodeAdapter<TNode> {
    mergeNodes(left: TNode, right: TNode): TNode;
}

export function createObjectState<TNode>(): ObjectState<TNode> {
    return {
        fields: {},
    };
}

export function createObjectSlotVersion(
    input: ObjectSlotVersion,
): ObjectSlotVersion {
    return {
        ...input,
        clock: {...input.clock},
    };
}

export function compareObjectSlotVersions(
    a: ObjectSlotVersion,
    b: ObjectSlotVersion,
): number {
    if (a.opId === b.opId) {
        return 0;
    }

    const relation: ClockRelation = compareClocks(a.clock, b.clock);

    if (relation === "before") {
        return -1;
    }

    if (relation === "after") {
        return 1;
    }

    if (a.replicaId !== b.replicaId) {
        return a.replicaId < b.replicaId ? -1 : 1;
    }

    return a.opId < b.opId ? -1 : 1;
}

export function getObjectField<TNode>(
    state: ObjectState<TNode>,
    field: string,
): ObjectFieldState<TNode> | null {
    return state.fields[field] ?? null;
}

export function hasObjectField<TNode>(
    state: ObjectState<TNode>,
    field: string,
): boolean {
    const slot = getObjectField(state, field);
    return slot !== null && slot.node !== null;
}

export function setObjectField<TNode>(
    state: ObjectState<TNode>,
    field: string,
    node: TNode,
    slotVersion: ObjectSlotVersion,
): ObjectState<TNode> {
    return {
        fields: {
            ...state.fields,
            [field]: {
                node,
                slotVersion: createObjectSlotVersion(slotVersion),
            },
        },
    };
}

export function deleteObjectField<TNode>(
    state: ObjectState<TNode>,
    field: string,
    slotVersion: ObjectSlotVersion,
): ObjectState<TNode> {
    return {
        fields: {
            ...state.fields,
            [field]: {
                node: null,
                slotVersion: createObjectSlotVersion(slotVersion),
            },
        },
    };
}

export function mergeObjectFieldStates<TNode>(
    left: ObjectFieldState<TNode> | null,
    right: ObjectFieldState<TNode> | null,
    adapter: ObjectNodeAdapter<TNode>,
): ObjectFieldState<TNode> | null {
    if (left === null) {
        return right;
    }

    if (right === null) {
        return left;
    }

    if (left.slotVersion === null && right.slotVersion === null) {
        if (left.node !== null && right.node !== null) {
            return {
                node: adapter.mergeNodes(left.node, right.node),
                slotVersion: null,
            };
        }

        return left.node !== null ? left : right;
    }

    if (left.slotVersion === null) {
        return right;
    }

    if (right.slotVersion === null) {
        return left;
    }

    const ordering = compareObjectSlotVersions(
        left.slotVersion,
        right.slotVersion,
    );

    if (ordering < 0) {
        return right;
    }

    if (ordering > 0) {
        return left;
    }

    if (left.node !== null && right.node !== null) {
        return {
            node: adapter.mergeNodes(left.node, right.node),
            slotVersion: createObjectSlotVersion(left.slotVersion),
        };
    }

    return left.node !== null ? left : right;
}

export function mergeObjectStates<TNode>(
    left: ObjectState<TNode>,
    right: ObjectState<TNode>,
    adapter: ObjectNodeAdapter<TNode>,
): ObjectState<TNode> {
    const fieldNames = new Set<string>([
        ...Object.keys(left.fields),
        ...Object.keys(right.fields),
    ]);

    const fields: Record<string, ObjectFieldState<TNode>> = {};

    for (const field of fieldNames) {
        const merged = mergeObjectFieldStates(
            left.fields[field] ?? null,
            right.fields[field] ?? null,
            adapter,
        );

        if (merged !== null) {
            fields[field] = merged;
        }
    }

    return {fields};
}

export function listObjectFields<TNode>(
    state: ObjectState<TNode>,
): string[] {
    return Object.keys(state.fields)
        .filter((field) => hasObjectField(state, field))
        .sort();
}