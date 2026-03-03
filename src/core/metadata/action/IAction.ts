import { OperationId } from "../operation/OperationId";
import { WithObjectId } from "../object/ObjectId";
import { History } from "../../history/History";

/**
 * NB! This is a code snippet which is not tested and may be subject to change in the future,
 * so it should be used with caution. This is just an initial push to the repo.
 * TODO(gvsem): remove this caution when the class has a stable version.
 */

/**
 * IAction is an interface to represent an action that can be applied to an object.
 * Actions have no identity of their own, and are identified by the object they belong to, their kind and their payload.
 * 
 * If an action has an identity, it should be included in the payload, so it can be retrieved with `args` method.
 * 
 * Single action belongs to a single object, and is identified by its `objectId`.
 */
export interface IAction<KindId> extends WithObjectId {

    /**
     * Kind of the action is a type label of an action, which is used for typing purposes.
     * In other words, `kind` defines the type of the action arguments which can be retrieved by `args` method.
     * 
     * For example, if `kind` is "SetName", then `args` can be of type `{ name: string }`.
     */
    readonly kind: KindId;

    /** 
     * Arguments are the payload of the action, which is used to apply the action to an object.
     * The type of the arguments is defined by the `kind` of the action.
     * For example, if `kind` is "SetName", then `args` can be of type `{ name: string }`.
     * If `kind` is "Increment", then `args` can be of type `{ amount: number }`.
     * 
     * Note that the type of the arguments must be consistent with the `kind` of the action, but it is not enforced by the type system.
     * It is the responsibility of the user to ensure that the correct type of arguments is returned for each kind of action.
     */
    args<Args>(): Args | undefined;

    // /**
    //  * Premises are the casual dependencies of the action, which are inferred upon action creation and
    //  * included in the premises of the governing operation.
    //  * 
    //  * Premises is a mechanism for causal delivery of actions.
    //  * Action may have an empty list of premises, so the implementation of this method can be left blank.
    //  * 
    //  * @param history current history from which the premises can be inferred
    //  * @returns list of desired operationIds that must be present in the history for the action to be applicable
    //  */
    // premises(history: History): OperationId[];
    // TODO(gvsem): find a place to represent the premises of an action
}