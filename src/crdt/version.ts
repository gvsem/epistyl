import { compareClocks, ClockRelation, type ReplicaId, type VectorClock } from "../clock/clock";
import type { OpId } from "../ops/operation";

export interface VersionStamp {
    opId: OpId;
    replicaId: ReplicaId;
    clock: VectorClock;
}

export function cloneVersionStamp<T extends VersionStamp>(input: T): T {
    return {
        ...input,
        clock: { ...input.clock },
    };
}

export function compareVersionStamps(
    a: VersionStamp,
    b: VersionStamp,
): number {
    if (a.opId === b.opId) {
        return 0;
    }

    const relation: ClockRelation = compareClocks(a.clock, b.clock);

    if (relation === ClockRelation.BEFORE) {
        return -1;
    }

    if (relation === ClockRelation.AFTER) {
        return 1;
    }

    if (a.replicaId !== b.replicaId) {
        return a.replicaId < b.replicaId ? -1 : 1;
    }

    return a.opId < b.opId ? -1 : 1;
}