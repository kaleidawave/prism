import { StatementTypes } from "../../chef/rust/statements/block";
import { ArgumentList, ClosureExpression, FunctionDeclaration, ReturnStatement } from "../../chef/rust/statements/function";
import { VariableDeclaration } from "../../chef/rust/statements/variable";
import { Expression, Operation } from "../../chef/rust/values/expression";
import { Type, Value, ValueTypes as RustValueTypes, ValueTypes } from "../../chef/rust/values/value";
import { VariableReference } from "../../chef/rust/values/variable";
import { Component } from "../../component";
import { IFinalPrismSettings } from "../../settings";
import { Module } from "../../chef/rust/module";
import { Module as JSModule } from "../../chef/javascript/components/module";
import { ModStatement } from "../../chef/rust/statements/mod";
import { TypeSignature } from "../../chef/rust/statements/struct";
import { UseStatement } from "../../chef/rust/statements/use";
import { ElseStatement, IfStatement } from "../../chef/rust/statements/if";
import { ForStatement } from "../../chef/rust/statements/for";
import { IShellData } from "../template";
import { jsAstToRustAst, typeMap } from "../../chef/rust/utils/js2rust";
import { InterfaceDeclaration as TSInterfaceDeclaration } from "../../chef/javascript/components/types/interface";
import { DynamicStatement } from "../../chef/rust/dynamic-statement";
import { Comment as JSComment } from "../../chef/javascript/components/statements/comments";
import { Value as JSValue } from "../../chef/javascript/components/value/value";
import { VariableReference as JSVariableReference } from "../../chef/javascript/components/value/expression";
import { IType } from "../../chef/javascript/utils/types";
import {
    IServerRenderSettings, ServerRenderChunk, ServerRenderedChunks, serverRenderPrismNode
} from "../../templating/builders/server-render";
import {
    ImportStatement as JSImportStatement,
    ExportStatement as JSExportStatement
} from "../../chef/javascript/components/statements/import-export";
import { dirname, join, relative, basename } from "path";
import { ObjectLiteral } from "../../chef/javascript/components/value/object";

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
    dataType: IType | null,
): Array<StatementTypes> {
    const statements: Array<StatementTypes> = [];
    for (const chunk of serverChunks) {
        if (typeof chunk === "string") {
            statements.push(new Expression(
                new VariableReference("push_str", accVariable),
                Operation.Call,
                new Value(Type.string, chunk)
            ));
        } else if ("value" in chunk) {
            const value = serverChunkToValue(chunk, module, jsModule, dataType);
            statements.push(new Expression(
                new VariableReference("push_str", accVariable),
                Operation.Call,
                new Expression(value, Operation.Borrow)
            ));
        } else if ("condition" in chunk) {
            // TODO null
            let value = jsAstToRustAst(chunk.condition, null, module, jsModule) as RustValueTypes;
            /* TODO TEMP:
             * Convert conditional properties (in rust these are Option<T>) to a boolean
             * and check strings are not empty
             * TODO does not work for for loop and nested variables...
            */
            if (value instanceof VariableReference) {
                const name = value.name;
                const isOptional = dataType?.properties?.get(name)?.isOptional;
                if (isOptional) {
                    value = new Expression(
                        new VariableReference("is_some", value),
                        Operation.Call,
                    )
                }
                if (dataType?.properties?.get(name)?.name === "string") {
                    // TODO should probably do destructured pattern matching with guard
                    // Prevents .is_some().is_empty() with 'x.is_some() && !x.as_ref().unwrap().is_empty()'
                    if (isOptional) {
                        value = new Expression(
                            value,
                            Operation.And,
                            new Expression(
                                new Expression(
                                    new VariableReference(
                                        "is_empty",
                                        new Expression(
                                            new VariableReference(
                                                "unwrap",
                                                new Expression(
                                                    new VariableReference(
                                                        "as_ref",
                                                        // without the is_some()
                                                        ((value as Expression).lhs as VariableReference).parent!,
                                                    ),
                                                    Operation.Call
                                                )
                                            ),
                                            Operation.Call,
                                        ),
                                    ),
                                    Operation.Call,
                                ),
                                Operation.Not
                            ),
                        );
                    } else {
                        value = new Expression(
                            new Expression(
                                new VariableReference("is_empty", value),
                                Operation.Call,
                            ),
                            Operation.Not
                        );
                    }
                }
                // TODO numbers != 0
            }
            statements.push(new IfStatement(
                value,
                statementsFromServerRenderChunks(chunk.truthyRenderExpression, module, jsModule, dataType),
                new ElseStatement(null, statementsFromServerRenderChunks(chunk.falsyRenderExpression, module, jsModule, dataType))
            ));
        } else if ("subject" in chunk) {
            // TODO null
            const expr = jsAstToRustAst(chunk.subject, null, module, jsModule) as RustValueTypes;
            statements.push(new ForStatement(
                chunk.variable,
                new Expression(expr, Operation.Borrow),
                statementsFromServerRenderChunks(chunk.childRenderExpression, module, jsModule, dataType)
            ));
        } else if ("component" in chunk) {
            statements.push(serverChunkToValue(chunk, module, jsModule, dataType));
        }
    }
    return statements;
}

function serverChunkToValue(
    chunk: ServerRenderChunk,
    module: Module,
    jsModule: JSModule,
    dataType: IType | null = null
): RustValueTypes {
    if (typeof chunk === "string") {
        return new Expression(
            new VariableReference("to_string", new Value(Type.string, chunk)),
            Operation.Call
        );
    } else if ("value" in chunk) {
        // TODO null
        let value = jsAstToRustAst(chunk.value, null, module, jsModule) as RustValueTypes;
        /* TODO TEMP:
         * Unwrap conditional properties (Option<T> in rust)
        */
        if (value instanceof VariableReference && dataType?.properties?.get(value.name)?.isOptional) {
            value = new Expression(
                new VariableReference(
                    "unwrap",
                    new Expression(
                        new VariableReference("as_ref", value),
                        Operation.Call
                    )
                ),
                Operation.Call,
            )
        }
        // TODO for deep properties
        const typeIsString = 
            chunk.value instanceof JSVariableReference && 
            dataType?.properties?.get(chunk.value.name)?.name === "string"
        if (!typeIsString) {
            value = new Expression(
                new VariableReference("to_string", value),
                Operation.Call
            );
        }
        if (chunk.escape) {
            // TODO if text (not a attribute could use "encode_text")
            value = new Expression(
                new VariableReference("encode_safe"),
                Operation.Call,
                new Expression(value, Operation.Borrow)
            );
        }
        return value;
    } else if ("component" in chunk) {
        const useDestructured = chunk.args.has("data") &&
            typeof chunk.args.get("data")![0] === "object" &&
            "argument" in (chunk.args.get("data")![0] as object) &&
            (chunk.args.get("data")![0] as any).argument instanceof ObjectLiteral;

        const args: Map<string, RustValueTypes> = new Map([["acc", new VariableReference("acc")]]);
        for (const [name, [value, valueType]] of chunk.args) {
            if (typeof value === "object" && "argument" in value) {
                if (value.argument instanceof ObjectLiteral) {
                    for (const [olKey, olValue] of value.argument.values) {
                        args.set(
                            olKey as string, // TODO catch [Symbol.x] etc
                            new Expression(
                                jsAstToRustAst(olValue, valueType, module, jsModule) as RustValueTypes,
                                Operation.Borrow
                            )
                        )
                    }
                } else {
                    args.set(
                        name,
                        new Expression(
                            jsAstToRustAst(value.argument, valueType, module, jsModule) as RustValueTypes,
                            Operation.Borrow
                        )
                    );
                }
            } else {
                if (Array.isArray(value)) {
                    if (value.length === 0) {
                        args.set(
                            name,
                            new Expression(
                                new Expression(
                                    new VariableReference("to_string", new Value(Type.string, "")),
                                    Operation.Call
                                ),
                                Operation.Borrow
                            )
                        );
                    } else if (value.length === 1) {
                        const rustValue = serverChunkToValue(value[0], module, jsModule, dataType);
                        if (typeof value[0] === "string") {
                            args.set(name, new Expression(rustValue, Operation.Borrow));
                        } else {
                            args.set(name, rustValue);
                        }
                    } else {
                        args.set(name, formatExpressionFromServerChunks(value, module, jsModule));
                    }
                } else {
                    const rustValue = serverChunkToValue(value, module, jsModule, dataType)
                    if (value instanceof JSValue) {
                        args.set(name, new Expression(rustValue, Operation.Borrow));
                    } else {
                        args.set(name, rustValue);
                    }
                }
            }
        }
        const func = useDestructured ?
            chunk.component.destructuredServerRenderFunction! :
            chunk.component.serverRenderFunction!;
        return new Expression(
            new VariableReference(func.actualName!),
            Operation.Call,
            func.buildArgumentListFromArgumentsMap(args)
        );
    } else if ("subject" in chunk) {
        const mapFunctionOnSubject = new VariableReference("map", new Expression(
            new VariableReference("iter", jsAstToRustAst(chunk.subject, null, module, jsModule) as RustValueTypes),
            Operation.Call,
        ));
        const serverRenderedIteratorChunk = formatExpressionFromServerChunks(
            chunk.childRenderExpression, module, jsModule
        );
        const mapCall = new Expression(
            mapFunctionOnSubject,
            Operation.Call,
            new ClosureExpression(
                [[chunk.variable, null]],
                [new ReturnStatement(serverRenderedIteratorChunk)],
                true // <- Important environment is captured to allow variables other than the one from the iterator to be accessible
            )
        )
        // Collect the output to a String:
        return new Expression(
            // Yes <String> is a generic argument which is not the same as a member at the ast level but due to syntactical equivalence when rendering can get away with it here
            new VariableReference("<String>",
                new VariableReference("collect", mapCall),
                true
            ),
            Operation.Call
        )
    } else {
        // TODO conditional expressions with match, will run into the js truthy to rust boolean issue here...?
        throw Error(`Not implemented - producing rust expression from chunk "${chunk}" `);
    }
}

/** Builds a `format!(...)` expression. Cannot be used for condition and iterator data */
function formatExpressionFromServerChunks(
    serverChunks: ServerRenderedChunks,
    module: Module,
    jsModule: JSModule,
): Expression {
    let formatString = "";
    const args: Array<RustValueTypes> = [];
    for (const chunk of serverChunks) {
        if (typeof chunk === "string") {
            formatString += chunk;
        } else {
            formatString += "{}";
            args.push(new Expression(
                serverChunkToValue(chunk, module, jsModule),
                Operation.Borrow
            ));
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

const jsToRustDecoratorName = "@useRustStatement";

/**
 * Builds a rust module that has a public function for rendering a component to js
 * @param comp 
 * @param settings 
 */
export function makeRustComponentServerModule(
    comp: Component,
    settings: IFinalPrismSettings,
    ssrSettings: IServerRenderSettings
): void {
    comp.serverModule = new Module(
        join(settings.absoluteServerOutputPath, comp.relativeFilename.replace(/[.-]/g, "_")) + ".rs"
    );

    // Use encode_safe from html_escape crate
    const useHTMLEscapeStatement = new UseStatement(["html_escape", "encode_safe"]);
    comp.serverModule!.statements.push(useHTMLEscapeStatement);

    // Transition over statements
    for (const statement of comp.clientModule.statements) {
        if (
            statement instanceof JSExportStatement && (
                statement.exported === comp.componentClass) ||
            statement === comp.componentClass ||
            statement === comp.customElementDefineStatement) {
            continue;
        } else if (statement instanceof JSImportStatement) {
            if (statement.from.endsWith(".prism.js") || statement.from.endsWith(".prism.ts")) {
                const newImports: Array<string> = [];
                let importedComponent: Component | null = null;
                // If a imports a component class convert it to 
                for (const key of statement.variable!.entries!.values()) {
                    if (comp.importedComponents.has(key?.name!)) {
                        importedComponent = comp.importedComponents.get(key?.name!)!;
                        if (importedComponent.isLayout) {
                            newImports.push(
                                importedComponent.layoutServerRenderFunctions![0].actualName!,
                                importedComponent.layoutServerRenderFunctions![1].actualName!,
                            )
                        } else {
                            if (importedComponent.destructuredServerRenderFunction) {
                                newImports.push(importedComponent.destructuredServerRenderFunction!.actualName!)
                            }
                            newImports.push(importedComponent.serverRenderFunction!.actualName!)
                        }
                    } else {
                        newImports.push(key?.name!);
                    }
                }
                if (importedComponent) {
                    // TODO does not work where path ~ ../x/comp.prism.js but then I don't think that is possible without knowing crate origin
                    const path = relative(
                        comp.serverModule!.filename,
                        importedComponent.serverModule!.filename
                    );
                    const useStatement = new UseStatement([
                        "super",
                        ...path
                            .substr(0, path.lastIndexOf('.'))
                            .split(settings.pathSplitter)
                            .slice(1),
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
            const useRustStatementMatch = statement.comment.match(jsToRustDecoratorName);
            if (useRustStatementMatch) {
                const rustCode = statement.comment.slice(useRustStatementMatch.index! + jsToRustDecoratorName.length)
                comp.serverModule.statements.push(new DynamicStatement(rustCode.trim()));
            }
        } else if (
            statement instanceof TSInterfaceDeclaration ||
            statement instanceof JSImportStatement ||
            statement instanceof JSExportStatement
        ) {
            const rustStatement = jsAstToRustAst(statement, null, comp.serverModule, comp.clientModule);
            if (rustStatement) comp.serverModule.statements.push(rustStatement);
        }
    }

    /**
     * May produce 4 statements
     * - render_x
     * - render_x_from_buffer
     * - render_x_page
     * - render_x_destructured
     */
    const rustRenderParameters: Array<[string, TypeSignature]> = [["acc", new TypeSignature("&mut String")]];
    for (const parameter of comp.serverRenderParameters) {
        const newTS = jsAstToRustAst(parameter.typeSignature!, null, comp.serverModule!, comp.clientModule) as TypeSignature;
        newTS.name = "&" + newTS.name;
        rustRenderParameters.push([
            parameter.name,
            newTS
        ])
    }
    const camelCaseComponentName = comp.tagName
        .replace(/-/g, "_")
        .replace(/[A-Z]/g, (s, i) => i ? `_${s.toLowerCase()}` : s.toLowerCase());

    const componentRenderFunctionName = "render_" + camelCaseComponentName + "_component";
    const componentRenderFunctionFromBufferName = "render_" + camelCaseComponentName + "_component_from_buffer";
    const componentRenderFunctionDestructuredName = componentRenderFunctionFromBufferName + "_destructured";
    const pageRenderFunctionName = "render_" + camelCaseComponentName + "_page";

    // TODO add clientGlobals
    // Used for "passthrough" functions e.g. render page and render (on new buffer)
    const renderFunctionArguments = [
        new VariableReference("data"),
    ];

    if (!comp.isPage) {
        renderFunctionArguments.push(new VariableReference("attributes"))
    }

    // Component function which initializes string for you. TODO @WithCapacity
    const componentRenderFunction = new FunctionDeclaration(
        componentRenderFunctionName,
        rustRenderParameters.slice(1), // Ignore the acc parameter 
        new TypeSignature("String"),
        [
            // Create new string
            new VariableDeclaration("acc", true, getNewString(comp.withCapacity)),
            // Call the buffer function
            new Expression(
                new VariableReference(componentRenderFunctionFromBufferName),
                Operation.Call,
                new ArgumentList([new VariableReference("&mut acc")].concat(renderFunctionArguments))
            ),
            // Return acc
            new ReturnStatement(accVariable)
        ],
        true
    );

    const serverRenderChunks = serverRenderPrismNode(
        comp.componentHTMLTag,
        comp.templateData.nodeData,
        ssrSettings,
        comp.globals,
        false,
        // If destructured method then data is sent down property wise rather than on a struct instance named "data"
        !comp.createdUsingDestructured
    );

    if (comp.isLayout) {
        const pageInterpolationIndex = serverRenderChunks
            .findIndex((value) => typeof value === "object" &&
                "value" in value &&
                value.value instanceof JSVariableReference &&
                value.value.name === "contentSlot"
            );

        const prefixChunk = serverRenderChunks.slice(0, pageInterpolationIndex);
        const suffixChunk = serverRenderChunks.slice(pageInterpolationIndex + 1);

        const renderParameters = rustRenderParameters.filter(([name]) => name !== "contentSlot");

        const prefixChunkRenderFunction = new FunctionDeclaration(
            "render_" + camelCaseComponentName + "_layout_prefix",
            renderParameters,
            null,
            statementsFromServerRenderChunks(
                prefixChunk,
                comp.serverModule,
                comp.clientModule,
                comp.componentDataType,
            ),
            true
        );

        const suffixChunkRenderFunction = new FunctionDeclaration(
            "render_" + camelCaseComponentName + "_layout_suffix",
            renderParameters,
            null,
            statementsFromServerRenderChunks(
                suffixChunk,
                comp.serverModule,
                comp.clientModule,
                comp.componentDataType,
            ),
            true
        );

        comp.layoutServerRenderFunctions = [prefixChunkRenderFunction, suffixChunkRenderFunction];
        comp.serverModule.statements.push(prefixChunkRenderFunction, suffixChunkRenderFunction);
        return;
    }

    if (comp.renderFromEndpoint) {
        // TODO recomputing chunks slow :( 
        // Same chunks without component tag
        const chunks = comp.componentHTMLTag.children
            .flatMap((child) => serverRenderPrismNode(
                child,
                comp.templateData.nodeData,
                ssrSettings,
                comp.globals,
                false,
                true
            )
        );

        comp.serverModule.statements.push(new FunctionDeclaration(
            componentRenderFunctionName + "_content",
            rustRenderParameters.filter(([paramName]) => !["acc", "attributes"].includes(paramName)),
            new TypeSignature("String"),
            [
                // Create new string
                new VariableDeclaration("buf", true, getNewString(comp.withCapacity)),
                // buf is owned (mutable) String but many statements require a mutable reference so acc is &mut buf
                new VariableDeclaration("acc", false, new VariableReference("&mut buf")),
                ...statementsFromServerRenderChunks(chunks, 
                    comp.serverModule,
                    comp.clientModule,
                    comp.componentDataType
                ),
                // Return acc
                new ReturnStatement(new VariableReference("buf"))
            ],
            true
        ));
    }

    comp.serverModule.statements.push(componentRenderFunction);

    /* For <OtherComponent $data="{x, y, z}"> it cannot generate &OtherComponentData { x, y, z } as OtherComponentData 
       needs values and x, y, z values are only references. So instead creates a function with a references to 
       individual properties instead a of instance. Exactly the same statements though
    */
    if (!comp.createdUsingDestructured) {
        comp.serverRenderFunction = new FunctionDeclaration(
            componentRenderFunctionFromBufferName,
            rustRenderParameters,
            null,
            [],
            true
        );
        comp.serverModule.statements.push(comp.serverRenderFunction);
    } else {
        const destructuredParameters = rustRenderParameters.filter(([propName]) => propName !== "data");

        const destructuredArguments: Array<ValueTypes> = [
            new VariableReference("acc"),
            new VariableReference("attributes")
        ];

        for (const [name, type] of comp.componentDataType?.properties ?? []) {
            // TODO deep destructuring
            let rustTypeName = typeMap.get(type.name!) ?? type.name!;
            if (type.name === "Array") {
                rustTypeName += `<${typeMap.get(type.indexed!.name!) ?? type.indexed!.name!}>`;
            }
            if (type.isOptional) {
                rustTypeName = `Option<${rustTypeName}>`;
            }
            destructuredParameters.push([name, new TypeSignature("&" + rustTypeName)]);
            destructuredArguments.push(new Expression(
                new VariableReference(name, new VariableReference("data")),
                Operation.Borrow
            ));
        }
        // TODO add client globals to destructuredParameters
        const componentRenderFunctionDestructured = new FunctionDeclaration(
            componentRenderFunctionDestructuredName,
            destructuredParameters,
            null,
            [],
            true
        );
        const componentRenderFunction = new FunctionDeclaration(
            componentRenderFunctionFromBufferName,
            rustRenderParameters,
            null,
            [
                new Expression(
                    new VariableReference(componentRenderFunctionDestructuredName),
                    Operation.Call,
                    new ArgumentList(destructuredArguments)
                )
            ],
            true
        );
        comp.serverRenderFunction = componentRenderFunction;
        comp.destructuredServerRenderFunction = componentRenderFunctionDestructured;
        comp.serverModule.statements.push(componentRenderFunctionDestructured, componentRenderFunction);
    }

    // Statements must be set after "comp.serverRenderFunction" is set to allow for recursive components
    const statements = statementsFromServerRenderChunks(
        serverRenderChunks,
        comp.serverModule,
        comp.clientModule,
        comp.componentDataType,
    );
    if (comp.createdUsingDestructured) {
        comp.destructuredServerRenderFunction!.statements = statements;
    } else {
        comp.serverRenderFunction.statements = statements;
    }

    if (comp.usesLayout) {
        // TODO imports
        const [prefixFunction, suffixFunction] = comp.usesLayout.layoutServerRenderFunctions!;
        // Call prefix function
        statements.unshift(new Expression(
            new VariableReference(prefixFunction.actualName!),
            Operation.Call,
            new ArgumentList([new VariableReference("acc")]) // TODO client globals
        ));
        // Call suffix function
        statements.push(new Expression(
            new VariableReference(suffixFunction.actualName!),
            Operation.Call,
            new ArgumentList([new VariableReference("acc")]) // TODO client globals
        ));
    }

    if (comp.isPage) {
        let metadataString: RustValueTypes;
        if (comp.metaDataChunks.length > 0) {
            metadataString = formatExpressionFromServerChunks(comp.metaDataChunks, comp.serverModule, comp.clientModule);
        } else {
            metadataString = new Expression(
                new VariableReference("to_string", new Value(Type.string, "")),
                Operation.Call,
            );
        }

        /*
            new String
            call1
            append metadata
            call2
            append content
            call3
            return string
         */
        const renderPageFunction = new FunctionDeclaration(
            pageRenderFunctionName,
            rustRenderParameters.slice(1), // Skip &mut acc
            new TypeSignature("String"),
            [
                // Create new string
                new VariableDeclaration("acc", true, getNewString(comp.withCapacity)),
                new Expression(
                    new VariableReference(htmlRenderFunctionOne),
                    Operation.Call,
                    new ArgumentList([new VariableReference("&mut acc")])
                ),
                new Expression(
                    new VariableReference("push_str", accVariable),
                    Operation.Call,
                    new Expression(metadataString, Operation.Borrow)
                ),
                new Expression(
                    new VariableReference(htmlRenderFunctionTwo),
                    Operation.Call,
                    new ArgumentList([new VariableReference("&mut acc")])
                ),
                // Call the buffer function
                new Expression(
                    new VariableReference(componentRenderFunctionFromBufferName),
                    Operation.Call,
                    new ArgumentList([new VariableReference("&mut acc")].concat(renderFunctionArguments))
                ),
                new Expression(
                    new VariableReference(htmlRenderFunctionThree),
                    Operation.Call,
                    new ArgumentList([new VariableReference("&mut acc")])
                ),
                // Return acc
                new ReturnStatement(accVariable)
            ],
            true
        );

        comp.serverModule.statements.push(renderPageFunction);

        const pathToPrismModule = relative(
            settings.absoluteServerOutputPath,
            dirname(comp.serverModule.filename)
        ).split(settings.pathSplitter).filter(Boolean);
        const useStatement = new UseStatement([
            "super",
            ...pathToPrismModule,
            "prism", [
                "render_html_one",
                "render_html_two",
                "render_html_three"
            ]
        ]);
        comp.serverModule!.statements.unshift(useStatement);
    }
}

const htmlRenderFunctionOne = "render_html_one";
const htmlRenderFunctionTwo = "render_html_two";
const htmlRenderFunctionThree = "render_html_three";

export function buildPrismServerModule(
    template: IShellData,
    settings: IFinalPrismSettings,
    outputFiles: Array<string>
): Module {
    const baseServerModule = new Module(join(settings.absoluteServerOutputPath, "prism.rs"));

    // Create a template literal to build the index page. As the template has been parsed it will include slots for rendering slots
    const chunks = serverRenderPrismNode(template.document, template.nodeData, {
        minify: settings.minify, addDisableToElementWithEvents: false
    });

    const metaLocation = chunks
        .findIndex((value) => typeof value === "object" &&
            "value" in value &&
            value.value instanceof JSVariableReference &&
            value.value.name === "metaSlot"
        );

    const contentLocation = chunks
        .findIndex((value) => typeof value === "object" &&
            "value" in value &&
            value.value instanceof JSVariableReference &&
            value.value.name === "contentSlot"
        );

    // Create function with content and meta slot parameters
    const pageRenderFunctionOne = new FunctionDeclaration(
        htmlRenderFunctionOne,
        [["acc", new TypeSignature("&mut String")]],
        null,
        statementsFromServerRenderChunks(chunks.slice(0, metaLocation), baseServerModule, new JSModule(""), null),
        true
    );
    const pageRenderFunctionTwo = new FunctionDeclaration(
        htmlRenderFunctionTwo,
        [["acc", new TypeSignature("&mut String")]],
        null,
        statementsFromServerRenderChunks(chunks.slice(metaLocation + 1, contentLocation), baseServerModule, new JSModule(""), null),
        true
    );
    const pageRenderFunctionThree = new FunctionDeclaration(
        htmlRenderFunctionThree,
        [["acc", new TypeSignature("&mut String")]],
        null,
        statementsFromServerRenderChunks(chunks.slice(contentLocation + 1), baseServerModule, new JSModule(""), null),
        true
    );
    baseServerModule.statements.push(pageRenderFunctionOne, pageRenderFunctionTwo, pageRenderFunctionThree);

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

function getNewString(initialBufferCapacity: number): Expression {
    if (initialBufferCapacity === 0) {
        return new Expression(
            new VariableReference("new", new VariableReference("String"), true),
            Operation.Call
        )
    } else {
        return new Expression(
            new VariableReference("with_capacity", new VariableReference("String"), true),
            Operation.Call,
            new ArgumentList([
                new Value(Type.number, initialBufferCapacity.toString())
            ])
        )
    }
}