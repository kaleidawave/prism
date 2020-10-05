import { HTMLElement, TextNode, HTMLComment } from "../../chef/html/html";
import { Expression, Operation } from "../../chef/javascript/components/value/expression";
import { VariableReference } from "../../chef/javascript/components/value/variable";
import { Value, IValue, Type } from "../../chef/javascript/components/value/value";
import { FunctionDeclaration, ArgumentList } from "../../chef/javascript/components/constructs/function";
import { ObjectLiteral } from "../../chef/javascript/components/value/object";
import { PrismNode, PrismHTMLElement } from "../template";
import { cloneAST, aliasVariables } from "../../chef/javascript/utils/variables";
import { ForIteratorExpression } from "../../chef/javascript/components/statements/for";
import { ReturnStatement } from "../../chef/javascript/components/statements/statement";
import { thisDataVariable } from "../helpers";

/**
 * Adds render method to existing class component definition
 * @param template The <template> element from the Prism
 * @param aliasDataToThis given data variables point them towards this 
 */
export function buildClientRenderMethod(template: PrismHTMLElement, aliasDataToThis: boolean, locals: Array<VariableReference> = []): FunctionDeclaration {
    if (template instanceof HTMLComment) throw Error();

    const statements: Array<Expression> = [];
    for (const child of template.children as Array<PrismNode>) {
        const clientChildRendered = clientRenderPrismNode(child, aliasDataToThis, locals);
        if (clientChildRendered === null) continue;

        let statement: Expression;
        // Convert `yield ...abc` to `yield* abc`
        if (clientChildRendered instanceof Expression && clientChildRendered.operation === Operation.Spread) {
            statement = new Expression({
                operation: Operation.DelegatedYield,
                lhs: clientChildRendered.lhs,
            });
        } else {
            statement = new Expression({
                operation: Operation.Yield,
                lhs: clientChildRendered,
            });
        }
        statements.push(statement);
    }

    return new FunctionDeclaration("render", [], statements, { isGenerator: true });
}

/**
 * Generated the call for rendering a node (element, text node or comment)
 * If not needed will return null (TODO temp element should not exist at all)
 */
export function clientRenderPrismNode(element: PrismNode, aliasDataToThis: boolean = false, locals: Array<VariableReference> = []): IValue {
    if (element instanceof HTMLElement) {
        // If slot then use then loaded slotted element
        if (element.tagName === "slot") {
            return new Expression({
                operation: Operation.Spread,
                lhs: VariableReference.fromChain("this", "slotElement")
            });
        }

        // Pointer to the h minified render function included in prism bundle under `render.ts`
        const renderFunction = new VariableReference("h");

        // The render function (h) second argument takes 0 (falsy) if no attributes, string for a single class name and a object literal of attribute to value pairs. Mostly for minification purposes
        const attrs: Array<[string, IValue]> = [];
        if (element.attributes) {
            for (const [name, value] of element.attributes) {
                if (HTMLElement.booleanAttributes.has(name)) {
                    attrs.push([name, new Value(true, Type.boolean)])
                } else {
                    attrs.push([name, new Value(value ?? "", Type.string)])
                }
            }
        }

        if (element.dynamicAttributes) {
            for (const [key, value] of element.dynamicAttributes) {
                if (aliasDataToThis) {
                    // Value reference is also used a lot so due to aliasVariables doing it in place best to clone it to prevent side effects
                    const clonedValue = cloneAST(value);
                    aliasVariables(clonedValue, thisDataVariable, locals);
                    attrs.push([key, clonedValue]);
                } else {
                    attrs.push([key, value]);
                }
            }
        }

        const attributeArgument: IValue = attrs.length > 0 ?
            new ObjectLiteral(new Map(attrs)) :
            new Value(0, Type.number); // 0 is used as a falsy value;

        let eventArgument: IValue;
        if (element.events) {
            eventArgument = new ObjectLiteral(
                new Map(
                    element.events.map(event => {
                        let callback: IValue;
                        if (event.existsOnComponentClass) {
                            callback = new Expression({
                                lhs: VariableReference.fromChain("this", event.callback.name, "bind"),
                                operation: Operation.Call,
                                rhs: new ArgumentList([new VariableReference("this")])
                            });
                        } else {
                            callback = event.callback;
                        }
                        return [event.event, callback];
                    })
                )
            );
        } else {
            eventArgument = new Value(0, Type.number);
        }

        // TODO explain
        let childrenArgument: Array<IValue>;
        if (element.clientExpression) {
            if (element.clientRenderMethod) {
                if (element.clientExpression instanceof ForIteratorExpression) {
                    childrenArgument = [
                        new Expression({
                            operation: Operation.Spread,
                            lhs: new Expression({
                                lhs: new VariableReference("map", element.clientExpression.subject),
                                operation: Operation.Call,
                                rhs: VariableReference.fromChain("this", "render" + element.clientRenderMethod)
                            })
                        })
                    ];
                } else {
                    return new Expression({
                        lhs: VariableReference.fromChain("this", "render" + element.clientRenderMethod),
                        operation: Operation.Call,
                    });
                }
            } else {
                if (element.clientExpression instanceof ForIteratorExpression) {
                    childrenArgument = [
                        new Expression({ 
                            operation: Operation.Spread, 
                            lhs: new Expression({
                                lhs: new VariableReference("map", element.clientExpression.subject),
                                operation: Operation.Call,
                                rhs: new FunctionDeclaration(
                                    null,
                                    [element.clientExpression.variable],
                                    [new ReturnStatement(
                                        clientRenderPrismNode(element.children[0] as PrismHTMLElement, aliasDataToThis, locals)
                                    )],
                                    { bound: false }
                                )
                            }) 
                        })
                    ];
                } else {
                    // TODO very temp removal of the elements clientExpression to not clash 
                    const clientExpression = element.clientExpression;
                    delete element.clientExpression;
                    const renderTruthyChild = clientRenderPrismNode(element, aliasDataToThis, locals);
                    element.clientExpression = clientExpression;

                    const renderFalsyChild = clientRenderPrismNode(element.elseElement!, aliasDataToThis, locals);

                    return new Expression({
                        lhs: element.clientExpression,
                        operation: Operation.Ternary,
                        rhs: new ArgumentList([
                            renderTruthyChild,
                            renderFalsyChild
                        ])
                    })
                }
            }
        } else {
            // TODO explain including case where children.length === 0
            childrenArgument = element.children.map(
                (element: PrismNode) => clientRenderPrismNode(element, aliasDataToThis, locals))
        }


        // TODO trim trailing 0's

        // Arguments for: h(tagname: string, attribute: 0 | string | object, events: 0 | object, ...children: Array<string>)
        const argumentList = new ArgumentList([
            new Value(element.tagName, Type.string),
            attributeArgument,
            eventArgument,
            ...childrenArgument
        ]);

        return new Expression({
            lhs: renderFunction,
            operation: Operation.Call,
            rhs: argumentList
        });

    } else if (element instanceof TextNode) {
        if (element.value && aliasDataToThis) {
            const clonedValue = cloneAST(element.value);
            aliasVariables(clonedValue, thisDataVariable, locals);
            return clonedValue;
        }
        return element.value ?? new Value(element.text, Type.string);
    } else if (element instanceof HTMLComment) {
        if (!element.fragment) throw Error("");
        // This used to maintain the same structure as server rendered content
        return new Expression({
            lhs: new VariableReference("createComment"), // Create comment function in render.ts
            operation: Operation.Call,
            rhs: element.comment ? new Value(element.comment, Type.string) : new ArgumentList
        });
    } else {
        throw Error(`Unsupported building of ${element!.constructor.name}`)
    }
}