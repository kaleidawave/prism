import { StatementTypes } from "../../chef/rust/statements/block";
import { ArgumentList, FunctionDeclaration, ReturnStatement } from "../../chef/rust/statements/function";
import { VariableDeclaration } from "../../chef/rust/statements/variable";
import { Expression, Operation } from "../../chef/rust/values/expression";
import { Type, Value, ValueTypes } from "../../chef/rust/values/value";
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
import { ModStatement } from "../../chef/rust/statements/mod";
import { dirname, join, relative } from "path";
import { HTMLElement } from "../../chef/html/html";
import { StructStatement, TypeSignature } from "../../chef/rust/statements/struct";
import { ImportStatement as JSImportStatement, ExportStatement as JSExportStatement } from "../../chef/javascript/components/statements/import-export";
import { UseStatement } from "../../chef/rust/statements/use";
import { ElseStatement, IfStatement } from "../../chef/rust/statements/if";
import { ForStatement } from "../../chef/rust/statements/for";
import { basename } from "path";
import { IShellData } from "../template";

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
        if (jsAst.name === "Union") {
            return new TypeSignature(typeMap.get(jsAst.typeArguments![0].name!)!);
        }

        // TODO mapped types
        return new TypeSignature(typeMap.get(jsAst.name!) ?? jsAst.name!, {
            typeArguments: jsAst.typeArguments ? jsAst.typeArguments.map(tA => jsAstToRustAst(tA)) : undefined
        });
    } else if (jsAst instanceof JSExportStatement) {
        const rustAst = jsAstToRustAst(jsAst.exported);
        if ("isPublic" in rustAst) rustAst.isPublic = true;
        return rustAst;
    } else if (jsAst instanceof JSImportStatement) {
        const path: Array<string | string[]> = [basename(jsAst.from, ".js").replace(/\./g, "_")];
        if (jsAst.variable) {
            path.push(Array.from(jsAst.variable.entries!).map(([name]) => name as string));
        }
        return new UseStatement(path);
    } else {
        console.warn(`Cannot convert "${jsAst.constructor.name}" "${jsAst.render()}" to Rust`);
    }
}

const accVariable = new VariableReference("acc");

function statementsFromServerRenderChunks(serverChunks: ServerRenderedChunks, includeStringDef = false): Array<StatementTypes> {
    const statements: Array<StatementTypes> = includeStringDef ? [new VariableDeclaration("acc", true,
        new Expression(
            new VariableReference("new", new VariableReference("String"), true),
            Operation.Call
        )
    )] : [];
    for (const chunk of serverChunks) {
        if (typeof chunk === "string") {
            statements.push(new Expression(
                new VariableReference("push_str", accVariable),
                Operation.Call,
                new ArgumentList([new Value(Type.string, chunk)])
            ));
        } else if ("value" in chunk) {
            let statement = new Expression(
                new Expression(
                    new VariableReference("to_string", jsAstToRustAst(chunk.value),),
                    Operation.Call
                ),
                Operation.Borrow
            );
            if (chunk.escape) {
                statement = new Expression(
                    new VariableReference("escape"),
                    Operation.Call,
                    statement
                );
            }
            statements.push(new Expression(
                new VariableReference("push_str", accVariable),
                Operation.Call,
                statement
            ));
        } else if ("condition" in chunk) {
            statements.push(new IfStatement(
                jsAstToRustAst(chunk.condition),
                statementsFromServerRenderChunks(chunk.truthyRenderExpression),
                new ElseStatement(null, statementsFromServerRenderChunks(chunk.truthyRenderExpression))
            ));
        } else if ("subject" in chunk) {
            statements.push(new ForStatement(
                chunk.variable,
                jsAstToRustAst(chunk.subject),
                statementsFromServerRenderChunks(chunk.childRenderExpression)
            ));
        } else if ("func" in chunk) {
            // TODO temp fix
            if (chunk.args.has("attributes")) {
                // @ts-ignore chunk.args isn't used again so can overwrite value to be in ts base...
                // chunk.args.set("attributes", templateLiteralFromServerRenderChunks(chunk.args.get("attributes")!));
                chunk.args.set("attributes", new Value(Type.string, ""));
            }
            statements.push(new Expression(
                new VariableReference("push_str", accVariable),
                Operation.Call,
                new ArgumentList([new Expression(
                    new VariableReference(chunk.func.actualName!),
                    Operation.Call,
                    chunk.func.buildArgumentListFromArgumentsMap(chunk.args)
                )])
            ));
        }
    }
    if (includeStringDef) statements.push(new ReturnStatement(accVariable))
    return statements;
}

/**
 * Builds a rust module that has a public function for rendering a component to js
 * @param comp 
 * @param settings 
 */
export function makeRustComponentServerModule(comp: Component, settings: IFinalPrismSettings): void {
    comp.serverModule = new Module(
        join(settings.absoluteServerOutputPath, comp.relativeFilename.replace(/[.-]/g, "_") + ".rs")
    );

    for (const statement of comp.clientModule.statements) {
        if ((statement instanceof JSExportStatement && statement.exported === comp.componentClass) || statement === comp.componentClass || statement === comp.customElementDefineStatement) {
            continue;
        } else if (statement instanceof JSImportStatement) {
            if (statement.from.endsWith(".prism.js")) {
                const newImports: Array<string> = [];
                let importedComponent: Component | null = null;
                // If a imports a component class convert it to 
                for (const key of statement.variable!.entries!.values()) {
                    if (comp.importedComponents.has(key?.name!)) {
                        importedComponent = comp.importedComponents.get(key?.name!)!;
                        newImports.push(importedComponent.serverRenderFunction!.actualName!)
                    } else {
                        newImports.push(key?.name!);
                    }
                }
                const path = relative(
                    settings.absoluteServerOutputPath,
                    importedComponent!.serverModule!.filename!
                ).split("/");
                const useStatement = new UseStatement(["crate", ...path, newImports]);
                comp.serverModule!.statements.push(useStatement);
            }
            // Ignore other imports for now
        } else {
            // TODO function with @rustConditionalImport decorator
            const rustStatement = jsAstToRustAst(statement);
            if (rustStatement) comp.serverModule.statements.push(rustStatement);
        }
    }

    const name = "render_" + comp.tag.replace(/-/g, "_").replace(/[A-Z]/g, (s, i) => i ? `_${s.toLowerCase()}` : s.toLowerCase()) + "_component";

    comp.serverRenderFunction = new FunctionDeclaration(name, comp.serverRenderParameters.map((vD) => [vD.name, jsAstToRustAst(vD.typeSignature!)]), new TypeSignature("String"), [], true);

    // Append "data-ssr" to the server rendered component. Used at runtime.
    const componentAttributes: Map<string, string | null> = new Map([["data-ssr", null]]);
    const componentHtmlTag = new HTMLElement(comp.tag, componentAttributes, comp.templateElement.children, comp.templateElement.parent);

    const ssrSettings: IServerRenderSettings = {
        dynamicAttribute: false, // TODO temp
        minify: settings.minify,
        addDisableToElementWithEvents: settings.disableEventElements
    }

    const serverRenderChunks = serverRenderPrismNode(componentHtmlTag, comp.templateData.nodeData, ssrSettings, comp.globals);

    comp.serverRenderFunction.statements = statementsFromServerRenderChunks(serverRenderChunks, true);
    comp.serverModule.statements.push(comp.serverRenderFunction);

    const imports: Array<string> = [];

    if (comp.isPage) imports.push("renderHTML");
    if (comp.needsData) imports.push("escape");

    const pathToPrismModule = relative(
        settings.absoluteServerOutputPath,
        join(settings.absoluteServerOutputPath, "prism.rs")
    ).split("/");

    if (imports.length > 0) {
        comp.serverModule!.statements.push(new UseStatement(["crate", pathToPrismModule, imports]));
    }
}

const escapeMap = [["&", "&amp;"], ["<", "&lt;"], [">", "&gt;"], ["\"", "&quot;"], ["'", "&#039l"]];

export function buildPrismServerModule(template: IShellData, settings: IFinalPrismSettings, outputFiles: Array<string>): Module {
    const baseServerModule = new Module(join(settings.absoluteServerOutputPath, "prism.rs"));

    // Escape function
    let expression: ValueTypes = new VariableReference("unsafeString");
    for (const [character, replacer] of escapeMap) {
        expression = new Expression(
            new VariableReference("replace", expression),
            Operation.Call,
            new ArgumentList([new Value(Type.string, character), new Value(Type.string, replacer)])
        )
    }

    baseServerModule.statements.push(new FunctionDeclaration("escape", [["unsafeString", new TypeSignature("String")]], new TypeSignature("String"), [new ReturnStatement(expression)], true));

    // Create a template literal to build the index page. As the template has been parsed it will include slots for rendering slots
    const renderHTMLStatements = statementsFromServerRenderChunks(
        serverRenderPrismNode(template.document, template.nodeData, { minify: settings.minify, addDisableToElementWithEvents: false, dynamicAttribute: false })
        , true);

    // Create function with content and meta slot parameters
    const pageRenderFunction = new FunctionDeclaration(
        "renderHTML",
        [
            ["contentSlot", new TypeSignature("String")],
            ["metaSlot", new TypeSignature("String")]
        ],
        new TypeSignature("String"),
        renderHTMLStatements,
        true
    );
    baseServerModule.statements.push(pageRenderFunction);

    outputFiles.push(baseServerModule.filename);
    const directoryModules: Map<string, Module> = new Map();
    for (const file of outputFiles) {
        const dir = dirname(file);
        const base = basename(file, ".rs");
        const pubCrateStatement: ModStatement = new ModStatement(base, true);
        if (directoryModules.has(dir)) {
            directoryModules.get(dir)!.statements.push(pubCrateStatement)
        } else {
            const dirModule = new Module(join(dir, "mod.rs"), [pubCrateStatement])
            directoryModules.set(dir, dirModule);
        }
    }
    directoryModules.forEach(value => value.writeToFile({}))

    return baseServerModule;
}