import {type ClockRelation, compareClocks, ReplicaId, type VectorClock,} from "../core/clock";
import type {OpId} from "../ops/operation";

export interface MapEntryVersion {
    opId: OpId;
    replicaId: ReplicaId;
    clock: VectorClock;
    timestamp?: string;
}

export interface MapEntryState<TNode> {
    /**
     * Child node bound to the entry.
     * null means the entry is tombstoned / deleted.
     */
    node: TNode | null;

    /**
     * Version of the map entry binding itself.
     * Controls whether the key is considered present.
     */
    entryVersion: MapEntryVersion | null;
}

export interface MapState<TNode> {
    entries: Record<string, MapEntryState<TNode>>;
}

export interface MapNodeAdapter<TNode> {
    mergeNodes(left: TNode, right: TNode): TNode;
}

export function createMapState<TNode>(): MapState<TNode> {
    return {
        entries: {},
    };
}

export function createMapEntryVersion(
    input: MapEntryVersion,
): MapEntryVersion {
    return {
        ...input,
        clock: {...input.clock},
    };
}

export function compareMapEntryVersions(
    a: MapEntryVersion,
    b: MapEntryVersion,
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

export function getMapEntry<TNode>(
    state: MapState<TNode>,
    key: string,
): MapEntryState<TNode> | null {
    return state.entries[key] ?? null;
}

export function hasMapEntry<TNode>(
    state: MapState<TNode>,
    key: string,
): boolean {
    const entry = getMapEntry(state, key);
    return entry !== null && entry.node !== null;
}

export function setMapEntry<TNode>(
    state: MapState<TNode>,
    key: string,
    node: TNode,
    entryVersion: MapEntryVersion,
): MapState<TNode> {
    return {
        entries: {
            ...state.entries,
            [key]: {
                node,
                entryVersion: createMapEntryVersion(entryVersion),
            },
        },
    };
}

export function deleteMapEntry<TNode>(
    state: MapState<TNode>,
    key: string,
    entryVersion: MapEntryVersion,
): MapState<TNode> {
    return {
        entries: {
            ...state.entries,
            [key]: {
                node: null,
                entryVersion: createMapEntryVersion(entryVersion),
            },
        },
    };
}

export function mergeMapEntryStates<TNode>(
    left: MapEntryState<TNode> | null,
    right: MapEntryState<TNode> | null,
    adapter: MapNodeAdapter<TNode>,
): MapEntryState<TNode> | null {
    if (left === null) {
        return right;
    }

    if (right === null) {
        return left;
    }

    if (left.entryVersion === null && right.entryVersion === null) {
        if (left.node !== null && right.node !== null) {
            return {
                node: adapter.mergeNodes(left.node, right.node),
                entryVersion: null,
            };
        }

        return left.node !== null ? left : right;
    }

    if (left.entryVersion === null) {
        return right;
    }

    if (right.entryVersion === null) {
        return left;
    }

    const ordering = compareMapEntryVersions(
        left.entryVersion,
        right.entryVersion,
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
            entryVersion: createMapEntryVersion(left.entryVersion),
        };
    }

    return left.node !== null ? left : right;
}

export function mergeMapStates<TNode>(
    left: MapState<TNode>,
    right: MapState<TNode>,
    adapter: MapNodeAdapter<TNode>,
): MapState<TNode> {
    const keys = new Set<string>([
        ...Object.keys(left.entries),
        ...Object.keys(right.entries),
    ]);

    const entries: Record<string, MapEntryState<TNode>> = {};

    for (const key of keys) {
        const merged = mergeMapEntryStates(
            left.entries[key] ?? null,
            right.entries[key] ?? null,
            adapter,
        );

        if (merged !== null) {
            entries[key] = merged;
        }
    }

    return {entries};
}

export function listMapKeys<TNode>(
    state: MapState<TNode>,
): string[] {
    return Object.keys(state.entries)
        .filter((key) => hasMapEntry(state, key))
        .sort();
}
