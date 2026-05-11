import {describe, expect, it} from "vitest";
import {addRegisterVersion, createRegisterState, getRegisterView,} from "../../src/crdt/register";

describe("register", () => {
    it("keeps concurrent values in mv register", () => {
        let state = createRegisterState<string>("mv");

        state = addRegisterVersion(state, {
            value: "A",
            opId: "A:1",
            replicaId: "A",
            clock: {A: 1},
        });

        state = addRegisterVersion(state, {
            value: "B",
            opId: "B:1",
            replicaId: "B",
            clock: {B: 1},
        });

        expect(getRegisterView(state)).toEqual({
            semantics: "mv",
            values: [
                {
                    value: "A",
                    opId: "A:1",
                    replicaId: "A",
                    clock: {A: 1},
                },
                {
                    value: "B",
                    opId: "B:1",
                    replicaId: "B",
                    clock: {B: 1},
                },
            ],
        });
    });

    it("drops causally older version", () => {
        let state = createRegisterState<string>("mv");

        state = addRegisterVersion(state, {
            value: "old",
            opId: "A:1",
            replicaId: "A",
            clock: {A: 1},
        });

        state = addRegisterVersion(state, {
            value: "new",
            opId: "A:2",
            replicaId: "A",
            clock: {A: 2},
        });

        const view = getRegisterView(state);

        expect(view).toEqual({
            semantics: "mv",
            values: [
                {
                    value: "new",
                    opId: "A:2",
                    replicaId: "A",
                    clock: {A: 2},
                },
            ],
        });
    });
});