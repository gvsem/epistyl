import {SchemaValidationError,} from "./errors";
import type {
    ArrayFieldDefinition,
    FieldDefinition,
    ObjectFieldDefinition,
    ParsedFieldDefinition,
    ParsedSchemaDefinition,
    PrimitiveFieldDefinition,
    PrimitiveValueType,
    RefFieldDefinition,
    SchemaDefinition,
    SetFieldDefinition,
    ValueSemantics,
} from "./schema";

const ALLOWED_VALUE_TYPES = new Set<PrimitiveValueType>([
    "string",
    "number",
    "boolean",
    "null",
]);

const ALLOWED_SEMANTICS = new Set<ValueSemantics>([
    "lww",
    "mv",
]);

function validateFieldName(name: string, path: string): void {
    if (name.trim().length === 0) {
        throw new SchemaValidationError(path, "field name must not be empty");
    }
}

function validatePrimitiveField(
    field: Extract<ParsedFieldDefinition, { type: "primitive" }>,
    path: string,
): PrimitiveFieldDefinition {
    if (!ALLOWED_VALUE_TYPES.has(field.valueType as PrimitiveValueType)) {
        throw new SchemaValidationError(
            path,
            `unsupported primitive valueType "${field.valueType}"`,
        );
    }

    if (!ALLOWED_SEMANTICS.has(field.semantics as ValueSemantics)) {
        throw new SchemaValidationError(
            path,
            `unsupported semantics "${field.semantics}"`,
        );
    }

    return {
        type: "primitive",
        valueType: field.valueType as PrimitiveValueType,
        semantics: field.semantics as ValueSemantics,
    };
}

function validateRefField(
    field: Extract<ParsedFieldDefinition, { type: "ref" }>,
    path: string,
): RefFieldDefinition {
    if (!ALLOWED_SEMANTICS.has(field.semantics as ValueSemantics)) {
        throw new SchemaValidationError(
            path,
            `unsupported semantics "${field.semantics}"`,
        );
    }

    return {
        type: "ref",
        semantics: field.semantics as ValueSemantics,
    };
}

function validateCollectionElement(
    field: ParsedFieldDefinition,
    path: string,
): PrimitiveFieldDefinition | RefFieldDefinition {
    switch (field.type) {
        case "primitive":
            return validatePrimitiveField(field, path);
        case "ref":
            return validateRefField(field, path);
        case "object":
            throw new SchemaValidationError(path, "collection elements of type \"object\" are not supported in v1");
        case "set":
        case "array":
            throw new SchemaValidationError(path, "nested collection elements are not supported in v1");
    }
}

function validateObjectField(
    field: Extract<ParsedFieldDefinition, { type: "object" }>,
    path: string,
): ObjectFieldDefinition {
    const validatedFields: Record<string, FieldDefinition> = {};

    for (const [fieldName, childField] of Object.entries(field.fields)) {
        validateFieldName(fieldName, `${path}.fields`);
        validatedFields[fieldName] = validateFieldDefinition(
            childField,
            `${path}.fields.${fieldName}`,
        );
    }

    return {
        type: "object",
        fields: validatedFields,
    };
}

function validateSetField(
    field: Extract<ParsedFieldDefinition, { type: "set" }>,
    path: string,
): SetFieldDefinition {
    return {
        type: "set",
        element: validateCollectionElement(field.element, `${path}.element`),
    };
}

function validateArrayField(
    field: Extract<ParsedFieldDefinition, { type: "array" }>,
    path: string,
): ArrayFieldDefinition {
    return {
        type: "array",
        element: validateCollectionElement(field.element, `${path}.element`),
    };
}

export function validateFieldDefinition(
    field: ParsedFieldDefinition,
    path: string,
): FieldDefinition {
    switch (field.type) {
        case "primitive":
            return validatePrimitiveField(field, path);
        case "ref":
            return validateRefField(field, path);
        case "object":
            return validateObjectField(field, path);
        case "set":
            return validateSetField(field, path);
        case "array":
            return validateArrayField(field, path);
    }
}

export function validateParsedSchema(schema: ParsedSchemaDefinition): SchemaDefinition {
    if (schema.name.trim().length === 0) {
        throw new SchemaValidationError("$.name", "schema name must not be empty");
    }

    if (schema.root.type !== "object") {
        throw new SchemaValidationError("$.root", "root type must be \"object\"");
    }

    return {
        name: schema.name,
        root: validateObjectField(schema.root, "$.root"),
    };
}

