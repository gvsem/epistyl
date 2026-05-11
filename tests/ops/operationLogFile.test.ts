import {mkdtemp, readFile, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";

import {describe, expect, it} from "vitest";

import type {Operation} from "../../src/ops/operation";
import {OperationLogJsonError} from "../../src/ops/operationLogJson";
import {readOperationLogFile, writeOperationLogFile} from "../../src/ops/operationLogFile";

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

describe("ops/operationLogFile", () => {
    it("writes and reads an operation log file", async () => {
        const tempRoot = await mkdtemp(join(tmpdir(), "epistyl-operation-log-"));
        const filePath = join(tempRoot, "operation-log.json");

        await writeOperationLogFile(filePath, [operation], {space: 2});

        const raw = await readFile(filePath, "utf8");
        expect(raw).toContain('"operationId": "A:1"');

        await expect(readOperationLogFile(filePath)).resolves.toEqual([operation]);
    });

    it("rejects invalid operation log file content", async () => {
        const tempRoot = await mkdtemp(join(tmpdir(), "epistyl-operation-log-"));
        const filePath = join(tempRoot, "invalid-operation-log.json");

        await writeFile(filePath, JSON.stringify({operations: []}), "utf8");

        await expect(readOperationLogFile(filePath)).rejects.toThrowError(
            new OperationLogJsonError("$", "expected operation log array"),
        );
    });
});
