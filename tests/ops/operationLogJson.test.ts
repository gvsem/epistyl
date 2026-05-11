import {describe, expect, it} from "vitest";

import type {Operation} from "../../src/ops/operation";
import {
    OperationLogJsonError,
    parseOperationLogJson,
    stringifyOperationLogJson,
    toOperationLogJsonValue,
} from "../../src/ops/operationLogJson";

const operation: Operation = {
    operationId: "A:1",
    transactionId: "A:tx:1",
    objectId: "event-1",
    replicaId: "A",
    clockSnapshot: {A: 1},
    action: {
        type: "field.set",
        path: ["title"],
        value: "Team Sync",
    },
};

describe("ops/operationLogJson", () => {
    it("serializes and parses an operation log", () => {
        const json = stringifyOperationLogJson([operation], {space: 2});

        expect(json).toContain('"operationId": "A:1"');
        expect(parseOperationLogJson(json)).toEqual([operation]);
    });

    it("parses ref values", () => {
        const parsed = parseOperationLogJson(JSON.stringify([
            {
                ...operation,
                operationId: "A:2",
                action: {
                    type: "field.set",
                    path: ["organizer"],
                    value: {type: "ref", objectId: "user-1"},
                },
            },
        ]));

        expect(parsed[0].action).toEqual({
            type: "field.set",
            path: ["organizer"],
            value: {type: "ref", objectId: "user-1"},
        });
    });

    it("creates a detached JSON value", () => {
        const value = toOperationLogJsonValue([operation]);

        expect(value).toEqual([operation]);
        expect(value[0]).not.toBe(operation);
        expect(value[0].clockSnapshot).not.toBe(operation.clockSnapshot);
        expect(value[0].action.path).not.toBe(operation.action.path);
    });

    it("rejects invalid JSON", () => {
        expect(() => parseOperationLogJson("{")).toThrow(OperationLogJsonError);
    });

    it("rejects non-array operation logs", () => {
        expect(() => parseOperationLogJson(JSON.stringify({operations: []}))).toThrowError(
            new OperationLogJsonError("$", "expected operation log array"),
        );
    });

    it("rejects invalid operation shape with path", () => {
        expect(() => parseOperationLogJson(JSON.stringify([
            {
                ...operation,
                clockSnapshot: {A: "one"},
            },
        ]))).toThrowError(
            new OperationLogJsonError("$[0].clockSnapshot.A", "expected finite number"),
        );
    });

    it("rejects unsupported action types", () => {
        expect(() => parseOperationLogJson(JSON.stringify([
            {
                ...operation,
                action: {
                    type: "unknown.action",
                    path: [],
                },
            },
        ]))).toThrowError(
            new OperationLogJsonError("$[0].action.type", 'unsupported action type "unknown.action"'),
        );
    });

    it("rejects invalid leaf values", () => {
        expect(() => parseOperationLogJson(JSON.stringify([
            {
                ...operation,
                action: {
                    type: "field.set",
                    path: ["title"],
                    value: {kind: "not-ref"},
                },
            },
        ]))).toThrowError(
            new OperationLogJsonError("$[0].action.value", "expected primitive value or ref value"),
        );
    });
});
