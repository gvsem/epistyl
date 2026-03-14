import { describe, expect, it } from "vitest";

import { createClockState, issueClock, type ClockState } from "../../src/core/clock";
import {
    createTransactionBuilder,
    type IssuedOperationMetadata,
    type TransactionBuildContext,
} from "../../src/ops/transaction";
import {Operation} from "../../src/ops/operation";

function createBuildContext(replicaId = "A"): {
    context: TransactionBuildContext;
    getClockState(): ClockState;
} {
    let state = createClockState(replicaId);

    return {
        context: {
            replicaId,
            issueOperationMetadata(): IssuedOperationMetadata {
                const issued = issueClock(state);
                state = issued.state;

                return {
                    opId: `${replicaId}:${issued.state.counter}`,
                    clock: issued.state.clock,
                };
            },
            timestamp(): string {
                return "2026-03-13T10:00:00Z";
            },
        },
        getClockState(): ClockState {
            return state;
        },
    };
}

describe("ops/transaction", () => {
    it("creates empty transaction record", () => {
        const { context } = createBuildContext("A");

        const tx = createTransactionBuilder(
            "A:tx:1",
            "event-1",
            context,
        );

        expect(tx.txId).toBe("A:tx:1");
        expect(tx.objectId).toBe("event-1");
        expect(tx.replicaId).toBe("A");

        expect(tx.getOperations()).toEqual([]);
        expect(tx.toRecord()).toEqual({
            txId: "A:tx:1",
            objectId: "event-1",
            replicaId: "A",
            operations: [],
            label: undefined,
            timestamp: undefined,
        });
    });

    it("stores transaction options in record", () => {
        const { context } = createBuildContext("A");

        const tx = createTransactionBuilder(
            "A:tx:1",
            "event-1",
            context,
            {
                label: "bootstrap event",
                timestamp: "2026-03-13T11:00:00Z",
            },
        );

        expect(tx.toRecord()).toEqual({
            txId: "A:tx:1",
            objectId: "event-1",
            replicaId: "A",
            operations: [],
            label: "bootstrap event",
            timestamp: "2026-03-13T11:00:00Z",
        });
    });

    it("emits field.set operation", () => {
        const { context } = createBuildContext("A");

        const tx = createTransactionBuilder("A:tx:1", "event-1", context);
        tx.setField(["title"], "Team Sync");

        expect(tx.getOperations()).toEqual([
            {
                opId: "A:1",
                txId: "A:tx:1",
                objectId: "event-1",
                replicaId: "A",
                clock: { A: 1 },
                action: {
                    type: "field.set",
                    path: ["title"],
                    value: "Team Sync",
                },
                timestamp: "2026-03-13T10:00:00Z",
            },
        ]);
    });

    it("emits field.delete operation", () => {
        const { context } = createBuildContext("A");

        const tx = createTransactionBuilder("A:tx:1", "event-1", context);
        tx.deleteField(["title"]);

        expect(tx.getOperations()).toEqual([
            {
                opId: "A:1",
                txId: "A:tx:1",
                objectId: "event-1",
                replicaId: "A",
                clock: { A: 1 },
                action: {
                    type: "field.delete",
                    path: ["title"],
                },
                timestamp: "2026-03-13T10:00:00Z",
            },
        ]);
    });

    it("emits node init operations", () => {
        const { context } = createBuildContext("A");

        const tx = createTransactionBuilder("A:tx:1", "event-1", context);

        tx.initObject(["location"]);
        tx.initMap(["metadata"]);
        tx.initSet(["tags"]);
        tx.initArray(["attendees"]);

        expect(tx.getOperations()).toEqual([
            {
                opId: "A:1",
                txId: "A:tx:1",
                objectId: "event-1",
                replicaId: "A",
                clock: { A: 1 },
                action: {
                    type: "node.initObject",
                    path: ["location"],
                },
                timestamp: "2026-03-13T10:00:00Z",
            },
            {
                opId: "A:2",
                txId: "A:tx:1",
                objectId: "event-1",
                replicaId: "A",
                clock: { A: 2 },
                action: {
                    type: "node.initMap",
                    path: ["metadata"],
                },
                timestamp: "2026-03-13T10:00:00Z",
            },
            {
                opId: "A:3",
                txId: "A:tx:1",
                objectId: "event-1",
                replicaId: "A",
                clock: { A: 3 },
                action: {
                    type: "node.initSet",
                    path: ["tags"],
                },
                timestamp: "2026-03-13T10:00:00Z",
            },
            {
                opId: "A:4",
                txId: "A:tx:1",
                objectId: "event-1",
                replicaId: "A",
                clock: { A: 4 },
                action: {
                    type: "node.initArray",
                    path: ["attendees"],
                },
                timestamp: "2026-03-13T10:00:00Z",
            },
        ]);
    });

    it("emits map operations", () => {
        const { context } = createBuildContext("A");

        const tx = createTransactionBuilder("A:tx:1", "event-1", context);

        tx.mapSetValue(["metadata"], "color", "blue");
        tx.mapInitEntry(["metadata"], "nested", "object");
        tx.mapDelete(["metadata"], "obsolete");

        expect(tx.getOperations()).toEqual([
            {
                opId: "A:1",
                txId: "A:tx:1",
                objectId: "event-1",
                replicaId: "A",
                clock: { A: 1 },
                action: {
                    type: "map.setValue",
                    path: ["metadata"],
                    key: "color",
                    value: "blue",
                },
                timestamp: "2026-03-13T10:00:00Z",
            },
            {
                opId: "A:2",
                txId: "A:tx:1",
                objectId: "event-1",
                replicaId: "A",
                clock: { A: 2 },
                action: {
                    type: "map.initEntry",
                    path: ["metadata"],
                    key: "nested",
                    nodeKind: "object",
                },
                timestamp: "2026-03-13T10:00:00Z",
            },
            {
                opId: "A:3",
                txId: "A:tx:1",
                objectId: "event-1",
                replicaId: "A",
                clock: { A: 3 },
                action: {
                    type: "map.delete",
                    path: ["metadata"],
                    key: "obsolete",
                },
                timestamp: "2026-03-13T10:00:00Z",
            },
        ]);
    });

    it("emits set operations", () => {
        const { context } = createBuildContext("A");

        const tx = createTransactionBuilder("A:tx:1", "event-1", context);

        tx.setAdd(["tags"], "team");
        tx.setRemove(["tags"], "team");

        expect(tx.getOperations()).toEqual([
            {
                opId: "A:1",
                txId: "A:tx:1",
                objectId: "event-1",
                replicaId: "A",
                clock: { A: 1 },
                action: {
                    type: "set.add",
                    path: ["tags"],
                    value: "team",
                },
                timestamp: "2026-03-13T10:00:00Z",
            },
            {
                opId: "A:2",
                txId: "A:tx:1",
                objectId: "event-1",
                replicaId: "A",
                clock: { A: 2 },
                action: {
                    type: "set.remove",
                    path: ["tags"],
                    value: "team",
                },
                timestamp: "2026-03-13T10:00:00Z",
            },
        ]);
    });

    it("emits array operations", () => {
        const { context } = createBuildContext("A");

        const tx = createTransactionBuilder("A:tx:1", "event-1", context);

        tx.arrayInsert(["attendees"], 0, {
            type: "ref",
            objectId: "user-1",
        });
        tx.arrayRemove(["attendees"], 0);

        expect(tx.getOperations()).toEqual([
            {
                opId: "A:1",
                txId: "A:tx:1",
                objectId: "event-1",
                replicaId: "A",
                clock: { A: 1 },
                action: {
                    type: "array.insert",
                    path: ["attendees"],
                    index: 0,
                    value: {
                        type: "ref",
                        objectId: "user-1",
                    },
                },
                timestamp: "2026-03-13T10:00:00Z",
            },
            {
                opId: "A:2",
                txId: "A:tx:1",
                objectId: "event-1",
                replicaId: "A",
                clock: { A: 2 },
                action: {
                    type: "array.remove",
                    path: ["attendees"],
                    index: 0,
                },
                timestamp: "2026-03-13T10:00:00Z",
            },
        ]);
    });

    it("uses same txId for all operations in one transaction", () => {
        const { context } = createBuildContext("A");

        const tx = createTransactionBuilder("A:tx:1", "event-1", context);

        tx.setField(["title"], "Team Sync");
        tx.setField(["description"], "Weekly planning");
        tx.setAdd(["tags"], "team");

        expect(tx.getOperations().map((op) => op.txId)).toEqual([
            "A:tx:1",
            "A:tx:1",
            "A:tx:1",
        ]);
    });

    it("increments opIds and clocks in local order", () => {
        const { context, getClockState } = createBuildContext("A");

        const tx = createTransactionBuilder("A:tx:1", "event-1", context);

        tx.setField(["title"], "Team Sync");
        tx.setField(["description"], "Weekly planning");
        tx.setField(["startAt"], "2026-03-07T10:00:00Z");

        expect(tx.getOperations().map((op) => op.opId)).toEqual([
            "A:1",
            "A:2",
            "A:3",
        ]);

        expect(tx.getOperations().map((op) => op.clock)).toEqual([
            { A: 1 },
            { A: 2 },
            { A: 3 },
        ]);

        expect(getClockState()).toEqual({
            replicaId: "A",
            clock: { A: 3 },
            counter: 3,
        });
    });

    it("getOperations returns snapshot copy", () => {
        const { context } = createBuildContext("A");

        const tx = createTransactionBuilder("A:tx:1", "event-1", context);
        tx.setField(["title"], "Team Sync");

        const ops = tx.getOperations() as Operation[];
        ops.push({
            opId: "fake",
            txId: "fake",
            objectId: "fake",
            replicaId: "A",
            clock: { A: 999 },
            action: {
                type: "field.delete",
                path: ["title"],
            },
        });

        expect(tx.getOperations()).toHaveLength(1);
        expect(tx.getOperations()[0]?.opId).toBe("A:1");
    });

    it("toRecord returns snapshot copy of operations", () => {
        const { context } = createBuildContext("A");

        const tx = createTransactionBuilder("A:tx:1", "event-1", context);
        tx.setField(["title"], "Team Sync");

        const record = tx.toRecord();
        record.operations.push({
            opId: "fake",
            txId: "fake",
            objectId: "fake",
            replicaId: "A",
            clock: { A: 999 },
            action: {
                type: "field.delete",
                path: ["title"],
            },
        });

        expect(tx.toRecord().operations).toHaveLength(1);
        expect(tx.toRecord().operations[0]?.opId).toBe("A:1");
    });
});