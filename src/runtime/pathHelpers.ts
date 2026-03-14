import type {ObjectPath} from "../ops/action";
import type {NodeState} from "../crdt/state";
import {isObjectNodeState} from "../crdt/state";
import {getObjectField} from "../crdt/object";

export function assertStringPath(path: ObjectPath): string[] {
    for (const segment of path) {
        if (typeof segment !== "string") {
            throw new Error(
                `MVP apply.ts only supports string path segments for traversal. Got: ${String(
                    segment,
                )}`,
            );
        }
    }

    return path as string[];
}

export function splitParentPath(path: ObjectPath): {
    parentPath: string[];
    lastSegment: string;
} {
    const normalized = assertStringPath(path);

    if (normalized.length === 0) {
        throw new Error("Path must not be empty");
    }

    return {
        parentPath: normalized.slice(0, -1),
        lastSegment: normalized[normalized.length - 1],
    };
}

export function getChildFromContainer(
    container: NodeState,
    segment: string,
): NodeState | null {
    if (isObjectNodeState(container)) {
        const entry = getObjectField(container.state, segment);
        return entry?.node ?? null;
    }

    throw new Error(
        `Cannot traverse through node kind "${container.kind}" using string segment "${segment}"`,
    );
}