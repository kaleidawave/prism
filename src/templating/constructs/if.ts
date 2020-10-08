import { PrismHTMLElement, IDependency, IEvent, PrismNode, ValueAspect, Locals, PartialDependency } from "../template";
import { Component } from "../../component";
import { Expression } from "../../chef/javascript/components/value/expression";
import { addIdentifierToElement, addDependency, createNullElseElement, thisDataVariable } from "../helpers";
import { parsePrismNode } from "../template";
import { HTMLElement } from "../../chef/html/html";
import { VariableReference } from "../../chef/javascript/components/value/variable";
import { cloneAST, aliasVariables } from "../../chef/javascript/utils/variables";

export function parseIfNode(
    element: PrismHTMLElement,
    slots: Map<string, PrismHTMLElement>,
    dependencies: Array<IDependency>,
    events: Array<IEvent>,
    importedComponents: Map<string, Component> | null,
    ssr: boolean,
    globals: Array<VariableReference>, // TODO eventually remove
    locals: Locals,
    nullable: boolean,
    multiple = false,
) {
    const value = element.attributes!.get("#if");

    if (!value) {
        throw Error("Expected value for #if construct")
    }

    const expression = Expression.fromString(value);

    if (multiple) {
        throw Error("Not implemented - #if node under a #for element")
    }

    const identifier = addIdentifierToElement(element);
    element.nullable = true;

    const dependency: PartialDependency = {
        aspect: ValueAspect.Conditional,
        expression,
        element
    }

    addDependency(dependency, locals, globals, dependencies);

    for (const child of element.children) {
        parsePrismNode(
            child as PrismNode,
            slots,
            dependencies,
            events,
            importedComponents,
            ssr,
            globals,
            locals,
            true,
            multiple
        );
    }

    element.attributes!.delete("#if");

    // Skip over comments in between #if and #else
    let elseElement: PrismNode | null = element.next as PrismNode;

    if (elseElement && elseElement instanceof HTMLElement && elseElement.attributes?.has("#else")) {
        elseElement.attributes.delete("#else");
        parsePrismNode(elseElement, slots, dependencies, events, importedComponents, ssr, globals, locals, true, multiple);
        elseElement.attributes.set("data-else", null);
        // Add a (possibly second) identifer to elseElement. It is the same identifer used for the #if element
        // and simplifies runtime by having a single id element to swap
        if (elseElement.attributes.has("class")) {
            elseElement.attributes.set("class", elseElement.attributes.get("class") + " " + identifier);
        } else {
            elseElement.attributes.set("class", identifier);
        }

        // Remove else node from being rendered normally as it will be created under the function
        elseElement.parent!.children.splice(elseElement.parent!.children.indexOf(elseElement), 1);
    } else {
        elseElement = createNullElseElement(identifier);
        elseElement.nullable = true;
    }

    element.elseElement = elseElement;

    const clientAliasedExpression = cloneAST(expression);
    aliasVariables(clientAliasedExpression, thisDataVariable, globals);

    element.clientExpression = clientAliasedExpression;
    if (ssr) {
        const serverAliasedExpression = cloneAST(expression);
        aliasVariables(serverAliasedExpression, new VariableReference("data"), globals);
        element.serverExpression = serverAliasedExpression;
    }
}