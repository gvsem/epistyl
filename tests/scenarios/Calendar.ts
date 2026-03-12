import {ApplyContext} from "../../src/runtime/apply";
import {
    createArrayNodeState,
    createMapNodeState,
    createObjectNodeState,
    createPrimitiveNodeState,
    createRefNodeState,
    createSetNodeState,
    NodeState
} from "../../src/crdt/state";
import {
    applyLocalAction,
    createReplicaState,
    materializeReplicaObject,
    mergeReplicaStates,
    ReplicaState
} from "../../src/runtime/replica";
import {viewNode} from "../../src/runtime/view";


export interface CalendarHarnessOptions {
    objectId?: string;
    replicaId: string;
    applyContext?: ApplyContext;
}

export function createCalendarInitialRoot(): NodeState {
    const locationNode = createObjectNodeState();
    locationNode.state.fields["room"] = {
        node: createPrimitiveNodeState("lww"),
        slotVersion: null,
    };
    locationNode.state.fields["building"] = {
        node: createPrimitiveNodeState("lww"),
        slotVersion: null,
    };

    const metadataNode = createMapNodeState();
    metadataNode.state.entries["color"] = {
        node: createPrimitiveNodeState("lww"),
        entryVersion: null,
    };
    metadataNode.state.entries["note"] = {
        node: createPrimitiveNodeState("mv"),
        entryVersion: null,
    };

    const root = createObjectNodeState();

    root.state.fields["title"] = {
        node: createPrimitiveNodeState("mv"),
        slotVersion: null,
    };

    root.state.fields["description"] = {
        node: createPrimitiveNodeState("lww"),
        slotVersion: null,
    };

    root.state.fields["startAt"] = {
        node: createPrimitiveNodeState("lww"),
        slotVersion: null,
    };

    root.state.fields["endAt"] = {
        node: createPrimitiveNodeState("lww"),
        slotVersion: null,
    };

    root.state.fields["organizer"] = {
        node: createRefNodeState("lww"),
        slotVersion: null,
    };

    root.state.fields["location"] = {
        node: locationNode,
        slotVersion: null,
    };

    root.state.fields["tags"] = {
        node: createSetNodeState(),
        slotVersion: null,
    };

    root.state.fields["attendees"] = {
        node: createArrayNodeState(),
        slotVersion: null,
    };

    root.state.fields["metadata"] = {
        node: metadataNode,
        slotVersion: null,
    };

    return root;
}

const defaultApplyContext: ApplyContext = {
    policy: {
        defaultPrimitiveSemantics: "mv",
        defaultRefSemantics: "lww",
    },
};

export class CalendarEventHarness {
    private readonly objectId: string;
    private readonly applyContext: ApplyContext;
    private replicaState: ReplicaState;

    constructor(options: CalendarHarnessOptions) {
        this.objectId = options.objectId ?? "event-1";
        this.applyContext = options.applyContext ?? defaultApplyContext;
        this.replicaState = createReplicaState(options.replicaId);
    }

    static fromReplica(
        replica: ReplicaState,
        options?: {
            objectId?: string;
            applyContext?: ApplyContext;
        },
    ): CalendarEventHarness {
        const harness = new CalendarEventHarness({
            replicaId: replica.replicaId,
            objectId: options?.objectId ?? "event-1",
            applyContext: options?.applyContext ?? defaultApplyContext,
        });

        harness.replicaState = replica;
        return harness;
    }

    get replica(): ReplicaState {
        return this.replicaState;
    }

    clone(): CalendarEventHarness {
        return CalendarEventHarness.fromReplica(this.replicaState, {
            objectId: this.objectId,
            applyContext: this.applyContext,
        });
    }

    replaceReplica(replica: ReplicaState): this {
        this.replicaState = replica;
        return this;
    }

    mergeFrom(other: CalendarEventHarness, replicaId = this.replica.replicaId): this {
        this.replicaState = mergeReplicaStates(this.replicaState, other.replica, replicaId);
        return this;
    }

    bootstrapBaseEvent(): this {
        return this
            .setTitle("Team Sync")
            .setDescription("Weekly planning")
            .setStartAt("2026-03-07T10:00:00Z")
            .setEndAt("2026-03-07T11:00:00Z")
            .setOrganizer("user-1")
            .setRoom("A-101")
            .setBuilding("HQ")
            .addTag("team")
            .addAttendee("user-2")
            .setColor("blue")
            .setNote("base-note");
    }

    setTitle(value: string): this {
        this.replicaState = applyLocalAction(this.replicaState, this.objectId, {
            type: "field.set",
            path: ["title"],
            value,
        });
        return this;
    }

    setDescription(value: string): this {
        this.replicaState = applyLocalAction(this.replicaState, this.objectId, {
            type: "field.set",
            path: ["description"],
            value,
        });
        return this;
    }

    setStartAt(value: string): this {
        this.replicaState = applyLocalAction(this.replicaState, this.objectId, {
            type: "field.set",
            path: ["startAt"],
            value,
        });
        return this;
    }

    setEndAt(value: string): this {
        this.replicaState = applyLocalAction(this.replicaState, this.objectId, {
            type: "field.set",
            path: ["endAt"],
            value,
        });
        return this;
    }

    setOrganizer(userId: string): this {
        this.replicaState = applyLocalAction(this.replicaState, this.objectId, {
            type: "field.set",
            path: ["organizer"],
            value: {
                type: "ref",
                objectId: userId,
            },
        });
        return this;
    }

    setRoom(value: string): this {
        this.replicaState = applyLocalAction(this.replicaState, this.objectId, {
            type: "field.set",
            path: ["location", "room"],
            value,
        });
        return this;
    }

    setBuilding(value: string): this {
        this.replicaState = applyLocalAction(this.replicaState, this.objectId, {
            type: "field.set",
            path: ["location", "building"],
            value,
        });
        return this;
    }

    addTag(value: string): this {
        this.replicaState = applyLocalAction(this.replicaState, this.objectId, {
            type: "set.add",
            path: ["tags"],
            value,
        });
        return this;
    }

    removeTag(value: string): this {
        this.replicaState = applyLocalAction(this.replicaState, this.objectId, {
            type: "set.remove",
            path: ["tags"],
            value,
        });
        return this;
    }

    addAttendee(userId: string, index?: number): this {
        const attendees = this.getAttendees();
        const resolvedIndex = index ?? attendees.length;

        this.replicaState = applyLocalAction(this.replicaState, this.objectId, {
            type: "array.insert",
            path: ["attendees"],
            index: resolvedIndex,
            value: {
                type: "ref",
                objectId: userId,
            },
        });

        return this;
    }

    removeAttendeeAt(index: number): this {
        this.replicaState = applyLocalAction(this.replicaState, this.objectId, {
            type: "array.remove",
            path: ["attendees"],
            index,
        });
        return this;
    }

    setColor(value: string): this {
        this.replicaState = applyLocalAction(this.replicaState, this.objectId, {
            type: "map.setValue",
            path: ["metadata"],
            key: "color",
            value,
        });
        return this;
    }

    setNote(value: string): this {
        this.replicaState = applyLocalAction(this.replicaState, this.objectId, {
            type: "map.setValue",
            path: ["metadata"],
            key: "note",
            value,
        });
        return this;
    }

    materialize() {
        return materializeReplicaObject(this.replicaState, this.objectId, {
            applyContext: this.applyContext,
            initialRoot: createCalendarInitialRoot(),
        });
    }

    view() {
        return viewNode(this.materialize().root);
    }

    private getObjectView(): Record<string, unknown> {
        const current = this.view();

        if (
            current !== null &&
            typeof current === "object" &&
            !Array.isArray(current) &&
            !("kind" in current)
        ) {
            return current as Record<string, unknown>;
        }

        return {};
    }

    getTitle(): unknown {
        return this.getObjectView()["title"];
    }

    getDescription(): unknown {
        return this.getObjectView()["description"];
    }

    getStartAt(): unknown {
        return this.getObjectView()["startAt"];
    }

    getEndAt(): unknown {
        return this.getObjectView()["endAt"];
    }

    getOrganizer(): unknown {
        return this.getObjectView()["organizer"];
    }

    getTags(): unknown[] {
        const value = this.getObjectView()["tags"];
        return Array.isArray(value) ? value : [];
    }

    getAttendees(): unknown[] {
        const value = this.getObjectView()["attendees"];
        return Array.isArray(value) ? value : [];
    }

    getLocation(): Record<string, unknown> {
        const location = this.getObjectView()["location"];

        if (
            location !== null &&
            typeof location === "object" &&
            !Array.isArray(location)
        ) {
            return location as Record<string, unknown>;
        }

        return {};
    }

    getRoom(): unknown {
        return this.getLocation()["room"];
    }

    getBuilding(): unknown {
        return this.getLocation()["building"];
    }

    getMetadata(): Record<string, unknown> {
        const metadata = this.getObjectView()["metadata"];

        if (
            metadata !== null &&
            typeof metadata === "object" &&
            !Array.isArray(metadata)
        ) {
            return metadata as Record<string, unknown>;
        }

        return {};
    }

    getColor(): unknown {
        return this.getMetadata()["color"];
    }

    getNote(): unknown {
        return this.getMetadata()["note"];
    }

    getAttendeeCount(): number {
        return this.getAttendees().length;
    }

    hasTag(tag: string): boolean {
        return this.getTags().includes(tag);
    }

    getFirstAttendee(): unknown | null {
        const attendees = this.getAttendees();
        return attendees.length > 0 ? attendees[0] : null;
    }

    debug(label?: string): this {
        if (label) {
            console.log(`\n=== ${label} ===`);
        }
        console.dir(this.view(), {depth: null});
        return this;
    }

    print(label?: string): this {
        return this.debug(label);
    }
}