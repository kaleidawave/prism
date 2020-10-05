import { PrismHTMLElement, IDependency, IEvent, ValueAspect, PrismNode, Locals, VariableReferenceArray, PartialDependency } from "../template";
import { ForStatement, ForStatementExpression } from "../../chef/javascript/components/statements/for";
import { addIdentifierToElement, addDependency } from "../helpers";
import { VariableReference } from "../../chef/javascript/components/value/variable";
import { parsePrismNode } from "../template";
import { HTMLComment } from "../../chef/html/html";
import type { Component } from "../../component";
import { aliasVariables, cloneAST } from "../../chef/javascript/utils/variables";

export function parseForNode(
    element: PrismHTMLElement,
    slots: Map<string, PrismHTMLElement>,
    dependencies: Array<IDependency>,
    events: Array<IEvent>,
    importedComponents: Map<string, Component> | null,
    ssr: boolean,
    globals: Array<VariableReference>,
    localData: Locals,
    nullable = false,
    multiple: boolean
) {
    const value = element.attributes!.get("#for");
    if (!value) {
        throw Error("Expected value for #for construct")
    }

    const expression = ForStatement.parseForParameter(value);
    if (expression instanceof ForStatementExpression) {
        throw Error("#for construct only supports iterator expression");
    }

    const clientAliasedExpression = cloneAST(expression);
    aliasVariables(clientAliasedExpression, VariableReference.fromChain("this", "data"), globals);

    const subjectReference = (expression.subject as VariableReference).toChain();

    // Parent identifier
    if (!multiple) {
        addIdentifierToElement(element);
    }

    // Deals with nested arrays:
    let fromLocal: VariableReferenceArray = subjectReference;
    if (localData.some(local => local.name === (expression.subject as VariableReference).name)) {
        fromLocal = localData.find(local => local.name === (expression.subject as VariableReference).name)!.path;
    }

    if (element.children.filter(child => !(child instanceof HTMLComment)).length > 1) {
        throw Error("#for construct element must be single child");
    }

    element.clientExpression = clientAliasedExpression;
    if (ssr) {
        const serverAliasedExpression = cloneAST(expression);
        aliasVariables(serverAliasedExpression, new VariableReference("data"), globals);
        element.serverExpression = serverAliasedExpression;
    }

    const newLocals: Locals = [
        ...localData,
        {
            name: expression.variable.name!,
            path: [...fromLocal, { aspect: "*", alias: expression.variable.name, origin: element }]
        }
    ];

    const dependency: PartialDependency = { aspect: ValueAspect.Iterator, element, expression, }

    addDependency(dependency, localData, globals, dependencies);

    for (const child of element.children) {
        parsePrismNode(
            child as PrismNode,
            slots,
            dependencies,
            events,
            importedComponents,
            ssr,
            globals,
            newLocals,
            nullable,
            true
        );
    }
    element.attributes!.delete("#for");
}