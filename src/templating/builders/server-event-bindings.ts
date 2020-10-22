import { FunctionDeclaration, ArgumentList } from "../../chef/javascript/components/constructs/function";
import { Expression, Operation } from "../../chef/javascript/components/value/expression";
import { VariableReference } from "../../chef/javascript/components/value/variable";
import { Value, Type, IValue } from "../../chef/javascript/components/value/value";
import { IEvent, NodeData } from "../template";
import { Node } from "../../chef/html/html";
import { newOptionalVariableReferenceFromChain } from "../../chef/javascript/utils/variables";

/**
 * Creates functions for binding events to ssr content
 */
export function buildEventBindings(
    events: Array<IEvent>,
    nodeData: WeakMap<Node, NodeData>,
    disableEventElements: boolean
): [FunctionDeclaration, FunctionDeclaration] {
    const bindEventListenersFunction = new FunctionDeclaration("bindEventListeners");
    const unbindEventListenersFunction = new FunctionDeclaration("unbindEventListeners");

    for (const event of events) {
        const getElementExpression = new Expression({
            lhs: VariableReference.fromChain("this", "getElem"),
            operation: Operation.Call,
            rhs: new ArgumentList([new Value(event.nodeIdentifier, Type.string)])
        });

        // Bind the cb to "this" so that the data variable exist, rather than being bound the event invoker
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

        let addEventListenerExpression: Expression;

        const { multiple, nullable } = nodeData.get(event.element) ?? {};

        if (multiple) {
            // TODO forEach getElementExpression
            throw Error("Not implemented - event listeners on elements tagged with multiple");
        } else {
            addEventListenerExpression = new Expression({
                lhs: nullable ?
                    newOptionalVariableReferenceFromChain(getElementExpression, "addEventListener") :
                    VariableReference.fromChain(getElementExpression, "addEventListener"),
                operation: nullable ? Operation.OptionalCall : Operation.Call,
                rhs: new ArgumentList([
                    new Value(event.event, Type.string),
                    callback
                ])
            });

            bindEventListenersFunction.statements.push(addEventListenerExpression);

            // Enable the component now that its functionality is available
            if (event.required && disableEventElements) {
                const enableComponent = new Expression({
                    lhs: nullable ?
                        newOptionalVariableReferenceFromChain(getElementExpression, "removeAttribute") :
                        VariableReference.fromChain(getElementExpression, "removeAttribute"),
                    operation: nullable ? Operation.OptionalCall : Operation.Call,
                    rhs: new ArgumentList([new Value("disabled", Type.string)])
                });

                bindEventListenersFunction.statements.push(enableComponent);
            }
        }

        let removeEventListenerExpression: Expression;

        // TODO has a lot of overlap with the creation of the addEventListener expression creation
        if (multiple) {
            // TODO forEach remove thing
            throw Error("Not implemented - event listeners on elements tagged with multiple");
        } else {
            removeEventListenerExpression = new Expression({
                lhs: nullable ?
                    newOptionalVariableReferenceFromChain(getElementExpression, "removeEventListener") :
                    VariableReference.fromChain(getElementExpression, "removeEventListener"),
                operation: nullable ? Operation.OptionalCall : Operation.Call,
                rhs: new ArgumentList([
                    new Value(event.event, Type.string),
                    callback
                ])
            });
        }

        unbindEventListenersFunction.statements.push(removeEventListenerExpression)
    }

    return [bindEventListenersFunction, unbindEventListenersFunction];
}