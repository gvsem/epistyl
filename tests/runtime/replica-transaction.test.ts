import {describe, expect, it} from "vitest";

import type {ApplyContext} from "../../src/runtime/apply";
import {
    appendTransaction,
    applyLocalAction,
    applyLocalTransaction,
    createReplicaState,
    issueTransaction,
    materializeReplicaObject,
} from "../../src/runtime/replica";

import {viewNode} from "../../src/runtime/view";

const OBJECT_ID = "event-1";

const applyContext: ApplyContext = {
    policy: {
        defaultPrimitiveSemantics: "mv",
        defaultRefSemantics: "lww",
    },
};

describe("runtime/replica transactions", () => {
    it("issueTransaction returns updated replica clockSnapshot state and transaction record", () => {
        const replica = createReplicaState("A");

        const issued = issueTransaction(
            replica,
            OBJECT_ID,
            (tx) => {
                tx.setField(["title"], "Team Sync");
                tx.setField(["description"], "Weekly planning");
            }
        );

        expect(issued.replica.clockState).toEqual({
            replicaId: "A",
            clock: {A: 2},
            counter: 2,
        });

        expect(issued.transaction).toEqual({
            txId: "A:tx:1",
            objectId: OBJECT_ID,
            replicaId: "A",
            operations: [
                {
                    operationId: "A:1",
                    transactionId: "A:tx:1",
                    objectId: OBJECT_ID,
                    replicaId: "A",
                    clockSnapshot: {A: 1},
                    action: {
                        type: "field.set",
                        path: ["title"],
                        value: "Team Sync",
                    }
                },
                {
                    operationId: "A:2",
                    transactionId: "A:tx:1",
                    objectId: OBJECT_ID,
                    replicaId: "A",
                    clockSnapshot: {A: 2},
                    action: {
                        type: "field.set",
                        path: ["description"],
                        value: "Weekly planning",
                    }
                },
            ],
        });
    });

    it("applyLocalTransaction appends all emitted operations into replica history", () => {
        let replica = createReplicaState("A");

        replica = applyLocalTransaction(replica, OBJECT_ID, (tx) => {
            tx.setField(["title"], "Team Sync");
            tx.setField(["description"], "Weekly planning");
            tx.setAdd(["tags"], "team");
        });

        const history = replica.objects[OBJECT_ID];
        expect(history).not.toBeUndefined();
        expect(history?.operations.map((op) => op.operationId)).toEqual([
            "A:1",
            "A:2",
            "A:3",
        ]);
        expect(history?.operations.map((op) => op.transactionId)).toEqual([
            "A:tx:1",
            "A:tx:1",
            "A:tx:1",
        ]);

        expect(replica.clockState).toEqual({
            replicaId: "A",
            clock: {A: 3},
            counter: 3,
        });
    });

    it("applyLocalTransaction materializes same state as applying equivalent local actions one by one", () => {
        let txReplica = createReplicaState("A");
        let opReplica = createReplicaState("A");

        txReplica = applyLocalTransaction(txReplica, OBJECT_ID, (tx) => {
            tx.setField(["title"], "Team Sync");
            tx.setField(["description"], "Weekly planning");
            tx.initSet(["tags"]);
            tx.setAdd(["tags"], "team");
        });

        opReplica = applyLocalAction(opReplica, OBJECT_ID, {
            type: "field.set",
            path: ["title"],
            value: "Team Sync",
        });

        opReplica = applyLocalAction(opReplica, OBJECT_ID, {
            type: "field.set",
            path: ["description"],
            value: "Weekly planning",
        });

        opReplica = applyLocalAction(opReplica, OBJECT_ID, {
            type: "node.initSet",
            path: ["tags"],
        });

        opReplica = applyLocalAction(opReplica, OBJECT_ID, {
            type: "set.add",
            path: ["tags"],
            value: "team",
        });

        const txView = viewNode(
            materializeReplicaObject(txReplica, OBJECT_ID, {applyContext}).root,
        );

        const opView = viewNode(
            materializeReplicaObject(opReplica, OBJECT_ID, {applyContext}).root,
        );

        expect(txView).toEqual(opView);
    });

    it("appendTransaction produces same result as applyLocalTransaction when using same issued transaction", () => {
        const replica = createReplicaState("A");

        const issued = issueTransaction(replica, OBJECT_ID, (tx) => {
            tx.setField(["title"], "Team Sync");
            tx.setField(["description"], "Weekly planning");
        });

        const appended = appendTransaction(issued.replica, issued.transaction);

        const directlyApplied = applyLocalTransaction(
            createReplicaState("A"),
            OBJECT_ID,
            (tx) => {
                tx.setField(["title"], "Team Sync");
                tx.setField(["description"], "Weekly planning");
            },
        );

        const appendedView = viewNode(
            materializeReplicaObject(appended, OBJECT_ID, {applyContext}).root,
        );

        const directView = viewNode(
            materializeReplicaObject(directlyApplied, OBJECT_ID, {applyContext}).root,
        );

        expect(appendedView).toEqual(directView);
    });

    it("can build nested structures in one transaction", () => {
        let replica = createReplicaState("A");

        replica = applyLocalTransaction(replica, OBJECT_ID, (tx) => {
            tx.initObject(["location"]);
            tx.initSet(["tags"]);
            tx.initArray(["attendees"]);
            tx.initObject(["metadata"]);

            tx.setField(["title"], "Team Sync");
            tx.setField(["location", "room"], "A-101");
            tx.setField(["location", "building"], "HQ");
            tx.setAdd(["tags"], "team");
            tx.arrayInsert(["attendees"], 0, {
                type: "ref",
                objectId: "user-1",
            });
            tx.setField(["metadata", "color"], "blue");
        });

        const view = viewNode(
            materializeReplicaObject(replica, OBJECT_ID, {applyContext}).root,
        );

        expect(view).toEqual({
            attendees: [{type: "ref", objectId: "user-1"}],
            location: {
                building: {
                    kind: "mv",
                    values: ["HQ"],
                },
                room: {
                    kind: "mv",
                    values: ["A-101"],
                },
            },
            metadata: {
                color: {
                    kind: "mv",
                    values: ["blue"],
                },
            },
            tags: ["team"],
            title: {
                kind: "mv",
                values: ["Team Sync"],
            },
        });
    });

    it("can apply multiple transactions sequentially with increasing txIds", () => {
        let replica = createReplicaState("A");

        replica = applyLocalTransaction(replica, OBJECT_ID, (tx) => {
            tx.setField(["title"], "Team Sync");
        });

        replica = applyLocalTransaction(replica, OBJECT_ID, (tx) => {
            tx.setField(["title"], "Weekly Team Sync");
        });

        const history = replica.objects[OBJECT_ID];
        expect(history?.operations.map((op) => [op.operationId, op.transactionId])).toEqual([
            ["A:1", "A:tx:1"],
            ["A:2", "A:tx:2"],
        ]);

        const view = viewNode(
            materializeReplicaObject(replica, OBJECT_ID, {applyContext}).root,
        );

        expect(view).toEqual({
            title: {
                kind: "mv",
                values: ["Weekly Team Sync"],
            },
        });
    });

    it("supports transaction labels and timestamps without affecting materialized state", () => {
        let replica = createReplicaState("A");

        replica = applyLocalTransaction(
            replica,
            OBJECT_ID,
            (tx) => {
                tx.setField(["title"], "Team Sync");
                tx.setField(["description"], "Weekly planning");
            }
        );

        const history = replica.objects[OBJECT_ID];
        expect(history?.operations.every((op) => op.transactionId === "A:tx:1")).toBe(true);

        const view = viewNode(
            materializeReplicaObject(replica, OBJECT_ID, {applyContext}).root,
        );

        expect(view).toEqual({
            description: {
                kind: "mv",
                values: ["Weekly planning"],
            },
            title: {
                kind: "mv",
                values: ["Team Sync"],
            },
        });
    });
});
