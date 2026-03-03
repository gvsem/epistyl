import { IAction } from "../action/IAction";
import { ReplicaId } from "../replica/ReplicaId";
import { OperationId, WithOperationId } from "./OperationId";

/**
 * NB! This is a code snippet which is not tested and may be subject to change in the future,
 * so it should be used with caution. This is just an initial push to the repo.
 * TODO(gvsem): remove this caution when the class has a stable version.
 */

export interface IOperation extends WithOperationId {
    readonly replicaId: ReplicaId;
    readonly actions: IAction<any>[]; 

    // TODO(gvsem): consider finding place for premises
    // readonly initialPremises: OperationId[];
};