import { describe, expect, it } from "vitest";
import {CalendarEventHarness} from "./Calendar";

describe("scenarios/calendar/extended", () => {
    it("bootstrap produces expected base calendar view", () => {
        const a = new CalendarEventHarness({ replicaId: "A" }).bootstrapBaseEvent();

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

        expect(a.getTitle()).toEqual({
            kind: "mv",
            values: ["Team Sync"],
        });
        expect(a.getDescription()).toBe("Weekly planning");
        expect(a.getStartAt()).toBe("2026-03-07T10:00:00Z");
        expect(a.getEndAt()).toBe("2026-03-07T11:00:00Z");
        expect(a.getOrganizer()).toEqual({ type: "ref", objectId: "user-1" });
        expect(a.getRoom()).toBe("A-101");
        expect(a.getBuilding()).toBe("HQ");
        expect(a.getColor()).toBe("blue");
        expect(a.getNote()).toEqual({
            kind: "mv",
            values: ["base-note"],
        });
        expect(a.getTags()).toEqual(["team"]);
        expect(a.getAttendees()).toEqual([{ type: "ref", objectId: "user-2" }]);
        expect(a.getAttendeeCount()).toBe(1);
        expect(a.hasTag("team")).toBe(true);
        expect(a.hasTag("urgent")).toBe(false);
    });

    it("shows intermediate local states for sequential scalar updates", () => {
        const a = new CalendarEventHarness({ replicaId: "A" }).bootstrapBaseEvent();

        expect(a.getDescription()).toBe("Weekly planning");
        expect(a.getBuilding()).toBe("HQ");

        a.setDescription("Planning v2");
        expect(a.getDescription()).toBe("Planning v2");
        expect(a.getBuilding()).toBe("HQ");

        a.setDescription("Planning v3");
        expect(a.getDescription()).toBe("Planning v3");
        expect(a.getBuilding()).toBe("HQ");

        a.setBuilding("HQ-2");
        expect(a.getDescription()).toBe("Planning v3");
        expect(a.getBuilding()).toBe("HQ-2");

        expect(a.view()).toEqual({
            attendees: [{ type: "ref", objectId: "user-2" }],
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
            organizer: { type: "ref", objectId: "user-1" },
            startAt: "2026-03-07T10:00:00Z",
            tags: ["team"],
            title: {
                kind: "mv",
                values: ["Team Sync"],
            },
        });
    });

    it("shows intermediate local states for tags", () => {
        const a = new CalendarEventHarness({ replicaId: "A" }).bootstrapBaseEvent();

        expect(a.getTags()).toEqual(["team"]);

        a.addTag("urgent");
        expect(a.getTags()).toEqual(["team", "urgent"]);
        expect(a.hasTag("urgent")).toBe(true);

        a.addTag("planning");
        expect(a.getTags()).toEqual(["planning", "team", "urgent"]);

        a.removeTag("team");
        expect(a.getTags()).toEqual(["planning", "urgent"]);
        expect(a.hasTag("team")).toBe(false);
    });

    it("shows intermediate local states for attendees array", () => {
        const a = new CalendarEventHarness({ replicaId: "A" }).bootstrapBaseEvent();

        expect(a.getAttendees()).toEqual([{ type: "ref", objectId: "user-2" }]);
        expect(a.getAttendeeCount()).toBe(1);

        a.addAttendee("user-3");
        expect(a.getAttendees()).toEqual([
            { type: "ref", objectId: "user-2" },
            { type: "ref", objectId: "user-3" },
        ]);
        expect(a.getAttendeeCount()).toBe(2);

        a.addAttendee("user-4", 0);
        expect(a.getAttendees()).toEqual([
            { type: "ref", objectId: "user-2" },
            { type: "ref", objectId: "user-3" },
            { type: "ref", objectId: "user-4" },
        ]);

        a.removeAttendeeAt(1);
        expect(a.getAttendees()).toEqual([
            { type: "ref", objectId: "user-2" },
            { type: "ref", objectId: "user-4" },
        ]);
    });

    it("shows intermediate local states for metadata", () => {
        const a = new CalendarEventHarness({ replicaId: "A" }).bootstrapBaseEvent();

        expect(a.getColor()).toBe("blue");
        expect(a.getNote()).toEqual({
            kind: "mv",
            values: ["base-note"],
        });

        a.setColor("green");
        expect(a.getColor()).toBe("green");
        expect(a.getNote()).toEqual({
            kind: "mv",
            values: ["base-note"],
        });

        a.setNote("note-v2");
        expect(a.getColor()).toBe("green");
        expect(a.getNote()).toEqual({
            kind: "mv",
            values: ["note-v2"],
        });

        a.setNote("note-v3");
        expect(a.getNote()).toEqual({
            kind: "mv",
            values: ["note-v3"],
        });
    });

    it("keeps concurrent MV title updates and preserves local views before merge", () => {
        const a = new CalendarEventHarness({ replicaId: "A" }).bootstrapBaseEvent();
        const b = new CalendarEventHarness({ replicaId: "B" }).mergeFrom(a, "B");

        expect(a.getTitle()).toEqual({
            kind: "mv",
            values: ["Team Sync"],
        });
        expect(b.getTitle()).toEqual({
            kind: "mv",
            values: ["Team Sync"],
        });

        a.setTitle("Team Sync — Urgent");
        b.setTitle("Weekly Team Sync");

        expect(a.getTitle()).toEqual({
            kind: "mv",
            values: ["Team Sync — Urgent"],
        });

        expect(b.getTitle()).toEqual({
            kind: "mv",
            values: ["Weekly Team Sync"],
        });

        const merged = new CalendarEventHarness({ replicaId: "M" })
            .replaceReplica(a.replica)
            .mergeFrom(b, "M");

        expect(merged.getTitle()).toEqual({
            kind: "mv",
            values: ["Team Sync — Urgent", "Weekly Team Sync"],
        });
    });

    it("keeps concurrent MV note updates and preserves local views before merge", () => {
        const a = new CalendarEventHarness({ replicaId: "A" }).bootstrapBaseEvent();
        const b = new CalendarEventHarness({ replicaId: "B" }).mergeFrom(a, "B");

        a.setNote("note-from-a");
        b.setNote("note-from-b");

        expect(a.getNote()).toEqual({
            kind: "mv",
            values: ["note-from-a"],
        });

        expect(b.getNote()).toEqual({
            kind: "mv",
            values: ["note-from-b"],
        });

        const merged = new CalendarEventHarness({ replicaId: "M" })
            .replaceReplica(a.replica)
            .mergeFrom(b, "M");

        expect(merged.getNote()).toEqual({
            kind: "mv",
            values: ["note-from-a", "note-from-b"],
        });
    });

    it("collapses LWW nested field to causally latest update across replicas", () => {
        const a = new CalendarEventHarness({ replicaId: "A" }).bootstrapBaseEvent();
        const b = new CalendarEventHarness({ replicaId: "B" }).mergeFrom(a, "B");

        a.setRoom("A-201");
        expect(a.getRoom()).toBe("A-201");

        b.setRoom("B-205");
        expect(b.getRoom()).toBe("B-205");

        const merged = new CalendarEventHarness({ replicaId: "M" })
            .replaceReplica(a.replica)
            .mergeFrom(b, "M");

        expect(merged.getRoom()).toBe("B-205");
    });

    it("collapses LWW ref field to latest local write", () => {
        const a = new CalendarEventHarness({ replicaId: "A" }).bootstrapBaseEvent();

        expect(a.getOrganizer()).toEqual({ type: "ref", objectId: "user-1" });

        a.setOrganizer("user-2");
        expect(a.getOrganizer()).toEqual({ type: "ref", objectId: "user-2" });

        a.setOrganizer("user-3");
        expect(a.getOrganizer()).toEqual({ type: "ref", objectId: "user-3" });
    });

    it("supports concurrent set additions from different replicas", () => {
        const a = new CalendarEventHarness({ replicaId: "A" }).bootstrapBaseEvent();
        const b = new CalendarEventHarness({ replicaId: "B" }).mergeFrom(a, "B");

        a.addTag("urgent");
        b.addTag("planning");

        expect(a.getTags()).toEqual(["team", "urgent"]);
        expect(b.getTags()).toEqual(["planning", "team"]);

        const merged = new CalendarEventHarness({ replicaId: "M" })
            .replaceReplica(a.replica)
            .mergeFrom(b, "M");

        expect(merged.getTags()).toEqual(["planning", "team", "urgent"]);
    });

    it("keeps unseen set add after concurrent remove", () => {
        const a = new CalendarEventHarness({ replicaId: "A" }).bootstrapBaseEvent();
        const b = new CalendarEventHarness({ replicaId: "B" }).mergeFrom(a, "B");

        a.removeTag("team");
        expect(a.getTags()).toEqual([]);

        b.addTag("team");
        expect(b.getTags()).toEqual(["team"]);

        const merged = new CalendarEventHarness({ replicaId: "M" })
            .replaceReplica(a.replica)
            .mergeFrom(b, "M");

        expect(merged.getTags()).toEqual(["team"]);
        expect(merged.hasTag("team")).toBe(true);
    });

    it("supports array inserts on different replicas and preserves deterministic order", () => {
        const a = new CalendarEventHarness({ replicaId: "A" }).bootstrapBaseEvent();
        const b = new CalendarEventHarness({ replicaId: "B" }).mergeFrom(a, "B");

        a.addAttendee("user-3");
        b.addAttendee("user-4");

        expect(a.getAttendees()).toEqual([
            { type: "ref", objectId: "user-2" },
            { type: "ref", objectId: "user-3" },
        ]);

        expect(b.getAttendees()).toEqual([
            { type: "ref", objectId: "user-2" },
            { type: "ref", objectId: "user-4" },
        ]);

        const merged = new CalendarEventHarness({ replicaId: "M" })
            .replaceReplica(a.replica)
            .mergeFrom(b, "M");

        expect(merged.getAttendees()).toEqual([
            { type: "ref", objectId: "user-2" },
            { type: "ref", objectId: "user-3" },
            { type: "ref", objectId: "user-4" },
        ]);
    });

    it("supports array removal on one replica and insert on another with deterministic merged order", () => {
        const a = new CalendarEventHarness({ replicaId: "A" }).bootstrapBaseEvent();
        const b = new CalendarEventHarness({ replicaId: "B" }).mergeFrom(a, "B");

        a.addAttendee("user-3");
        b.removeAttendeeAt(0).addAttendee("user-4", 0);

        expect(a.getAttendees()).toEqual([
            { type: "ref", objectId: "user-2" },
            { type: "ref", objectId: "user-3" },
        ]);

        expect(b.getAttendees()).toEqual([{ type: "ref", objectId: "user-4" }]);

        const merged = new CalendarEventHarness({ replicaId: "M" })
            .replaceReplica(a.replica)
            .mergeFrom(b, "M");

        expect(merged.getAttendees()).toEqual([
            { type: "ref", objectId: "user-3" },
            { type: "ref", objectId: "user-4" },
        ]);
    });

    it("keeps base fields unchanged when only tags change", () => {
        const a = new CalendarEventHarness({ replicaId: "A" }).bootstrapBaseEvent();

        a.addTag("urgent").addTag("planning");

        expect(a.getTitle()).toEqual({
            kind: "mv",
            values: ["Team Sync"],
        });
        expect(a.getDescription()).toBe("Weekly planning");
        expect(a.getRoom()).toBe("A-101");
        expect(a.getBuilding()).toBe("HQ");
        expect(a.getColor()).toBe("blue");
        expect(a.getTags()).toEqual(["planning", "team", "urgent"]);
    });

    it("keeps base fields unchanged when only attendees change", () => {
        const a = new CalendarEventHarness({ replicaId: "A" }).bootstrapBaseEvent();

        a.addAttendee("user-3").addAttendee("user-4");

        expect(a.getTitle()).toEqual({
            kind: "mv",
            values: ["Team Sync"],
        });
        expect(a.getOrganizer()).toEqual({ type: "ref", objectId: "user-1" });
        expect(a.getTags()).toEqual(["team"]);
        expect(a.getAttendees()).toEqual([
            { type: "ref", objectId: "user-2" },
            { type: "ref", objectId: "user-3" },
            { type: "ref", objectId: "user-4" },
        ]);
    });

    it("merge is idempotent at view level", () => {
        const a = new CalendarEventHarness({ replicaId: "A" }).bootstrapBaseEvent();

        a
            .setTitle("Team Sync — Urgent")
            .addTag("urgent")
            .setRoom("B-205");

        const mergedOnce = new CalendarEventHarness({ replicaId: "M1" })
            .replaceReplica(a.replica)
            .mergeFrom(a, "M1");

        const mergedTwice = new CalendarEventHarness({ replicaId: "M2" })
            .replaceReplica(mergedOnce.replica)
            .mergeFrom(a, "M2");

        expect(mergedOnce.view()).toEqual(mergedTwice.view());
    });

    it("merge is commutative at view level for concurrent updates", () => {
        const a = new CalendarEventHarness({ replicaId: "A" }).bootstrapBaseEvent();
        const b = new CalendarEventHarness({ replicaId: "B" }).mergeFrom(a, "B");

        a
            .setTitle("Team Sync — Urgent")
            .addTag("urgent");

        b
            .setTitle("Weekly Team Sync")
            .addTag("planning");

        const ab = new CalendarEventHarness({ replicaId: "M1" })
            .replaceReplica(a.replica)
            .mergeFrom(b, "M1");

        const ba = new CalendarEventHarness({ replicaId: "M2" })
            .replaceReplica(b.replica)
            .mergeFrom(a, "M2");

        expect(ab.view()).toEqual(ba.view());
    });

    it("preserves imported base state on follower replica before independent edits", () => {
        const source = new CalendarEventHarness({ replicaId: "A" }).bootstrapBaseEvent();
        const follower = new CalendarEventHarness({ replicaId: "B" }).mergeFrom(source, "B");

        expect(follower.view()).toEqual(source.view());

        follower
            .setTitle("Follower Title")
            .setRoom("Follower Room")
            .addTag("follower");

        expect(follower.view()).toEqual({
            attendees: [{ type: "ref", objectId: "user-2" }],
            description: "Weekly planning",
            endAt: "2026-03-07T11:00:00Z",
            location: {
                building: "HQ",
                room: "Follower Room",
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
            tags: ["follower", "team"],
            title: {
                kind: "mv",
                values: ["Follower Title"],
            },
        });
    });

    it("supports many mixed local updates and preserves coherent final view", () => {
        const a = new CalendarEventHarness({ replicaId: "A" }).bootstrapBaseEvent();

        a
            .setTitle("Title v2")
            .setTitle("Title v3")
            .setDescription("Desc v2")
            .setOrganizer("user-5")
            .setRoom("C-301")
            .setBuilding("Annex")
            .addTag("urgent")
            .addTag("planning")
            .removeTag("team")
            .addAttendee("user-3")
            .addAttendee("user-4")
            .removeAttendeeAt(0)
            .setColor("red")
            .setNote("note-v2")
            .setNote("note-v3");

        expect(a.view()).toEqual({
            attendees: [
                { type: "ref", objectId: "user-3" },
                { type: "ref", objectId: "user-4" },
            ],
            description: "Desc v2",
            endAt: "2026-03-07T11:00:00Z",
            location: {
                building: "Annex",
                room: "C-301",
            },
            metadata: {
                color: "red",
                note: {
                    kind: "mv",
                    values: ["note-v3"],
                },
            },
            organizer: { type: "ref", objectId: "user-5" },
            startAt: "2026-03-07T10:00:00Z",
            tags: ["planning", "urgent"],
            title: {
                kind: "mv",
                values: ["Title v3"],
            },
        });
    });

    it("can inspect intermediate merged states across multiple merge phases", () => {
        const a = new CalendarEventHarness({ replicaId: "A" }).bootstrapBaseEvent();
        const b = new CalendarEventHarness({ replicaId: "B" }).mergeFrom(a, "B");
        const c = new CalendarEventHarness({ replicaId: "C" }).mergeFrom(a, "C");

        a.setTitle("Title from A").addTag("urgent");
        b.setTitle("Title from B").setRoom("B-205");
        c.setNote("note-from-c").addAttendee("user-5");

        const ab = new CalendarEventHarness({ replicaId: "AB" })
            .replaceReplica(a.replica)
            .mergeFrom(b, "AB");

        expect(ab.view()).toEqual({
            attendees: [{ type: "ref", objectId: "user-2" }],
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
            organizer: { type: "ref", objectId: "user-1" },
            startAt: "2026-03-07T10:00:00Z",
            tags: ["team", "urgent"],
            title: {
                kind: "mv",
                values: ["Title from A", "Title from B"],
            },
        });

        const abc = new CalendarEventHarness({ replicaId: "ABC" })
            .replaceReplica(ab.replica)
            .mergeFrom(c, "ABC");

        expect(abc.view()).toEqual({
            attendees: [
                { type: "ref", objectId: "user-2" },
                { type: "ref", objectId: "user-5" },
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
                    values: ["note-from-c"],
                },
            },
            organizer: { type: "ref", objectId: "user-1" },
            startAt: "2026-03-07T10:00:00Z",
            tags: ["team", "urgent"],
            title: {
                kind: "mv",
                values: ["Title from A", "Title from B"],
            },
        });
    });
});