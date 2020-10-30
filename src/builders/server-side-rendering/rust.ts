import { StatementTypes } from "../../chef/rust/statements/block";
import { ArgumentList, FunctionDeclaration, ReturnStatement } from "../../chef/rust/statements/function";
import { VariableDeclaration } from "../../chef/rust/statements/variable";
import { Expression, Operation } from "../../chef/rust/values/expression";
import { Type, Value, ValueTypes } from "../../chef/rust/values/value";
import { VariableReference } from "../../chef/rust/values/variable";
import { IServerRenderSettings, ServerRenderedChunks, serverRenderPrismNode } from "../../templating/builders/server-render";
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
import { jsAstToRustAst } from "../../chef/rust/utils/js2rust";
import { DeriveStatement } from "../../chef/rust/statements/derive";

/** The variable which points to the String that is appended to */
const accVariable = new VariableReference("acc");

/**
 * Builds a array of rust statements for rendering a component to string
 * @param serverChunks The chunks from `/templating/builders/server-render.ts`
 * @param includeStringDef Whether to add the `acc` variable declaration and ending 
 * return statement. Default `true` set false for doing working in `if` or `for` blocks
 */
function statementsFromServerRenderChunks(
    serverChunks: ServerRenderedChunks,
    module: Module,
    includeStringDef = false,
): Array<StatementTypes> {
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
            let value = jsAstToRustAst(chunk.value, module);
            if (chunk.escape) {
                value = new Expression(
                    new VariableReference("escape"),
                    Operation.Call,
                    new Expression(
                        new VariableReference("to_string", value),
                        Operation.Call
                    )
                );
            }
            statements.push(new Expression(
                new VariableReference("push_str", accVariable),
                Operation.Call,
                new Expression(
                    new Expression(
                        new VariableReference("to_string", value),
                        Operation.Call
                    ),
                    Operation.Borrow
                )
            ));
        } else if ("condition" in chunk) {
            statements.push(new IfStatement(
                jsAstToRustAst(chunk.condition, module),
                statementsFromServerRenderChunks(chunk.truthyRenderExpression, module),
                new ElseStatement(null, statementsFromServerRenderChunks(chunk.truthyRenderExpression, module))
            ));
        } else if ("subject" in chunk) {
            statements.push(new ForStatement(
                chunk.variable,
                jsAstToRustAst(chunk.subject, module),
                statementsFromServerRenderChunks(chunk.childRenderExpression, module)
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
                new ArgumentList([
                    new Expression(
                        new Expression(
                            new VariableReference(chunk.func.actualName!),
                            Operation.Call,
                            chunk.func.buildArgumentListFromArgumentsMap(chunk.args)
                        ),
                        Operation.Borrow
                    )
                ])
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
                    join(settings.cwd, "src"),
                    importedComponent!.serverModule!.filename!.slice()
                )
                const useStatement = new UseStatement([
                    "crate",
                    ...path.substr(0, path.lastIndexOf('.')).split(settings.pathSplitter),
                    newImports
                ]);
                comp.serverModule!.statements.push(useStatement);
            }
            // Ignore other imports for now
        } else {
            // TODO function with @rustConditionalImport decorator
            const rustStatement = jsAstToRustAst(statement, comp.serverModule);
            if (rustStatement instanceof StructStatement) {
                comp.serverModule.statements.push(new DeriveStatement(["Clone", "Debug"]));
            }
            if (rustStatement) comp.serverModule.statements.push(rustStatement);
        }
    }

    const rustRenderParameters: Array<[string, TypeSignature]> = comp.serverRenderParameters.map((vD) => [vD.name, jsAstToRustAst(vD.typeSignature!, comp.serverModule!)]);

    const name = "render_" + comp.tag.replace(/-/g, "_").replace(/[A-Z]/g, (s, i) => i ? `_${s.toLowerCase()}` : s.toLowerCase());
    const componentRenderFunctionName = name + "_component";

    comp.serverRenderFunction = new FunctionDeclaration(componentRenderFunctionName, rustRenderParameters, new TypeSignature("String"), [], true);

    // Append "data-ssr" to the server rendered component. Used at runtime.
    const componentAttributes: Map<string, string | null> = new Map([["data-ssr", null]]);
    const componentHtmlTag = new HTMLElement(comp.tag, componentAttributes, comp.templateElement.children, comp.templateElement.parent);
    const ssrSettings: IServerRenderSettings = {
        dynamicAttribute: !(comp.isPage || comp.isLayout),
        minify: settings.minify,
        addDisableToElementWithEvents: settings.disableEventElements
    }

    const serverRenderChunks = serverRenderPrismNode(componentHtmlTag, comp.templateData.nodeData, ssrSettings, comp.globals);

    comp.serverRenderFunction.statements = statementsFromServerRenderChunks(serverRenderChunks, comp.serverModule, true);

    if (comp.usesLayout) {
        const returnLayoutWrap = new ReturnStatement(new Expression(
            new VariableReference(comp.usesLayout.serverRenderFunction!.actualName!),
            Operation.Call,
            accVariable
        ));
        comp.serverRenderFunction.statements[comp.serverRenderFunction.statements.length - 1] = returnLayoutWrap;
    }

    comp.serverModule.statements.push(comp.serverRenderFunction);

    if (comp.isPage) {
        let metadataString: ValueTypes;
        if (comp.metadata) {
            throw Error("Not implemented - Rust page metadata")
        } else {
            metadataString = new Expression(
                new VariableReference("to_string", new Value(Type.string, "")),
                Operation.Call,
            );
        }

        const renderPageFunction = new FunctionDeclaration(
            name + "_page",
            rustRenderParameters,
            new TypeSignature("String"),
            [
                new ReturnStatement(
                    new Expression(
                        new VariableReference("renderHTML"),
                        Operation.Call,
                        new Expression(
                            new VariableReference(componentRenderFunctionName),
                            Operation.Call,
                            new ArgumentList([
                                new VariableReference("data"),
                                metadataString
                            ])
                        )
                    )
                )
            ],
            true
        );
        comp.serverModule.statements.push(renderPageFunction);
    }

    const imports: Array<string> = [];

    if (comp.isPage) imports.push("renderHTML");
    if (comp.needsData) imports.push("escape");

    const pathToPrismModule = relative(join(settings.cwd, "src"), dirname(comp.serverModule.filename)).split(settings.pathSplitter);

    if (imports.length > 0) {
        comp.serverModule!.statements.unshift(new UseStatement(["crate", ...pathToPrismModule, "prism", imports]));
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
    const serverChunks = serverRenderPrismNode(template.document, template.nodeData, {
        minify: settings.minify, addDisableToElementWithEvents: false, dynamicAttribute: false
    });
    const renderHTMLStatements = statementsFromServerRenderChunks(serverChunks, baseServerModule, true);

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