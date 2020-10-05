import { HTMLDocument, flatElements, HTMLElement } from "../chef/html/html";
import { PrismHTMLElement } from "../templating/template";
import { getRoutes } from "./client-side-routing";
import { dynamicUrlToString } from "../chef/dynamic-url";
import { settings } from "../settings";

/**
 * Creates the underlining index document including references in the script to the script and style bundle.
 */
export function buildIndexHtml(): HTMLDocument {

    // Read the included template
    const htmlPage = HTMLDocument.fromFile(settings.absoluteTemplatePath);

    for (const element of flatElements(htmlPage) as Array<PrismHTMLElement>) {
        if (element.tagName === "slot") {
            element.slotFor = element.attributes!.get("for") ?? "content";

            // Injecting router
            if (element.slotFor === "content") {
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

    return htmlPage;
}
