import {cloneCausalVersionStamp, compareCausalVersionStamps, CausalVersionStamp} from "./version";

export type ArrayElementCausalVersionStamp = CausalVersionStamp;

export const createArrayElementCausalVersionStamp = cloneCausalVersionStamp;
export const compareArrayElementCausalVersionStamps = compareCausalVersionStamps;

export interface ArrayElementState<TNode> {
    elementId: string;
    afterElementId: string | null;
    node: TNode | null;
    insertVersion: ArrayElementCausalVersionStamp;
    deleteVersion: ArrayElementCausalVersionStamp | null;
}

export interface ArrayState<TNode> {
    elements: Record<string, ArrayElementState<TNode>>;
}

export interface ArrayNodeAdapter<TNode> {
    mergeNodes(left: TNode, right: TNode): TNode;
}

export function createArrayState<TNode>(): ArrayState<TNode> {
    return {
        elements: {},
    };
}

export function getArrayElement<TNode>(
    state: ArrayState<TNode>,
    elementId: string,
): ArrayElementState<TNode> | null {
    return state.elements[elementId] ?? null;
}

export function isArrayElementVisible<TNode>(
    element: ArrayElementState<TNode>,
): boolean {
    return element.node !== null && element.deleteVersion === null;
}

export function mergeArrayElementStates<TNode>(
    left: ArrayElementState<TNode> | null,
    right: ArrayElementState<TNode> | null,
    adapter: ArrayNodeAdapter<TNode>,
): ArrayElementState<TNode> | null {
    if (left === null) {
        return right;
    }

    if (right === null) {
        return left;
    }

    const insertWinner =
        compareArrayElementCausalVersionStamps(left.insertVersion, right.insertVersion) >= 0
            ? left
            : right;

    let mergedNode: TNode | null;

    if (left.node !== null && right.node !== null) {
        mergedNode = adapter.mergeNodes(left.node, right.node);
    } else {
        mergedNode = left.node ?? right.node;
    }

    let mergedDeleteVersion: ArrayElementCausalVersionStamp | null = null;

    if (left.deleteVersion !== null && right.deleteVersion !== null) {
        mergedDeleteVersion =
            compareArrayElementCausalVersionStamps(left.deleteVersion, right.deleteVersion) >= 0
                ? createArrayElementCausalVersionStamp(left.deleteVersion)
                : createArrayElementCausalVersionStamp(right.deleteVersion);
    } else if (left.deleteVersion !== null) {
        mergedDeleteVersion = createArrayElementCausalVersionStamp(left.deleteVersion);
    } else if (right.deleteVersion !== null) {
        mergedDeleteVersion = createArrayElementCausalVersionStamp(right.deleteVersion);
    }

    return {
        elementId: insertWinner.elementId,
        afterElementId: insertWinner.afterElementId,
        node: mergedNode,
        insertVersion: createArrayElementCausalVersionStamp(insertWinner.insertVersion),
        deleteVersion: mergedDeleteVersion,
    };
}

export function insertArrayElement<TNode>(
    state: ArrayState<TNode>,
    element: ArrayElementState<TNode>,
    adapter: ArrayNodeAdapter<TNode>,
): ArrayState<TNode> {
    const existing = state.elements[element.elementId] ?? null;
    const merged = mergeArrayElementStates(existing, element, adapter);

    if (merged === null) {
        return state;
    }

    return {
        elements: {
            ...state.elements,
            [element.elementId]: merged,
        },
    };
}

export function deleteArrayElement<TNode>(
    state: ArrayState<TNode>,
    elementId: string,
    deleteVersion: ArrayElementCausalVersionStamp,
): ArrayState<TNode> {
    const existing = state.elements[elementId];
    if (!existing) {
        return state;
    }

    let nextDeleteVersion = createArrayElementCausalVersionStamp(deleteVersion);

    if (
        existing.deleteVersion !== null &&
        compareArrayElementCausalVersionStamps(existing.deleteVersion, nextDeleteVersion) > 0
    ) {
        nextDeleteVersion = createArrayElementCausalVersionStamp(existing.deleteVersion);
    }

    return {
        elements: {
            ...state.elements,
            [elementId]: {
                ...existing,
                node: null,
                deleteVersion: nextDeleteVersion,
            },
        },
    };
}

function buildChildrenIndex<TNode>(
    state: ArrayState<TNode>,
): Map<string | null, ArrayElementState<TNode>[]> {
    const byParent = new Map<string | null, ArrayElementState<TNode>[]>();

    for (const element of Object.values(state.elements)) {
        const parentId =
            element.afterElementId !== null &&
            state.elements[element.afterElementId] !== undefined
                ? element.afterElementId
                : null;

        const current = byParent.get(parentId) ?? [];
        current.push(element);
        byParent.set(parentId, current);
    }

    for (const children of byParent.values()) {
        children.sort((a, b) =>
            compareArrayElementCausalVersionStamps(a.insertVersion, b.insertVersion),
        );
    }

    return byParent;
}

export function getVisibleArrayElements<TNode>(
    state: ArrayState<TNode>,
): ArrayElementState<TNode>[] {
    const byParent = buildChildrenIndex(state);
    const result: ArrayElementState<TNode>[] = [];
    const visited = new Set<string>();

    function visit(parentId: string | null): void {
        const children = byParent.get(parentId) ?? [];

        for (const child of children) {
            if (visited.has(child.elementId)) {
                continue;
            }

            visited.add(child.elementId);

            if (isArrayElementVisible(child)) {
                result.push(child);
            }

            visit(child.elementId);
        }
    }

    visit(null);

    return result;
}

export function findVisibleElementIdAtIndex<TNode>(
    state: ArrayState<TNode>,
    index: number,
): string | null {
    const visible = getVisibleArrayElements(state);

    if (index < 0 || index >= visible.length) {
        return null;
    }

    return visible[index].elementId;
}