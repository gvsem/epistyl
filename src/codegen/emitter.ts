import type {
    ArrayFieldDefinition,
    FieldDefinition,
    ObjectFieldDefinition,
    PrimitiveFieldDefinition,
    PrimitiveValueType,
    RefFieldDefinition,
    SchemaDefinition,
    SetFieldDefinition,
} from "./schema";

export interface EmitTypeScriptModuleOptions {
    packageImportPath?: string;
}

const DEFAULT_PACKAGE_IMPORT_PATH = "@gvsem/epistyl";

function toPascalCase(value: string): string {
    return value
        .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
        .split(/[^A-Za-z0-9]+/)
        .filter((segment) => segment.length > 0)
        .map((segment) => segment[0].toUpperCase() + segment.slice(1))
        .join("");
}

function singularize(value: string): string {
    if (value.endsWith("ies") && value.length > 3) {
        return `${value.slice(0, -3)}y`;
    }

    if (value.endsWith("s") && !value.endsWith("ss") && value.length > 1) {
        return value.slice(0, -1);
    }

    return value;
}

function indent(text: string, level = 1): string {
    const prefix = "    ".repeat(level);
    return text
        .split("\n")
        .map((line) => line.length > 0 ? `${prefix}${line}` : line)
        .join("\n");
}

function primitiveScalarType(valueType: PrimitiveValueType): string {
    switch (valueType) {
        case "string":
            return "string";
        case "number":
            return "number";
        case "boolean":
            return "boolean";
        case "null":
            return "null";
    }
}

function emitPrimitiveViewType(field: PrimitiveFieldDefinition): string {
    const scalar = primitiveScalarType(field.valueType);

    if (field.semantics === "mv") {
        return `MultiValueView<${scalar}>`;
    }

    return field.valueType === "null"
        ? "null"
        : `${scalar} | null`;
}

function emitRefViewType(field: RefFieldDefinition): string {
    return field.semantics === "mv"
        ? "MultiValueView<RefValue>"
        : "RefValue | null";
}

function emitSetViewType(field: SetFieldDefinition): string {
    return field.element.type === "primitive"
        ? `${primitiveScalarType(field.element.valueType)}[]`
        : "RefValue[]";
}

function emitArrayViewType(field: ArrayFieldDefinition): string {
    return field.element.type === "primitive"
        ? `${primitiveScalarType(field.element.valueType)}[]`
        : "RefValue[]";
}

function emitFieldViewType(field: FieldDefinition, level: number): string {
    switch (field.type) {
        case "primitive":
            return emitPrimitiveViewType(field);
        case "ref":
            return emitRefViewType(field);
        case "object":
            return emitObjectViewShape(field, level);
        case "set":
            return emitSetViewType(field);
        case "array":
            return emitArrayViewType(field);
    }
}

function emitObjectViewShape(field: ObjectFieldDefinition, level: number): string {
    const lines = Object.entries(field.fields).map(([name, childField]) => {
        return `${name}: ${emitFieldViewType(childField, level + 1)};`;
    });

    if (lines.length === 0) {
        return "{}";
    }

    return `{\n${indent(lines.join("\n"), level)}\n${"    ".repeat(level - 1)}}`;
}

function buildObjectNodeVariableName(path: string[]): string {
    if (path.length === 0) {
        return "rootNode";
    }

    return `${path.map(toPascalCase).join("")}Node`.replace(/^([A-Z])/, (match) => match.toLowerCase());
}

function emitObjectNodeInitialization(
    field: ObjectFieldDefinition,
    path: string[],
    lines: string[],
): void {
    const variableName = buildObjectNodeVariableName(path);

    if (path.length === 0) {
        lines.push(`const ${variableName} = createObjectNodeState();`);
    }

    for (const [fieldName, childField] of Object.entries(field.fields)) {
        const childPath = [...path, fieldName];

        if (childField.type === "object") {
            const childVariableName = buildObjectNodeVariableName(childPath);
            lines.push(`const ${childVariableName} = createObjectNodeState();`);
            emitObjectNodeInitialization(childField, childPath, lines);
            lines.push(
                `${variableName}.state.items["${fieldName}"] = {`,
                `    node: ${childVariableName},`,
                `    causalVersionStamp: null,`,
                `};`,
            );
            continue;
        }

        const nodeFactory = childField.type === "primitive"
            ? `createPrimitiveNodeState("${childField.semantics}")`
            : childField.type === "ref"
                ? `createRefNodeState("${childField.semantics}")`
                : childField.type === "set"
                    ? "createSetNodeState()"
                    : "createArrayNodeState()";

        lines.push(
            `${variableName}.state.items["${fieldName}"] = {`,
            `    node: ${nodeFactory},`,
            `    causalVersionStamp: null,`,
            `};`,
        );
    }
}

function collectSemantics(field: FieldDefinition, kind: "primitive" | "ref", result: Set<string>): void {
    switch (field.type) {
        case "primitive":
            if (kind === "primitive") {
                result.add(field.semantics);
            }
            return;
        case "ref":
            if (kind === "ref") {
                result.add(field.semantics);
            }
            return;
        case "object":
            for (const child of Object.values(field.fields)) {
                collectSemantics(child, kind, result);
            }
            return;
        case "set":
        case "array":
            if (field.element.type === kind) {
                result.add(field.element.semantics);
            }
            return;
    }
}

function resolveDefaultSemantics(
    schema: SchemaDefinition,
    kind: "primitive" | "ref",
): "lww" | "mv" {
    const semantics = new Set<string>();
    collectSemantics(schema.root, kind, semantics);

    if (kind === "primitive") {
        return semantics.has("mv") ? "mv" : "lww";
    }

    return semantics.has("lww") ? "lww" : "mv";
}

function pathLiteral(path: string[]): string {
    return `[${path.map((segment) => `"${segment}"`).join(", ")}]`;
}

function emitPrimitiveMethod(
    methodName: string,
    path: string[],
    valueType: PrimitiveValueType,
): string {
    const parameterType = primitiveScalarType(valueType);

    return [
        `${methodName}(value: ${parameterType}): this {`,
        indent(`this.replicaState = applyLocalAction(this.replicaState, this.objectId, {
type: "field.set",
path: ${pathLiteral(path)},
value,
});`),
        indent("return this;"),
        "}",
    ].join("\n");
}

function emitRefMethod(methodName: string, path: string[]): string {
    return [
        `${methodName}(objectId: string): this {`,
        indent(`this.replicaState = applyLocalAction(this.replicaState, this.objectId, {
type: "field.set",
path: ${pathLiteral(path)},
value: {
    type: "ref",
    objectId,
},
});`),
        indent("return this;"),
        "}",
    ].join("\n");
}

function emitSetMethods(
    field: SetFieldDefinition,
    path: string[],
    methodBaseName: string,
): string[] {
    const parameterType = field.element.type === "primitive"
        ? primitiveScalarType(field.element.valueType)
        : "string";
    const valueExpression = field.element.type === "primitive"
        ? "value"
        : `{
    type: "ref",
    objectId: value,
}`;

    return [
        [
            `add${methodBaseName}(value: ${parameterType}): this {`,
            indent(`this.replicaState = applyLocalAction(this.replicaState, this.objectId, {
type: "set.add",
path: ${pathLiteral(path)},
value: ${valueExpression},
});`),
            indent("return this;"),
            "}",
        ].join("\n"),
        [
            `remove${methodBaseName}(value: ${parameterType}): this {`,
            indent(`this.replicaState = applyLocalAction(this.replicaState, this.objectId, {
type: "set.remove",
path: ${pathLiteral(path)},
value: ${valueExpression},
});`),
            indent("return this;"),
            "}",
        ].join("\n"),
    ];
}

function emitArrayMethods(
    field: ArrayFieldDefinition,
    path: string[],
    methodBaseName: string,
): string[] {
    const parameterType = field.element.type === "primitive"
        ? primitiveScalarType(field.element.valueType)
        : "string";
    const valueExpression = field.element.type === "primitive"
        ? "value"
        : `{
    type: "ref",
    objectId: value,
}`;

    return [
        [
            `insert${methodBaseName}(value: ${parameterType}, index?: number): this {`,
            indent(`const currentValues = this.view().${path.join(".")} ?? [];
const resolvedIndex = index ?? currentValues.length;

this.replicaState = applyLocalAction(this.replicaState, this.objectId, {
type: "array.insert",
path: ${pathLiteral(path)},
index: resolvedIndex,
value: ${valueExpression},
});`),
            indent("return this;"),
            "}",
        ].join("\n"),
        [
            `remove${methodBaseName}At(index: number): this {`,
            indent(`this.replicaState = applyLocalAction(this.replicaState, this.objectId, {
type: "array.remove",
path: ${pathLiteral(path)},
index,
});`),
            indent("return this;"),
            "}",
        ].join("\n"),
    ];
}

function emitMutationMethods(
    field: ObjectFieldDefinition,
    path: string[],
    namePrefix: string[],
): string[] {
    const methods: string[] = [];

    for (const [fieldName, childField] of Object.entries(field.fields)) {
        const childPath = [...path, fieldName];
        const childPrefix = [...namePrefix, fieldName];

        switch (childField.type) {
            case "primitive":
                methods.push(
                    emitPrimitiveMethod(
                        `set${childPrefix.map(toPascalCase).join("")}`,
                        childPath,
                        childField.valueType,
                    ),
                );
                break;
            case "ref":
                methods.push(
                    emitRefMethod(
                        `set${childPrefix.map(toPascalCase).join("")}`,
                        childPath,
                    ),
                );
                break;
            case "object":
                methods.push(...emitMutationMethods(childField, childPath, childPrefix));
                break;
            case "set":
                methods.push(
                    ...emitSetMethods(
                        childField,
                        childPath,
                        [...namePrefix, singularize(fieldName)].map(toPascalCase).join(""),
                    ),
                );
                break;
            case "array":
                methods.push(
                    ...emitArrayMethods(
                        childField,
                        childPath,
                        [...namePrefix, singularize(fieldName)].map(toPascalCase).join(""),
                    ),
                );
                break;
        }
    }

    return methods;
}

export function emitTypeScriptModule(
    schema: SchemaDefinition,
    options: EmitTypeScriptModuleOptions = {},
): string {
    const packageImportPath = options.packageImportPath ?? DEFAULT_PACKAGE_IMPORT_PATH;
    const defaultPrimitiveSemantics = resolveDefaultSemantics(schema, "primitive");
    const defaultRefSemantics = resolveDefaultSemantics(schema, "ref");
    const name = schema.name;
    const optionsName = `${name}Options`;
    const viewName = `${name}View`;
    const harnessName = `${name}Harness`;
    const createInitialRootName = `create${name}InitialRoot`;

    const initialRootLines: string[] = [];
    emitObjectNodeInitialization(schema.root, [], initialRootLines);

    const mutationMethods = emitMutationMethods(schema.root, [], []);

    return `import {
    type ApplyContext,
    applyLocalAction,
    createArrayNodeState,
    createObjectNodeState,
    createPrimitiveNodeState,
    createRefNodeState,
    createReplicaState,
    createSetNodeState,
    type MultiValueView,
    type NodeState,
    type RefValue,
    materializeReplicaObject,
    mergeReplicaStates,
    type ReplicaState,
    viewNode,
} from "${packageImportPath}";

export interface ${optionsName} {
    replicaId: string;
    objectId?: string;
    applyContext?: ApplyContext;
}

export type ${viewName} = ${emitObjectViewShape(schema.root, 1)};

export function ${createInitialRootName}(): NodeState {
${indent(`${initialRootLines.join("\n")}

return rootNode;`)}
}

const defaultApplyContext: ApplyContext = {
    policy: {
        defaultPrimitiveSemantics: "${defaultPrimitiveSemantics}",
        defaultRefSemantics: "${defaultRefSemantics}",
    },
};

export class ${harnessName} {
    private readonly objectId: string;
    private readonly applyContext: ApplyContext;
    private replicaState: ReplicaState;

    constructor(options: ${optionsName}) {
        this.objectId = options.objectId ?? "${name}";
        this.applyContext = options.applyContext ?? defaultApplyContext;
        this.replicaState = createReplicaState(options.replicaId);
    }

    static fromReplica(
        replica: ReplicaState,
        options?: {
            objectId?: string;
            applyContext?: ApplyContext;
        },
    ): ${harnessName} {
        const harness = new ${harnessName}({
            replicaId: replica.replicaId,
            objectId: options?.objectId ?? "${name}",
            applyContext: options?.applyContext ?? defaultApplyContext,
        });

        harness.replicaState = replica;
        return harness;
    }

    get replica(): ReplicaState {
        return this.replicaState;
    }

    clone(): ${harnessName} {
        return ${harnessName}.fromReplica(this.replicaState, {
            objectId: this.objectId,
            applyContext: this.applyContext,
        });
    }

    replaceReplica(replica: ReplicaState): this {
        this.replicaState = replica;
        return this;
    }

    mergeFrom(other: ${harnessName}, replicaId = this.replica.replicaId): this {
        this.replicaState = mergeReplicaStates(this.replicaState, other.replica, replicaId);
        return this;
    }

    view(): ${viewName} {
        return viewNode(
            materializeReplicaObject(this.replicaState, this.objectId, {
                applyContext: this.applyContext,
                initialRoot: ${createInitialRootName}(),
            }).root,
        ) as ${viewName};
    }

${indent(mutationMethods.join("\n\n"))}
}
`;
}
