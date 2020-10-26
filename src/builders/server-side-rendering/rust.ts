import { Statements } from "../../chef/rust/statements/block";
import { ArgumentList, FunctionDeclaration, ReturnStatement } from "../../chef/rust/statements/function";
import { VariableDeclaration } from "../../chef/rust/statements/variable";
import { Expression, Operation } from "../../chef/rust/values/expression";
import { Type, Value } from "../../chef/rust/values/value";
import { VariableReference } from "../../chef/rust/values/variable";
import { IServerRenderSettings, ServerRenderedChunks, serverRenderPrismNode } from "../../templating/builders/server-render";
import { Value as JSValue, Type as JSType } from "../../chef/javascript/components/value/value";
import { astTypes as JSAstTypes } from "../../chef/javascript/javascript";
import { VariableReference as JSVariableReference } from "../../chef/javascript/components/value/variable";
import { InterfaceDeclaration as JSInterfaceDeclaration } from "../../chef/javascript/components/types/interface";
import { TypeSignature as JSTypeSignature } from "../../chef/javascript/components/types/type-signature";
import { Component } from "../../component";
import { IFinalPrismSettings } from "../../settings";
import { Module } from "../../chef/rust/module";
import { join } from "path";
import { HTMLElement } from "../../chef/html/html";
import { StructStatement, TypeSignature } from "../../chef/rust/statements/struct";
import { ImportStatement as JSImportStatement, ExportStatement as JSExportStatement } from "../../chef/javascript/components/statements/import-export";
import { UseStatement } from "../../chef/rust/statements/use";

const literalTypeMap = new Map([[JSType.number, Type.number], [JSType.string, Type.string]]);
const typeMap: Map<string, string> = new Map([
    ["number", "f64"],
    ["string", "String"],
    ["Array", "Vec"],
]);

function jsAstToRustAst(jsAst: JSAstTypes) {
    if (jsAst instanceof JSVariableReference) {
        return new VariableReference(jsAst.name, jsAst.parent ? jsAstToRustAst(jsAst.parent) : undefined, false);
    } else if (jsAst instanceof JSValue) {
        return new Value(literalTypeMap.get(jsAst.type)!, jsAst.value ?? "");
    } else if (jsAst instanceof JSInterfaceDeclaration) {
        return new StructStatement(
            jsAstToRustAst(jsAst.name),
            new Map(Array.from(jsAst.members).map(([name, tS]) => [name, jsAstToRustAst(tS)])),
            true // TODO temp will say its true for now ...
        );
    } else if (jsAst instanceof JSTypeSignature) {
        // TODO mapped types
        return new TypeSignature(typeMap.get(jsAst.name!) ?? jsAst.name!, {
            typeArguments: jsAst.typeArguments ? jsAst.typeArguments.map(tA => jsAstToRustAst(tA)) : undefined
        });
    } else if (jsAst instanceof JSExportStatement) {
        const rustAst = jsAstToRustAst(jsAst.exported);
        if ("isPublic" in rustAst) rustAst.isPublic = true;
        return rustAst;
    } else if (jsAst instanceof JSImportStatement) {
        // TODO
        return new UseStatement(["TODO"]);
    } else {
        console.warn(`Cannot convert "${jsAst.constructor.name}" "${jsAst.render()}" to Rust`);
    }
}

const accVariable = new VariableReference("acc");

function statementsFromServerRenderChunks(serverChunks: ServerRenderedChunks): Array<Statements> {
    const statements: Array<Statements> = [
        new VariableDeclaration("acc", true,
            new Expression(
                new VariableReference("new", new VariableReference("String"), true),
                Operation.Call
            )
        ),
    ];
    for (const chunk of serverChunks) {
        if (typeof chunk === "string") {
            statements.push(new Expression(
                new VariableReference("push_str", accVariable),
                Operation.Call,
                new ArgumentList([new Value(Type.string, chunk)])
            ));
        } else if ("value" in chunk) {
            // TODO escape()
            statements.push(new Expression(
                new Expression(
                    new VariableReference("push_str", accVariable),
                    Operation.Call,
                    new ArgumentList([new Expression(
                        new VariableReference("to_string", jsAstToRustAst(chunk.value),),
                        Operation.Call
                    )])
                ),
                Operation.Borrow
            ));
        } else {
            // TODO if, loop & call
            throw Error();
        }
    }
    statements.push(new ReturnStatement(accVariable))
    return statements;
}

/**
 * Builds a rust module that has a public function for rendering a component to js
 * @param comp 
 * @param settings 
 */
export function makeRustComponentServerModule(comp: Component, settings: IFinalPrismSettings): void {
    comp.serverModule = new Module(join(settings.absoluteServerOutputPath, comp.relativeFilename));

    for (const statement of comp.clientModule.statements) {
        if ((statement instanceof JSExportStatement && statement.exported === comp.componentClass) || statement === comp.componentClass || statement === comp.customElementDefineStatement) {
            continue;
        } else {
            // TODO function with @rustConditionalImport decorator
            const rustStatement = jsAstToRustAst(statement);
            if (rustStatement) comp.serverModule.statements.push(rustStatement);
        }
    }

    const name = "render_" + comp.tag.replace(/-/g, "_").replace(/[A-Z]/g, (s, i) => i ? `_${s.toLowerCase()}` : s.toLowerCase()) + "_component";

    comp.serverRenderFunction = new FunctionDeclaration(name, comp.serverRenderParameters.map((vD) => [vD.name, jsAstToRustAst(vD.typeSignature!)]), new TypeSignature("String"), [], true);

    const componentHtmlTag = new HTMLElement(comp.tag, new Map(), comp.templateElement.children, comp.templateElement.parent);

    const ssrSettings: IServerRenderSettings = {
        dynamicAttribute: false, // TODO temp
        minify: settings.minify,
        addDisableToElementWithEvents: settings.disableEventElements
    }

    const serverRenderChunks = serverRenderPrismNode(componentHtmlTag, comp.templateData.nodeData, ssrSettings, comp.globals);

    // TODO page, layout, metadata etc...

    comp.serverRenderFunction.statements = statementsFromServerRenderChunks(serverRenderChunks);
    comp.serverModule.statements.push(comp.serverRenderFunction);
}