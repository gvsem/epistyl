import type {Action, ObjectPath,} from "./action";
import type {ObjectId, Operation, OpId, TxId,} from "./operation";
import type {ReplicaId, VectorClock} from "../clock/clock";
import {LeafValue} from "../runtime/leafUtils";

export interface TransactionRecord {
    /**
     * Transaction identifier.
     */
    txId: TxId;

    /**
     * Identifier of the root object affected by the transaction. Now transaction can affect just one object
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

    initSet(path: ObjectPath): void;

    initArray(path: ObjectPath): void;

    setField(path: ObjectPath, value: LeafValue): void;

    deleteField(path: ObjectPath): void;

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

class DefaultTransactionBuilder implements TransactionBuilder {
    public readonly txId: TxId;
    public readonly objectId: ObjectId;
    public readonly replicaId: ReplicaId;

    private readonly operations: Operation[] = [];
    private readonly context: TransactionBuildContext;

    constructor(
        txId: TxId,
        objectId: ObjectId,
        context: TransactionBuildContext,
    ) {
        this.txId = txId;
        this.objectId = objectId;
        this.replicaId = context.replicaId;
        this.context = context;
    }

    private emit(action: Action): void {
        const issued = this.context.issueOperationMetadata();

        const operation: Operation = {
            opId: issued.opId,
            txId: this.txId,
            objectId: this.objectId,
            replicaId: this.replicaId,
            clock: { ...issued.clock },
            action,
        };

        this.operations.push(operation);
    }

    initObject(path: ObjectPath): void {
        this.emit({
            type: "node.initObject",
            path,
        });
    }

    initSet(path: ObjectPath): void {
        this.emit({
            type: "node.initSet",
            path,
        });
    }

    initArray(path: ObjectPath): void {
        this.emit({
            type: "node.initArray",
            path,
        });
    }

    setField(path: ObjectPath, value: LeafValue): void {
        this.emit({
            type: "field.set",
            path,
            value,
        });
    }

    deleteField(path: ObjectPath): void {
        this.emit({
            type: "field.delete",
            path,
        });
    }

    setAdd(path: ObjectPath, value: LeafValue): void {
        this.emit({
            type: "set.add",
            path,
            value,
        });
    }

    setRemove(path: ObjectPath, value: LeafValue): void {
        this.emit({
            type: "set.remove",
            path,
            value,
        });
    }

    arrayInsert(path: ObjectPath, index: number, value: LeafValue): void {
        this.emit({
            type: "array.insert",
            path,
            index,
            value,
        });
    }

    arrayRemove(path: ObjectPath, index: number): void {
        this.emit({
            type: "array.remove",
            path,
            index,
        });
    }

    getOperations(): readonly Operation[] {
        return [...this.operations];
    }

    toRecord(): TransactionRecord {
        return {
            txId: this.txId,
            objectId: this.objectId,
            replicaId: this.replicaId,
            operations: [...this.operations],
        };
    }
}

export function createTransactionBuilder(
    txId: TxId,
    objectId: ObjectId,
    context: TransactionBuildContext,
): TransactionBuilder {
    return new DefaultTransactionBuilder(
        txId,
        objectId,
        context,
    );
}