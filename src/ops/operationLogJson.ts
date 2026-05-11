import type {Action, ObjectPath, PrimitiveValue, RefValue} from "./action";
import type {Operation} from "./operation";
import type {LeafValue} from "../runtime/leafUtils";

export class OperationLogJsonError extends Error {
    public readonly path: string;

    constructor(path: string, message: string) {
        super(`${path}: ${message}`);
        this.name = "OperationLogJsonError";
        this.path = path;
    }
}

export interface StringifyOperationLogJsonOptions {
    space?: number | string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function expectRecord(value: unknown, path: string): Record<string, unknown> {
    if (!isRecord(value)) {
        throw new OperationLogJsonError(path, "expected object");
    }

    return value;
}

function expectString(value: unknown, path: string): string {
    if (typeof value !== "string") {
        throw new OperationLogJsonError(path, "expected string");
    }

    return value;
}

function expectNumber(value: unknown, path: string): number {
    if (typeof value !== "number" || !Number.isFinite(value)) {
        throw new OperationLogJsonError(path, "expected finite number");
    }

    return value;
}

function parseObjectPath(value: unknown, path: string): ObjectPath {
    if (!Array.isArray(value)) {
        throw new OperationLogJsonError(path, "expected path array");
    }

    return value.map((segment, index) => {
        if (typeof segment !== "string" && typeof segment !== "number") {
            throw new OperationLogJsonError(`${path}[${index}]`, "expected string or number path segment");
        }

        return segment;
    });
}

function parseClockSnapshot(value: unknown, path: string): Record<string, number> {
    const record = expectRecord(value, path);
    const clock: Record<string, number> = {};

    for (const [replicaId, counter] of Object.entries(record)) {
        clock[replicaId] = expectNumber(counter, `${path}.${replicaId}`);
    }

    return clock;
}

function isPrimitiveValue(value: unknown): value is PrimitiveValue {
    return (
        value === null ||
        typeof value === "string" ||
        typeof value === "number" ||
        typeof value === "boolean"
    );
}

function parseRefValue(value: Record<string, unknown>, path: string): RefValue {
    if (value.type !== "ref") {
        throw new OperationLogJsonError(`${path}.type`, "expected ref value type");
    }

    if (typeof value.objectId !== "string" && value.objectId !== null) {
        throw new OperationLogJsonError(`${path}.objectId`, "expected string or null");
    }

    return {
        type: "ref",
        objectId: value.objectId,
    };
}

function parseLeafValue(value: unknown, path: string): LeafValue {
    if (isPrimitiveValue(value)) {
        return value;
    }

    if (isRecord(value) && value.type === "ref") {
        return parseRefValue(value, path);
    }

    throw new OperationLogJsonError(path, "expected primitive value or ref value");
}

type ValueActionType =
    | "field.set"
    | "set.add"
    | "set.remove";

type PathOnlyActionType =
    | "field.delete"
    | "node.initObject"
    | "node.initSet"
    | "node.initArray";

function parseValueAction<T extends ValueActionType>(
    type: T,
    action: Record<string, unknown>,
    path: string,
): Extract<Action, { type: T }> {
    return {
        type,
        path: parseObjectPath(action.path, `${path}.path`),
        value: parseLeafValue(action.value, `${path}.value`),
    } as Extract<Action, { type: T }>;
}

function parsePathOnlyAction<T extends PathOnlyActionType>(
    type: T,
    action: Record<string, unknown>,
    path: string,
): Extract<Action, { type: T }> {
    return {
        type,
        path: parseObjectPath(action.path, `${path}.path`),
    } as Extract<Action, { type: T }>;
}

function parseAction(value: unknown, path: string): Action {
    const action = expectRecord(value, path);
    const type = expectString(action.type, `${path}.type`);

    switch (type) {
        case "field.set":
            return parseValueAction(type, action, path);
        case "field.delete":
            return parsePathOnlyAction(type, action, path);
        case "set.add":
        case "set.remove":
            return parseValueAction(type, action, path);
        case "array.insert":
            return {
                type,
                path: parseObjectPath(action.path, `${path}.path`),
                index: expectNumber(action.index, `${path}.index`),
                value: parseLeafValue(action.value, `${path}.value`),
            };
        case "array.remove":
            return {
                type,
                path: parseObjectPath(action.path, `${path}.path`),
                index: expectNumber(action.index, `${path}.index`),
            };
        case "node.initObject":
        case "node.initSet":
        case "node.initArray":
            return parsePathOnlyAction(type, action, path);
        default:
            throw new OperationLogJsonError(`${path}.type`, `unsupported action type "${type}"`);
    }
}

function parseOperation(value: unknown, path: string): Operation {
    const operation = expectRecord(value, path);

    return {
        operationId: expectString(operation.operationId, `${path}.operationId`),
        transactionId: expectString(operation.transactionId, `${path}.transactionId`),
        objectId: expectString(operation.objectId, `${path}.objectId`),
        replicaId: expectString(operation.replicaId, `${path}.replicaId`),
        clockSnapshot: parseClockSnapshot(operation.clockSnapshot, `${path}.clockSnapshot`),
        action: parseAction(operation.action, `${path}.action`),
    };
}

function cloneLeafValue(value: LeafValue): LeafValue {
    return isRecord(value) &&
        value.type === "ref" &&
        (typeof value.objectId === "string" || value.objectId === null)
        ? {
            type: "ref",
            objectId: value.objectId,
        }
        : value;
}

function cloneValueAction<T extends ValueActionType>(
    action: {
        type: T;
        path: ObjectPath;
        value: LeafValue;
    },
): Extract<Action, { type: T }> {
    return {
        type: action.type,
        path: [...action.path],
        value: cloneLeafValue(action.value),
    } as Extract<Action, { type: T }>;
}

function clonePathOnlyAction<T extends PathOnlyActionType>(
    action: {
        type: T;
        path: ObjectPath;
    },
): Extract<Action, { type: T }> {
    return {
        type: action.type,
        path: [...action.path],
    } as Extract<Action, { type: T }>;
}

function cloneAction(action: Action): Action {
    switch (action.type) {
        case "field.set":
            return cloneValueAction(action);
        case "field.delete":
            return clonePathOnlyAction(action);
        case "set.add":
        case "set.remove":
            return cloneValueAction(action);
        case "array.insert":
            return {
                type: action.type,
                path: [...action.path],
                index: action.index,
                value: cloneLeafValue(action.value),
            };
        case "array.remove":
            return {
                type: action.type,
                path: [...action.path],
                index: action.index,
            };
        case "node.initObject":
        case "node.initSet":
        case "node.initArray":
            return clonePathOnlyAction(action);
    }
}

export function parseOperationLogJson(json: string): Operation[] {
    let parsed: unknown;

    try {
        parsed = JSON.parse(json);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new OperationLogJsonError("$", `invalid JSON: ${message}`);
    }

    if (!Array.isArray(parsed)) {
        throw new OperationLogJsonError("$", "expected operation log array");
    }

    return parsed.map((item, index) => parseOperation(item, `$[${index}]`));
}

export function stringifyOperationLogJson(
    operations: readonly Operation[],
    options: StringifyOperationLogJsonOptions = {},
): string {
    return JSON.stringify(operations, null, options.space);
}

export function toOperationLogJsonValue(
    operations: readonly Operation[],
): Operation[] {
    return operations.map((operation) => ({
        ...operation,
        clockSnapshot: {...operation.clockSnapshot},
        action: cloneAction(operation.action),
    }));
}
