import { describe, expect, it } from "vitest";
import {CalendarEventHarness} from "./Calendar";

describe("scenarios/calendar/edge-cases", () => {
    it("merge with empty replica preserves populated replica view", () => {
        const populated = new CalendarEventHarness({ replicaId: "A" }).bootstrapBaseEvent();
        const empty = new CalendarEventHarness({ replicaId: "B" });

        const merged = new CalendarEventHarness({ replicaId: "M" })
            .replaceReplica(populated.replica)
            .mergeFrom(empty, "M");

        expect(merged.view()).toEqual(populated.view());
    });

    it("merge of two empty replicas produces empty calendar materialization shape", () => {
        const a = new CalendarEventHarness({ replicaId: "A" });
        const b = new CalendarEventHarness({ replicaId: "B" });

        const merged = new CalendarEventHarness({ replicaId: "M" })
            .replaceReplica(a.replica)
            .mergeFrom(b, "M");

        expect(merged.view()).toEqual({
            attendees: [],
            description: null,
            endAt: null,
            location: {
                building: null,
                room: null,
            },
            metadata: {
                color: null,
                note: {
                    kind: "mv",
                    values: [],
                },
            },
            organizer: null,
            startAt: null,
            tags: [],
            title: {
                kind: "mv",
                values: [],
            },
        });
    });

    it("repeated merge from the same source is idempotent at view level", () => {
        const source = new CalendarEventHarness({ replicaId: "A" })
            .bootstrapBaseEvent()
            .setTitle("Title v2")
            .addTag("urgent");

        const follower = new CalendarEventHarness({ replicaId: "B" });

        follower.mergeFrom(source, "B");
        const once = follower.view();

        follower.mergeFrom(source, "B");
        const twice = follower.view();

        expect(twice).toEqual(once);
    });

    it("self-merge does not change view", () => {
        const a = new CalendarEventHarness({ replicaId: "A" })
            .bootstrapBaseEvent()
            .setTitle("Self merge title")
            .addTag("urgent")
            .setRoom("B-205");

        const before = a.view();

        a.mergeFrom(a, "A");

        expect(a.view()).toEqual(before);
    });

    it("empty repeated merges remain stable", () => {
        const a = new CalendarEventHarness({ replicaId: "A" });
        const b = new CalendarEventHarness({ replicaId: "B" });

        const merged = new CalendarEventHarness({ replicaId: "M" })
            .replaceReplica(a.replica)
            .mergeFrom(b, "M");

        const once = merged.view();

        merged.mergeFrom(a, "M").mergeFrom(b, "M");
        const twice = merged.view();

        expect(twice).toEqual(once);
    });

    it("removing a non-existing tag does not create visible garbage", () => {
        const a = new CalendarEventHarness({ replicaId: "A" }).bootstrapBaseEvent();

        a.removeTag("urgent");

        expect(a.getTags()).toEqual(["team"]);
        expect(a.hasTag("urgent")).toBe(false);

        expect(a.view()).toEqual({
            attendees: [{ type: "ref", objectId: "user-2" }],
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
            organizer: { type: "ref", objectId: "user-1" },
            startAt: "2026-03-07T10:00:00Z",
            tags: ["team"],
            title: {
                kind: "mv",
                values: ["Team Sync"],
            },
        });
    });

    it("repeated removal of the same tag stays stable", () => {
        const a = new CalendarEventHarness({ replicaId: "A" }).bootstrapBaseEvent();

        a.removeTag("team");
        expect(a.getTags()).toEqual([]);

        a.removeTag("team");
        expect(a.getTags()).toEqual([]);
    });

    it("re-adding tag after local remove restores visibility", () => {
        const a = new CalendarEventHarness({ replicaId: "A" }).bootstrapBaseEvent();

        a.removeTag("team");
        expect(a.getTags()).toEqual([]);

        a.addTag("team");
        expect(a.getTags()).toEqual(["team"]);
    });

    it("repeated add of the same tag remains visibly deduplicated", () => {
        const a = new CalendarEventHarness({ replicaId: "A" }).bootstrapBaseEvent();

        a.addTag("team").addTag("team").addTag("team");

        expect(a.getTags()).toEqual(["team"]);
    });

    it("can remove the only attendee and produce empty attendee list", () => {
        const a = new CalendarEventHarness({ replicaId: "A" }).bootstrapBaseEvent();

        expect(a.getAttendees()).toEqual([{ type: "ref", objectId: "user-2" }]);

        a.removeAttendeeAt(0);

        expect(a.getAttendees()).toEqual([]);
        expect(a.getAttendeeCount()).toBe(0);
        expect(a.getFirstAttendee()).toBeNull();
    });

    it("supports repeated attendee removals without resurrecting elements", () => {
        const a = new CalendarEventHarness({ replicaId: "A" }).bootstrapBaseEvent();

        a.removeAttendeeAt(0);
        expect(a.getAttendees()).toEqual([]);

        // second remove would be invalid semantically if applied blindly,
        // so instead we verify state remains empty after additional unrelated ops
        a.addTag("urgent");
        expect(a.getAttendees()).toEqual([]);
    });

    it("adding attendees after full removal works", () => {
        const a = new CalendarEventHarness({ replicaId: "A" }).bootstrapBaseEvent();

        a.removeAttendeeAt(0);
        expect(a.getAttendees()).toEqual([]);

        a.addAttendee("user-3");
        a.addAttendee("user-4");

        expect(a.getAttendees()).toEqual([
            { type: "ref", objectId: "user-3" },
            { type: "ref", objectId: "user-4" },
        ]);
    });

    it("concurrent attendee additions from many replicas converge deterministically", () => {
        const a = new CalendarEventHarness({ replicaId: "A" }).bootstrapBaseEvent();
        const b = new CalendarEventHarness({ replicaId: "B" }).mergeFrom(a, "B");
        const c = new CalendarEventHarness({ replicaId: "C" }).mergeFrom(a, "C");
        const d = new CalendarEventHarness({ replicaId: "D" }).mergeFrom(a, "D");

        a.addAttendee("user-3");
        b.addAttendee("user-4");
        c.addAttendee("user-5");
        d.addAttendee("user-6");

        const merged = new CalendarEventHarness({ replicaId: "M" })
            .replaceReplica(a.replica)
            .mergeFrom(b, "M")
            .mergeFrom(c, "M")
            .mergeFrom(d, "M");

        expect(merged.getAttendees()).toEqual([
            { type: "ref", objectId: "user-2" },
            { type: "ref", objectId: "user-3" },
            { type: "ref", objectId: "user-4" },
            { type: "ref", objectId: "user-5" },
            { type: "ref", objectId: "user-6" },
        ]);
    });

    it("concurrent title writes from many replicas produce MV title", () => {
        const a = new CalendarEventHarness({ replicaId: "A" }).bootstrapBaseEvent();
        const b = new CalendarEventHarness({ replicaId: "B" }).mergeFrom(a, "B");
        const c = new CalendarEventHarness({ replicaId: "C" }).mergeFrom(a, "C");

        a.setTitle("Title from A");
        b.setTitle("Title from B");
        c.setTitle("Title from C");

        const merged = new CalendarEventHarness({ replicaId: "M" })
            .replaceReplica(a.replica)
            .mergeFrom(b, "M")
            .mergeFrom(c, "M");

        expect(merged.getTitle()).toEqual({
            kind: "mv",
            values: ["Title from A", "Title from B", "Title from C"],
        });
    });

    it("concurrent notes from many replicas produce MV note", () => {
        const a = new CalendarEventHarness({ replicaId: "A" }).bootstrapBaseEvent();
        const b = new CalendarEventHarness({ replicaId: "B" }).mergeFrom(a, "B");
        const c = new CalendarEventHarness({ replicaId: "C" }).mergeFrom(a, "C");

        a.setNote("note-a");
        b.setNote("note-b");
        c.setNote("note-c");

        const merged = new CalendarEventHarness({ replicaId: "M" })
            .replaceReplica(a.replica)
            .mergeFrom(b, "M")
            .mergeFrom(c, "M");

        expect(merged.getNote()).toEqual({
            kind: "mv",
            values: ["note-a", "note-b", "note-c"],
        });
    });

    it("LWW fields remain single-valued even after many sequential local updates", () => {
        const a = new CalendarEventHarness({ replicaId: "A" }).bootstrapBaseEvent();

        a
            .setDescription("d1")
            .setDescription("d2")
            .setDescription("d3")
            .setRoom("R1")
            .setRoom("R2")
            .setRoom("R3")
            .setColor("red")
            .setColor("green")
            .setColor("black");

        expect(a.getDescription()).toBe("d3");
        expect(a.getRoom()).toBe("R3");
        expect(a.getColor()).toBe("black");
    });

    it("follower can sync, diverge, and resync without losing base state", () => {
        const source = new CalendarEventHarness({ replicaId: "A" }).bootstrapBaseEvent();
        const follower = new CalendarEventHarness({ replicaId: "B" }).mergeFrom(source, "B");

        follower
            .setTitle("Follower title")
            .setNote("follower-note")
            .addTag("follower");

        source
            .setRoom("A-202")
            .addTag("source");

        follower.mergeFrom(source, "B");

        const view = follower.view() as Record<string, any>
        expect({
            ...view,
            tags: [...view.tags].sort()
        }).toEqual({
            attendees: [{ type: "ref", objectId: "user-2" }],
            description: "Weekly planning",
            endAt: "2026-03-07T11:00:00Z",
            location: {
                building: "HQ",
                room: "A-202",
            },
            metadata: {
                color: "blue",
                note: {
                    kind: "mv",
                    values: ["follower-note"],
                },
            },
            organizer: { type: "ref", objectId: "user-1" },
            startAt: "2026-03-07T10:00:00Z",
            tags: ["follower", "source", "team"],
            title: {
                kind: "mv",
                values: ["Follower title"],
            },
        });
    });

    it("merge chain A->B->C and then back into A remains convergent", () => {
        const a = new CalendarEventHarness({ replicaId: "A" }).bootstrapBaseEvent();
        const b = new CalendarEventHarness({ replicaId: "B" }).mergeFrom(a, "B");
        const c = new CalendarEventHarness({ replicaId: "C" }).mergeFrom(b, "C");

        a.setTitle("A-title").addTag("a-tag");
        b.setRoom("B-room").setColor("green");
        c.setNote("c-note").addAttendee("user-7");

        const mergedABC = new CalendarEventHarness({ replicaId: "ABC" })
            .replaceReplica(a.replica)
            .mergeFrom(b, "ABC")
            .mergeFrom(c, "ABC");

        const mergedCBA = new CalendarEventHarness({ replicaId: "CBA" })
            .replaceReplica(c.replica)
            .mergeFrom(b, "CBA")
            .mergeFrom(a, "CBA");

        expect(mergedABC.view()).toEqual(mergedCBA.view());
    });

    it("duplicate source replicas merged multiple times do not duplicate visible tags or attendees", () => {
        const source = new CalendarEventHarness({ replicaId: "A" }).bootstrapBaseEvent();
        source.addTag("urgent").addAttendee("user-3");

        const merged = new CalendarEventHarness({ replicaId: "M" })
            .mergeFrom(source, "M")
            .mergeFrom(source, "M")
            .mergeFrom(source, "M");

        expect(merged.getTags().sort()).toEqual(["team", "urgent"]);
        expect(merged.getAttendees()).toEqual([
            { type: "ref", objectId: "user-2" },
            { type: "ref", objectId: "user-3" },
        ]);
    });

    it("independent LWW ref updates on different replicas deterministically converge", () => {
        const a = new CalendarEventHarness({ replicaId: "A" }).bootstrapBaseEvent();
        const b = new CalendarEventHarness({ replicaId: "B" }).mergeFrom(a, "B");

        a.setOrganizer("user-2");
        b.setOrganizer("user-3");

        const merged = new CalendarEventHarness({ replicaId: "M" })
            .replaceReplica(a.replica)
            .mergeFrom(b, "M");

        expect(merged.getOrganizer()).toEqual({ type: "ref", objectId: "user-3" });
    });

    it("base event can be extended into a dense final state from many replicas", () => {
        const a = new CalendarEventHarness({ replicaId: "A" }).bootstrapBaseEvent();
        const b = new CalendarEventHarness({ replicaId: "B" }).mergeFrom(a, "B");
        const c = new CalendarEventHarness({ replicaId: "C" }).mergeFrom(a, "C");
        const d = new CalendarEventHarness({ replicaId: "D" }).mergeFrom(a, "D");

        a.setTitle("A-title").addTag("urgent");
        b.setRoom("B-room").setBuilding("Remote");
        c.setNote("c-note").addAttendee("user-8");
        d.setColor("purple").setOrganizer("user-9");

        const merged = new CalendarEventHarness({ replicaId: "M" })
            .replaceReplica(a.replica)
            .mergeFrom(b, "M")
            .mergeFrom(c, "M")
            .mergeFrom(d, "M");


        const view = merged.view() as Record<string, any>

        expect({
            ...view,
            tags: [...view.tags].sort()
        }).toEqual({
            attendees: [
                { type: "ref", objectId: "user-2" },
                { type: "ref", objectId: "user-8" },
            ],
            description: "Weekly planning",
            endAt: "2026-03-07T11:00:00Z",
            location: {
                building: "Remote",
                room: "B-room",
            },
            metadata: {
                color: "purple",
                note: {
                    kind: "mv",
                    values: ["c-note"],
                },
            },
            organizer: { type: "ref", objectId: "user-9" },
            startAt: "2026-03-07T10:00:00Z",
            tags: ["team", "urgent"],
            title: {
                kind: "mv",
                values: ["A-title"],
            },
        });
    });

    it("mix of concurrent remove/add and scalar updates stays coherent", () => {
        const a = new CalendarEventHarness({ replicaId: "A" }).bootstrapBaseEvent();
        const b = new CalendarEventHarness({ replicaId: "B" }).mergeFrom(a, "B");

        a.removeTag("team").setDescription("desc-a").addAttendee("user-3");
        b.addTag("team").setRoom("B-205").removeAttendeeAt(0);

        const merged = new CalendarEventHarness({ replicaId: "M" })
            .replaceReplica(a.replica)
            .mergeFrom(b, "M");

        expect(merged.view()).toEqual({
            attendees: [{ type: "ref", objectId: "user-3" }],
            description: "desc-a",
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
            organizer: { type: "ref", objectId: "user-1" },
            startAt: "2026-03-07T10:00:00Z",
            tags: ["team"],
            title: {
                kind: "mv",
                values: ["Team Sync"],
            },
        });
    });
});