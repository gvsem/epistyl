import {compareClocks, PartialOrderClockRelation, ReplicaId, type VectorClock,} from "../clock/clock";
import {compareOperationTimestamps, type OperationId} from "../ops/operation";

export type RegisterSemantics =
    | "lww"
    | "mv";

export interface RegisterVersion<T> {
    value: T;
    opId: OperationId;
    replicaId: ReplicaId;
    clock: VectorClock;
}

export interface RegisterState<T> {
    semantics: RegisterSemantics;
    versions: RegisterVersion<T>[];
}

export interface LwwRegisterView<T> {
    semantics: "lww";
    winner: RegisterVersion<T> | null;
}

export interface MvRegisterView<T> {
    semantics: "mv";
    values: RegisterVersion<T>[];
}

export type RegisterView<T> =
    | LwwRegisterView<T>
    | MvRegisterView<T>;

export function createRegisterState<T>(
    semantics: RegisterSemantics,
): RegisterState<T> {
    return {
        semantics,
        versions: [],
    };
}

export const compareRegisterVersionsForLww = compareOperationTimestamps

export function sortRegisterVersions<T>(
    versions: readonly RegisterVersion<T>[],
): RegisterVersion<T>[] {
    return [...versions].sort(compareRegisterVersionsForLww);
}

function joinRegisterVersions<T>(
    versions: readonly RegisterVersion<T>[],
    incoming: RegisterVersion<T>,
): RegisterVersion<T>[] {
    const next: RegisterVersion<T>[] = [];
    let shouldInsertIncoming = true;

    for (const existing of versions) {
        if (existing.opId === incoming.opId) {
            next.push(existing);
            shouldInsertIncoming = false;
            continue;
        }

        const relation = compareClocks(existing.clock, incoming.clock);

        if (relation === PartialOrderClockRelation.BEFORE) {
            continue;
        }

        if (relation === PartialOrderClockRelation.AFTER) {
            next.push(existing);
            shouldInsertIncoming = false;
            continue;
        }

        next.push(existing);
    }

    if (shouldInsertIncoming) {
        next.push(incoming);
    }

    return sortRegisterVersions(next);
}

export function addRegisterVersion<T>(
    state: RegisterState<T>,
    version: RegisterVersion<T>,
): RegisterState<T> {
    return {
        semantics: state.semantics,
        versions: joinRegisterVersions(state.versions, version),
    };
}

export function getLwwWinner<T>(
    state: RegisterState<T>,
): RegisterVersion<T> | null {
    return state.versions.reduce<RegisterVersion<T> | null>(
        (winner, candidate) =>
            winner === null || compareRegisterVersionsForLww(candidate, winner) > 0 ? candidate : winner,
        null,
    );
}

export function getMvValues<T>(
    state: RegisterState<T>,
): RegisterVersion<T>[] {
    return sortRegisterVersions(state.versions);
}

export function getRegisterView<T>(state: RegisterState<T>): RegisterView<T> {
    if (state.semantics === "lww") {
        return {
            semantics: "lww",
            winner: getLwwWinner(state),
        };
    }

    return {
        semantics: "mv",
        values: getMvValues(state),
    };
}
