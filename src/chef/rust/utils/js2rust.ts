import { Value as JSValue, Type as JSType } from "../../javascript/components/value/value";
import { astTypes as JSAstTypes } from "../../javascript/javascript";
import { InterfaceDeclaration as JSInterfaceDeclaration } from "../../javascript/components/types/interface";
import { TypeSignature as JSTypeSignature } from "../../javascript/components/types/type-signature";
import { Type, Value, ValueTypes } from "../values/value";
import { VariableReference } from "../values/variable";
import { StructStatement, TypeSignature } from "../statements/struct";
import { ImportStatement as JSImportStatement, ExportStatement as JSExportStatement } from "../../javascript/components/statements/import-export";
import { Expression as JSExpression, Operation as JSOperation, VariableReference as JSVariableReference } from "../../javascript/components/value/expression";
import { UseStatement } from "../statements/use";
import { Module } from "../module";
import { Expression, Operation } from "../values/expression";
import { ArgumentList as JSArgumentList } from "../../javascript/components/constructs/function";
import { ArgumentList } from "../statements/function";
import { VariableDeclaration as JSVariableDeclaration } from "../../javascript/components/statements/variable";
import { VariableDeclaration } from "../statements/variable";
import { TemplateLiteral } from "../../javascript/components/value/template-literal";
import { Module as JSModule } from "../../javascript/components/module";
import { findTypeDeclaration } from "../../javascript/utils/types";
import { StatementTypes } from "../statements/block";
import { basename } from "path";

type rustAstTypes = StatementTypes | ValueTypes | TypeSignature | ArgumentList;

const literalTypeMap = new Map([[JSType.number, Type.number], [JSType.string, Type.string]]);
const typeMap: Map<string, string> = new Map([
    ["number", "f64"],
    ["string", "String"],
    ["Array", "Vec"],
]);

const jsTypeMap: Map<JSType, string> = new Map([
    [JSType.string, "string"],
    [JSType.number, "number"],
]);

const operationMap: Map<JSOperation, Operation> = new Map([
    [JSOperation.Call, Operation.Call]
]);

export function jsAstToRustAst(jsAst: JSAstTypes, rustModule: Module, jsModule: JSModule): rustAstTypes {
    if (jsAst instanceof JSVariableReference) {
        return new VariableReference(jsAst.name, jsAst.parent ? jsAstToRustAst(jsAst.parent, rustModule, jsModule) as ValueTypes : undefined, false);
    } else if (jsAst instanceof JSValue) {
        return new Value(literalTypeMap.get(jsAst.type)!, jsAst.value ?? "");
    } else if (jsAst instanceof JSInterfaceDeclaration) {
        const members = Array.from(jsAst.members)
            .map(([name, tS]) => {
                let rts: TypeSignature = jsAstToRustAst(tS, rustModule, jsModule) as TypeSignature;
                if (jsAst.optionalProperties.has(name)) {
                    rts = new TypeSignature("Option", { typeArguments: [rts] });
                }
                return [name, rts] as [string, TypeSignature];
            });
        if (jsAst.extendsType) {
            // Rust does not do extends so do it in place
            const [extendingTypeDef, moduleItsIn] = findTypeDeclaration(jsModule, jsAst.extendsType.name!);
            // Add the extended definitions onto this declaration
            members.push(
                ...(jsAstToRustAst(extendingTypeDef, rustModule, moduleItsIn) as StructStatement).members
            );
        }
        return new StructStatement(
            jsAstToRustAst(jsAst.name, rustModule, jsModule) as TypeSignature,
            new Map(members),
            new Map,
            true // TODO temp will say its true for now ...
        );
    } else if (jsAst instanceof JSTypeSignature) {
        if (jsAst.name === "Union") {
            const firstTypeArg = jsAst.typeArguments![0];
            const actualName = firstTypeArg.value ? jsTypeMap.get(firstTypeArg.value.type)! : firstTypeArg.name!;
            return new TypeSignature(typeMap.get(actualName)!);
        }

        if (jsAst.mappedTypes) {
            const name = "prism_gen_" + Math.random().toString().slice(10);
            const struct = new StructStatement(new TypeSignature(name),
                new Map(
                    Array.from(jsAst.mappedTypes)
                        .map(([name, type]) =>
                            [name, jsAstToRustAst(type, rustModule, jsModule)] as [string, TypeSignature]
                        )
                ),
                new Map,
                true
            );
            rustModule.statements.push(struct);
            return new TypeSignature(name);
        }

        return new TypeSignature(
            typeMap.get(jsAst.name!) ?? jsAst.name!,
            {
                typeArguments: jsAst.typeArguments ?
                    jsAst.typeArguments.map(tA => jsAstToRustAst(tA, rustModule, jsModule) as TypeSignature) :
                    undefined
            }
        );
    } else if (jsAst instanceof JSExportStatement) {
        const rustAst = jsAstToRustAst(jsAst.exported, rustModule, jsModule);
        if ("isPublic" in rustAst) rustAst.isPublic = true;
        return rustAst;
    } else if (jsAst instanceof JSImportStatement) {
        const path: Array<string | string[]> = [basename(jsAst.from, ".js").replace(/\./g, "_")];
        if (jsAst.variable) {
            path.push(Array.from(jsAst.variable.entries!).map(([name]) => name as string));
        }
        return new UseStatement(path);
    } else if (jsAst instanceof JSExpression) {
        const operation = operationMap.get(jsAst.operation);
        if (typeof operation === "undefined") {
            throw Error(`Cannot convert JS operation "${JSOperation[jsAst.operation]}" to Rust`);
        }
        return new Expression(
            jsAstToRustAst(jsAst.lhs, rustModule, jsModule) as ValueTypes,
            operation,
            jsAst.rhs ? jsAstToRustAst(jsAst.rhs, rustModule, jsModule) as ValueTypes : undefined
        );
    } else if (jsAst instanceof TemplateLiteral) {
        let formatString = "";
        const formatArgs: Array<ValueTypes> = [];
        for (const entry of jsAst.entries) {
            if (typeof entry === "string") {
                formatString += entry;
            } else {
                formatString += "{}";
                formatArgs.push(jsAstToRustAst(entry, rustModule, jsModule) as ValueTypes)
            }
        }
        return new Expression(
            new VariableReference("format!"),
            Operation.Call,
            new ArgumentList([
                new Value(Type.string, formatString),
                ...formatArgs
            ])
        );
    } else if (jsAst instanceof JSArgumentList) {
        return new ArgumentList(jsAst.args.map(arg =>
            new Expression(
                (jsAstToRustAst(arg, rustModule, jsModule) as ValueTypes),
                Operation.Borrow
            )
        ));
    } else if (jsAst instanceof JSVariableDeclaration) {
        return new VariableDeclaration(
            jsAst.name,
            !jsAst.isConstant,
            jsAstToRustAst(jsAst.value, rustModule, jsModule) as ValueTypes
        );
    } else {
        throw Error(`Cannot convert "${jsAst.constructor.name}" "${jsAst.render()}" to Rust`);
    }
}