import {mkdir, readFile, writeFile,} from "node:fs/promises";
import {join,} from "node:path";

import {emitTypeScriptModule, type EmitTypeScriptModuleOptions,} from "./emitter";
import {parseYamlSchema,} from "./parser";
import {validateParsedSchema,} from "./validator";

export interface GenerateTypeScriptFromYamlOptions extends EmitTypeScriptModuleOptions {
    schemaPath: string;
    outDir: string;
}

export interface GenerateTypeScriptFromYamlResult {
    schemaName: string;
    outputPath: string;
    source: string;
}

export async function generateTypeScriptFromYaml(
    options: GenerateTypeScriptFromYamlOptions,
): Promise<GenerateTypeScriptFromYamlResult> {
    const yamlSource = await readFile(options.schemaPath, "utf8");
    const schema = validateParsedSchema(parseYamlSchema(yamlSource));
    const source = emitTypeScriptModule(schema, {
        packageImportPath: options.packageImportPath,
    });
    const outputPath = join(options.outDir, `${schema.name}.ts`);

    await mkdir(options.outDir, {recursive: true});
    await writeFile(outputPath, source, "utf8");

    return {
        schemaName: schema.name,
        outputPath,
        source,
    };
}

