import {describe, expect, it} from "vitest";
import {CalendarEventHarness} from "./Calendar";

describe("scenarios/calendar", () => {
    it("merges concurrent MV title updates, LWW nested fields, set union and array inserts", () => {
        const replicaA = new CalendarEventHarness({replicaId: "A"}).bootstrapBaseEvent();
        const replicaB = new CalendarEventHarness({replicaId: "B"}).mergeFrom(replicaA, "B");

        replicaA
            .setTitle("Team Sync — Urgent")
            .addTag("urgent")
            .addAttendee("user-3");

        replicaB
            .setTitle("Weekly Team Sync")
            .setRoom("B-205")
            .addTag("planning");

        const merged = new CalendarEventHarness({replicaId: "M"})
            .replaceReplica(replicaA.replica)
            .mergeFrom(replicaB, "M");

        expect(merged.view()).toEqual({
            attendees: [
                {type: "ref", objectId: "user-2"},
                {type: "ref", objectId: "user-3"},
            ],
            description: "Weekly planning",
            endAt: "2026-03-07T11:00:00Z",
            location: {
                building: "HQ",
                room: "B-205",
            },
            metadata: {
                color: "blue",
                note: {
                    kind: "mv",
                    values: ["base-note"],
                },
            },
            organizer: {type: "ref", objectId: "user-1"},
            startAt: "2026-03-07T10:00:00Z",
            tags: ["planning", "team", "urgent"],
            title: {
                kind: "mv",
                values: ["Team Sync — Urgent", "Weekly Team Sync"],
            },
        });
    });

    it("uses LWW semantics for scalar fields and keeps only causally latest value", () => {
        const a = new CalendarEventHarness({replicaId: "A"}).bootstrapBaseEvent();

        a
            .setDescription("Planning v2")
            .setDescription("Planning v3")
            .setBuilding("HQ-2");

        expect(a.view()).toEqual({
            attendees: [{type: "ref", objectId: "user-2"}],
            description: "Planning v3",
            endAt: "2026-03-07T11:00:00Z",
            location: {
                building: "HQ-2",
                room: "A-101",
            },
            metadata: {
                color: "blue",
                note: {
                    kind: "mv",
                    values: ["base-note"],
                },
            },
            organizer: {type: "ref", objectId: "user-1"},
            startAt: "2026-03-07T10:00:00Z",
            tags: ["team"],
            title: {
                kind: "mv",
                values: ["Team Sync"],
            },
        });

        expect(a.getDescription()).toBe("Planning v3");
        expect(a.getBuilding()).toBe("HQ-2");
    });

    it("keeps concurrent MV map note values while LWW map color collapses to latest", () => {
        const replicaA = new CalendarEventHarness({replicaId: "A"}).bootstrapBaseEvent();
        const replicaB = new CalendarEventHarness({replicaId: "B"}).mergeFrom(replicaA, "B");

        replicaA
            .setNote("note-from-replicaA")
            .setColor("green");

        replicaB.setNote("note-from-replicaB");

        const merged = new CalendarEventHarness({replicaId: "M"})
            .replaceReplica(replicaA.replica)
            .mergeFrom(replicaB, "M");

        expect(merged.view()).toEqual({
            attendees: [{type: "ref", objectId: "user-2"}],
            description: "Weekly planning",
            endAt: "2026-03-07T11:00:00Z",
            location: {
                building: "HQ",
                room: "A-101",
            },
            metadata: {
                color: "green",
                note: {
                    kind: "mv",
                    values: ["note-from-replicaA", "note-from-replicaB"],
                },
            },
            organizer: {type: "ref", objectId: "user-1"},
            startAt: "2026-03-07T10:00:00Z",
            tags: ["team"],
            title: {
                kind: "mv",
                values: ["Team Sync"],
            },
        });

        expect(merged.getColor()).toBe("green");
    });

    it("keeps unseen set add after concurrent remove (OR-Set semantics)", () => {
        const a = new CalendarEventHarness({replicaId: "A"}).bootstrapBaseEvent();
        const b = new CalendarEventHarness({replicaId: "B"}).mergeFrom(a, "B");

        a.removeTag("team");
        b.addTag("team");

        const merged = new CalendarEventHarness({replicaId: "M"})
            .replaceReplica(a.replica)
            .mergeFrom(b, "M");

        expect(merged.view()).toEqual({
            attendees: [{type: "ref", objectId: "user-2"}],
            description: "Weekly planning",
            endAt: "2026-03-07T11:00:00Z",
            location: {
                building: "HQ",
                room: "A-101",
            },
            metadata: {
                color: "blue",
                note: {
                    kind: "mv",
                    values: ["base-note"],
                },
            },
            organizer: {type: "ref", objectId: "user-1"},
            startAt: "2026-03-07T10:00:00Z",
            tags: ["team"],
            title: {
                kind: "mv",
                values: ["Team Sync"],
            },
        });

        expect(merged.hasTag("team")).toBe(true);
    });

    it("preserves array order under inserts and removals across replicas", () => {
        const a = new CalendarEventHarness({replicaId: "A"}).bootstrapBaseEvent();
        const b = new CalendarEventHarness({replicaId: "B"}).mergeFrom(a, "B");

        a.addAttendee("user-3");
        b.removeAttendeeAt(0).addAttendee("user-4", 0);

        const merged = new CalendarEventHarness({replicaId: "M"})
            .replaceReplica(a.replica)
            .mergeFrom(b, "M").debug("M after merge");

        expect(merged.view()).toEqual({
            attendees: [
                {type: "ref", objectId: "user-3"},
                {type: "ref", objectId: "user-4"},
            ],
            description: "Weekly planning",
            endAt: "2026-03-07T11:00:00Z",
            location: {
                building: "HQ",
                room: "A-101",
            },
            metadata: {
                color: "blue",
                note: {
                    kind: "mv",
                    values: ["base-note"],
                },
            },
            organizer: {type: "ref", objectId: "user-1"},
            startAt: "2026-03-07T10:00:00Z",
            tags: ["team"],
            title: {
                kind: "mv",
                values: ["Team Sync"],
            },
        });

        expect(merged.getAttendeeCount()).toBe(2);
        expect(merged.getFirstAttendee()).toEqual({
            type: "ref",
            objectId: "user-3",
        });
    });

    it("resolves ref field with LWW semantics", () => {
        const a = new CalendarEventHarness({replicaId: "A"}).bootstrapBaseEvent();

        a
            .setOrganizer("user-2")
            .setOrganizer("user-3");

        expect(a.view()).toEqual({
            attendees: [{type: "ref", objectId: "user-2"}],
            description: "Weekly planning",
            endAt: "2026-03-07T11:00:00Z",
            location: {
                building: "HQ",
                room: "A-101",
            },
            metadata: {
                color: "blue",
                note: {
                    kind: "mv",
                    values: ["base-note"],
                },
            },
            organizer: {type: "ref", objectId: "user-3"},
            startAt: "2026-03-07T10:00:00Z",
            tags: ["team"],
            title: {
                kind: "mv",
                values: ["Team Sync"],
            },
        });

        expect(a.getOrganizer()).toEqual({
            type: "ref",
            objectId: "user-3",
        });
    });
});