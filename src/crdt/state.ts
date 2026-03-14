import type { PrimitiveValue, RefValue } from "../ops/action";

import {
    createRegisterState,
    mergeRegisterStates, RegisterSemantics,
    type RegisterState,
} from "./register";

import {
    createObjectState,
    mergeObjectStates,
    type ObjectState,
} from "./object";

import {
    createMapState,
    mergeMapStates,
    type MapState,
} from "./map";

import {
    createSetState,
    mergeSetStates,
    type SetState,
} from "./set";

import {
    createArrayState,
    mergeArrayStates,
    type ArrayState,
} from "./array";

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

export interface MapNodeState {
    kind: "map";
    state: MapState<NodeState>;
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
    | MapNodeState
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

export function isRegisterNodeState(
    node: NodeState,
): node is RegisterNodeState {
    return node.kind === "primitive" || node.kind === "ref";
}

export function isObjectNodeState(
    node: NodeState,
): node is ObjectNodeState {
    return node.kind === "object";
}

export function isMapNodeState(
    node: NodeState,
): node is MapNodeState {
    return node.kind === "map";
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

export function isContainerNodeState(
    node: NodeState,
): node is ContainerNodeState {
    return (
        node.kind === "object" ||
        node.kind === "map" ||
        node.kind === "set" ||
        node.kind === "array"
    );
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

export function createMapNodeState(): MapNodeState {
    return {
        kind: "map",
        state: createMapState<NodeState>(),
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

export function assertSameNodeKind(
    left: NodeState,
    right: NodeState,
): void {
    if (left.kind !== right.kind) {
        throw new Error(
            `Cannot merge nodes of different kinds: ${left.kind} vs ${right.kind}`,
        );
    }
}

export function mergeNodes(
    left: NodeState,
    right: NodeState,
): NodeState {
    assertSameNodeKind(left, right);

    if (isPrimitiveNodeState(left) && isPrimitiveNodeState(right)) {
        if (left.semantics !== right.semantics) {
            throw new Error(
                `Cannot merge primitive registers with different semantics: ${left.semantics} vs ${right.semantics}`,
            );
        }

        return {
            kind: "primitive",
            semantics: left.semantics,
            state: mergeRegisterStates(left.state, right.state),
        };
    }

    if (isRefNodeState(left) && isRefNodeState(right)) {
        if (left.semantics !== right.semantics) {
            throw new Error(
                `Cannot merge ref registers with different semantics: ${left.semantics} vs ${right.semantics}`,
            );
        }

        return {
            kind: "ref",
            semantics: left.semantics,
            state: mergeRegisterStates(left.state, right.state),
        };
    }

    if (isObjectNodeState(left) && isObjectNodeState(right)) {
        return {
            kind: "object",
            state: mergeObjectStates(left.state, right.state, {
                mergeNodes,
            }),
        };
    }

    if (isMapNodeState(left) && isMapNodeState(right)) {
        return {
            kind: "map",
            state: mergeMapStates(left.state, right.state, {
                mergeNodes,
            }),
        };
    }

    if (isSetNodeState(left) && isSetNodeState(right)) {
        return {
            kind: "set",
            state: mergeSetStates(left.state, right.state),
        };
    }

    if (isArrayNodeState(left) && isArrayNodeState(right)) {
        return {
            kind: "array",
            state: mergeArrayStates(left.state, right.state, {
                mergeNodes,
            }),
        };
    }

    throw new Error("Unsupported node kind for merge");
}