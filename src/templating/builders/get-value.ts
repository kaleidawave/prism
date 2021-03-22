import { IBinding, NodeData, BindingAspect, VariableReferenceArray } from "../template";
import { ValueTypes, Value, Type } from "../../chef/javascript/components/value/value";
import { buildReverseFunction, compileIIFE } from "../../chef/javascript/utils/reverse";
import { getElement } from "../helpers";
import { Expression, Operation, VariableReference } from "../../chef/javascript/components/value/expression";
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
    variableChain: VariableReferenceArray,
    settings: IFinalPrismSettings
): ValueTypes | null {

    // If the element is multiple get the "pivot" of that element and building a chain
    const elementStatement = binding.element ? getElement(binding.element, nodeData) : null; 
    const isElementNullable = binding.element ? nodeData.get(binding.element)?.nullable ?? false : false;

    let getSource: ValueTypes;
    switch (binding.aspect) {
        case BindingAspect.InnerText:
            if (typeof binding.fragmentIndex === "undefined") throw Error("Encountered binding with invalid fragment index");
            if (isElementNullable) {
                getSource = newOptionalVariableReferenceFromChain(
                    elementStatement!,
                    "childNodes",
                    binding.fragmentIndex,
                    "data"
                );
            } else {
                getSource = VariableReference.fromChain(
                    elementStatement!,
                    "childNodes",
                    binding.fragmentIndex,
                    "data"
                );
            }
            break;
        case BindingAspect.Attribute:
            const attribute = binding.attribute!;
            if (HTMLElement.booleanAttributes.has(attribute)) {
                getSource = isElementNullable ? newOptionalVariableReference("data", elementStatement!) : new VariableReference("data", elementStatement!);
            } else {
                const getAttributeRef = isElementNullable ? newOptionalVariableReference("getAttribute", elementStatement!) : new VariableReference("getAttribute", elementStatement!);
                getSource = new Expression({
                    lhs: getAttributeRef,
                    operation: isElementNullable ? Operation.OptionalCall : Operation.Call,
                    rhs: new ArgumentList([new Value(Type.string, attribute)])
                });
            }
            break;
        case BindingAspect.Data:
            getSource = isElementNullable ?
                newOptionalVariableReference("data", elementStatement!) :
                new VariableReference("data", elementStatement!);
            break;
        case BindingAspect.Conditional:
            if (dataType.name === "boolean") {
                getSource = new Expression({
                    lhs: elementStatement!,
                    operation: Operation.StrictNotEqual,
                    rhs: new Value(Type.object)
                });
            } else {
                throw Error(`Cannot reverse Conditional binding to return value of type "${dataType.name}"`);
            }
            break;
        case BindingAspect.InnerHTML:
            getSource = isElementNullable ?
                newOptionalVariableReference("innerHTML", elementStatement!) :
                new VariableReference("innerHTML", elementStatement!);
            break;
        case BindingAspect.ServerParameter:
            return null;
        default:
            throw Error(`Not implemented - get resolver for binding of type ${BindingAspect[binding.aspect]}`)
    }

    let value: ValueTypes = getSource;
    // If not a variable reference try build a reverser for the value
    if (!(binding.expression instanceof VariableReference) && !(binding.expression instanceof ForIteratorExpression)) {
        // "buildReverseFunction" will throw error if the expression cannot be reversed 
        const reversedExpressionFunction = buildReverseFunction(
            binding.expression as ValueTypes,
            variableChain.map((point) => {
                if (typeof point === "string") {
                    return point
                } else {
                    throw Error(`Cannot reverse ${binding.expression.render()}`);
                }
            }) 
        );

        // Invoke the reverseFunction with the evaluate output (which is value)
        const iife = new Expression({
            lhs: new Group(reversedExpressionFunction),
            operation: Operation.Call,
            rhs: value
        });

        // Can reduce the function by replace the paramter variables with the arguments
        value = compileIIFE(iife);
    }

    if (dataType.name === "number") {
        value = new Expression({
            lhs: new VariableReference("parseFloat"),
            operation: Operation.Call,
            rhs: value
        });
    } else if (dataType.name === "Date") {
        value = new Expression({
            lhs: new VariableReference("Date"),
            operation: Operation.Initialize,
            rhs: value
        });
    } else if (dataType.name === "boolean") {
        // Temp fix for the fact data attributes (which are not in HTMLElement.booleanAttribute set)
        // will be rendered out like data-post-liked="true" or data-post-liked="false"
        if (binding.aspect === BindingAspect.Attribute && !HTMLElement.booleanAttributes.has(binding.attribute!)) {
            value = new Expression({
                lhs: value,
                operation: Operation.StrictEqual,
                rhs: new Value(Type.string)
            });
        } else if (binding.aspect !== BindingAspect.Conditional) {
            value = new Expression({
                lhs: value,
                operation: Operation.StrictNotEqual,
                rhs: new Value(Type.object)
            });
        }
    } else if (
        dataType.name === "string" && 
        !settings.minify && 
        [BindingAspect.Attribute, BindingAspect.InnerText].includes(binding.aspect)
    ) {
        value = new Expression({
            lhs: new VariableReference("trim", value),
            operation: isElementNullable ? Operation.OptionalCall : Operation.Call
        });
    }

    return value;
}

/**
 * Returns a expression that will be used to get the length of array using
 */
export function getLengthFromIteratorBinding(binding: IBinding, nodeData: WeakMap<Node, NodeData>): ValueTypes {
    if (binding.aspect !== BindingAspect.Iterator) throw Error("Expected iterator binding");

    const getElemExpression = getElement(binding.element!, nodeData);

    // TODO this a temp fix for some conditionals being based on empty arrays but
    // makes the assumption that if parent component is not rendered due to #if="someArr.length > 0"
    if (nodeData.get(binding.element!)?.nullable) {
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
            rhs: new Value(Type.number, 0)
        });
    } else {
        return new VariableReference("length", new VariableReference("children", getElemExpression));
    }
}