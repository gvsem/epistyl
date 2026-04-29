export type PrimitiveValueType = "string" | "number" | "boolean" | "null";

export type ValueSemantics = "lww" | "mv";

export interface ParsedSchemaDefinition {
    name: string;
    root: ParsedFieldDefinition;
}

export type ParsedFieldDefinition =
    | ParsedPrimitiveFieldDefinition
    | ParsedRefFieldDefinition
    | ParsedObjectFieldDefinition
    | ParsedSetFieldDefinition
    | ParsedArrayFieldDefinition;

export interface ParsedPrimitiveFieldDefinition {
    type: "primitive";
    valueType: string;
    semantics: string;
}

export interface ParsedRefFieldDefinition {
    type: "ref";
    semantics: string;
}

export interface ParsedObjectFieldDefinition {
    type: "object";
    fields: Record<string, ParsedFieldDefinition>;
}

export interface ParsedSetFieldDefinition {
    type: "set";
    element: ParsedFieldDefinition;
}

export interface ParsedArrayFieldDefinition {
    type: "array";
    element: ParsedFieldDefinition;
}

export interface SchemaDefinition {
    name: string;
    root: ObjectFieldDefinition;
}

export type FieldDefinition =
    | PrimitiveFieldDefinition
    | RefFieldDefinition
    | ObjectFieldDefinition
    | SetFieldDefinition
    | ArrayFieldDefinition;

export interface PrimitiveFieldDefinition {
    type: "primitive";
    valueType: PrimitiveValueType;
    semantics: ValueSemantics;
}

export interface RefFieldDefinition {
    type: "ref";
    semantics: ValueSemantics;
}

export interface ObjectFieldDefinition {
    type: "object";
    fields: Record<string, FieldDefinition>;
}

export interface SetFieldDefinition {
    type: "set";
    element: PrimitiveFieldDefinition | RefFieldDefinition;
}

export interface ArrayFieldDefinition {
    type: "array";
    element: PrimitiveFieldDefinition | RefFieldDefinition;
}

