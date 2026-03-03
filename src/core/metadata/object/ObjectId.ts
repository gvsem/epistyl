export type ObjectId = string | undefined | { __brand: 'ObjectId' };

export namespace ObjectId {
    export function create(): ObjectId {
        return crypto.randomUUID() as ObjectId;
    }
};

export type WithObjectId = {
    objectId: ObjectId;
};