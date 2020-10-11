import { HTMLElement, TextNode, HTMLDocument, HTMLComment } from "../../chef/html/html";
import { PrismNode, PrismComment, PrismHTMLElement } from "../template";
import { TemplateLiteral } from "../../chef/javascript/components/value/template-literal";
import { IValue, Value, Type } from "../../chef/javascript/components/value/value";
import { VariableReference } from "../../chef/javascript/components/value/variable";
import { Expression, Operation } from "../../chef/javascript/components/value/expression";
import { ForIteratorExpression } from "../../chef/javascript/components/statements/for";
import { FunctionDeclaration, ArgumentList } from "../../chef/javascript/components/constructs/function";
import { ReturnStatement } from "../../chef/javascript/components/statements/statement";
import { settings } from "../../settings";
import { aliasVariables, cloneAST } from "../../chef/javascript/utils/variables";

const dataVariable = new VariableReference("data");

/**
 * Generates a template literal with relevant interpolation of variables that when run will generate ssr html
 * TODO maybe combine with buildPartsFromNode
 * TODO indention for map and stuff
 * @param template The <template> prism node to render
 * @param minify Will not prettify the output in the template literal
 * @param dynamicAttribute If true will add a ${attributes} onto the top tag attribute. Kinda temp but doing it later breaks because template literal collapsation 
 */
export function serverRenderPrismNode(template: PrismNode | HTMLDocument, locals: Array<VariableReference> = [], minify = true, dynamicAttribute = false,): TemplateLiteral {
    const parts = buildServerTemplateLiteralShards(template, locals, minify);
    if (dynamicAttribute) {
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
    element: PrismNode | HTMLDocument,
    locals: Array<VariableReference>,
    minify: boolean = true,
): Array<string | IValue> {

    const entries: Array<string | IValue> = []; // Entries is unique for each execution for indentation benefits
    if (element instanceof HTMLElement) {

        if (element.slotFor) {
            entries.push(new VariableReference(`${element.slotFor}Slot`));
            return entries;
        }

        // If node
        if (element.serverExpression && !(element.serverExpression instanceof ForIteratorExpression)) {
            // TODO very temp removal of the elements clientExpression to not clash 
            const serverExpression = element.serverExpression;
            delete element.serverExpression;
            const renderTruthyChild = serverRenderPrismNode(element as PrismHTMLElement, locals, minify);
            element.serverExpression = serverExpression;

            const renderFalsyChild = serverRenderPrismNode(element.elseElement!, locals, minify);

            return [new Expression({
                lhs: serverExpression,
                operation: Operation.Ternary,
                rhs: new ArgumentList([renderTruthyChild, renderFalsyChild])
            })];
        }

        if (element.component) {

            // Components data
            const componentsData: IValue | null =  element.dynamicAttributes?.get("data") ?? null;

            // A render function for a component goes attributes, componentData, contentSlot, ...context. With all of those being optional apart from contentSlot

            const renderArgs: Map<string, IValue> = new Map();

            renderArgs.set("attributes", new TemplateLiteral(serverRenderNodeAttribute(element, locals)));

            if (element.component.hasSlots) {
                const slotRenderFunction: Array<string | IValue> = [];
                if (element.children.length > 0) {
                    for (let i = 0; i < element.children.length; i++) {
                        const child = element.children[i] as PrismNode;
                        slotRenderFunction.push(...buildServerTemplateLiteralShards(child, locals, minify));
                        if (!minify && i !== element.children.length - 1) entries.push("\n");
                    }
                }
                renderArgs.set("contentSlot", new TemplateLiteral(slotRenderFunction));
            }

            if (componentsData) {
                const aliasedData = cloneAST(componentsData);
                aliasVariables(aliasedData, dataVariable, locals)
                renderArgs.set("data", aliasedData);
            }

            if (element.component.clientGlobals) {
                for (const clientGlobal of element.component.clientGlobals) {
                    renderArgs.set((clientGlobal.tail as VariableReference).name, clientGlobal);
                }
            }

            // buildArgumentListFromArguments means that the order of arguments does not matter
            const renderComponentFunction = new Expression({
                lhs: new VariableReference(element.component.serverRenderFunction!.name!.name!),
                operation: Operation.Call,
                rhs: element.component.serverRenderFunction!.buildArgumentListFromArguments(renderArgs)
            });

            entries.push(renderComponentFunction);
            return entries;
        }

        entries.push(`<${element.tagName}`);

        entries.push(...serverRenderNodeAttribute(element, locals))

        // If the element has any events disable it by default TODO explain why
        // TODO possibly add during template parse
        if (element.events?.some(event => event.required) && settings.disableEventElements) {
            entries.push(" disabled")
        }

        if (element.closesSelf) entries.push("/");
        entries.push(">");
        if (!minify && element.children.length > 0) entries.push("\n    ");

        if (HTMLElement.selfClosingTags.has(element.tagName) || element.closesSelf) return entries;

        if (element.serverExpression && element.serverExpression instanceof ForIteratorExpression) {
            entries.push(
                new Expression({
                    lhs: new VariableReference("join", new Expression({
                        lhs: new VariableReference("map", element.serverExpression.subject),
                        operation: Operation.Call,
                        rhs: new FunctionDeclaration(
                            null,
                            [element.serverExpression.variable],
                            [new ReturnStatement(
                                new TemplateLiteral(buildServerTemplateLiteralShards(element.children[0] as PrismHTMLElement, [element.serverExpression.variable.toReference(), ...locals], minify))
                            )],
                            { bound: false }
                        )
                    })),
                    operation: Operation.Call,
                    rhs: new Value("", Type.string)
                })
            );
        } else {
            for (const child of element.children as Array<PrismNode>) {
                const parts = buildServerTemplateLiteralShards(child, locals, minify);
                // Indent children
                if (!minify) {
                    for (let i = 0; i < parts.length; i++) {
                        if (typeof parts[i] === "string" && (parts[i] as string).startsWith("\n")) {
                            parts[i] = parts[i] + " ".repeat(4);
                        }
                    }
                    if (child.next) {
                        const isFragment = 
                            (child instanceof HTMLComment && child.isFragment && child.next instanceof TextNode) || 
                            (child instanceof TextNode && child.next instanceof HTMLComment && (child.next as PrismComment).isFragment);
                        if (!isFragment) {
                            parts.push("\n" + " ".repeat(4));
                        }
                    }
                }
                entries.push(...parts);
            }
        }
        if (!minify && element.children.length > 0) entries.push("\n");
        entries.push(`</${element.tagName}>`);

    } else if (element instanceof TextNode) {
        if (element.value) {
            if (element.value instanceof TemplateLiteral) {
                for (const part of element.value.entries) {
                    if (typeof part === "string") {
                        entries.push(part);
                    } else {
                        const aliasedPart = cloneAST(part);
                        aliasVariables(aliasedPart, dataVariable, locals);
                        entries.push(wrapWithEscapeValue(aliasedPart));
                    }
                }
            } else {
                const aliasedPart = cloneAST(element.value!);
                aliasVariables(aliasedPart, dataVariable, locals);
                entries.push(wrapWithEscapeValue(aliasedPart));
            }
        } else {
            entries.push(element.text);
        }
    } else if (element instanceof HTMLComment) {
        // If the comment is used to fragment text nodes:
        if (element.isFragment) {
            entries.push(`<!--${element.comment}-->`);
        }
    } else if (element instanceof HTMLDocument) {
        for (let i = 0; i < element.children.length; i++) {
            const child = element.children[i];
            entries.push(...buildServerTemplateLiteralShards(child as PrismNode, locals, minify));
            if (!minify && i !== element.children.length - 1) entries.push("\n");
        }
    } else {
        throw Error(`Cannot build render string from construct ${(element as any).constructor.name}`)
    }
    return entries;
}

export function serverRenderNodeAttribute(element: PrismHTMLElement, locals: Array<VariableReference>) {
    const entries: Array<string | IValue> = [];
    if (element.attributes) {
        for (const [name, value] of element.attributes) {
            entries.push(" " + name);
            if (value !== null) {
                entries.push(`="${value}"`)
            }
        }
    }
    if (element.dynamicAttributes) {
        for (let [name, value] of element.dynamicAttributes) {
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
