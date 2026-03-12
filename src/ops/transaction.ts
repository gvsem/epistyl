import type {LeafValue, ObjectPath,} from "./action";
import type {ObjectId, Operation, OpId, TxId,} from "./operation";
import type {ReplicaId, VectorClock} from "../core/clock";

export type ContainerNodeKind =
    | "object"
    | "map"
    | "set"
    | "array";

export interface TransactionOptions {
    /**
     * Optional human-readable label for diagnostics/logging.
     */
    label?: string;

    /**
     * Optional wall-clock timestamp for diagnostics/logging.
     */
    timestamp?: string;
}

export interface TransactionRecord {
    /**
     * Transaction identifier.
     */
    txId: TxId;

    /**
     * Identifier of the root object affected by the transaction.
     */
    objectId: ObjectId;

    /**
     * Origin replica identifier.
     */
    replicaId: ReplicaId;

    /**
     * Operations emitted by this transaction in local order.
     */
    operations: Operation[];

    /**
     * Optional human-readable label.
     */
    label?: string;

    /**
     * Optional wall-clock timestamp for diagnostics/logging only.
     */
    timestamp?: string;
}

export interface IssuedOperationMetadata {
    opId: OpId;
    clock: VectorClock;
}

export interface TransactionBuildContext {
    /**
     * Replica on behalf of which operations are issued.
     */
    replicaId: ReplicaId;

    /**
     * Issues metadata for the next operation in the transaction.
     * Returned clock must be an immutable snapshot.
     */
    issueOperationMetadata(): IssuedOperationMetadata;

    /**
     * Optional clock-independent timestamp provider.
     */
    timestamp?(): string;
}

export interface TransactionBuilder {
    /**
     * Identifier of the transaction being built.
     */
    readonly txId: TxId;

    /**
     * Identifier of the target root object.
     */
    readonly objectId: ObjectId;

    /**
     * Identifier of the origin replica.
     */
    readonly replicaId: ReplicaId;

    initObject(path: ObjectPath): void;

    initMap(path: ObjectPath): void;

    initSet(path: ObjectPath): void;

    initArray(path: ObjectPath): void;

    setField(path: ObjectPath, value: LeafValue): void;

    deleteField(path: ObjectPath): void;

    mapSetValue(path: ObjectPath, key: string, value: LeafValue): void;

    mapInitEntry(
        path: ObjectPath,
        key: string,
        nodeKind: ContainerNodeKind,
    ): void;

    mapDelete(path: ObjectPath, key: string): void;

    setAdd(path: ObjectPath, value: LeafValue): void;

    setRemove(path: ObjectPath, value: LeafValue): void;

    arrayInsert(path: ObjectPath, index: number, value: LeafValue): void;

    arrayRemove(path: ObjectPath, index: number): void;

    /**
     * Returns the operations currently accumulated by the builder.
     * The returned array must be treated as read-only snapshot data.
     */
    getOperations(): readonly Operation[];

    /**
     * Finalizes the builder and returns a serializable transaction record.
     */
    toRecord(): TransactionRecord;
}
