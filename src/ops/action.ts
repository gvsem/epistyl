export type PathSegment = string | number;
export type ObjectPath = PathSegment[];

export type PrimitiveValue =
    | string
    | number
    | boolean
    | null;

export interface RefValue {
    type: "ref";
    objectId: string | null;
}

export type LeafValue = PrimitiveValue | RefValue;

export interface SetFieldAction {
    type: "field.set";
    path: ObjectPath;
    value: LeafValue;
}

export interface DeleteFieldAction {
    type: "field.delete";
    path: ObjectPath;
}

export interface MapSetValueAction {
    type: "map.setValue";
    path: ObjectPath;
    key: string;
    value: LeafValue;
}

export interface MapInitEntryAction {
    type: "map.initEntry";
    path: ObjectPath;
    key: string;
    nodeKind: "object" | "map" | "set" | "array";
}

export interface MapDeleteAction {
    type: "map.delete";
    path: ObjectPath;
    key: string;
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

export interface InitMapAction {
    type: "node.initMap";
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
    | MapSetValueAction
    | MapInitEntryAction
    | MapDeleteAction
    | SetAddAction
    | SetRemoveAction
    | ArrayInsertAction
    | ArrayRemoveAction
    | InitObjectAction
    | InitMapAction
    | InitSetAction
    | InitArrayAction;