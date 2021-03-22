import { fileBundle } from "../../bundled-files";
import { getImportPath } from "../../chef/helpers";
import { ClassDeclaration } from "../../chef/javascript/components/constructs/class";
import { ArgumentList, FunctionDeclaration } from "../../chef/javascript/components/constructs/function";
import { Module } from "../../chef/javascript/components/module";
import { GenerateDocString } from "../../chef/javascript/components/statements/comments";
import { ExportStatement, ImportStatement } from "../../chef/javascript/components/statements/import-export";
import { ReturnStatement } from "../../chef/javascript/components/statements/statement";
import { VariableDeclaration } from "../../chef/javascript/components/statements/variable";
import { TypeSignature } from "../../chef/javascript/components/types/type-signature";
import { Expression, Operation, VariableReference } from "../../chef/javascript/components/value/expression";
import { TemplateLiteral } from "../../chef/javascript/components/value/template-literal";
import { Value, Type, ValueTypes } from "../../chef/javascript/components/value/value";
import { Component } from "../../component";
import { IFinalPrismSettings } from "../../settings";
import { IServerRenderSettings, ServerRenderChunk, ServerRenderedChunks, serverRenderPrismNode } from "../../templating/builders/server-render";
import { IShellData } from "../template";
import { dirname, relative, join, resolve } from "path";

function renderServerChunk(serverChunk: ServerRenderChunk): ValueTypes | string {
    if (typeof serverChunk === "string") {
        return serverChunk;
    } else if ("value" in serverChunk) {
        if (serverChunk.escape) {
            return new Expression({
                lhs: new VariableReference("escape"),
                operation: Operation.Call,
                rhs: serverChunk.value
            });
        } else {
            return serverChunk.value;
        }
    } else if ("condition" in serverChunk) {
        return new Expression({
            lhs: serverChunk.condition as ValueTypes,
            operation: Operation.Ternary,
            rhs: new ArgumentList([
                templateLiteralFromServerRenderChunks(serverChunk.truthyRenderExpression),
                templateLiteralFromServerRenderChunks(serverChunk.falsyRenderExpression)
            ])
        });
    } else if ("subject" in serverChunk) {
        return new Expression({
            lhs: new VariableReference("join", new Expression({
                lhs: new VariableReference("map", serverChunk.subject),
                operation: Operation.Call,
                rhs: new FunctionDeclaration(
                    null,
                    [serverChunk.variable],
                    [new ReturnStatement(
                        templateLiteralFromServerRenderChunks(serverChunk.childRenderExpression)
                    )],
                    { bound: false }
                )
            })),
            operation: Operation.Call,
            rhs: new Value(Type.string)
        });
    } else if ("component" in serverChunk) {
        const args: Map<string, ValueTypes> = new Map(
            Array.from(serverChunk.args).map(([name, [value, _]]) => {
                if (typeof value === "object" && "argument" in value) return [name, value.argument];
                else if (Array.isArray(value)) return [name, templateLiteralFromServerRenderChunks(value)]
                else return [name, renderServerChunk(value) as ValueTypes];
            })
        );
        const func = serverChunk.component.serverRenderFunction!;
        return new Expression({
            lhs: new VariableReference(func.actualName!),
            operation: Operation.Call,
            rhs: func.buildArgumentListFromArgumentsMap(args)
        });
    } else {
        throw Error();
    }
}

/**
 * Creates a `TemplateLiteral`
 * @param serverChunks Array of chunks
 */
function templateLiteralFromServerRenderChunks(serverChunks: ServerRenderedChunks): TemplateLiteral {
    return new TemplateLiteral(serverChunks.map(serverChunk => renderServerChunk(serverChunk)));
}

export function makeTsComponentServerModule(
    comp: Component, 
    settings: IFinalPrismSettings, 
    ssrSettings: IServerRenderSettings
): void {
    comp.serverModule = new Module(join(settings.absoluteServerOutputPath, comp.relativeFilename));

    for (const statement of comp.clientModule.statements) {
        if (statement instanceof ClassDeclaration) {
            // Don't copy the front side component definition
            if (statement !== comp.componentClass) comp.serverModule!.statements.push(statement);
        } else if (statement instanceof ExportStatement) {
            if (statement.exported !== comp.componentClass) comp.serverModule!.statements.push(statement);
        } else if (statement instanceof ImportStatement) {
            if (statement.from.endsWith(".prism")) {
                const newImports: Array<string> = [];
                let importedComponent: Component | null = null;
                for (const [key] of statement.variable?.entries ?? []) {
                    if (comp.importedComponents.has(key as string)) {
                        importedComponent = comp.importedComponents.get(key as string)!;
                        newImports.push(importedComponent.serverRenderFunction!.actualName!)
                    } else {
                        newImports.push(key as string);
                    }
                }
                const newPath = getImportPath(
                    comp.serverModule!.filename!,
                    importedComponent!.serverModule!.filename!
                );
                const newImport = new ImportStatement(newImports, newPath, statement.as, statement.typeOnly);
                comp.serverModule!.statements.push(newImport);
            } else if (!(statement as any).prismPrelude) {
                const newPath = getImportPath(
                    comp.serverModule!.filename!,
                    resolve(dirname(comp.filename), statement.from)
                );
                const newImport = new ImportStatement(statement.variable, newPath, statement.as, statement.typeOnly);
                comp.serverModule!.statements.push(newImport);
            }
        } else if (statement !== comp.customElementDefineStatement) {
            comp.serverModule!.statements.push(statement);
        }
    }

    comp.serverRenderFunction = new FunctionDeclaration(
        `render${comp.className}Component`, 
        comp.serverRenderParameters, 
        []
    );

    if (comp.defaultData && comp.noSSRData) {
        comp.serverRenderFunction.statements.push(new VariableDeclaration("data", {
            value: comp.defaultData,
            typeSignature: comp.dataTypeSignature
        }));
    }

    // Final argument is to add a entry onto the component that is sent attributes 
    const serverRenderChunks = serverRenderPrismNode(comp.componentHTMLTag, comp.templateData.nodeData, ssrSettings, comp.globals);
    const renderTemplateLiteral = templateLiteralFromServerRenderChunks(serverRenderChunks);

    // TODO would comp work just using the existing slot functionality?
    // TODO could do in the page render function
    if (comp.usesLayout) {
        // Generate comp components markup and then pass it to the layout render function to be injected
        const innerContent = new VariableDeclaration("content", {
            isConstant: true,
            value: renderTemplateLiteral
        });

        comp.serverRenderFunction.statements.push(innerContent);

        // TODO layout data is different to component data. Should be interpreted in same way as client global
        const renderArgs = new Map([
            ["attributes", new Value(Type.string)],
            ["data", new VariableReference("data")],
            ["contentSlot", innerContent.toReference()]
        ] as Array<[string, ValueTypes]>);

        for (const clientGlobal of comp.clientGlobals) {
            renderArgs.set((clientGlobal[0].tail as VariableReference).name, clientGlobal[0]);
        }

        let argumentList: ArgumentList;
        try {
            argumentList = comp.usesLayout.serverRenderFunction!.buildArgumentListFromArgumentsMap(renderArgs)
        } catch (error) {
            throw Error(`Layout "${comp.usesLayout.filename}" has a client global not present in "${comp.filename}"`);
        }
        const callLayoutSSRFunction = new Expression({
            lhs: new VariableReference(comp.usesLayout.serverRenderFunction!.actualName!),
            operation: Operation.Call,
            rhs: argumentList
        });

        comp.serverRenderFunction.statements.push(new ReturnStatement(callLayoutSSRFunction));
    } else {
        comp.serverRenderFunction.statements.push(new ReturnStatement(renderTemplateLiteral));
    }

    comp.serverModule!.addExport(comp.serverRenderFunction);

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
            `render${comp.className}Content`,
            comp.serverRenderParameters.filter((name) => name.name !== "attributes"),
            [
                new ReturnStatement(templateLiteralFromServerRenderChunks(chunks))
            ]
        ));
    }

    // If has page decorator, add another function that renders the page into full document with head
    if (comp.isPage) {
        const pageRenderArgs: Array<ValueTypes> = comp.needsData ? [new VariableReference("data")] : [];
        pageRenderArgs.push(...comp.clientGlobals.map(cG => cG[0]));

        const pageRenderCall: ValueTypes = new Expression({
            lhs: new VariableReference(comp.serverRenderFunction.actualName!),
            operation: Operation.Call,
            rhs: new ArgumentList(pageRenderArgs)
        });

        const metaDataArg: ValueTypes = (comp.title || comp.metadata) ? 
            templateLiteralFromServerRenderChunks(comp.metaDataChunks) : 
            new Value(Type.string);

        // Creates "return renderHTML(renderComponent(***))"
        const renderAsPage = new ReturnStatement(
            new Expression({
                lhs: new VariableReference("renderHTML"),
                operation: Operation.Call,
                rhs: new ArgumentList([pageRenderCall, metaDataArg])
            })
        );

        const renderPageFunction = new FunctionDeclaration(
            `render${comp.className}Page`,
            comp.serverRenderParameters,
            [renderAsPage]
        );

        let description = "Server render function for ";
        if (comp.filename) {
            // Create a link back to the component
            description += `[${comp.className}](file:///${comp.filename?.replace(/\\/g, "/")})`
        } else {
            description += comp.className;
        }

        // Generate a docstring for the function
        const functionDocumentationString = GenerateDocString({
            text: description,
            remarks: "Built using [Prism](https://github.com/kaleidawave/prism)",
        });
        comp.serverModule!.statements.push(functionDocumentationString);
        comp.pageServerRenderFunction = renderPageFunction;
        comp.serverModule!.addExport(renderPageFunction);
    }

    // Add imports from the server module
    const imports: Array<VariableDeclaration> = [];

    // Renders the component around the HTML document
    if (comp.isPage) imports.push(new VariableDeclaration("renderHTML"));
    // Escapes HTML values
    if (comp.needsData) imports.push(new VariableDeclaration("escape"));

    if (imports.length > 0) {
        comp.serverModule!.addImport(
            imports,
            "./" +
            relative(
                dirname(comp.serverModule!.filename ?? ""),
                join(settings.absoluteServerOutputPath, "prism")
            ).replace(/\\/g, "/")
        );
    }
}

export function buildPrismServerModule(template: IShellData, settings: IFinalPrismSettings): Module {
    // Include the escape function
    const baseServerModule = Module.fromString(fileBundle.get("server.ts")!, join(settings.absoluteServerOutputPath, "prism"));

    // Create a template literal to build the index page. As the template has been parsed it will include slots for rendering slots
    const pageRenderTemplateLiteral = serverRenderPrismNode(template.document, template.nodeData, { minify: settings.minify, addDisableToElementWithEvents: false });

    // Create function with content and meta slot parameters
    const pageRenderFunction = new FunctionDeclaration(
        "renderHTML",
        [
            new VariableDeclaration("contentSlot", { typeSignature: new TypeSignature({ name: "string" }) }),
            new VariableDeclaration("metaSlot", { typeSignature: new TypeSignature({ name: "string" }) })
        ],
        [new ReturnStatement(templateLiteralFromServerRenderChunks(pageRenderTemplateLiteral))],
    );

    baseServerModule.addExport(pageRenderFunction);
    return baseServerModule;
}