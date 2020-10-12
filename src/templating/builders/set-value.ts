import { IStatement } from "../../chef/javascript/components/statements/statement";
import { Expression, Operation } from "../../chef/javascript/components/value/expression";
import { VariableReference } from "../../chef/javascript/components/value/variable";
import { ArgumentList } from "../../chef/javascript/components/constructs/function";
import { Value, Type, IValue } from "../../chef/javascript/components/value/value";
import { replaceVariables, cloneAST, newOptionalVariableReference, newOptionalVariableReferenceFromChain, aliasVariables } from "../../chef/javascript/utils/variables";
import { getSlice, getChildrenStatement, thisDataVariable } from "../helpers";
import { ValueAspect, IDependency, PrismHTMLElement, VariableReferenceArray } from "../template";
import { HTMLElement } from "../../chef/html/html";

export function makeSetFromDependency(
    dependency: IDependency,
    variable: VariableReferenceArray,
    globals: Array<VariableReference> = []
): Array<IStatement> {
    const statements: Array<IStatement> = [];
    const elementStatement = getChildrenStatement(dependency.element);
    const isElementNullable = dependency.element.nullable ?? false;

    // getSlice will return the trailing portion from the for iterator statement thing
    const variableReference = VariableReference.fromChain(...getSlice(variable) as Array<string>) as VariableReference;
    
    let newValue: IValue | null = null;
    if (dependency.expression) {
        const clonedExpression = cloneAST(dependency.expression) as IValue;
        const valueParam = new VariableReference("value");
        replaceVariables(clonedExpression, valueParam, [variableReference]);
        aliasVariables(clonedExpression, thisDataVariable, [valueParam, ...globals]);
        newValue = clonedExpression;
    }

    switch (dependency.aspect) {
        case ValueAspect.InnerText:
            // Gets the index of the fragment and alters the data property of the 
            // fragment (which exists on CharacterData) to the string value
            if (dependency.element.nullable) {
                statements.push(new Expression({
                    lhs: new VariableReference("tryAssignData"),
                    operation: Operation.Call,
                    rhs: new ArgumentList([
                        newOptionalVariableReferenceFromChain(
                            elementStatement,
                            "childNodes",
                            dependency.fragmentIndex!,
                        ),
                        newValue!
                    ])
                }));
            } else {
                statements.push(new Expression({
                    lhs: VariableReference.fromChain(
                        elementStatement,
                        "childNodes",
                        dependency.fragmentIndex!,
                        "data"
                    ),
                    operation: Operation.Assign,
                    rhs: newValue!
                }));
            }
            break;
        case ValueAspect.Conditional:
            const callConditionalSwapFunction = new Expression({
                lhs: VariableReference.fromChain("conditionalSwap", "call"),
                operation: Operation.Call,
                rhs: new ArgumentList([
                    new VariableReference("this"),
                    newValue!, // TODO temp non null
                    new Value(dependency.element.identifier!, Type.string),
                    VariableReference.fromChain("this", "render" + dependency.element.identifier)
                ])
            });
            statements.push(callConditionalSwapFunction);
            break;
        case ValueAspect.Iterator:
            // TODO temp dependency.element.identifier should maybe have reference to actual method
            const renderNewElement = new Expression({
                lhs: VariableReference.fromChain("this", "render" + dependency.element.identifier),
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
        case ValueAspect.Attribute:
            const attribute = dependency.attribute!;
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
            const styleKey = dependency.styleKey!.replace(/(?:-)([a-z])/g, (_, m) => m.toUpperCase());
            statements.push(new Expression({
                lhs: new VariableReference(styleKey, styleObject),
                operation: Operation.Assign,
                rhs: newValue!
            }));
            break;
        default:
            throw Error(`Unknown aspect ${ValueAspect[dependency.aspect]}`)
    }

    return statements;
}

export function setLengthForIteratorDependency(dependency: IDependency): IStatement {

    const getElemExpression = getChildrenStatement(dependency.element as PrismHTMLElement);

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