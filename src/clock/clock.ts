export type ReplicaId = string;
export type VectorClock = Record<ReplicaId, number>;

export enum PartialOrderClockRelation {
    EQUAL,
    BEFORE,
    AFTER,
    CONCURRENT
}

export interface ReplicaClockState {
    replicaId: ReplicaId;
    clock: VectorClock;
    counter: number;
}

export function getClockValue(
    clock: VectorClock,
    replicaId: ReplicaId,
): number {
    return clock[replicaId] ?? 0;
}

export function setClockValue(
    clock: VectorClock,
    replicaId: ReplicaId,
    value: number,
): VectorClock {
    return {
        ...clock,
        [replicaId]: value,
    };
}

export function mergeClocks(
    a: VectorClock,
    b: VectorClock,
): VectorClock {
    const replicaIds = new Set<string>([
        ...Object.keys(a),
        ...Object.keys(b),
    ]);

    const merged: VectorClock = {};

    for (const replicaId of replicaIds) {
        merged[replicaId] = Math.max(
            getClockValue(a, replicaId),
            getClockValue(b, replicaId),
        );
    }

    return merged;
}

export function compareClocks(
    a: VectorClock,
    b: VectorClock,
): PartialOrderClockRelation {
    const replicaIds = new Set<string>([
        ...Object.keys(a),
        ...Object.keys(b),
    ]);

    let aLess = false;
    let aGreater = false;

    for (const replicaId of replicaIds) {
        const aValue = getClockValue(a, replicaId);
        const bValue = getClockValue(b, replicaId);

        if (aValue < bValue) {
            aLess = true;
        } else if (aValue > bValue) {
            aGreater = true;
        }
    }

    if (!aLess && !aGreater) {
        return PartialOrderClockRelation.EQUAL;
    }

    if (aLess && !aGreater) {
        return PartialOrderClockRelation.BEFORE;
    }

    if (!aLess && aGreater) {
        return PartialOrderClockRelation.AFTER;
    }

    return PartialOrderClockRelation.CONCURRENT;
}

export function createReplicaClockState(
    replicaId: ReplicaId,
): ReplicaClockState {
    return {
        replicaId,
        clock: {},
        counter: 0,
    };
}

export function tickClock(state: ReplicaClockState): {
    state: ReplicaClockState
} {
    const nextCounter = state.counter + 1;
    const nextClock = {
        ...state.clock,
        [state.replicaId]: nextCounter,
    };

    return {
        state: {
            replicaId: state.replicaId,
            clock: nextClock,
            counter: nextCounter,
        }
    };
}

export function acceptClock(
    state: ReplicaClockState,
    observed: VectorClock,
): ReplicaClockState {
    const merged = mergeClocks(state.clock, observed);
    const localCounter = Math.max(
        state.counter,
        getClockValue(merged, state.replicaId),
    );

    return {
        replicaId: state.replicaId,
        clock: merged,
        counter: localCounter,
    };
}