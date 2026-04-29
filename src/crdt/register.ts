import {PartialOrderClockRelation, compareClocks, ReplicaId, type VectorClock,} from "../clock/clock";
import type {OperationId} from "../ops/operation";
import {compareCausalVersionStamps} from "./version";

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

export const compareRegisterVersionsForLww = compareCausalVersionStamps

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
    if (state.versions.length === 0) {
        return null;
    }

    let winner = state.versions[0]

    for (let i = 1; i < state.versions.length; i += 1) {
        const candidate = state.versions[i]
        if (compareRegisterVersionsForLww(candidate, winner) > 0) {
            winner = candidate;
        }
    }

    return winner;
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