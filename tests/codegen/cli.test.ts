import {execFile,} from "node:child_process";
import {mkdtemp, readFile,} from "node:fs/promises";
import {tmpdir,} from "node:os";
import {join, resolve,} from "node:path";
import {promisify,} from "node:util";

import {describe, expect, it,} from "vitest";

const execFileAsync = promisify(execFile);

describe("codegen/cli", () => {
    it("generates a TypeScript file through the CLI command", async () => {
        const tempRoot = await mkdtemp(join(tmpdir(), "epistyl-cli-codegen-"));
        const outDir = join(tempRoot, "generated");
        const schemaPath = resolve("tests/codegen/fixtures/calendar.yaml");
        const cliPath = resolve("src/cli.ts");

        const {stdout,} = await execFileAsync(
            "node",
            [
                "--import",
                "tsx",
                cliPath,
                "generate",
                "--schema",
                schemaPath,
                "--out-dir",
                outDir,
                "--package-import",
                resolve("src/index.ts"),
            ],
            {
                cwd: resolve("."),
            },
        );

        const outputPath = join(outDir, "CalendarEvent.ts");
        const generated = await readFile(outputPath, "utf8");

        expect(stdout).toContain(`Generated CalendarEvent: ${outputPath}`);
        expect(generated).toContain("export class CalendarEventHarness");
        expect(generated).toContain("setLocationRoom(value: string): this");
        expect(generated).toContain("insertAttendee(value: string, index?: number): this");
    });
});
