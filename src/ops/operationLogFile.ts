import {readFile, writeFile} from "node:fs/promises";

import type {Operation} from "./operation";
import {
    parseOperationLogJson,
    stringifyOperationLogJson,
    type StringifyOperationLogJsonOptions,
} from "./operationLogJson";

export type WriteOperationLogFileOptions = StringifyOperationLogJsonOptions;

export async function readOperationLogFile(
    path: string,
): Promise<Operation[]> {
    const json = await readFile(path, "utf8");
    return parseOperationLogJson(json);
}

export async function writeOperationLogFile(
    path: string,
    operations: readonly Operation[],
    options: WriteOperationLogFileOptions = {},
): Promise<void> {
    await writeFile(
        path,
        stringifyOperationLogJson(operations, options),
        "utf8",
    );
}

