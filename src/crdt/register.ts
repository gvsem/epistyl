import {type ClockRelation, compareClocks, ReplicaId, type VectorClock,} from "../core/clock";
import type {OpId} from "../ops/operation";
import {compareVersionStamps} from "./version";

export type RegisterSemantics =
    | "lww"
    | "mv";

export interface RegisterVersion<T> {
    value: T;
    opId: OpId;
    replicaId: ReplicaId;
    clock: VectorClock;
    timestamp?: string;
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

export function compareRegisterVersionsByCausality<T>(
    a: RegisterVersion<T>,
    b: RegisterVersion<T>,
): ClockRelation {
    return compareClocks(a.clock, b.clock);
}

export const compareRegisterVersionsForLww = compareVersionStamps

export function sortRegisterVersions<T>(
    versions: readonly RegisterVersion<T>[],
): RegisterVersion<T>[] {
    return [...versions].sort(compareRegisterVersionsForLww);
}

export function joinRegisterVersions<T>(
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

        const relation = compareRegisterVersionsByCausality(existing, incoming);

        if (relation === "before") {
            continue;
        }

        if (relation === "after") {
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

export function mergeRegisterStates<T>(
    a: RegisterState<T>,
    b: RegisterState<T>,
): RegisterState<T> {
    if (a.semantics !== b.semantics) {
        throw new Error(
            `Cannot merge register states with different semantics: ${a.semantics} vs ${b.semantics}`,
        );
    }

    let merged = createRegisterState<T>(a.semantics);

    for (const version of a.versions) {
        merged = addRegisterVersion(merged, version);
    }

    for (const version of b.versions) {
        merged = addRegisterVersion(merged, version);
    }

    return merged;
}

export function getLwwWinner<T>(
    state: RegisterState<T>,
): RegisterVersion<T> | null {
    if (state.versions.length === 0) {
        return null;
    }

    let winner = state.versions[0]!;

    for (let i = 1; i < state.versions.length; i += 1) {
        const candidate = state.versions[i]!;
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

export function getRegisterView<T>(
    state: RegisterState<T>,
): RegisterView<T> {
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