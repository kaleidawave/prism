import { FunctionDeclaration, ArgumentList } from "../../chef/javascript/components/constructs/function";
import { Expression, Operation, VariableReference } from "../../chef/javascript/components/value/expression";
import { Value, Type, ValueTypes } from "../../chef/javascript/components/value/value";
import { IEvent } from "../template";

const addVariable = new VariableReference("a");

function generateChangeEventCall(
    elementID: string, 
    eventName: string, 
    callback: ValueTypes, 
    wasDisabled: boolean
): Expression {
    const changeEventArgs = new ArgumentList([
        new VariableReference("this"),
        new Value(Type.string, elementID),
        new Value(Type.string, eventName),
        callback,
        addVariable,
    ]);

    if (wasDisabled) {
        changeEventArgs.args.push(new Value(Type.boolean, true));
    }
    
    return new Expression({
        lhs: new VariableReference("changeEvent"),
        operation: Operation.Call,
        rhs: changeEventArgs
    });
}

/**
 * Creates functions for binding events to ssr content
 */
export function buildEventBindings(
    events: Array<IEvent>,
    disableEventElements: boolean
): FunctionDeclaration {
    const handleEventListenersFunction = new FunctionDeclaration("handleEvents", ["a"]);

    for (const event of events) {
        // Bind the cb to "this" so that the data variable exist, rather than being bound the event invoker
        let callback: ValueTypes;
        if (event.existsOnComponentClass) {
            callback = new Expression({
                lhs: VariableReference.fromChain("this", event.callback.name, "bind"),
                operation: Operation.Call,
                rhs: new ArgumentList([new VariableReference("this")])
            });
        } else {
            callback = event.callback;
        }

        const eventChangeCall = generateChangeEventCall(
            event.nodeIdentifier,
            event.eventName,
            callback,
            event.required && disableEventElements
        );

        handleEventListenersFunction.statements.push(eventChangeCall);
    }

    return handleEventListenersFunction;
}