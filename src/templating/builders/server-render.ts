import { HTMLElement, TextNode, HTMLDocument, HTMLComment, Node } from "../../chef/html/html";
import { IValue, Value, Type } from "../../chef/javascript/components/value/value";
import { VariableReference } from "../../chef/javascript/components/value/variable";
import { Expression, Operation } from "../../chef/javascript/components/value/expression";
import { FunctionDeclaration, ArgumentList } from "../../chef/javascript/components/constructs/function";
import { aliasVariables, cloneAST } from "../../chef/javascript/utils/variables";
import { NodeData } from "../template";
import { ForIteratorExpression } from "../../chef/javascript/components/statements/for";
import { IFunctionDeclaration } from "../../chef/abstract-asts";

const dataVariable = new VariableReference("data");

export interface IServerRenderSettings {
    dynamicAttribute: boolean,
    minify: boolean,
    addDisableToElementWithEvents: boolean
}

export interface ServerRenderExpression {
    value: IValue
}

export interface FunctionCallServerRenderExpression {
    func: IFunctionDeclaration,
    args: Map<string, ServerRenderedChunks>
}

export interface ConditionalServerRenderExpression {
    condition: IValue,
    truthyRenderExpression: ServerRenderedChunks,
    falsyRenderExpression: ServerRenderedChunks
}

export interface LoopServerRenderExpression {
    subject: IValue,
    variable: string,
    childRenderExpression: ServerRenderedChunks
}

export type ServerRenderedChunks = Array<
    string
    | ConditionalServerRenderExpression
    | LoopServerRenderExpression
    | ServerRenderExpression
    | FunctionCallServerRenderExpression
>;

/**
 * Generates a template literal with relevant interpolation of variables that when run will generate ssr html
 * @param template The <template> prism node to render
 * @param minify Will not prettify the output in the template literal
 * @param dynamicAttribute If true will add a ${attributes} onto the top tag attribute. Kinda temp but doing it later breaks because template literal collapsation 
 */
export function serverRenderPrismNode(
    template: HTMLElement | HTMLDocument,
    nodeData: WeakMap<Node, NodeData>,
    serverRenderSettings: IServerRenderSettings,
    locals: Array<VariableReference> = [],
    skipOverServerExpression: boolean = false
): ServerRenderedChunks {
    const parts = buildServerTemplateLiteralShards(template, nodeData, serverRenderSettings, locals, skipOverServerExpression);
    if (serverRenderSettings.minify) {
        parts.splice(1, 0, { value: new VariableReference("attributes") });
    }
    return parts;
}

/**
 * Builds parts to build up the template literal
 * TODO generator ???
 */
function buildServerTemplateLiteralShards(
    element: Node | HTMLDocument,
    nodeData: WeakMap<Node, NodeData>,
    serverRenderSettings: IServerRenderSettings,
    locals: Array<VariableReference>,
    skipOverServerExpression: boolean = false
): ServerRenderedChunks {

    const entries: ServerRenderedChunks = []; // Entries is unique for each execution for indentation benefits
    if (element instanceof HTMLElement) {

        const elementData = nodeData.get(element);

        if (elementData?.slotFor) {
            entries.push({ value: new VariableReference(`${elementData?.slotFor}Slot`) });
            return entries;
        }

        // If node
        if (elementData?.conditionalExpression && !skipOverServerExpression) {
            const truthyRenderExpression = serverRenderPrismNode(element, nodeData, serverRenderSettings, locals, true);
            const falsyRenderExpression = serverRenderPrismNode(elementData.elseElement!, nodeData, serverRenderSettings, locals);

            const serverAliasedExpression = cloneAST(elementData.conditionalExpression);
            aliasVariables(serverAliasedExpression, dataVariable, locals);

            return [{
                condition: serverAliasedExpression,
                truthyRenderExpression,
                falsyRenderExpression,
            }];
        }

        if (elementData?.component) {
            const component = elementData.component;

            // Components data
            const componentsData: IValue | null = elementData.dynamicAttributes?.get("data") ?? null;

            // A render function for a component goes attributes, componentData, contentSlot, ...context. With all of those being optional apart from contentSlot

            const renderArgs: Map<string, ServerRenderedChunks> = new Map();

            if (element.attributes) {
                renderArgs.set("attributes", serverRenderNodeAttribute(element, nodeData, locals));
            }

            if (component.hasSlots) {
                const slotRenderFunction: ServerRenderedChunks = [];
                if (element.children.length > 0) {
                    for (let i = 0; i < element.children.length; i++) {
                        const child = element.children[i];
                        slotRenderFunction.push(
                            ...buildServerTemplateLiteralShards(child, nodeData, serverRenderSettings, locals)
                        );
                        if (!serverRenderSettings.minify && i !== element.children.length - 1) entries.push("\n");
                    }
                }
                renderArgs.set("contentSlot", slotRenderFunction);
            }

            if (componentsData) {
                const aliasedData = cloneAST(componentsData);
                aliasVariables(aliasedData, dataVariable, locals)
                renderArgs.set("data", aliasedData);
            }

            if (component.clientGlobals) {
                for (const clientGlobal of component.clientGlobals) {
                    renderArgs.set((clientGlobal[0].tail as VariableReference).name, [{ value: clientGlobal[0] }]);
                }
            }

            entries.push({
                func: component.serverRenderFunction!,
                args: renderArgs
            });

            return entries;
        }

        entries.push(`<${element.tagName}`);

        entries.push(...serverRenderNodeAttribute(element, nodeData, locals))

        // If the element has any events disable it by default TODO explain why
        if (serverRenderSettings.addDisableToElementWithEvents && elementData?.events?.some(event => event.required)) {
            entries.push(" disabled")
        }

        if (element.closesSelf) entries.push("/");
        entries.push(">");
        if (!serverRenderSettings.minify && element.children.length > 0) entries.push("\n    ");

        if (HTMLElement.selfClosingTags.has(element.tagName) || element.closesSelf) return entries;

        if (elementData?.iteratorExpression) {
            const serverAliasedExpression: ForIteratorExpression = cloneAST(elementData.iteratorExpression);
            aliasVariables(serverAliasedExpression, dataVariable, locals);

            entries.push({
                subject: serverAliasedExpression.subject,
                variable: serverAliasedExpression.variable.name,
                childRenderExpression: buildServerTemplateLiteralShards(
                    element.children[0],
                    nodeData,
                    serverRenderSettings,
                    [serverAliasedExpression.variable.toReference(), ...locals]
                )
            })
        } else {
            for (const child of element.children) {
                const parts = buildServerTemplateLiteralShards(child, nodeData, serverRenderSettings, locals);
                // Indent children
                if (!serverRenderSettings.minify) {
                    for (let i = 0; i < parts.length; i++) {
                        if (typeof parts[i] === "string" && (parts[i] as string).startsWith("\n")) {
                            parts[i] = parts[i] + " ".repeat(4);
                        }
                    }
                    // Comments 
                    if (child.next) {
                        const isFragment =
                            (child instanceof HTMLComment && nodeData.get(child)?.isFragment && child.next instanceof TextNode) ||
                            (child instanceof TextNode && child.next instanceof HTMLComment && (nodeData.get(child.next)?.isFragment));
                        if (!isFragment) {
                            parts.push("\n" + " ".repeat(4));
                        }
                    }
                }
                entries.push(...parts);
            }
        }
        if (!serverRenderSettings.minify && element.children.length > 0) entries.push("\n");
        entries.push(`</${element.tagName}>`);

    } else if (element instanceof TextNode) {
        const value = nodeData.get(element)?.textNodeValue;
        if (value) {
            const aliasedPart = cloneAST(value);
            aliasVariables(aliasedPart, dataVariable, locals);
            entries.push({ value: aliasedPart });
        } else {
            entries.push(element.text);
        }
    } else if (element instanceof HTMLComment) {
        // If the comment is used to fragment text nodes:
        if (nodeData.get(element)?.isFragment) {
            entries.push(`<!--${element.comment}-->`);
        }
    } else if (element instanceof HTMLDocument) {
        for (let i = 0; i < element.children.length; i++) {
            const child = element.children[i];
            entries.push(...buildServerTemplateLiteralShards(child, nodeData, serverRenderSettings, locals));
            if (!serverRenderSettings.minify && i !== element.children.length - 1) entries.push("\n");
        }
    } else {
        throw Error(`Cannot build render string from construct ${(element as any).constructor.name}`)
    }
    return entries;
}

export function serverRenderNodeAttribute(element: HTMLElement, nodeData: WeakMap<Node, NodeData>, locals: Array<VariableReference>) {
    const entries: ServerRenderedChunks = [];
    if (element.attributes) {
        for (const [name, value] of element.attributes) {
            entries.push(" " + name);
            if (value !== null) {
                entries.push(`="${value}"`)
            }
        }
    }

    const dynamicAttributes = nodeData.get(element)?.dynamicAttributes;
    if (dynamicAttributes) {
        for (let [name, value] of dynamicAttributes) {
            const aliasedValue = cloneAST(value);
            aliasVariables(aliasedValue, dataVariable, locals);
            if (HTMLElement.booleanAttributes.has(name)) {
                entries.push({
                    condition: aliasedValue,
                    truthyRenderExpression: [" " + name],
                    falsyRenderExpression: [""]
                });
            } else {
                if (name === "data") continue;
                entries.push(" " + name);
                if (value !== null) {
                    entries.push(`="`);
                    entries.push({ value: aliasedValue });
                    entries.push(`"`);
                }
            }
        }
    }
    return entries;
}
