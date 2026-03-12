import { describe, it, expect } from "vitest";

import {
    isContainerNodeModel,
    isLeafNodeModel,
    type ArrayNodeModel,
    type MapNodeModel,
    type ObjectNodeModel,
    type PrimitiveNodeModel,
    type RefNodeModel,
    type SetNodeModel,
} from "../../src/crdt/model";

describe("crdt/model", () => {
    describe("isLeafNodeModel", () => {
        it("returns true for primitive node model", () => {
            const model: PrimitiveNodeModel = {
                kind: "primitive",
                semantics: "mv",
            };

            expect(isLeafNodeModel(model)).toBe(true);
            expect(isContainerNodeModel(model)).toBe(false);
        });

        it("returns true for ref node model", () => {
            const model: RefNodeModel = {
                kind: "ref",
                semantics: "lww",
            };

            expect(isLeafNodeModel(model)).toBe(true);
            expect(isContainerNodeModel(model)).toBe(false);
        });

        it("returns false for object node model", () => {
            const model: ObjectNodeModel = {
                kind: "object",
            };

            expect(isLeafNodeModel(model)).toBe(false);
        });

        it("returns false for map node model", () => {
            const model: MapNodeModel = {
                kind: "map",
            };

            expect(isLeafNodeModel(model)).toBe(false);
        });

        it("returns false for set node model", () => {
            const model: SetNodeModel = {
                kind: "set",
            };

            expect(isLeafNodeModel(model)).toBe(false);
        });

        it("returns false for array node model", () => {
            const model: ArrayNodeModel = {
                kind: "array",
            };

            expect(isLeafNodeModel(model)).toBe(false);
        });
    });

    describe("isContainerNodeModel", () => {
        it("returns true for object node model", () => {
            const model: ObjectNodeModel = {
                kind: "object",
            };

            expect(isContainerNodeModel(model)).toBe(true);
            expect(isLeafNodeModel(model)).toBe(false);
        });

        it("returns true for map node model", () => {
            const model: MapNodeModel = {
                kind: "map",
            };

            expect(isContainerNodeModel(model)).toBe(true);
            expect(isLeafNodeModel(model)).toBe(false);
        });

        it("returns true for set node model", () => {
            const model: SetNodeModel = {
                kind: "set",
            };

            expect(isContainerNodeModel(model)).toBe(true);
            expect(isLeafNodeModel(model)).toBe(false);
        });

        it("returns true for array node model", () => {
            const model: ArrayNodeModel = {
                kind: "array",
            };

            expect(isContainerNodeModel(model)).toBe(true);
            expect(isLeafNodeModel(model)).toBe(false);
        });

        it("returns false for primitive node model", () => {
            const model: PrimitiveNodeModel = {
                kind: "primitive",
                semantics: "lww",
            };

            expect(isContainerNodeModel(model)).toBe(false);
        });

        it("returns false for ref node model", () => {
            const model: RefNodeModel = {
                kind: "ref",
                semantics: "mv",
            };

            expect(isContainerNodeModel(model)).toBe(false);
        });
    });
});