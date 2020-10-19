import { IStatement } from "../../chef/javascript/components/statements/statement";
import { Expression, Operation } from "../../chef/javascript/components/value/expression";
import { VariableReference } from "../../chef/javascript/components/value/variable";
import { ArgumentList } from "../../chef/javascript/components/constructs/function";
import { Value, Type, IValue } from "../../chef/javascript/components/value/value";
import { replaceVariables, cloneAST, newOptionalVariableReference, newOptionalVariableReferenceFromChain, aliasVariables } from "../../chef/javascript/utils/variables";
import { getSlice, getElement, thisDataVariable } from "../helpers";
import { ValueAspect, IBinding, VariableReferenceArray, NodeData } from "../template";
import { HTMLElement, Node } from "../../chef/html/html";

export function makeSetFromBinding(
    binding: IBinding,
    nodeData: WeakMap<Node, NodeData>,
    variable: VariableReferenceArray,
    globals: Array<VariableReference> = []
): Array<IStatement> {
    const statements: Array<IStatement> = [];
    const elementStatement = getElement(binding.element, nodeData);
    const isElementNullable = nodeData.get(binding.element)?.nullable ?? false;

    // getSlice will return the trailing portion from the for iterator statement thing
    const variableReference = VariableReference.fromChain(...getSlice(variable) as Array<string>) as VariableReference;

    let newValue: IValue | null = null;
    if (binding.expression) {
        const clonedExpression = cloneAST(binding.expression) as IValue;
        const valueParam = new VariableReference("value");
        replaceVariables(clonedExpression, valueParam, [variableReference]);
        aliasVariables(clonedExpression, thisDataVariable, [valueParam, ...globals]);
        newValue = clonedExpression;
    }

    switch (binding.aspect) {
        case ValueAspect.InnerText:
            // Gets the index of the fragment and alters the data property of the 
            // fragment (which exists on CharacterData) to the string value
            if (isElementNullable) {
                statements.push(new Expression({
                    lhs: new VariableReference("tryAssignData"),
                    operation: Operation.Call,
                    rhs: new ArgumentList([
                        newOptionalVariableReferenceFromChain(
                            elementStatement,
                            "childNodes",
                            binding.fragmentIndex!,
                        ),
                        newValue!
                    ])
                }));
            } else {
                statements.push(new Expression({
                    lhs: VariableReference.fromChain(
                        elementStatement,
                        "childNodes",
                        binding.fragmentIndex!,
                        "data"
                    ),
                    operation: Operation.Assign,
                    rhs: newValue!
                }));
            }
            break;
        case ValueAspect.Conditional: {
            const clientRenderFunction = nodeData.get(binding.element)!.clientRenderMethod!;

            const callConditionalSwapFunction = new Expression({
                lhs: VariableReference.fromChain("conditionalSwap", "call"),
                operation: Operation.Call,
                rhs: new ArgumentList([
                    new VariableReference("this"),
                    newValue!, // TODO temp non null
                    new Value(nodeData.get(binding.element)!.identifier!, Type.string),
                    VariableReference.fromChain("this", clientRenderFunction.name?.name!)
                ])
            });
            statements.push(callConditionalSwapFunction);
            break;
        }
        case ValueAspect.Iterator: {
            const clientRenderFunction = nodeData.get(binding.element)!.clientRenderMethod!;

            const renderNewElement = new Expression({
                lhs: VariableReference.fromChain("this", clientRenderFunction.name?.name!),
                operation: Operation.Call,
                rhs: new VariableReference("value")
            });

            const addNewElementToTheParent = new Expression({
                lhs: isElementNullable ?
                    newOptionalVariableReferenceFromChain(elementStatement, "append") :
                    VariableReference.fromChain(elementStatement, "append"),
                operation: isElementNullable ? Operation.OptionalCall : Operation.Call,
                rhs: renderNewElement
            });

            statements.push(addNewElementToTheParent);
            break;
        }
        case ValueAspect.Attribute:
            const attribute = binding.attribute!;
            if (HTMLElement.booleanAttributes.has(attribute)) {
                statements.push(new Expression({
                    lhs: new VariableReference(attribute, elementStatement),
                    operation: Operation.Assign,
                    rhs: newValue!
                }));
            } else {
                const setAttributeRef = isElementNullable ? newOptionalVariableReference("setAttribute", elementStatement) : new VariableReference("setAttribute", elementStatement);
                statements.push(new Expression({
                    lhs: setAttributeRef,
                    operation: isElementNullable ? Operation.OptionalCall : Operation.Call,
                    rhs: new ArgumentList([
                        new Value(attribute, Type.string),
                        newValue!
                    ])
                }));
            }
            break;
        case ValueAspect.Data:
            if (isElementNullable) {
                statements.push(new Expression({
                    lhs: new VariableReference("tryAssignData"),
                    operation: Operation.Call,
                    rhs: new ArgumentList([
                        elementStatement,
                        newValue!
                    ])
                }));
            } else {
                statements.push(new Expression({
                    lhs: new VariableReference("data", elementStatement),
                    operation: Operation.Assign,
                    rhs: newValue!
                }));
            }
            break;
        case ValueAspect.DocumentTitle:
            statements.push(new Expression({
                lhs: VariableReference.fromChain("document", "title"),
                operation: Operation.Assign,
                rhs: newValue!
            }));
            break;
        case ValueAspect.Style:
            const styleObject = new VariableReference("style", elementStatement);
            // Converts background-color -> backgroundColor which is the key JS uses
            const styleKey = binding.styleKey!.replace(/(?:-)([a-z])/g, (_, m) => m.toUpperCase());
            statements.push(new Expression({
                lhs: new VariableReference(styleKey, styleObject),
                operation: Operation.Assign,
                rhs: newValue!
            }));
            break;
        default:
            throw Error(`Unknown aspect ${ValueAspect[binding.aspect]}`)
    }

    return statements;
}

export function setLengthForIteratorBinding(binding: IBinding, nodeData: WeakMap<Node, NodeData>): IStatement {
    if (binding.aspect !== ValueAspect.Iterator) throw Error("Expected iterator binding");
    const getElemExpression = getElement(binding.element, nodeData);

    // Uses the setLength helper to assist with sorting cache and removing from DOM
    return new Expression({
        lhs: new VariableReference("setLength"),
        operation: Operation.Call,
        rhs: new ArgumentList([
            getElemExpression,
            new VariableReference("value")
        ])
    });
}