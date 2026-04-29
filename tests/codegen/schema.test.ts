import {describe, expect, it,} from "vitest";

import {SchemaParseError, SchemaValidationError,} from "../../src/codegen/errors";
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

describe("codegen/schema", () => {
    it("parses and validates the calendar schema", () => {
        const parsed = parseYamlSchema(calendarSchemaYaml);
        const validated = validateParsedSchema(parsed);

        expect(validated.name).toBe("CalendarEvent");
        expect(validated.root.type).toBe("object");
        expect(validated.root.fields.title).toEqual({
            type: "primitive",
            valueType: "string",
            semantics: "mv",
        });
        expect(validated.root.fields.organizer).toEqual({
            type: "ref",
            semantics: "lww",
        });
        expect(validated.root.fields.location).toMatchObject({
            type: "object",
        });
        expect(validated.root.fields.tags).toEqual({
            type: "set",
            element: {
                type: "primitive",
                valueType: "string",
                semantics: "lww",
            },
        });
        expect(validated.root.fields.attendees).toEqual({
            type: "array",
            element: {
                type: "ref",
                semantics: "lww",
            },
        });
    });

    it("rejects duplicate keys during parsing", () => {
        expect(() => parseYamlSchema(`
name: DuplicateFields
root:
  type: object
  fields:
    title:
      type: primitive
      valueType: string
      semantics: lww
    title:
      type: primitive
      valueType: string
      semantics: mv
`)).toThrow(SchemaParseError);
    });

    it("rejects non-object root during validation", () => {
        const parsed = parseYamlSchema(`
name: InvalidRoot
root:
  type: primitive
  valueType: string
  semantics: lww
`);

        expect(() => validateParsedSchema(parsed)).toThrowError(
            new SchemaValidationError("$.root", "root type must be \"object\""),
        );
    });

    it("rejects unsupported primitive value types", () => {
        const parsed = parseYamlSchema(`
name: InvalidPrimitive
root:
  type: object
  fields:
    createdAt:
      type: primitive
      valueType: date
      semantics: lww
`);

        expect(() => validateParsedSchema(parsed)).toThrowError(
            new SchemaValidationError(
                "$.root.fields.createdAt",
                "unsupported primitive valueType \"date\"",
            ),
        );
    });

    it("rejects missing required primitive keys during parsing", () => {
        expect(() => parseYamlSchema(`
name: MissingSemantics
root:
  type: object
  fields:
    title:
      type: primitive
      valueType: string
`)).toThrow(SchemaParseError);
    });

    it("rejects collection of object during validation", () => {
        const parsed = parseYamlSchema(`
name: InvalidArrayObject
root:
  type: object
  fields:
    attendees:
      type: array
      element:
        type: object
        fields:
          name:
            type: primitive
            valueType: string
            semantics: lww
`);

        expect(() => validateParsedSchema(parsed)).toThrowError(
            new SchemaValidationError(
                "$.root.fields.attendees.element",
                "collection elements of type \"object\" are not supported in v1",
            ),
        );
    });

    it("rejects nested collection elements during validation", () => {
        const parsed = parseYamlSchema(`
name: InvalidNestedCollection
root:
  type: object
  fields:
    labels:
      type: set
      element:
        type: array
        element:
          type: primitive
          valueType: string
          semantics: lww
`);

        expect(() => validateParsedSchema(parsed)).toThrowError(
            new SchemaValidationError(
                "$.root.fields.labels.element",
                "nested collection elements are not supported in v1",
            ),
        );
    });

    it("rejects empty schema names during validation", () => {
        const parsed = parseYamlSchema(`
name: "   "
root:
  type: object
  fields: {}
`);

        expect(() => validateParsedSchema(parsed)).toThrowError(
            new SchemaValidationError("$.name", "schema name must not be empty"),
        );
    });
});
