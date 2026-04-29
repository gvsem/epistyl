#!/usr/bin/env node

import {generateTypeScriptFromYaml,} from "./codegen/generate";

interface CliOptions {
    command: string | null;
    schemaPath: string | null;
    outDir: string | null;
    packageImportPath?: string;
}

function printUsage(): void {
    console.error(`Usage:
  epistyl generate --schema <schema.yaml> --out-dir <directory>

Options:
  --schema <path>          Path to YAML schema.
  --out-dir <directory>    Directory for generated TypeScript file.
  --package-import <path>  Package import used by generated code. Defaults to @gvsem/epistyl.
`);
}

function readOptionValue(args: string[], index: number, option: string): string {
    const value = args[index + 1];

    if (value === undefined || value.startsWith("--")) {
        throw new Error(`Missing value for ${option}`);
    }

    return value;
}

function parseArgs(args: string[]): CliOptions {
    const [command, ...rest] = args;
    const options: CliOptions = {
        command: command ?? null,
        schemaPath: null,
        outDir: null,
    };

    for (let index = 0; index < rest.length; index += 1) {
        const arg = rest[index];

        switch (arg) {
            case "--schema":
                options.schemaPath = readOptionValue(rest, index, arg);
                index += 1;
                break;
            case "--out-dir":
                options.outDir = readOptionValue(rest, index, arg);
                index += 1;
                break;
            case "--package-import":
                options.packageImportPath = readOptionValue(rest, index, arg);
                index += 1;
                break;
            default:
                throw new Error(`Unknown argument: ${arg}`);
        }
    }

    return options;
}

async function main(): Promise<void> {
    const options = parseArgs(process.argv.slice(2));

    if (options.command !== "generate") {
        printUsage();
        process.exitCode = 1;
        return;
    }

    if (options.schemaPath === null || options.outDir === null) {
        printUsage();
        process.exitCode = 1;
        return;
    }

    const result = await generateTypeScriptFromYaml({
        schemaPath: options.schemaPath,
        outDir: options.outDir,
        packageImportPath: options.packageImportPath,
    });

    console.log(`Generated ${result.schemaName}: ${result.outputPath}`);
}

main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
});

