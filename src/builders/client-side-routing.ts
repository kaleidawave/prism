import { Component } from "../component";
import { Module } from "../chef/javascript/components/module";
import { ArrayLiteral } from "../chef/javascript/components/value/array";
import { Value, Type, ValueTypes } from "../chef/javascript/components/value/value";
import { DynamicUrl, dynamicUrlToRegexPattern } from "../chef/dynamic-url";
import { ClassDeclaration } from "../chef/javascript/components/constructs/class";
import { RegExpLiteral } from "../chef/javascript/components/value/regex";

// Maps urls to components
const routes: Array<[DynamicUrl, Component]> = [];
let notFoundRoute: Component;

/**
 * TODO check no overwrite
 * @param url 
 * @param component 
 */
export function addRoute(url: DynamicUrl, component: Component) {
    routes.push([url, component]);
}

export function getRoutes() {
    return routes;
}

/**
 * TODO check no overwrite
 * @param component 
 */
export function setNotFoundRoute(component: Component) {
    if (notFoundRoute) throw Error(`Component "${component.filename}" cannot be set to all routes as "${notFoundRoute.filename}" is already set to match on all routes`);
    notFoundRoute = component;
}

/**
 * Takes the client side router module and injects a array map the router uses to pair urls to components and layouts
 */
export function injectRoutes(routerModule: Module): void {

    // Use the bundled router and get the router component
    const routerComponent: ClassDeclaration = routerModule.classes.find(cls => cls.actualName === "Router")!;

    // Build up array that map patterns to components and their possible layout
    const routePairArray = new ArrayLiteral();

    // Sort routes so that fixed routes take prevalence over dynamic routes
    routes.sort((r1, r2) => {
        const r1hasDynamicParts = r1[0].some(part => typeof part === "object"),
              r2hasDynamicParts = r2[0].some(part => typeof part === "object");
        if (r1hasDynamicParts === r2hasDynamicParts) {
            return 0;
        } else if (r1hasDynamicParts && !r2hasDynamicParts) {
            return 1;
        } else {
            return -1;
        }
    });

    for (const [url, component] of routes) {
        const parts: Array<ValueTypes> = [];
        // TODO could to dynamic import for code splitting
        parts.push(dynamicUrlToRegexPattern(url));

        // Push the component tag and if the the page requires a layout
        parts.push(new Value(Type.string, component.tagName));
        if (component.usesLayout) {
            parts.push(new Value(Type.string, component.usesLayout.tagName,));
        }

        routePairArray.elements.push(new ArrayLiteral(parts));
    }

    // If there is a not found route append a always matching regex pattern
    // Important that this comes last as not to return early on other patterns
    if (notFoundRoute) {
        const parts: Array<ValueTypes> = [];
        parts.push(new RegExpLiteral(".?")); // This regexp matches on anything inc empty strings
        parts.push(new Value(Type.string, notFoundRoute.tagName));
        if (notFoundRoute.usesLayout) {
            parts.push(new Value(Type.string, notFoundRoute.usesLayout.tagName));
        }
        routePairArray.elements.push(new ArrayLiteral(parts));
    }

    // Add the routes as a static member to the router class
    routerComponent.staticFields!.get("r")!.value = routePairArray;
}