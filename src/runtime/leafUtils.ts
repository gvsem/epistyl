import {ApplyContext} from "./apply";
import {PrimitiveValue, RefValue} from "../ops/action";
import type {NodeState} from "../crdt/state";
import {createPrimitiveNodeState, createRefNodeState} from "../crdt/state";

export type LeafValue = PrimitiveValue | RefValue;

export function isRefValue(value: LeafValue): value is RefValue {
    return (
        typeof value === "object" &&
        value !== null &&
        "type" in value &&
        value.type === "ref"
    );
}

export function createLeafNodeFromValue(
    value: LeafValue,
    context: ApplyContext,
): NodeState {
    return isRefValue(value)
        ? createRefNodeState(context.policy.defaultRefSemantics)
        : createPrimitiveNodeState(context.policy.defaultPrimitiveSemantics);
}

export function areLeafValuesEqual(left: LeafValue, right: LeafValue): boolean {
    if (isRefValue(left) && isRefValue(right)) {
        return left.objectId === right.objectId;
    }

    if (isRefValue(left) || isRefValue(right)) {
        return false;
    }

    return left === right;
}
