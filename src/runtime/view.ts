import type {PrimitiveValue, RefValue} from "../ops/action";

import {getRegisterView,} from "../crdt/register";

import {getPresentSetValues,} from "../crdt/set";

import {getVisibleArrayElements,} from "../crdt/array";

import {
    isArrayNodeState,
    isObjectNodeState,
    isPrimitiveNodeState,
    isRefNodeState,
    isSetNodeState,
    type NodeState,
    type SetElementValue,
} from "../crdt/state";
import {areLeafValuesEqual} from "./leafUtils";
import {getObjectField, listObjectFields} from "../crdt/object";

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


export interface KeyedView {
    [items: string]: NodeView;
}

export type SetView = SetElementValue[];
export type ArrayView = NodeView[];

export type NodeView =
    | PrimitiveView
    | RefView
    | KeyedView
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
): KeyedView {
    const result: KeyedView = {};

    for (const field of listObjectFields(node.state)) {
        const slot = getObjectField(node.state, field);
        if (slot?.node !== null && slot?.node !== undefined) {
            result[field] = viewNode(slot.node);
        }
    }

    return result;
}

export function viewSetNode(
    node: Extract<NodeState, { kind: "set" }>,
): SetView {
    const values = getPresentSetValues(node.state, {equals: areLeafValuesEqual});

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
