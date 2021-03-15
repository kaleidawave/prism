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
import { Expression, Operation, StructConstructor } from "../values/expression";
import { ArgumentList as JSArgumentList } from "../../javascript/components/constructs/function";
import { ArgumentList } from "../statements/function";
import { VariableDeclaration as JSVariableDeclaration } from "../../javascript/components/statements/variable";
import { VariableDeclaration } from "../statements/variable";
import { TemplateLiteral } from "../../javascript/components/value/template-literal";
import { Module as JSModule } from "../../javascript/components/module";
import { findTypeDeclaration, IType } from "../../javascript/utils/types";
import { StatementTypes } from "../statements/block";
import { basename } from "path";
import { ObjectLiteral as JSObjectLiteral } from "../../javascript/components/value/object";

type rustAstTypes = StatementTypes | ValueTypes | TypeSignature | ArgumentList;

const literalTypeMap = new Map([[JSType.number, Type.number], [JSType.string, Type.string], [JSType.boolean, Type.boolean]]);
export const typeMap: Map<string, string> = new Map([
    ["number", "f64"],
    ["string", "String"],
    ["boolean", "bool"],
    ["Array", "Vec"],
    ["Date", "DateTime<Utc>"], // DateTime from 'chrono' crate. TODO bad specifying type arguments here
]);

// Used for converting literal types e.g. "text" to underlying type.
const jsTypeMap: Map<JSType, string> = new Map([
    [JSType.string, "string"],
    [JSType.number, "number"],
]);

const operationMap: Map<JSOperation, Operation> = new Map([
    [JSOperation.Call, Operation.Call],
    [JSOperation.StrictEqual, Operation.Equal],
    [JSOperation.LogAnd, Operation.And],
    [JSOperation.LogOr, Operation.Or],
    [JSOperation.LessThan, Operation.LessThan],
    [JSOperation.LessThanEqual, Operation.LessThanEqual],
    [JSOperation.GreaterThan, Operation.GreaterThan],
    [JSOperation.GreaterThanEqual, Operation.GreaterThanEqual],
    [JSOperation.BitNot, Operation.Not],
]);

/**
 * TODO as separate functions jsStatementToRustStatement and jsValueToRustValue
 * @param jsAst 
 * @param jsType Type used for object literal to struct constructor. Null for statements
 * @param rustModule 
 * @param jsModule 
 */
export function jsAstToRustAst(
    jsAst: JSAstTypes, 
    jsType: IType | null, 
    rustModule: Module, 
    jsModule: JSModule
): rustAstTypes {
    if (jsAst instanceof JSVariableReference) {
        return new VariableReference(
            jsAst.name, 
            jsAst.parent ? jsAstToRustAst(jsAst.parent, jsType?.properties?.get(jsAst.name) ?? null, rustModule, jsModule) as ValueTypes : undefined, 
            false
        );
    } else if (jsAst instanceof JSValue) {
        return new Value(literalTypeMap.get(jsAst.type)!, jsAst.value ?? "");
    } else if (jsAst instanceof JSInterfaceDeclaration) {
        const members = Array.from(jsAst.members)
            .map(([name, tS]) => {
                let rts: TypeSignature = jsAstToRustAst(tS, null, rustModule, jsModule) as TypeSignature;
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
                ...(jsAstToRustAst(extendingTypeDef, null, rustModule, moduleItsIn) as StructStatement).members
            );
        }
        return new StructStatement(
            jsAstToRustAst(jsAst.name, null, rustModule, jsModule) as TypeSignature,
            new Map(members),
            new Map,
            true // TODO temp will say its true for now ...
        );
    } else if (jsAst instanceof JSTypeSignature) {
        if (jsAst.name === "Union") {
            const firstTypeArg = jsAst.typeArguments![0];
            // TODO 
            const actualName = firstTypeArg.value ? jsTypeMap.get(firstTypeArg.value.type)! : firstTypeArg.name!;
            return new TypeSignature(typeMap.get(actualName)!);
        }

        if (jsAst.mappedTypes) {
            throw Error("Rust modules cannot have inline object literal type declarations");
        }

        return new TypeSignature(
            typeMap.get(jsAst.name!) ?? jsAst.name!,
            {
                typeArguments: jsAst.typeArguments ?
                    jsAst.typeArguments.map(tA => jsAstToRustAst(tA, null, rustModule, jsModule) as TypeSignature) :
                    undefined
            }
        );
    } else if (jsAst instanceof JSExportStatement) {
        const rustAst = jsAstToRustAst(jsAst.exported, null, rustModule, jsModule);
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
        // TODO nulls here bad
        return new Expression(
            jsAstToRustAst(jsAst.lhs, null, rustModule, jsModule) as ValueTypes,
            operation,
            jsAst.rhs ? jsAstToRustAst(jsAst.rhs, null, rustModule, jsModule) as ValueTypes : undefined
        );
    } else if (jsAst instanceof TemplateLiteral) {
        let formatString = "";
        const formatArgs: Array<ValueTypes> = [];
        for (const entry of jsAst.entries) {
            if (typeof entry === "string") {
                formatString += entry;
            } else {
                formatString += "{}";
                formatArgs.push(jsAstToRustAst(entry, null, rustModule, jsModule) as ValueTypes)
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
                (jsAstToRustAst(arg, null, rustModule, jsModule) as ValueTypes),
                Operation.Borrow
            )
        ));
    } else if (jsAst instanceof JSVariableDeclaration) {
        return new VariableDeclaration(
            jsAst.name,
            !jsAst.isConstant,
            jsAstToRustAst(jsAst.value, null, rustModule, jsModule) as ValueTypes
        );
    } else if (jsAst instanceof JSObjectLiteral) {
        // TODO spread values
        const struct = new StructConstructor(
            jsType?.name!,
            Array.from(jsAst.values)
                .map(([key, value]) => [
                    key as string, 
                    jsAstToRustAst(value, jsType!.properties!.get(key as string)!, rustModule, jsModule) as ValueTypes
                ])
        );
        return struct;
    } else {
        throw Error(`Cannot convert "${jsAst.constructor.name}" "${jsAst.render()}" to Rust`);
    }
}