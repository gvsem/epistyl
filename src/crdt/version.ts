import { compareClocks, type ClockRelation, type ReplicaId, type VectorClock } from "../core/clock";
import type { OpId } from "../ops/operation";

export interface VersionStamp {
    opId: OpId;
    replicaId: ReplicaId;
    clock: VectorClock;
    timestamp?: string;
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