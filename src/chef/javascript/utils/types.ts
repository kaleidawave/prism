import { Module } from "../components/module";
import { TypeSignature } from "../components/types/type-signature";
import { TypeStatement } from "../components/types/statements";
import { InterfaceDeclaration } from "../components/types/interface";
import { ImportStatement, ExportStatement } from "../components/statements/import-export";
import { resolve, dirname } from "path";

export interface IType {
    name?: string,
    properties?: Map<string, IType>,
    indexed?: IType,
}

// Cache found types
interface ModuleWithResolvedTypes extends Module {
    _typeMap?: Map<string, IType>
}

// TODO hardcoded, doesn't contain any properties, needs to read from lib.d.ts
// TODO Observable temp
const inbuiltTypes: Map<string, IType> = new Map(
    ["number", "boolean", "string", "Date", "Observable"].map(t => [t, { name: t }])
);

/**
 * Rough function to turn the AST TypeSignature object into IType.
 * Dereferences type references
 * @param module Module it can find type declarations and imports from
 * @param name Optional name of interface etc...
 */
export function typeSignatureToIType(typeSignature: TypeSignature, module: ModuleWithResolvedTypes, name?: string): IType {
    if (typeSignature.name) {
        return typeFromName(typeSignature.name, module, typeSignature.typeArguments);
    }

    if (typeSignature.mappedTypes) {
        return {
            name,
            properties: new Map(
                Array.from(typeSignature.mappedTypes).map(([name, signature]) =>
                    [name, typeSignatureToIType(signature, module)]
                )
            )
        }
    }

    // TODO 
    throw Error("Not implemented");
}

/**
 * @param name 
 * @param module 
 * @param typeArguments 
 * @param imported 
 */
function typeFromName(
    name: string, 
    module: ModuleWithResolvedTypes, 
    typeArguments?: Array<TypeSignature>,
    imported: boolean = false
): IType {
    if (inbuiltTypes.has(name)) return inbuiltTypes.get(name)!;

    // TODO replace hardcoded array implementation
    if (name === "Array") {
        return {
            name: "Array",
            properties: new Map([["length", { name: "number" }]]),
            indexed: typeSignatureToIType(typeArguments![0]!, module)
        }
    }

    if (module._typeMap?.has(name)) return module._typeMap.get(name)!;

    let type: IType | null = null;
    const statementsToLookThrough = imported ? module.exports : module.statements;

    for (let statement of statementsToLookThrough) {
        // TODO kinda temp
        if (statement instanceof ExportStatement) statement = statement.exported;

        // TODO does not take into account generics 
        if (statement instanceof TypeStatement && statement.name!.name! === name) {
            type = typeSignatureToIType(statement.value, module, name);
        } else if (statement instanceof InterfaceDeclaration && statement.name!.name! === name) {
            type = {
                name,
                properties: new Map(
                    Array.from(statement.members).map(
                        ([key, typeSig]) => [key, typeSignatureToIType(typeSig, module, name)]
                    )
                )
            }

            // If extends type
            if (statement.extendsType) {
                // Get the type
                const extendsType = typeSignatureToIType(statement.extendsType, module);

                // Add the declarations to the existing type
                for (const [key, value] of extendsType.properties!) {
                    type.properties!.set(key, value);
                }
            }
        } else if (statement instanceof ImportStatement && statement.variable?.entries?.has(name)) {
            let importedModuleFilename = resolve(dirname(module.filename!), statement.from);
            if (importedModuleFilename.endsWith(".js")) {
                importedModuleFilename = importedModuleFilename.substring(0, importedModuleFilename.length - 3) + ".ts";
            } else if (!importedModuleFilename.endsWith(".ts")) {
                importedModuleFilename += ".ts";
            }
            const importedModule = Module.fromFile(importedModuleFilename);
            type = typeFromName(name, importedModule, typeArguments, true);
        }

        if (type) break;
    }

    if (type === null) throw Error(`Could not find type: ${name} in module`);
    if (!module._typeMap) module._typeMap = new Map();
    module._typeMap!.set(name, type);
    return type;
}