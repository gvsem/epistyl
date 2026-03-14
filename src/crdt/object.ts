import {cloneVersionStamp, type VersionStamp} from "./version";

export type ObjectVersion = VersionStamp;

export const createObjectVersion = cloneVersionStamp;

export interface ObjectEntryState<TNode> {
    /**
     * Child node bound to the key.
     * null means the key is tombstoned / deleted.
     */
    node: TNode | null;

    /**
     * Version of the binding itself.
     * Controls whether the key is considered present.
     */
    version: ObjectVersion | null;
}

export interface ObjectState<TNode> {
    items: Record<string, ObjectEntryState<TNode>>;
}

export function createObjectState<TNode>(): ObjectState<TNode> {
    return {
        items: {},
    };
}

export function getObjectField<TNode>(
    state: ObjectState<TNode>,
    field: string,
): ObjectEntryState<TNode> | null {
    return state.items[field] ?? null;
}

export function hasObjectField<TNode>(
    state: ObjectState<TNode>,
    field: string,
): boolean {
    const entry = getObjectField(state, field);
    return entry !== null && entry.node !== null;
}

export function setObjectField<TNode>(
    state: ObjectState<TNode>,
    field: string,
    node: TNode,
    version: ObjectVersion,
): ObjectState<TNode> {
    return {
        items: {
            ...state.items,
            [field]: {
                node,
                version: createObjectVersion(version),
            },
        },
    };
}

export function deleteObjectField<TNode>(
    state: ObjectState<TNode>,
    field: string,
    version: ObjectVersion,
): ObjectState<TNode> {
    return {
        items: {
            ...state.items,
            [field]: {
                node: null,
                version: createObjectVersion(version),
            },
        },
    };
}

export function listObjectFields<TNode>(
    state: ObjectState<TNode>,
): string[] {
    return Object.keys(state.items)
        .filter((field) => hasObjectField(state, field))
        .sort();
}