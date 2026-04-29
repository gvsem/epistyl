import {execFile,} from "node:child_process";
import {mkdtemp, writeFile,} from "node:fs/promises";
import {pathToFileURL,} from "node:url";
import {join, resolve,} from "node:path";
import {tmpdir,} from "node:os";
import {promisify,} from "node:util";

import {describe, expect, it,} from "vitest";

import {generateTypeScriptFromYaml,} from "../../src";

const execFileAsync = promisify(execFile);

describe("codegen/generated calendar", () => {
    it("generates a usable CalendarEventHarness without touching handwritten scenarios", async () => {
        const tempRoot = await mkdtemp(join(tmpdir(), "epistyl-calendar-codegen-"));
        const schemaPath = resolve("tests/codegen/fixtures/calendar.yaml");
        const outDir = join(tempRoot, "generated");

        const result = await generateTypeScriptFromYaml({
            schemaPath,
            outDir,
            packageImportPath: resolve("src/index.ts"),
        });

        const generatedModule = await import(pathToFileURL(result.outputPath).href);
        const {CalendarEventHarness} = generatedModule as {
            CalendarEventHarness: new (options: { replicaId: string; objectId?: string }) => {
                setTitle(value: string): unknown;
                setDescription(value: string): unknown;
                setStartAt(value: string): unknown;
                setEndAt(value: string): unknown;
                setOrganizer(objectId: string): unknown;
                setLocationRoom(value: string): unknown;
                setLocationBuilding(value: string): unknown;
                addTag(value: string): unknown;
                insertAttendee(objectId: string, index?: number): unknown;
                setMetadataColor(value: string): unknown;
                setMetadataNote(value: string): unknown;
                view(): unknown;
            };
        };

        const calendar = new CalendarEventHarness({
            replicaId: "A",
            objectId: "event-1",
        });

        calendar
            .setTitle("Team Sync")
            .setDescription("Weekly planning")
            .setStartAt("2026-03-07T10:00:00Z")
            .setEndAt("2026-03-07T11:00:00Z")
            .setOrganizer("user-1")
            .setLocationRoom("A-101")
            .setLocationBuilding("HQ")
            .addTag("team")
            .insertAttendee("user-2")
            .setMetadataColor("blue")
            .setMetadataNote("base-note");

        expect(calendar.view()).toEqual({
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
    });

    it("emits generated CalendarEvent code that typechecks for a consumer", async () => {
        const tempRoot = await mkdtemp(join(tmpdir(), "epistyl-calendar-typecheck-"));
        const schemaPath = resolve("tests/codegen/fixtures/calendar.yaml");
        const outDir = join(tempRoot, "generated");

        await generateTypeScriptFromYaml({
            schemaPath,
            outDir,
            packageImportPath: resolve("src/index"),
        });

        const usagePath = join(tempRoot, "usage.ts");
        const tsconfigPath = join(tempRoot, "tsconfig.json");

        await writeFile(
            usagePath,
            `import {CalendarEventHarness} from "./generated/CalendarEvent";

const calendar = new CalendarEventHarness({
    replicaId: "A",
    objectId: "event-1",
});

calendar
    .setTitle("Team Sync")
    .setDescription("Weekly planning")
    .setStartAt("2026-03-07T10:00:00Z")
    .setEndAt("2026-03-07T11:00:00Z")
    .setOrganizer("user-1")
    .setLocationRoom("A-101")
    .setLocationBuilding("HQ")
    .addTag("team")
    .insertAttendee("user-2")
    .setMetadataColor("blue")
    .setMetadataNote("base-note");

const view = calendar.view();

view.title.values.includes("Team Sync");
view.description?.toUpperCase();
view.location.room?.toUpperCase();
view.tags.map((tag) => tag.toUpperCase());
view.attendees.map((attendee) => attendee.objectId);
`,
            "utf8",
        );

        await writeFile(
            tsconfigPath,
            JSON.stringify(
                {
                    compilerOptions: {
                        target: "ES2020",
                        module: "ESNext",
                        moduleResolution: "Node",
                        strict: true,
                        esModuleInterop: true,
                        skipLibCheck: true,
                        lib: ["ES2020"],
                        types: ["node"],
                        typeRoots: [resolve("node_modules/@types")],
                        noEmit: true,
                    },
                    include: [
                        usagePath,
                        join(outDir, "CalendarEvent.ts"),
                    ],
                },
                null,
                2,
            ),
            "utf8",
        );

        try {
            await execFileAsync(
                "node",
                [
                    resolve("node_modules/typescript/bin/tsc"),
                    "-p",
                    tsconfigPath,
                ],
                {
                    cwd: resolve("."),
                },
            );
        } catch (error) {
            const typedError = error as Error & {
                stdout?: string;
                stderr?: string;
            };
            throw new Error(typedError.stderr || typedError.stdout || typedError.message);
        }
    });
});
