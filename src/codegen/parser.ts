import YAML from "yaml";

import {SchemaParseError,} from "./errors";
import type {
    ParsedArrayFieldDefinition,
    ParsedFieldDefinition,
    ParsedObjectFieldDefinition,
    ParsedPrimitiveFieldDefinition,
    ParsedRefFieldDefinition,
    ParsedSchemaDefinition,
    ParsedSetFieldDefinition,
} from "./schema";

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function expectRecord(value: unknown, path: string): Record<string, unknown> {
    if (!isRecord(value)) {
        throw new SchemaParseError(path, "expected object mapping");
    }

    return value;
}

function expectString(value: unknown, path: string, fieldName: string): string {
    if (typeof value !== "string") {
        throw new SchemaParseError(path, `expected "${fieldName}" to be a string`);
    }

    return value;
}

function parseFields(value: unknown, path: string): Record<string, ParsedFieldDefinition> {
    const fieldsRecord = expectRecord(value, path);
    const fields: Record<string, ParsedFieldDefinition> = {};

    for (const [fieldName, fieldValue] of Object.entries(fieldsRecord)) {
        fields[fieldName] = parseFieldDefinition(fieldValue, `${path}.${fieldName}`);
    }

    return fields;
}

function parsePrimitiveField(
    definition: Record<string, unknown>,
    path: string,
): ParsedPrimitiveFieldDefinition {
    return {
        type: "primitive",
        valueType: expectString(definition.valueType, path, "valueType"),
        semantics: expectString(definition.semantics, path, "semantics"),
    };
}

function parseRefField(
    definition: Record<string, unknown>,
    path: string,
): ParsedRefFieldDefinition {
    return {
        type: "ref",
        semantics: expectString(definition.semantics, path, "semantics"),
    };
}

function parseObjectField(
    definition: Record<string, unknown>,
    path: string,
): ParsedObjectFieldDefinition {
    return {
        type: "object",
        fields: parseFields(definition.fields, `${path}.fields`),
    };
}

function parseSetField(
    definition: Record<string, unknown>,
    path: string,
): ParsedSetFieldDefinition {
    return {
        type: "set",
        element: parseFieldDefinition(definition.element, `${path}.element`),
    };
}

function parseArrayField(
    definition: Record<string, unknown>,
    path: string,
): ParsedArrayFieldDefinition {
    return {
        type: "array",
        element: parseFieldDefinition(definition.element, `${path}.element`),
    };
}

export function parseFieldDefinition(
    value: unknown,
    path: string,
): ParsedFieldDefinition {
    const definition = expectRecord(value, path);
    const type = expectString(definition.type, path, "type");

    switch (type) {
        case "primitive":
            return parsePrimitiveField(definition, path);
        case "ref":
            return parseRefField(definition, path);
        case "object":
            return parseObjectField(definition, path);
        case "set":
            return parseSetField(definition, path);
        case "array":
            return parseArrayField(definition, path);
        default:
            throw new SchemaParseError(path, `unsupported field type "${type}"`);
    }
}

export function parseYamlSchema(source: string): ParsedSchemaDefinition {
    const document = YAML.parseDocument(source, {
        uniqueKeys: true,
    });

    if (document.errors.length > 0) {
        throw new SchemaParseError("$", document.errors.map((error) => error.message).join("; "));
    }

    const parsed = document.toJS();
    const root = expectRecord(parsed, "$");

    return {
        name: expectString(root.name, "$", "name"),
        root: parseFieldDefinition(root.root, "$.root"),
    };
}

