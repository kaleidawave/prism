import { FunctionDeclaration, ArgumentList } from "../../chef/javascript/components/constructs/function";
import { Expression, Operation } from "../../chef/javascript/components/value/expression";
import { VariableReference } from "../../chef/javascript/components/value/variable";
import { Value, Type, IValue } from "../../chef/javascript/components/value/value";
import { IEvent } from "../template";
import { settings } from "../../settings";

/**
 * Creates functions for binding events to ssr content
 */
export function buildEventBindings(events: Array<IEvent>): [FunctionDeclaration, FunctionDeclaration] {
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

        if (event.element.multiple) {
            // TODO forEach getElementExpression
            throw Error("Not implemented - event listeners on elements tagged with multiple");
        } else {
            addEventListenerExpression = new Expression({
                lhs: event.element.nullable ? new Expression({
                    lhs: getElementExpression,
                    operation: Operation.OptionalChain,
                    rhs: new VariableReference("addEventListener")
                }) : new VariableReference("addEventListener", getElementExpression),
                operation: Operation.Call,
                rhs: new ArgumentList([
                    new Value(event.event, Type.string),
                    callback
                ])
            });

            bindEventListenersFunction.statements.push(addEventListenerExpression);

            // Enable the component now that its functionality is available
            if (event.required && settings.disableEventElements) {
                const enableComponent = new Expression({
                    lhs: event.element.nullable ? new Expression({
                        lhs: getElementExpression,
                        operation: Operation.OptionalChain,
                        rhs: new VariableReference("removeAttribute")
                    }) : new VariableReference("removeAttribute", getElementExpression),
                    operation: Operation.Call,
                    rhs: new ArgumentList([new Value("disabled", Type.string)])
                });

                bindEventListenersFunction.statements.push(enableComponent);
            }
        }

        let removeEventListenerExpression: Expression;

        // TODO has a lot of overlap with the creation of the addEventListener expression creation
        if (event.element.multiple) {
            // TODO forEach remove thing
            throw Error("Not implemented - event listeners on elements tagged with multiple");
        } else {
            removeEventListenerExpression = new Expression({
                lhs: event.element.nullable ? new Expression({
                    lhs: getElementExpression,
                    operation: Operation.OptionalChain,
                    rhs: new VariableReference("removeEventListener")
                }) : new VariableReference("removeEventListener", getElementExpression),
                operation: Operation.Call,
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