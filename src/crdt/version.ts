import { compareClocks, PartialOrderClockRelation, type ReplicaId, type VectorClock } from "../clock/clock";
import type { OperationId } from "../ops/operation";

export interface CausalVersionStamp {
    opId: OperationId;
    replicaId: ReplicaId;
    clock: VectorClock;
}

export function cloneCausalVersionStamp<T extends CausalVersionStamp>(input: T): T {
    return {
        ...input,
        clock: { ...input.clock },
    };
}

export function compareCausalVersionStamps(
    a: CausalVersionStamp,
    b: CausalVersionStamp,
): number {
    if (a.opId === b.opId) {
        return 0;
    }

    const relation: PartialOrderClockRelation = compareClocks(a.clock, b.clock);

    if (relation === PartialOrderClockRelation.BEFORE) {
        return -1;
    }

    if (relation === PartialOrderClockRelation.AFTER) {
        return 1;
    }

    if (a.replicaId !== b.replicaId) {
        return a.replicaId < b.replicaId ? -1 : 1;
    }

    return a.opId < b.opId ? -1 : 1;
}