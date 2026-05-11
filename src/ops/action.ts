import {LeafValue} from "../runtime/leafUtils";

export type PathSegment = string | number;
export type ObjectPath = PathSegment[];

export type ContainerNodeKind =
    | "object"
    | "set"
    | "array";

export type PrimitiveValue =
    | string
    | number
    | boolean
    | null;

export interface RefValue {
    type: "ref";
    objectId: string | null;
}

export interface SetFieldAction {
    type: "field.set";
    path: ObjectPath;
    value: LeafValue;
}

export interface DeleteFieldAction {
    type: "field.delete";
    path: ObjectPath;
}

export interface SetAddAction {
    type: "set.add";
    path: ObjectPath;
    value: LeafValue;
}

export interface SetRemoveAction {
    type: "set.remove";
    path: ObjectPath;
    value: LeafValue;
}

export interface ArrayInsertAction {
    type: "array.insert";
    path: ObjectPath;
    index: number;
    value: LeafValue;
}

export interface ArrayRemoveAction {
    type: "array.remove";
    path: ObjectPath;
    index: number;
}

export interface InitObjectAction {
    type: "node.initObject";
    path: ObjectPath;
}

export interface InitSetAction {
    type: "node.initSet";
    path: ObjectPath;
}

export interface InitArrayAction {
    type: "node.initArray";
    path: ObjectPath;
}

export type Action =
    | SetFieldAction
    | DeleteFieldAction
    | SetAddAction
    | SetRemoveAction
    | ArrayInsertAction
    | ArrayRemoveAction
    | InitObjectAction
    | InitSetAction
    | InitArrayAction;