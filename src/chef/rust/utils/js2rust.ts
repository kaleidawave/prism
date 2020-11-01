import { Value as JSValue, Type as JSType } from "../../javascript/components/value/value";
import { astTypes as JSAstTypes } from "../../javascript/javascript";
import { VariableReference as JSVariableReference } from "../../javascript/components/value/variable";
import { InterfaceDeclaration as JSInterfaceDeclaration } from "../../javascript/components/types/interface";
import { TypeSignature as JSTypeSignature } from "../../javascript/components/types/type-signature";
import { Type, Value } from "../values/value";
import { VariableReference } from "../values/variable";
import { StructStatement, TypeSignature } from "../statements/struct";
import { ImportStatement as JSImportStatement, ExportStatement as JSExportStatement } from "../../javascript/components/statements/import-export";
import { Expression as JSExpression, Operation as JSOperation } from "../../javascript/components/value/expression";
import { basename } from "path";
import { UseStatement } from "../statements/use";
import { Module } from "../module";
import { Expression, Operation } from "../values/expression";
import { ArgumentList as JSArgumentList } from "../../javascript/components/constructs/function";
import { ArgumentList } from "../statements/function";

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

export function jsAstToRustAst(jsAst: JSAstTypes, module: Module) {
    if (jsAst instanceof JSVariableReference) {
        return new VariableReference(jsAst.name, jsAst.parent ? jsAstToRustAst(jsAst.parent, module) : undefined, false);
    } else if (jsAst instanceof JSValue) {
        return new Value(literalTypeMap.get(jsAst.type)!, jsAst.value ?? "");
    } else if (jsAst instanceof JSInterfaceDeclaration) {
        return new StructStatement(
            jsAstToRustAst(jsAst.name, module),
            new Map(Array.from(jsAst.members).map(([name, tS]) => [name, jsAstToRustAst(tS, module)])),
            true // TODO temp will say its true for now ...
        );
    } else if (jsAst instanceof JSTypeSignature) {
        if (jsAst.name === "Union") {
            const firstTypeArg = jsAst.typeArguments![0];
            const actualName = firstTypeArg.value ? jsTypeMap.get(firstTypeArg.value.type)! : firstTypeArg.name!;
            return new TypeSignature(typeMap.get(actualName)!);
        }

        // TODO mapped types
        return new TypeSignature(typeMap.get(jsAst.name!) ?? jsAst.name!, {
            typeArguments: jsAst.typeArguments ? jsAst.typeArguments.map(tA => jsAstToRustAst(tA, module)) : undefined
        });
    } else if (jsAst instanceof JSExportStatement) {
        const rustAst = jsAstToRustAst(jsAst.exported, module);
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
            jsAstToRustAst(jsAst.lhs, module),
            operation,
            jsAst.rhs ? jsAstToRustAst(jsAst.rhs, module) : undefined
        )
    } else if (jsAst instanceof JSArgumentList) {
        return new ArgumentList(jsAst.args.map(arg => jsAstToRustAst(arg, module)));
    } else {
        throw Error(`Cannot convert "${jsAst.constructor.name}" "${jsAst.render()}" to Rust`);
    }
}