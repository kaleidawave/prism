import { ValueAspect, Locals, PartialBinding, ITemplateConfig, ITemplateData } from "../template";
import { Expression } from "../../chef/javascript/components/value/expression";
import { addIdentifierToElement, addBinding, createNullElseElement, thisDataVariable } from "../helpers";
import { parseNode } from "../template";
import { HTMLElement } from "../../chef/html/html";
import { VariableReference } from "../../chef/javascript/components/value/variable";
import { cloneAST, aliasVariables } from "../../chef/javascript/utils/variables";
import { assignToObjectMap } from "../../helpers";

export function parseIfNode(
    element: HTMLElement,
    templateData: ITemplateData,
    templateConfig: ITemplateConfig,
    globals: Array<VariableReference>, // TODO eventually remove
    locals: Locals,
    nullable: boolean,
    multiple = false,
) {
    const value = element.attributes!.get("#if");

    if (!value) {
        throw Error("Expected value for #if construct")
    }

    assignToObjectMap(templateData.nodeData, element, "conditionalRoot", true);

    const expression = Expression.fromString(value);

    if (multiple) {
        throw Error("Not implemented - #if node under a #for element")
    }

    const identifier = addIdentifierToElement(element, templateData.nodeData);
    assignToObjectMap(templateData.nodeData, element, "nullable", true);

    const binding: PartialBinding = {
        aspect: ValueAspect.Conditional,
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

    const clientAliasedExpression = cloneAST(expression);
    aliasVariables(clientAliasedExpression, thisDataVariable, globals);

    assignToObjectMap(templateData.nodeData, element, "clientExpression", clientAliasedExpression);
    
    if (templateConfig.ssrEnabled) {
        const serverAliasedExpression = cloneAST(expression);
        // TODO do aliasing during server part
        aliasVariables(serverAliasedExpression, new VariableReference("data"), globals);
        assignToObjectMap(templateData.nodeData, element, "serverExpression", serverAliasedExpression);
    }
}