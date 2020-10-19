import { Module } from "../chef/javascript/components/module";
import { getRoutes, injectRoutes } from "./client-side-routing";
import { fileBundle } from "../bundled-files";
import { join } from "path";
import { dynamicUrlToString } from "../chef/dynamic-url";
import { flatElements, HTMLDocument, HTMLElement } from "../chef/html/html";
import { defaultTemplateHTML, IFinalPrismSettings } from "../settings";

export const clientModuleFilenames = [
    "component.ts",
    "helpers.ts",
    "observable.ts",
    "render.ts",
    "router.ts",
];

export const clientExports: Map<string, Array<string>> = new Map([
    ["component.ts", ["Component"]],
    ["helpers.ts", ["conditionalSwap", "setLength", "tryAssignToTextNode"]],
    ["render.ts", ["h", "createComment"]],
    ["router.ts", ["Router"]],
]);


/**
 * Returns the whole Prism client as a module.
 * @param clientSideRouting Include the client router module (including injecting routes)
 */
export async function getPrismClient(clientSideRouting: boolean = true): Promise<Module> {
    const bundle = new Module();
    bundle.filename = "prism.js";
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
        document = HTMLDocument.fromString(fileBundle.get("template.html")!);
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
