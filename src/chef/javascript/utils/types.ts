import { Module } from "../components/module";
import { TypeSignature } from "../components/types/type-signature";
import { TypeDeclaration } from "../components/types/statements";
import { InterfaceDeclaration } from "../components/types/interface";
import { ImportStatement, ExportStatement } from "../components/statements/import-export";
import { resolve, dirname } from "path";
import { EnumDeclaration } from "../components/types/enum";
import { Type, Value } from "../components/value/value";

export interface IType {
    name?: string,
    properties?: Map<string, IType>,
    indexed?: IType,
}

// TODO use WeakMap
// Cache found types
interface ModuleWithResolvedTypes extends Module {
    _typeMap?: Map<string, IType>
}

// TODO hardcoded, doesn't contain any properties, needs to read from lib.d.ts
export const inbuiltTypes: Map<string, IType> = new Map(
    ["number", "boolean", "string", "Date"].map(t => [t, { name: t }])
);

/**
 * Rough function to turn the AST TypeSignature object into IType.
 * Dereferences type references
 * @param module Module it can find type declarations and imports from
 * @param name Optional name of interface etc...
 */
export function typeSignatureToIType(
    typeSignature: TypeSignature,
    module: ModuleWithResolvedTypes,
    name?: string
): IType {
    if (typeSignature.name) {
        if (typeSignature.name === "Union") {
            if (typeSignature.typeArguments!.every(typeArg => typeArg.value?.type === Type.string)) {
                return inbuiltTypes.get("string")!;
            } else if (typeSignature.typeArguments!.every(typeArg => typeArg.value?.type === Type.number)) {
                return inbuiltTypes.get("number")!;
            }
        }

        return typeFromName(typeSignature.name, module, typeSignature.typeArguments);
    }

    if (typeSignature.mappedTypes) {
        return {
            name,
            properties: new Map(
                Array.from(typeSignature.mappedTypes)
                    .map(([name, signature]) =>
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

    if (!module._typeMap) module._typeMap = new Map();

    // TODO replace hardcoded array implementation
    if (name === "Array") {
        return {
            name: "Array",
            properties: new Map([["length", { name: "number" }]]),
            indexed: typeSignatureToIType(typeArguments![0]!, module)
        }
    }

    if (module._typeMap?.has(name)) return module._typeMap.get(name)!;

    const [statement] = findTypeDeclaration(module, name, imported);

    // TODO does not take into account generics 
    if (statement instanceof TypeDeclaration) {
        return typeSignatureToIType(statement.value, module, name);
    } else if (statement instanceof InterfaceDeclaration) {
        let type: IType = { name };
        // Assign now for recursive reasons
        module._typeMap!.set(name, type);

        type.properties = new Map(
            Array.from(statement.members)
                .map(([name, signature]) =>
                    [name, typeSignatureToIType(signature, module)]
                )
        );

        // If extends type
        if (statement.extendsType) {
            // Get the type
            const extendsType = typeSignatureToIType(statement.extendsType, module);

            // Add the declarations to the existing type
            for (const [key, value] of extendsType.properties!) {
                type.properties!.set(key, value);
            }
        }
        return type;
    } else {
        // Lets say its a string enum if first value is string
        if ((statement.members.values().next().value as Value).type === Type.string) {
            return inbuiltTypes.get("string")!;
        } else {
            return inbuiltTypes.get("number")!;
        }
    }
}

export type TypeDeclaringStatement = TypeDeclaration | InterfaceDeclaration | EnumDeclaration;

export function findTypeDeclaration(
    module: Module,
    name: string,
    imported: boolean = false
): [TypeDeclaringStatement, Module] {
    for (const statementInMod of imported ? module.exports : module.statements) {
        const statement = statementInMod instanceof ExportStatement ? statementInMod.exported : statementInMod;

        if (statement instanceof ImportStatement && statement.variable?.entries?.has(name)) {
            let importedModuleFilename = resolve(dirname(module.filename!), statement.from);
            if (importedModuleFilename.endsWith(".js")) {
                importedModuleFilename = importedModuleFilename.substring(0, importedModuleFilename.length - 3) + ".ts";
            } else if (!importedModuleFilename.endsWith(".ts")) {
                importedModuleFilename += ".ts";
            }
            const importedModule = Module.fromFile(importedModuleFilename);
            return findTypeDeclaration(importedModule, name);
        } else if (
            (
                statement instanceof InterfaceDeclaration ||
                statement instanceof TypeDeclaration ||
                statement instanceof EnumDeclaration
            ) &&
            statement.actualName === name
        ) {
            return [statement, module];
        }
    }
    throw Error(`Could not find type definition "${name}" in module "${module.filename}"`);
}