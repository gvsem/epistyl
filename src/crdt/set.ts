import type {ReplicaId, VectorClock} from "../clock/clock";
import type {OpId} from "../ops/operation";

export interface SetValueAdapter<T> {
    equals(left: T, right: T): boolean;
}

export interface SetAddVersion<T> {
    value: T;
    tag: OpId;
    replicaId: ReplicaId;
    clock: VectorClock;
}

export interface SetRemoveInput<T> {
    value: T;
    opId: OpId;
    replicaId: ReplicaId;
    clock: VectorClock;
}

export interface SetRemoveVersion<T> {
    value: T;
    opId: OpId;
    replicaId: ReplicaId;
    clock: VectorClock;
    removedTags: OpId[];
}

export interface SetValueView<T> {
    value: T;
    liveTags: OpId[];
}

export interface SetState<T> {
    adds: SetAddVersion<T>[];
    removes: SetRemoveVersion<T>[];
}

export function createSetState<T>(): SetState<T> {
    return {
        adds: [],
        removes: [],
    };
}

export function compareSetAddVersions<T>(
    a: SetAddVersion<T>,
    b: SetAddVersion<T>,
): number {
    if (a.tag === b.tag) {
        return 0;
    }

    if (a.replicaId !== b.replicaId) {
        return a.replicaId < b.replicaId ? -1 : 1;
    }

    return a.tag < b.tag ? -1 : 1;
}

export function compareSetRemoveVersions<T>(
    a: SetRemoveVersion<T>,
    b: SetRemoveVersion<T>,
): number {
    if (a.opId === b.opId) {
        return 0;
    }

    if (a.replicaId !== b.replicaId) {
        return a.replicaId < b.replicaId ? -1 : 1;
    }

    return a.opId < b.opId ? -1 : 1;
}

export function deduplicateSetAdds<T>(
    adds: readonly SetAddVersion<T>[],
): SetAddVersion<T>[] {
    const byTag = new Map<OpId, SetAddVersion<T>>();

    for (const add of adds) {
        if (!byTag.has(add.tag)) {
            byTag.set(add.tag, add);
        }
    }

    return [...byTag.values()].sort(compareSetAddVersions);
}

export function deduplicateSetRemoves<T>(
    removes: readonly SetRemoveVersion<T>[],
): SetRemoveVersion<T>[] {
    const byOpId = new Map<OpId, SetRemoveVersion<T>>();

    for (const remove of removes) {
        if (!byOpId.has(remove.opId)) {
            byOpId.set(remove.opId, remove);
        }
    }

    return [...byOpId.values()].sort(compareSetRemoveVersions);
}

export function addSetValue<T>(
    state: SetState<T>,
    add: SetAddVersion<T>,
): SetState<T> {
    return {
        adds: deduplicateSetAdds([...state.adds, add]),
        removes: state.removes,
    };
}

export function getObservedAddTagsForValue<T>(
    state: SetState<T>,
    value: T,
    adapter: SetValueAdapter<T>,
): OpId[] {
    const tags: OpId[] = [];

    for (const add of state.adds) {
        if (adapter.equals(add.value, value)) {
            tags.push(add.tag);
        }
    }

    return tags.sort();
}

export function removeSetValue<T>(
    state: SetState<T>,
    input: SetRemoveInput<T>,
    adapter: SetValueAdapter<T>,
): SetState<T> {
    const removedTags = getObservedAddTagsForValue(
        state,
        input.value,
        adapter,
    );

    const removeRecord: SetRemoveVersion<T> = {
        value: input.value,
        opId: input.opId,
        replicaId: input.replicaId,
        clock: {...input.clock},
        removedTags
    };

    return {
        adds: state.adds,
        removes: deduplicateSetRemoves([...state.removes, removeRecord]),
    };
}

export function getRemovedTagsForValue<T>(
    state: SetState<T>,
    value: T,
    adapter: SetValueAdapter<T>,
): Set<OpId> {
    const removed = new Set<OpId>();

    for (const remove of state.removes) {
        if (!adapter.equals(remove.value, value)) {
            continue;
        }

        for (const tag of remove.removedTags) {
            removed.add(tag);
        }
    }

    return removed;
}

export function getLiveAdditionsForValue<T>(
    state: SetState<T>,
    value: T,
    adapter: SetValueAdapter<T>,
): SetAddVersion<T>[] {
    const removedTags = getRemovedTagsForValue(state, value, adapter);

    return state.adds.filter(
        (add) =>
            adapter.equals(add.value, value) &&
            !removedTags.has(add.tag),
    );
}

export function hasSetValue<T>(
    state: SetState<T>,
    value: T,
    adapter: SetValueAdapter<T>,
): boolean {
    return getLiveAdditionsForValue(state, value, adapter).length > 0;
}

export function getPresentSetValues<T>(
    state: SetState<T>,
    adapter: SetValueAdapter<T>,
): SetValueView<T>[] {
    const views: SetValueView<T>[] = [];

    for (const add of state.adds) {
        if (views.some((view) => adapter.equals(view.value, add.value))) {
            continue;
        }

        const liveAdds = getLiveAdditionsForValue(
            state,
            add.value,
            adapter,
        );

        if (liveAdds.length === 0) {
            continue;
        }

        views.push({
            value: add.value,
            liveTags: liveAdds.map((item) => item.tag),
        });
    }

    return views;
}
