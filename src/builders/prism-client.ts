import { Module } from "../chef/javascript/components/module";
import { getRoutes, injectRoutes } from "./client-side-routing";
import { fileBundle } from "../bundled-files";
import { join } from "path";
import { dynamicUrlToString } from "../chef/dynamic-url";
import { flatElements, HTMLDocument, HTMLElement } from "../chef/html/html";
import { defaultTemplateHTML, IFinalPrismSettings } from "../settings";
import { FunctionDeclaration } from "../chef/javascript/components/constructs/function";
import { ExportStatement } from "../chef/javascript/components/statements/import-export";
import { ClassDeclaration } from "../chef/javascript/components/constructs/class";
import { VariableDeclaration } from "../chef/javascript/components/statements/variable";
import { Comment } from "../chef/javascript/components/statements/comments";

export const clientModuleFilenames = [
    "component.ts",
    "helpers.ts",
    "observable.ts",
    "render.ts",
    "router.ts",
];

export type IRuntimeFeatures =
    Record<
        "observableArrays" | "conditionals" | "isomorphic" | "svg" | "subObjects",
        boolean
    >;

/**
 * Remove unused runtime logic from `bundle` according to the `runtimeFeatures` that are needed
 */
export function treeShakeBundle(runtimeFeatures: IRuntimeFeatures, bundle: Module) {
    if (!runtimeFeatures.isomorphic) {
        // Remove createComment helper
        bundle.statements = bundle.statements.filter(statement => !(
            statement instanceof ExportStatement && statement.exported instanceof FunctionDeclaration && statement.exported.name?.name === "createComment"
        ));

        const otherStatements = Module.fromString(fileBundle.get("others.ts")!, "others.ts").statements;
        const componentClass = (bundle.statements.find(statement =>
            statement instanceof ExportStatement && statement.exported instanceof ClassDeclaration && statement.exported.name?.name === "Component"
        ) as ExportStatement).exported as ClassDeclaration;

        componentClass.methods!.get("connectedCallback")!.statements = (otherStatements.find(statement => statement instanceof FunctionDeclaration && statement.name?.name === "connectedCallback") as FunctionDeclaration).statements;

        componentClass.methods!.get("disconnectedCallback")!.statements = (otherStatements.find(statement => statement instanceof FunctionDeclaration && statement.name?.name === "disconnectedCallback") as FunctionDeclaration).statements;

    }
    if (!runtimeFeatures.conditionals) {
        // Remove setElem and _ifSwapElemCache
        const componentClass = (bundle.statements.find(statement =>
            statement instanceof ExportStatement && statement.exported instanceof ClassDeclaration && statement.exported.name?.name === "Component"
        ) as ExportStatement).exported as ClassDeclaration;
        componentClass.members = componentClass.members.filter(member => !(
            !(member instanceof Comment) && (
                member instanceof VariableDeclaration && member.name === "_ifSwapElemCache" ||
                member instanceof FunctionDeclaration && member.actualName === "setElem"
            )
        ));

        // Remove conditionalSwap and tryAssignData
        bundle.statements = bundle.statements.filter(statement => !(
            statement instanceof ExportStatement && statement.exported instanceof FunctionDeclaration &&
            ["conditionalSwap", "tryAssignData"].includes(statement.exported.actualName!)
        ));
    }
    if (!runtimeFeatures.observableArrays) {
        // Remove createObservableArray, isArrayHoley and setLength function
        bundle.statements = bundle.statements.filter(statement => !(
            statement instanceof ExportStatement && statement.exported instanceof FunctionDeclaration && ["createObservableArray", "isArrayHoley", "setLength"].includes(statement.exported.actualName!)
        ));
    }
    if (!runtimeFeatures.svg) {
        // Remove svgElems set that is needed to decide whether to create a element in the svg namespace
        bundle.statements = bundle.statements.filter(statement => !(
            statement instanceof VariableDeclaration && statement.name === "svgElems"
        ));

        // Get renderFunction and replace its statements for statements that do not take svg elements into account
        const renderFunction = bundle.statements.find(statement =>
            statement instanceof ExportStatement &&
            statement.exported instanceof FunctionDeclaration &&
            statement.exported.name?.name === "h") as ExportStatement;

        (renderFunction.exported as FunctionDeclaration).statements =
            (Module.fromString(fileBundle.get("others.ts")!, "others.ts").statements
                .find(statement =>
                    statement instanceof FunctionDeclaration &&
                    statement.name?.name === "h"
                ) as FunctionDeclaration)
                .statements;
    }
    if (!runtimeFeatures.subObjects) {
        // Remove createObservable function
        bundle.statements = bundle.statements.filter(statement => !(
            statement instanceof ExportStatement &&
            statement.exported instanceof FunctionDeclaration &&
            statement.exported.name?.name === "createObservable"
        ));

        const createObservableObject = Module.fromString(fileBundle.get("others.ts")!, "others.ts")
            .statements.find(statement =>
                statement instanceof FunctionDeclaration && statement.name?.name === "createObservableObject"
            );

        (bundle.statements.find(statement =>
            statement instanceof ExportStatement &&
            statement.exported instanceof FunctionDeclaration &&
            statement.exported.name?.name === "createObservableObject"
        ) as ExportStatement).exported = createObservableObject!;
    }
}

/**
 * Returns the whole Prism client as a module.
 * @param clientSideRouting Include the client router module (including injecting routes)
 */
export async function getPrismClient(clientSideRouting: boolean = true): Promise<Module> {
    const bundle = new Module("prism.js");
    for (const clientLib of clientModuleFilenames) {
        const module = Module.fromString(fileBundle.get(clientLib)!, join("bundle", clientLib));
        if (clientLib.endsWith("router.ts")) {
            if (!clientSideRouting) continue;
            injectRoutes(module);
        }
        bundle.combine(module);
    }
    return bundle;
}

/**
 * Creates the underlining index document including references in the script to the script and style bundle.
 */
export async function buildIndexHtml(settings: IFinalPrismSettings): Promise<HTMLDocument> {
    // Read the included template or one specified by settings
    let document: HTMLDocument;
    if (settings.templatePath === defaultTemplateHTML) {
        document = HTMLDocument.fromString(fileBundle.get("template.html")!, "template.html");
    } else {
        document = await HTMLDocument.fromFile(settings.absoluteTemplatePath);
    }

    for (const element of flatElements(document)) {
        if (element.tagName === "slot") {
            const slotFor = element.attributes?.get("for") ?? "content";

            // Injecting router
            if (slotFor === "content") {
                let swapElement: HTMLElement;
                const routes = getRoutes();
                // TODO temp implementation if only a single page
                if (routes.length === 1 && dynamicUrlToString(routes[0][0]) === "/") {
                    // Swap with router
                    // TODO could static render if doesn't require data + add "data-ssr" attribute
                    // TODO component may have load function
                    // TODO may have layout
                    swapElement = new HTMLElement(routes[0][1].tag, null, [], element.parent);
                } else {
                    // Swap with the only registered page component
                    swapElement = new HTMLElement("router-component", null, [], element.parent);
                }
                // Swap in the router-component at the position of the component
                element.parent!.children.splice(element.parent!.children.indexOf(element), 1, swapElement);
            } else {
                // TODO not sure why it delete other for slots
                element.parent!.children.splice(element.parent!.children.indexOf(element), 1);
            }
        } else if (element.tagName === "head") {
            // TODO link up the names of these assets
            element.children.push(new HTMLElement("script", new Map([["type", "module"], ["src", "/bundle.js"]])));
            element.children.push(new HTMLElement("link", new Map([["rel", "stylesheet"], ["href", "/bundle.css"]])));
        }
    }

    return document;
}
