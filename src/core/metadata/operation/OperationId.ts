import { v4 as uuidv4 } from 'uuid';

export type OperationId = string | { __brand: 'OperationId' };

export type WithOperationId = {
    readonly operationId: OperationId;
};

export namespace OperationId {
    export function create(): OperationId {
        // TODO: it can be just a combination of ReplicaId and a monotonic counter
        return uuidv4() as OperationId;
    }
};