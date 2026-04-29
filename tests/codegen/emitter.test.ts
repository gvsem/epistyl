import ts from "typescript";
import {describe, expect, it,} from "vitest";

import {emitTypeScriptModule,} from "../../src/codegen/emitter";
import {parseYamlSchema,} from "../../src/codegen/parser";
import {validateParsedSchema,} from "../../src/codegen/validator";

const calendarSchemaYaml = `
name: CalendarEvent
root:
  type: object
  fields:
    title:
      type: primitive
      valueType: string
      semantics: mv
    description:
      type: primitive
      valueType: string
      semantics: lww
    startAt:
      type: primitive
      valueType: string
      semantics: lww
    endAt:
      type: primitive
      valueType: string
      semantics: lww
    organizer:
      type: ref
      semantics: lww
    location:
      type: object
      fields:
        room:
          type: primitive
          valueType: string
          semantics: lww
        building:
          type: primitive
          valueType: string
          semantics: lww
    tags:
      type: set
      element:
        type: primitive
        valueType: string
        semantics: lww
    attendees:
      type: array
      element:
        type: ref
        semantics: lww
    metadata:
      type: object
      fields:
        color:
          type: primitive
          valueType: string
          semantics: lww
        note:
          type: primitive
          valueType: string
          semantics: mv
`;

describe("codegen/emitter", () => {
    it("emits the expected public CalendarEvent artifacts", () => {
        const schema = validateParsedSchema(parseYamlSchema(calendarSchemaYaml));
        const source = emitTypeScriptModule(schema);

        expect(source).toContain("export interface CalendarEventOptions");
        expect(source).toContain("export type CalendarEventView = {");
        expect(source).toContain("export function createCalendarEventInitialRoot(): NodeState");
        expect(source).toContain("export class CalendarEventHarness");
        expect(source).toContain("setTitle(value: string): this");
        expect(source).toContain("setLocationRoom(value: string): this");
        expect(source).toContain("addTag(value: string): this");
        expect(source).toContain("insertAttendee(value: string, index?: number): this");
        expect(source).toContain("view(): CalendarEventView");
    });

    it("emits initial root code for nested object slots and collection nodes", () => {
        const schema = validateParsedSchema(parseYamlSchema(calendarSchemaYaml));
        const source = emitTypeScriptModule(schema);

        expect(source).toContain('const rootNode = createObjectNodeState();');
        expect(source).toContain('const locationNode = createObjectNodeState();');
        expect(source).toContain('const metadataNode = createObjectNodeState();');
        expect(source).toContain('rootNode.state.items["tags"] = {');
        expect(source).toContain('node: createSetNodeState()');
        expect(source).toContain('rootNode.state.items["attendees"] = {');
        expect(source).toContain('node: createArrayNodeState()');
    });

    it("emits syntactically valid TypeScript", () => {
        const schema = validateParsedSchema(parseYamlSchema(calendarSchemaYaml));
        const source = emitTypeScriptModule(schema);

        const output = ts.transpileModule(source, {
            compilerOptions: {
                target: ts.ScriptTarget.ES2020,
                module: ts.ModuleKind.ESNext,
            },
            reportDiagnostics: true,
        });

        expect(output.diagnostics ?? []).toEqual([]);
    });
});
