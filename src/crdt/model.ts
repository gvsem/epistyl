/**
 * Register semantics for leaf nodes.
 *
 * - "lww": keeps one winning version
 * - "mv": keeps concurrent versions
 */
export type RegisterSemantics =
    | "lww"
    | "mv";

export type LeafNodeKind =
    | "primitive"
    | "ref";

export type ContainerNodeKind =
    | "object"
    | "map"
    | "set"
    | "array";

export type NodeKind =
    | LeafNodeKind
    | ContainerNodeKind;

export interface PrimitiveNodeModel {
    kind: "primitive";
    semantics: RegisterSemantics;
}

export interface RefNodeModel {
    kind: "ref";
    semantics: RegisterSemantics;
}

export interface ObjectNodeModel {
    kind: "object";
}

export interface MapNodeModel {
    kind: "map";
}

export interface SetNodeModel {
    kind: "set";
}

export interface ArrayNodeModel {
    kind: "array";
}

export type LeafNodeModel =
    | PrimitiveNodeModel
    | RefNodeModel;

export type AnyContainerNodeModel =
    | ObjectNodeModel
    | MapNodeModel
    | SetNodeModel
    | ArrayNodeModel;

export type NodeModel =
    | LeafNodeModel
    | AnyContainerNodeModel;

export function isLeafNodeModel(
    model: NodeModel,
): model is LeafNodeModel {
    return model.kind === "primitive" || model.kind === "ref";
}

export function isContainerNodeModel(
    model: NodeModel,
): model is AnyContainerNodeModel {
    return (
        model.kind === "object" ||
        model.kind === "map" ||
        model.kind === "set" ||
        model.kind === "array"
    );
}