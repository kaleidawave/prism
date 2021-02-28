import { BindingAspect, Locals, PartialBinding, ITemplateConfig, ITemplateData } from "../template";
import { Expression, VariableReference } from "../../chef/javascript/components/value/expression";
import { addIdentifierToElement, addBinding, createNullElseElement } from "../helpers";
import { parseNode } from "../template";
import { HTMLElement } from "../../chef/html/html";
import { assignToObjectMap } from "../../helpers";

export function parseIfNode(
    element: HTMLElement,
    templateData: ITemplateData,
    templateConfig: ITemplateConfig,
    globals: Array<VariableReference>,
    locals: Locals,
    multiple: boolean,
) {
    if (multiple) {
        throw Error("Not implemented - #if node under a #for element")
    }

    const value = element.attributes!.get("#if");
    if (!value) {
        throw Error("Expected value for #if construct")
    }

    const expression = Expression.fromString(value);
    assignToObjectMap(templateData.nodeData, element, "conditionalExpression", expression);

    const identifier = addIdentifierToElement(element, templateData.nodeData);
    assignToObjectMap(templateData.nodeData, element, "nullable", true);

    const binding: PartialBinding = {
        aspect: BindingAspect.Conditional,
        expression,
        element
    }

    addBinding(binding, locals, globals, templateData.bindings);

    for (const child of element.children) {
        parseNode(
            child,
            templateData,
            templateConfig,
            globals,
            locals,
            true,
            multiple
        );
    }

    element.attributes!.delete("#if");

    // Skip over comments in between #if and #else
    let elseElement: HTMLElement | null = element.next as HTMLElement;

    if (elseElement && elseElement instanceof HTMLElement && elseElement.attributes?.has("#else")) {
        elseElement.attributes.delete("#else");
        parseNode(elseElement, templateData, templateConfig, globals, locals, true, multiple);
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
        assignToObjectMap(templateData.nodeData, elseElement, "nullable", true);
    }

    // TODO is elseElement used???
    assignToObjectMap(templateData.nodeData, element, "elseElement", elseElement);
}