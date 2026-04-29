import {mkdtemp, readFile, writeFile,} from "node:fs/promises";
import {join,} from "node:path";
import {tmpdir,} from "node:os";

import {describe, expect, it,} from "vitest";

import {generateTypeScriptFromYaml,} from "../../src/codegen/generate";

const schemaYaml = `
name: TaskCard
root:
  type: object
  fields:
    title:
      type: primitive
      valueType: string
      semantics: lww
    assignee:
      type: ref
      semantics: lww
    labels:
      type: set
      element:
        type: primitive
        valueType: string
        semantics: lww
`;

describe("codegen/generate", () => {
    it("generates a TypeScript file from a YAML schema", async () => {
        const tempRoot = await mkdtemp(join(tmpdir(), "epistyl-codegen-"));
        const schemaPath = join(tempRoot, "task-card.yaml");
        const outDir = join(tempRoot, "generated");

        await writeFile(schemaPath, schemaYaml, "utf8");

        const result = await generateTypeScriptFromYaml({
            schemaPath,
            outDir,
            packageImportPath: "../src",
        });

        expect(result.schemaName).toBe("TaskCard");
        expect(result.outputPath).toBe(join(outDir, "TaskCard.ts"));

        const generated = await readFile(result.outputPath, "utf8");

        expect(generated).toBe(result.source);
        expect(generated).toContain('from "../src"');
        expect(generated).toContain("export class TaskCardHarness");
        expect(generated).toContain("setTitle(value: string): this");
        expect(generated).toContain("setAssignee(objectId: string): this");
        expect(generated).toContain("addLabel(value: string): this");
    });
});
