import { ValueAspect, Locals, VariableReferenceArray, PartialBinding, ITemplateData, ITemplateConfig } from "../template";
import { ForStatement, ForStatementExpression } from "../../chef/javascript/components/statements/for";
import { addIdentifierToElement, addBinding, thisDataVariable } from "../helpers";
import { VariableReference } from "../../chef/javascript/components/value/variable";
import { parseNode } from "../template";
import { HTMLComment, HTMLElement } from "../../chef/html/html";
import { aliasVariables, cloneAST } from "../../chef/javascript/utils/variables";
import { assignToObjectMap } from "../../helpers";

export function parseForNode(
    element: HTMLElement,
    templateData: ITemplateData,
    templateConfig: ITemplateConfig,
    globals: Array<VariableReference>,
    localData: Locals,
    nullable = false,
    multiple: boolean
) {
    const value = element.attributes!.get("#for");
    if (!value) {
        throw Error("Expected value for #for construct")
    }

    assignToObjectMap(templateData.nodeData, element, "iteratorRoot", true);

    const expression = ForStatement.parseForParameter(value);
    if (expression instanceof ForStatementExpression) {
        throw Error("#for construct only supports iterator expression");
    }

    const clientAliasedExpression = cloneAST(expression);
    aliasVariables(clientAliasedExpression, thisDataVariable, globals);

    const subjectReference = (expression.subject as VariableReference).toChain();

    // Parent identifier
    if (!multiple) {
        addIdentifierToElement(element, templateData.nodeData);
    }

    // Deals with nested arrays:
    let fromLocal: VariableReferenceArray = subjectReference;
    if (localData.some(local => local.name === (expression.subject as VariableReference).name)) {
        fromLocal = localData.find(local => local.name === (expression.subject as VariableReference).name)!.path;
    }

    if (element.children.filter(child => !(child instanceof HTMLComment)).length > 1) {
        throw Error("#for construct element must be single child");
    }

    assignToObjectMap(templateData.nodeData, element, "clientExpression", clientAliasedExpression)
    if (templateConfig.ssrEnabled) {
        const serverAliasedExpression = cloneAST(expression);
        aliasVariables(serverAliasedExpression, new VariableReference("data"), globals);
        assignToObjectMap(templateData.nodeData, element, "serverExpression", serverAliasedExpression)
    }

    const newLocals: Locals = [
        ...localData,
        {
            name: expression.variable.name!,
            path: [...fromLocal, { aspect: "*", alias: expression.variable.name, origin: element }]
        }
    ];

    const binding: PartialBinding = { aspect: ValueAspect.Iterator, element, expression, }

    addBinding(binding, localData, globals, templateData.bindings);

    for (const child of element.children) {
        parseNode(
            child,
            templateData,
            templateConfig,
            globals,
            newLocals,
            nullable,
            true
        );
    }
    element.attributes!.delete("#for");
}