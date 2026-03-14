import type {PrimitiveValue, RefValue} from "../ops/action";

import {createRegisterState, RegisterSemantics, type RegisterState,} from "./register";

import {createObjectState, type ObjectState,} from "./object";

import {createSetState, type SetState,} from "./set";

import {type ArrayState, createArrayState,} from "./array";

export type SetElementValue = PrimitiveValue | RefValue;

export interface PrimitiveNodeState {
    kind: "primitive";
    semantics: RegisterSemantics;
    state: RegisterState<PrimitiveValue>;
}

export interface RefNodeState {
    kind: "ref";
    semantics: RegisterSemantics;
    state: RegisterState<RefValue>;
}

export interface ObjectNodeState {
    kind: "object";
    state: ObjectState<NodeState>;
}

export interface SetNodeState {
    kind: "set";
    state: SetState<SetElementValue>;
}

export interface ArrayNodeState {
    kind: "array";
    state: ArrayState<NodeState>;
}

export type RegisterNodeState =
    | PrimitiveNodeState
    | RefNodeState;

export type ContainerNodeState =
    | ObjectNodeState
    | SetNodeState
    | ArrayNodeState;

export type NodeState =
    | RegisterNodeState
    | ContainerNodeState;

export function isPrimitiveNodeState(
    node: NodeState,
): node is PrimitiveNodeState {
    return node.kind === "primitive";
}

export function isRefNodeState(
    node: NodeState,
): node is RefNodeState {
    return node.kind === "ref";
}

export function isObjectNodeState(
    node: NodeState,
): node is ObjectNodeState {
    return node.kind === "object";
}

export function isSetNodeState(
    node: NodeState,
): node is SetNodeState {
    return node.kind === "set";
}

export function isArrayNodeState(
    node: NodeState,
): node is ArrayNodeState {
    return node.kind === "array";
}

export function createPrimitiveNodeState(
    semantics: RegisterSemantics,
): PrimitiveNodeState {
    return {
        kind: "primitive",
        semantics,
        state: createRegisterState<PrimitiveValue>(semantics),
    };
}

export function createRefNodeState(
    semantics: RegisterSemantics,
): RefNodeState {
    return {
        kind: "ref",
        semantics,
        state: createRegisterState<RefValue>(semantics),
    };
}

export function createObjectNodeState(): ObjectNodeState {
    return {
        kind: "object",
        state: createObjectState<NodeState>(),
    };
}

export function createSetNodeState(): SetNodeState {
    return {
        kind: "set",
        state: createSetState<SetElementValue>(),
    };
}

export function createArrayNodeState(): ArrayNodeState {
    return {
        kind: "array",
        state: createArrayState<NodeState>(),
    };
}
