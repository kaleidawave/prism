import { Statements } from "../../chef/rust/statements/block";
import { ArgumentList, FunctionDeclaration, ReturnStatement } from "../../chef/rust/statements/function";
import { VariableDeclaration } from "../../chef/rust/statements/variable";
import { Expression, Operation } from "../../chef/rust/values/expression";
import { Type, Value } from "../../chef/rust/values/value";
import { VariableReference } from "../../chef/rust/values/variable";
import { IServerRenderSettings, ServerRenderedChunks, serverRenderPrismNode } from "../../templating/builders/server-render";
import { ValueTypes as JSValueType, Value as JSValue, Type as JSType } from "../../chef/javascript/components/value/value";
import { VariableReference as JSVariableReference } from "../../chef/javascript/components/value/variable";
import { Component } from "../../component";
import { IFinalPrismSettings } from "../../settings";
import { Module } from "../../chef/rust/module";
import { join } from "path";
import { HTMLElement } from "../../chef/html/html";

const literalTypeMap = new Map([[JSType.number, Type.number], [JSType.string, Type.string]])

function jsAstToRustAst(jsAst: JSVariableReference | JSValueType) {
    if (jsAst instanceof JSVariableReference) {
        return new VariableReference(jsAst.name, jsAst.parent ? jsAstToRustAst(jsAst.parent) : undefined, false);
    } else if (jsAst instanceof JSValue) {
        return new Value(literalTypeMap.get(jsAst.type)!, jsAst.value ?? "");
    }
    throw Error()
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
                new VariableReference("push_str", accVariable),
                Operation.Call,
                new ArgumentList([new Expression(
                    new VariableReference("to_string", jsAstToRustAst(chunk.value),),
                    Operation.Call
                )])
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
export function moduleFromServerRenderedChunks(comp: Component, settings: IFinalPrismSettings): void {
    comp.serverModule = new Module(join(settings.absoluteServerOutputPath, comp.relativeFilename));

    // TODO get imports and convert type declarations to rust structs

    // TODO actual name
    // TODO parameters
    comp.serverRenderFunction = new FunctionDeclaration("render_some_component", [], "String", [], true);

    const componentHtmlTag = new HTMLElement(comp.tag, new Map(), comp.templateElement.children, comp.templateElement.parent);

    const ssrSettings: IServerRenderSettings = {
        dynamicAttribute: false, // TODO temp
        minify: settings.minify,
        addDisableToElementWithEvents: settings.disableEventElements
    }

    // TODO do this higher up
    const serverRenderChunks = serverRenderPrismNode(componentHtmlTag, comp.templateData.nodeData, ssrSettings, comp.globals);

    // TODO page, layout, metadata etc...

    comp.serverRenderFunction.statements = statementsFromServerRenderChunks(serverRenderChunks);
    comp.serverModule.statements.push(comp.serverRenderFunction);
}