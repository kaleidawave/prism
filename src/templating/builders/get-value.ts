import { IBinding, NodeData, ValueAspect, VariableReferenceArray } from "../template";
import { IValue, Value, Type } from "../../chef/javascript/components/value/value";
import { VariableReference } from "../../chef/javascript/components/value/variable";
import { buildReverseFunction, compileIIFE } from "../../chef/javascript/utils/reverse";
import { getElement } from "../helpers";
import { Expression, Operation } from "../../chef/javascript/components/value/expression";
import { ArgumentList } from "../../chef/javascript/components/constructs/function";
import { ForIteratorExpression } from "../../chef/javascript/components/statements/for";
import { IType } from "../../chef/javascript/utils/types";
import { HTMLElement, Node } from "../../chef/html/html";
import { newOptionalVariableReference, newOptionalVariableReferenceFromChain } from "../../chef/javascript/utils/variables";
import { Group } from "../../chef/javascript/components/value/group";
import { IFinalPrismSettings } from "../../settings";

export function makeGetFromBinding(
    binding: IBinding,
    nodeData: WeakMap<Node, NodeData>,
    dataType: IType,
    variable: VariableReferenceArray,
    settings: IFinalPrismSettings
): IValue {

    // If the element is multiple get the "pivot" of that element and building a chain
    const elementStatement = getElement(binding.element, nodeData);
    const isElementNullable: boolean = nodeData.get(binding.element)?.nullable ?? false;

    let getSource: IValue;
    switch (binding.aspect) {
        case ValueAspect.InnerText:
            if (isElementNullable) {
                getSource = newOptionalVariableReferenceFromChain(
                    elementStatement,
                    "childNodes",
                    binding.fragmentIndex!,
                    "data"
                );
            } else {
                getSource = VariableReference.fromChain(
                    elementStatement,
                    "childNodes",
                    binding.fragmentIndex!,
                    "data"
                );
            }
            break;
        case ValueAspect.Attribute:
            const attribute = binding.attribute!;
            if (HTMLElement.booleanAttributes.has(attribute)) {
                getSource = isElementNullable ? newOptionalVariableReference("data", elementStatement) : new VariableReference("data", elementStatement);
            } else {
                const getAttributeRef = isElementNullable ? newOptionalVariableReference("getAttribute", elementStatement) : new VariableReference("getAttribute", elementStatement);
                getSource = new Expression({
                    lhs: getAttributeRef,
                    operation: isElementNullable ? Operation.OptionalCall : Operation.Call,
                    rhs: new ArgumentList([new Value(attribute, Type.string)])
                });
            }
            break;
        case ValueAspect.Data:
            getSource = isElementNullable ? 
                newOptionalVariableReference("data", elementStatement) : 
                new VariableReference("data", elementStatement);
            break;
        case ValueAspect.Conditional:
            getSource = new Expression({
                lhs: elementStatement,
                operation: Operation.NotEqual,
                rhs: new Value(null, Type.object)
            });
        default:
            throw Error(`Not implemented - get hookup for binding of type ${ValueAspect[binding.aspect]}`)
    }

    let value: IValue
    if (dataType.name === "number") {
        value = new Expression({
            lhs: new VariableReference("parseFloat"),
            operation: Operation.Call,
            rhs: getSource
        });
    } else if (dataType.name === "Date") {
        value = new Expression({
            lhs: new VariableReference("Date"),
            operation: Operation.Initialize,
            rhs: getSource
        });
    } else if (dataType.name === "boolean") {
        // Temp fix for the fact data attributes (which are not in HTMLElement.booleanAttribute set)
        // will be rendered out like data-post-liked="true" or data-post-liked="false"
        if (binding.aspect === ValueAspect.Attribute && !HTMLElement.booleanAttributes.has(binding.attribute!)) {
            value = new Expression({
                lhs: getSource,
                operation: Operation.StrictEqual,
                rhs: new Value("true", Type.string)
            });
        } else {
            value = new Expression({
                lhs: getSource,
                operation: Operation.StrictNotEqual,
                rhs: new Value(null, Type.object)
            });
        }
    } else if (dataType.name === "string" && !settings.minify) {
        value = new Expression({
            lhs: new VariableReference("trim", getSource),
            operation: isElementNullable ? Operation.OptionalCall : Operation.Call
        });
    } else {
        value = getSource;
    }

    // If not a variable reference try build a reverser for the value
    if (!(binding.expression instanceof VariableReference) && !(binding.expression instanceof ForIteratorExpression)) {
        // "buildReverseFunction" will throw error if the expression cannot be reversed 
        const reversedExpressionFunction = buildReverseFunction(binding.expression as IValue);

        // Invoke the reverseFunction with the evaluate output (which is value)
        const iife = new Expression({
            lhs: new Group(reversedExpressionFunction),
            operation: Operation.Call,
            rhs: value
        });

        // Can reduce the function by replace the paramter variables with the arguments
        value = compileIIFE(iife);
    }

    return value;
}

/**
 * Returns a expression that will be used to get the length of array using
 */
export function getLengthFromIteratorBinding(binding: IBinding, nodeData: WeakMap<Node, NodeData>): IValue {
    if (binding.aspect !== ValueAspect.Iterator) throw Error("Expected iterator binding");

    const getElemExpression = getElement(binding.element, nodeData);

    // TODO this a temp fix for some conditionals being based on empty arrays but
    // makes the assumption that if parent component is not rendered due to #if="someArr.length > 0"
    if (nodeData.get(binding.element)?.nullable) {
        return new Expression({
            lhs: new Expression({
                lhs: new Expression({
                    lhs: getElemExpression,
                    operation: Operation.OptionalChain,
                    rhs: new VariableReference("children")
                }),
                operation: Operation.OptionalChain,
                rhs: new VariableReference("length")
            }),
            operation: Operation.NullCoalescing,
            rhs: new Value(0, Type.number)
        });
    } else {
        return new VariableReference("length", new VariableReference("children", getElemExpression));
    }
}