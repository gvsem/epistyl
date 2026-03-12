import type {LeafValue, PrimitiveValue, RefValue} from "../ops/action";

import {getRegisterView,} from "../crdt/register";

import {getObjectField, listObjectFields,} from "../crdt/object";

import {getMapEntry, listMapKeys,} from "../crdt/map";

import {getPresentSetValues,} from "../crdt/set";

import {getVisibleArrayElements,} from "../crdt/array";

import {
    isArrayNodeState,
    isMapNodeState,
    isObjectNodeState,
    isPrimitiveNodeState,
    isRefNodeState,
    isSetNodeState,
    type NodeState,
    type SetElementValue,
} from "../crdt/state";

export interface MultiValueView<T> {
    kind: "mv";
    values: T[];
}

export type PrimitiveView =
    | PrimitiveValue
    | MultiValueView<PrimitiveValue>;

export type RefView =
    | RefValue
    | null
    | MultiValueView<RefValue>;

export interface ObjectView {
    [field: string]: NodeView;
}

export interface MapView {
    [key: string]: NodeView;
}

export type SetView = SetElementValue[];
export type ArrayView = NodeView[];

export type NodeView =
    | PrimitiveView
    | RefView
    | ObjectView
    | MapView
    | SetView
    | ArrayView;

export function viewNode(node: NodeState): NodeView {
    if (isPrimitiveNodeState(node)) {
        return viewPrimitiveNode(node);
    }

    if (isRefNodeState(node)) {
        return viewRefNode(node);
    }

    if (isObjectNodeState(node)) {
        return viewObjectNode(node);
    }

    if (isMapNodeState(node)) {
        return viewMapNode(node);
    }

    if (isSetNodeState(node)) {
        return viewSetNode(node);
    }

    if (isArrayNodeState(node)) {
        return viewArrayNode(node);
    }

    throw new Error(`Unsupported node kind in view`);
}

export function viewPrimitiveNode(
    node: Extract<NodeState, { kind: "primitive" }>,
): PrimitiveView {
    const view = getRegisterView(node.state);

    if (view.semantics === "lww") {
        return view.winner?.value ?? null;
    }

    return {
        kind: "mv",
        values: view.values.map((item) => item.value),
    };
}

export function viewRefNode(
    node: Extract<NodeState, { kind: "ref" }>,
): RefView {
    const view = getRegisterView(node.state);

    if (view.semantics === "lww") {
        return view.winner?.value ?? null;
    }

    return {
        kind: "mv",
        values: view.values.map((item) => item.value),
    };
}

export function viewObjectNode(
    node: Extract<NodeState, { kind: "object" }>,
): ObjectView {
    const result: ObjectView = {};

    for (const field of listObjectFields(node.state)) {
        const slot = getObjectField(node.state, field);
        if (slot?.node !== null && slot?.node !== undefined) {
            result[field] = viewNode(slot.node);
        }
    }

    return result;
}

export function viewMapNode(
    node: Extract<NodeState, { kind: "map" }>,
): MapView {
    const result: MapView = {};

    for (const key of listMapKeys(node.state)) {
        const entry = getMapEntry(node.state, key);
        if (entry?.node !== null && entry?.node !== undefined) {
            result[key] = viewNode(entry.node);
        }
    }

    return result;
}

export function viewSetNode(
    node: Extract<NodeState, { kind: "set" }>,
): SetView {
    const values = getPresentSetValues(node.state, {
        equals: areLeafValuesEqual,
        compare: compareLeafValues,
    });

    return values.map((item) => item.value);
}

export function viewArrayNode(
    node: Extract<NodeState, { kind: "array" }>,
): ArrayView {
    const elements = getVisibleArrayElements(node.state);
    const result: ArrayView = [];

    for (const element of elements) {
        if (element.node !== null) {
            result.push(viewNode(element.node));
        }
    }

    return result;
}

function isRefValue(value: LeafValue): value is RefValue {
    return (
        typeof value === "object" &&
        value !== null &&
        "type" in value &&
        value.type === "ref"
    );
}

function areLeafValuesEqual(left: LeafValue, right: LeafValue): boolean {
    if (isRefValue(left) && isRefValue(right)) {
        return left.objectId === right.objectId;
    }

    if (isRefValue(left) || isRefValue(right)) {
        return false;
    }

    return left === right;
}

function compareLeafValues(left: LeafValue, right: LeafValue): number {
    const leftKey = leafValueSortKey(left);
    const rightKey = leafValueSortKey(right);

    if (leftKey < rightKey) {
        return -1;
    }

    if (leftKey > rightKey) {
        return 1;
    }

    return 0;
}

function leafValueSortKey(value: LeafValue): string {
    if (isRefValue(value)) {
        return `ref:${value.objectId ?? "null"}`;
    }

    return `${typeof value}:${String(value)}`;
}