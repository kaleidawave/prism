import { HTMLElement, TextNode, HTMLDocument, HTMLComment, Node } from "../../chef/html/html";
import { TemplateLiteral } from "../../chef/javascript/components/value/template-literal";
import { IValue, Value, Type } from "../../chef/javascript/components/value/value";
import { VariableReference } from "../../chef/javascript/components/value/variable";
import { Expression, Operation } from "../../chef/javascript/components/value/expression";
import { ForIteratorExpression } from "../../chef/javascript/components/statements/for";
import { FunctionDeclaration, ArgumentList } from "../../chef/javascript/components/constructs/function";
import { ReturnStatement } from "../../chef/javascript/components/statements/statement";
import { aliasVariables, cloneAST } from "../../chef/javascript/utils/variables";
import { NodeData } from "../template";

const dataVariable = new VariableReference("data");

export interface IServerRenderSettings {
    dynamicAttribute: boolean,
    minify: boolean,
    addDisableToElementWithEvents: boolean
}

/**
 * Generates a template literal with relevant interpolation of variables that when run will generate ssr html
 * TODO maybe combine with buildPartsFromNode
 * TODO indention for map and stuff
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
): TemplateLiteral {
    const parts = buildServerTemplateLiteralShards(template, nodeData, serverRenderSettings, locals, skipOverServerExpression);
    if (serverRenderSettings.minify) {
        parts.splice(1, 0, new VariableReference("attributes"));
    }
    return new TemplateLiteral(parts);
}

/**
 * Wraps IValue in a escapeValue function. The escape value function escapes html
 * @param value 
 * @example `abc` -> `escape(abc)`
 */
function wrapWithEscapeValue(value: IValue): Expression {
    return new Expression({
        lhs: new VariableReference("escape"),
        operation: Operation.Call,
        rhs: value
    });
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
): Array<string | IValue> {

    const entries: Array<string | IValue> = []; // Entries is unique for each execution for indentation benefits
    if (element instanceof HTMLElement) {

        const elementData = nodeData.get(element);

        if (elementData?.slotFor) {
            entries.push(new VariableReference(`${elementData?.slotFor}Slot`));
            return entries;
        }

        // If node
        if (elementData?.conditionalRoot && !skipOverServerExpression) {
            // TODO very temp removal of the elements clientExpression to not clash 
            const renderTruthyChild = serverRenderPrismNode(element, nodeData, serverRenderSettings, locals, true);
            const renderFalsyChild = serverRenderPrismNode(elementData.elseElement!, nodeData, serverRenderSettings, locals);

            return [
                new Expression({
                    lhs: elementData.serverExpression as IValue,
                    operation: Operation.Ternary,
                    rhs: new ArgumentList([renderTruthyChild, renderFalsyChild])
                })
            ];
        }

        if (elementData?.component) {
            const component = elementData.component;

            // Components data
            const componentsData: IValue | null = elementData.dynamicAttributes?.get("data") ?? null;

            // A render function for a component goes attributes, componentData, contentSlot, ...context. With all of those being optional apart from contentSlot

            const renderArgs: Map<string, IValue> = new Map();

            renderArgs.set("attributes", new TemplateLiteral(serverRenderNodeAttribute(element, nodeData, locals)));

            if (component.hasSlots) {
                const slotRenderFunction: Array<string | IValue> = [];
                if (element.children.length > 0) {
                    for (let i = 0; i < element.children.length; i++) {
                        const child = element.children[i];
                        slotRenderFunction.push(
                            ...buildServerTemplateLiteralShards(child, nodeData, serverRenderSettings, locals)
                        );
                        if (!serverRenderSettings.minify && i !== element.children.length - 1) entries.push("\n");
                    }
                }
                renderArgs.set("contentSlot", new TemplateLiteral(slotRenderFunction));
            }

            if (componentsData) {
                const aliasedData = cloneAST(componentsData);
                aliasVariables(aliasedData, dataVariable, locals)
                renderArgs.set("data", aliasedData);
            }

            if (component.clientGlobals) {
                for (const clientGlobal of component.clientGlobals) {
                    renderArgs.set((clientGlobal.tail as VariableReference).name, clientGlobal);
                }
            }

            // buildArgumentListFromArguments means that the order of arguments does not matter
            const renderComponentFunction = new Expression({
                lhs: new VariableReference(component.serverRenderFunction!.name!.name!),
                operation: Operation.Call,
                rhs: component.serverRenderFunction!.buildArgumentListFromArguments(renderArgs)
            });

            entries.push(renderComponentFunction);
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

        if (elementData?.iteratorRoot) {
            const expression = elementData.serverExpression as ForIteratorExpression;
            entries.push(
                new Expression({
                    lhs: new VariableReference("join", new Expression({
                        lhs: new VariableReference("map", expression.subject),
                        operation: Operation.Call,
                        rhs: new FunctionDeclaration(
                            null,
                            [expression.variable],
                            [new ReturnStatement(
                                new TemplateLiteral(
                                    buildServerTemplateLiteralShards(
                                        element.children[0],
                                        nodeData,
                                        serverRenderSettings,
                                        [expression.variable.toReference(), ...locals]
                                    )
                                )
                            )],
                            { bound: false }
                        )
                    })),
                    operation: Operation.Call,
                    rhs: new Value("", Type.string)
                })
            );
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
            if (value instanceof TemplateLiteral) {
                for (const part of value.entries) {
                    if (typeof part === "string") {
                        entries.push(part);
                    } else {
                        const aliasedPart = cloneAST(part);
                        aliasVariables(aliasedPart, dataVariable, locals);
                        entries.push(wrapWithEscapeValue(aliasedPart));
                    }
                }
            } else {
                const aliasedPart = cloneAST(value);
                aliasVariables(aliasedPart, dataVariable, locals);
                entries.push(wrapWithEscapeValue(aliasedPart));
            }
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
    const entries: Array<string | IValue> = [];
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
                entries.push(new Expression({
                    lhs: aliasedValue,
                    operation: Operation.Ternary,
                    rhs: new ArgumentList([
                        new Value(" " + name, Type.string),
                        new Value("", Type.string)
                    ])
                }));
            } else {
                if (name === "data") continue;
                entries.push(" " + name);
                if (value !== null) {
                    entries.push(`="`);
                    entries.push(wrapWithEscapeValue(aliasedValue));
                    entries.push(`"`);
                }
            }
        }
    }
    return entries;
}
