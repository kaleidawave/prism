import { HTMLElement, TextNode, HTMLDocument, HTMLComment, Node } from "../../chef/html/html";
import { ValueTypes } from "../../chef/javascript/components/value/value";
import { VariableReference } from "../../chef/javascript/components/value/variable";
import { aliasVariables, cloneAST } from "../../chef/javascript/utils/variables";
import { NodeData } from "../template";
import { ForIteratorExpression } from "../../chef/javascript/components/statements/for";
import { IFunctionDeclaration } from "../../chef/abstract-asts";

const dataVariable = new VariableReference("data");

export type ServerRenderChunk = string
    | ConditionalServerRenderExpression
    | LoopServerRenderExpression
    | ServerRenderExpression
    | FunctionCallServerRenderExpression;

export type ServerRenderedChunks = Array<ServerRenderChunk>;

export interface IServerRenderSettings {
    minify: boolean,
    addDisableToElementWithEvents: boolean
}

export interface ServerRenderExpression {
    value: ValueTypes,
    escape: boolean
}

export interface FunctionCallServerRenderExpression {
    func: IFunctionDeclaration,
    args: Map<string, ServerRenderChunk | ServerRenderedChunks | { argument: ValueTypes }>
}

export interface ConditionalServerRenderExpression {
    condition: ValueTypes,
    truthyRenderExpression: ServerRenderedChunks,
    falsyRenderExpression: ServerRenderedChunks
}

export interface LoopServerRenderExpression {
    subject: ValueTypes,
    variable: string,
    childRenderExpression: ServerRenderedChunks
}

function addChunk(chunk: ServerRenderChunk, chunks: Array<ServerRenderChunk>) {
    if (typeof chunk === "string" && chunks.length > 0 && typeof chunks[chunks.length - 1] === "string") {
        chunks[chunks.length - 1] += chunk;
    } else {
        chunks.push(chunk);
    }
}

/**
 * Builds parts to build up the template literal
 * TODO generator ???
 */
export function serverRenderPrismNode(
    element: Node | HTMLDocument,
    nodeData: WeakMap<Node, NodeData>,
    serverRenderSettings: IServerRenderSettings,
    locals: Array<VariableReference> = [],
    skipOverServerExpression: boolean = false
): ServerRenderedChunks {

    const chunks: ServerRenderedChunks = []; // Entries is unique for each execution for indentation benefits
    if (element instanceof HTMLElement) {

        const elementData = nodeData.get(element);

        if (elementData?.slotFor) {
            addChunk({ value: new VariableReference(`${elementData?.slotFor}Slot`), escape: false }, chunks);
            return chunks;
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
            const componentsData: ValueTypes | null = elementData.dynamicAttributes?.get("data") ?? null;

            // A render function for a component goes attributes, componentData, contentSlot, ...context. With all of those being optional apart from contentSlot
            const renderArgs: Map<string, ServerRenderedChunks | ServerRenderChunk | { argument: ValueTypes }> = new Map();

            renderArgs.set(
                "attributes", 
                element.attributes ? serverRenderNodeAttribute(element, nodeData, locals) : []
            );

            if (component.hasSlots) {
                const slotRenderFunction: ServerRenderedChunks = [];
                if (element.children.length > 0) {
                    for (let i = 0; i < element.children.length; i++) {
                        const child = element.children[i];
                        slotRenderFunction.push(
                            ...serverRenderPrismNode(child, nodeData, serverRenderSettings, locals)
                        );
                        if (!serverRenderSettings.minify && i !== element.children.length - 1) chunks.push("\n");
                    }
                }
                renderArgs.set("contentSlot", slotRenderFunction);
            }

            if (componentsData) {
                const aliasedData: ValueTypes = cloneAST(componentsData);
                aliasVariables(aliasedData, dataVariable, locals)
                renderArgs.set("data", { argument: aliasedData });
            }

            if (component.clientGlobals) {
                for (const clientGlobal of component.clientGlobals) {
                    renderArgs.set((clientGlobal[0].tail as VariableReference).name, { argument: clientGlobal[0] });
                }
            }

            chunks.push({
                func: component.serverRenderFunction!,
                args: renderArgs
            });

            return chunks;
        }

        addChunk(`<${element.tagName}`, chunks);

        serverRenderNodeAttribute(element, nodeData, locals).forEach(chunk => addChunk(chunk, chunks));

        // If the element has any events disable it by default TODO explain why
        if (serverRenderSettings.addDisableToElementWithEvents && elementData?.events?.some(event => event.required)) {
            addChunk(" disabled", chunks)
        }

        if (element.closesSelf) addChunk("/", chunks);
        addChunk(">", chunks);
        if (!serverRenderSettings.minify && element.children.length > 0) addChunk("\n    ", chunks);

        if (HTMLElement.selfClosingTags.has(element.tagName) || element.closesSelf) return chunks;

        if (elementData?.iteratorExpression) {
            const serverAliasedExpression: ForIteratorExpression = cloneAST(elementData.iteratorExpression);
            aliasVariables(serverAliasedExpression, dataVariable, locals);

            addChunk({
                subject: serverAliasedExpression.subject,
                variable: serverAliasedExpression.variable.name,
                childRenderExpression: serverRenderPrismNode(
                    element.children[0],
                    nodeData,
                    serverRenderSettings,
                    [serverAliasedExpression.variable.toReference(), ...locals]
                )
            }, chunks)
        } else if (elementData?.rawInnerHTML) {
            const aliasedRawInnerHTML: ValueTypes = cloneAST(elementData?.rawInnerHTML);
            aliasVariables(aliasedRawInnerHTML, dataVariable, locals);
            addChunk({
                value: aliasedRawInnerHTML,
                escape: false
            }, chunks);
        } else {
            for (const child of element.children) {
                const parts = serverRenderPrismNode(child, nodeData, serverRenderSettings, locals);
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
                parts.forEach(part => addChunk(part, chunks));
            }
        }
        if (!serverRenderSettings.minify && element.children.length > 0) addChunk("\n", chunks);
        addChunk(`</${element.tagName}>`, chunks);

    } else if (element instanceof TextNode) {
        const value = nodeData.get(element)?.textNodeValue;
        if (value) {
            const aliasedPart = cloneAST(value);
            aliasVariables(aliasedPart, dataVariable, locals);
            addChunk({ value: aliasedPart, escape: true }, chunks);
        } else {
            addChunk(element.text, chunks);
        }
    } else if (element instanceof HTMLComment) {
        // If the comment is used to fragment text nodes:
        if (nodeData.get(element)?.isFragment) {
            addChunk(`<!--${element.comment}-->`, chunks);
        }
    } else if (element instanceof HTMLDocument) {
        for (let i = 0; i < element.children.length; i++) {
            const child = element.children[i];
            serverRenderPrismNode(child, nodeData, serverRenderSettings, locals).forEach(chunk => addChunk(chunk, chunks));
            if (!serverRenderSettings.minify && i !== element.children.length - 1) addChunk("\n", chunks);
        }
    } else {
        throw Error(`Cannot build render string from construct ${(element as any).constructor.name}`)
    }
    return chunks;
}

export function serverRenderNodeAttribute(
    element: HTMLElement,
    nodeData: WeakMap<Node, NodeData>,
    locals: Array<VariableReference>
) {
    const chunks: ServerRenderedChunks = [];
    if (element.attributes) {
        for (const [name, value] of element.attributes) {
            addChunk(" " + name, chunks);
            if (value !== null) {
                addChunk(`="${value}"`, chunks)
            }
        }
    }
    const rawAttribute = nodeData.get(element)?.rawAttribute;
    if (rawAttribute) {
        addChunk(" ", chunks);
        addChunk({ value: rawAttribute, escape: true }, chunks);
    }

    const dynamicAttributes = nodeData.get(element)?.dynamicAttributes;
    if (dynamicAttributes) {
        for (let [name, value] of dynamicAttributes) {
            const aliasedValue = cloneAST(value);
            aliasVariables(aliasedValue, dataVariable, locals);
            if (HTMLElement.booleanAttributes.has(name)) {
                addChunk({
                    condition: aliasedValue,
                    truthyRenderExpression: [" " + name],
                    falsyRenderExpression: [""]
                }, chunks);
            } else {
                if (name === "data") continue;
                addChunk(" " + name, chunks);
                if (value !== null) {
                    addChunk(`="`, chunks);
                    addChunk({ value: aliasedValue, escape: true }, chunks);
                    addChunk(`"`, chunks);
                }
            }
        }
    }
    return chunks;
}
