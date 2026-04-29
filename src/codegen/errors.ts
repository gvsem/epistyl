export class SchemaParseError extends Error {
    public readonly path: string;

    constructor(path: string, message: string) {
        super(`${path}: ${message}`);
        this.name = "SchemaParseError";
        this.path = path;
    }
}

export class SchemaValidationError extends Error {
    public readonly path: string;

    constructor(path: string, message: string) {
        super(`${path}: ${message}`);
        this.name = "SchemaValidationError";
        this.path = path;
    }
}

