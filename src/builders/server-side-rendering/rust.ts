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
import { Module as JSModule } from "../../chef/javascript/components/module";
import { ModStatement } from "../../chef/rust/statements/mod";
import { dirname, join, relative } from "path";
import { StructStatement, TypeSignature } from "../../chef/rust/statements/struct";
import { ImportStatement as JSImportStatement, ExportStatement as JSExportStatement, ExportStatement } from "../../chef/javascript/components/statements/import-export";
import { UseStatement } from "../../chef/rust/statements/use";
import { ElseStatement, IfStatement } from "../../chef/rust/statements/if";
import { ForStatement } from "../../chef/rust/statements/for";
import { basename } from "path";
import { IShellData } from "../template";
import { jsAstToRustAst } from "../../chef/rust/utils/js2rust";
import { InterfaceDeclaration as TSInterfaceDeclaration } from "../../chef/javascript/components/types/interface";
import { DynamicStatement } from "../../chef/rust/dynamic-statement";
import { Comment as JSComment } from "../../chef/javascript/components/statements/comments";
import { TemplateLiteral as JSTemplateLiteral } from "../../chef/javascript/components/value/template-literal";
import { Type as JSType, Value as JSValue } from "../../chef/javascript/components/value/value";
import { findSourceMap } from "module";

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
    jsModule: JSModule,
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
            let value = jsAstToRustAst(chunk.value, module, jsModule) as ValueTypes;
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
                jsAstToRustAst(chunk.condition, module, jsModule) as ValueTypes,
                statementsFromServerRenderChunks(chunk.truthyRenderExpression, module, jsModule),
                new ElseStatement(null, statementsFromServerRenderChunks(chunk.falsyRenderExpression, module, jsModule))
            ));
        } else if ("subject" in chunk) {
            statements.push(new ForStatement(
                chunk.variable,
                jsAstToRustAst(chunk.subject, module, jsModule) as ValueTypes,
                statementsFromServerRenderChunks(chunk.childRenderExpression, module, jsModule)
            ));
        } else if ("func" in chunk) {
            // TODO temp fix
            if (chunk.args.has("attributes")) {
                // @ts-ignore chunk.args isn't used again so can overwrite value to be in ts base...
                // chunk.args.set("attributes", templateLiteralFromServerRenderChunks(chunk.args.get("attributes")!));
                chunk.args.set("attributes", new Expression(
                    new VariableReference("to_string", new Value(Type.string, "")),
                    Operation.Call
                ));
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

/** Builds a `format!(...)` expression. Cannot be used for condition and iterator data */
function formatExpressionFromServerChunks(
    serverChunks: ServerRenderedChunks,
    module: Module,
    jsModule: JSModule,
): Expression {
    let formatString = "";
    const args: Array<ValueTypes> = [];
    for (const chunk of serverChunks) {
        if (typeof chunk === "string") {
            formatString += chunk;
        } else if ("value" in chunk) {
            formatString += "{}";
            const value = jsAstToRustAst(chunk.value, module, jsModule) as ValueTypes;
            // Creates `&escape(*value*.to_string()).to_string()`:
            args.push(new Expression(
                new Expression(
                    new VariableReference("to_string", new Expression(
                        new VariableReference("escape"),
                        Operation.Call,
                        new Expression(
                            new VariableReference("to_string", value),
                            Operation.Call
                        )
                    )),
                    Operation.Call
                ),
                Operation.Borrow
            ));
        } else {
            throw Error(`Cannot use ${chunk} in Rust format! expression`);
        }
    }

    return new Expression(
        new VariableReference("format!"),
        Operation.Call,
        new ArgumentList(
            [new Value(Type.string, formatString), ...args]
        )
    );
}

const jsToRustDecoratorName = "useRustStatement";

/**
 * Builds a rust module that has a public function for rendering a component to js
 * @param comp 
 * @param settings 
 */
export function makeRustComponentServerModule(comp: Component, settings: IFinalPrismSettings, ssrSettings: IServerRenderSettings): void {
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
                if (importedComponent) {
                    const path = relative(
                        join(settings.cwd, "src"),
                        importedComponent.serverModule!.filename!
                    )
                    const useStatement = new UseStatement([
                        "crate",
                        ...path.substr(0, path.lastIndexOf('.')).split(settings.pathSplitter),
                        newImports
                    ]);
                    comp.serverModule!.statements.push(useStatement);
                }
            }
            // Ignores other imports for now
        } else if (
            statement instanceof JSComment
        ) {
            /** 
             * Conditional inject statement if compiling under rust e.g
             * /* @useRustStatement use crate_x::{func1};") * /
             * 
             * As this function will not be included into the rust
             * function func1() {
             *    ..js engine dependant logic...
             * }
             * 
             * Currently very flexible with `DynamicStatement`
             * Expects that the rust code in the argument string introduces a function of the same name 
             * and parameters into the module / scope
             */
            const useRustStatementMatch = statement.comment.match(/@useRustStatement/);
            if (useRustStatementMatch) {
                const rustCode = statement.comment.slice(useRustStatementMatch.index! + "@useRustStatement".length)
                comp.serverModule.statements.push(new DynamicStatement(rustCode.trim()));
            }
        } else if (
            statement instanceof TSInterfaceDeclaration ||
            statement instanceof JSImportStatement ||
            statement instanceof JSExportStatement
        ) {
            const rustStatement = jsAstToRustAst(statement, comp.serverModule, comp.clientModule);
            if (rustStatement instanceof StructStatement) {
                const memberDecorators = statement instanceof ExportStatement ? 
                    (statement.exported as TSInterfaceDeclaration).memberDecorators : 
                    (statement as TSInterfaceDeclaration).memberDecorators;
                for (const [name, decorator] of memberDecorators) {
                    if (decorator.name === "useRustStatement") {
                        const firstArg = decorator.args[0];
                        if (!firstArg || decorator.args.length > 1) { 
                            throw Error("@useRustStatement must have a single string or template literal arg");
                        }
                        let value: string;
                        if (firstArg instanceof JSValue && firstArg.type === JSType.string) {
                            value = firstArg.value!;
                        } else if (firstArg instanceof JSTemplateLiteral && typeof firstArg.entries[0] === "string") {
                            value = firstArg.entries[0];
                        } else {
                            throw Error("@useRustStatement must have a single string or template literal arg")
                        }
                        rustStatement.memberAttributes.set(name, new DynamicStatement(value));
                    }
                }
            }
            if (rustStatement) comp.serverModule.statements.push(rustStatement);
        }
    }

    const rustRenderParameters: Array<[string, TypeSignature]> = comp.serverRenderParameters.map((vD) => [vD.name, jsAstToRustAst(vD.typeSignature!, comp.serverModule!, comp.clientModule) as TypeSignature]);

    const name = "render_" + comp.tagName.replace(/-/g, "_").replace(/[A-Z]/g, (s, i) => i ? `_${s.toLowerCase()}` : s.toLowerCase());
    const componentRenderFunctionName = name + "_component";

    comp.serverRenderFunction = new FunctionDeclaration(componentRenderFunctionName, rustRenderParameters, new TypeSignature("String"), [], true);

    const serverRenderChunks = serverRenderPrismNode(comp.componentHtmlTag, comp.templateData.nodeData, ssrSettings, comp.globals);
    comp.serverRenderFunction.statements
        = statementsFromServerRenderChunks(serverRenderChunks, comp.serverModule, comp.clientModule, true);

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
        if (comp.metaDataChunks.length > 0) {
            metadataString = formatExpressionFromServerChunks(comp.metaDataChunks, comp.serverModule, comp.clientModule);
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
                        new VariableReference("render_html"),
                        Operation.Call,
                        new ArgumentList([
                            new Expression(
                                new VariableReference(componentRenderFunctionName),
                                Operation.Call,
                                new VariableReference("data"),
                            ),
                            metadataString
                        ])
                    )
                )
            ],
            true
        );
        comp.serverModule.statements.push(renderPageFunction);
    }

    const imports: Array<string> = [];

    if (comp.isPage) imports.push("render_html");
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
        minify: settings.minify, addDisableToElementWithEvents: false
    });
    const renderHTMLStatements
        = statementsFromServerRenderChunks(serverChunks, baseServerModule, new JSModule(""), true);

    // Create function with content and meta slot parameters
    const pageRenderFunction = new FunctionDeclaration(
        "render_html",
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