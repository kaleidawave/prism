import { IEvent, IBinding, Locals, PartialBinding, VariableReferenceArray, ForLoopVariable, NodeData } from "./template";
import { IValue, Value, Type } from "../chef/javascript/components/value/value";
import { HTMLElement, HTMLDocument, Node } from "../chef/html/html";
import { VariableReference } from "../chef/javascript/components/value/variable";
import { Expression, Operation } from "../chef/javascript/components/value/expression";
import { ArgumentList } from "../chef/javascript/components/constructs/function";
import { cloneAST, findVariables, newOptionalVariableReferenceFromChain } from "../chef/javascript/utils/variables";
import { assignToObjectMap, findLastIndex } from "../helpers";
import { IType } from "../chef/javascript/utils/types";

export const thisDataVariable = VariableReference.fromChain("this", "data") as VariableReference;

const usedIds = new Set();

export function randomPrismId(): string {
    let id = randomId();
    while (usedIds.has(id)) {
        id = randomId();
    }
    usedIds.add(id);
    return "p" + id;
}

function randomId() {
    return getRandomInt(0, 1e5).toString(36);
}

function getRandomInt(min: number = 0, max: number = 9) {
    return Math.floor(Math.random() * Math.floor(max - min)) + min;
}

/**
 * Adds a new identifier to an element. Used to reference elements at runtime. Adds identifer as a class (not id)
 */
export function addIdentifierToElement(element: HTMLElement, nodeData: WeakMap<Node, NodeData>): string {
    const existingIdentifer = nodeData.get(element)?.identifier;
    if (existingIdentifer) {
        return existingIdentifer;
    } else {
        const identifier = randomPrismId();
        assignToObjectMap(nodeData, element, "identifier", identifier);

        // Add identifer to class
        if (!element.attributes) {
            element.attributes = new Map([["class", identifier]]);
        } else if (element.attributes.has("class")) {
            element.attributes.set("class", element.attributes.get("class") + " " + identifier);
        } else {
            element.attributes.set("class", identifier);
        }
        return identifier;
    }
}

export function addEvent(events: Array<IEvent>, element: HTMLElement, event: IEvent, nodeData: WeakMap<Node, NodeData>) {
    events.push(event);
    const elementEvents = nodeData.get(element)?.events;
    if (elementEvents) {
        elementEvents.push(event);
    } else {
        assignToObjectMap(nodeData, element, "events", [event]);
    }
}

export function createNullElseElement(identifier: string): HTMLElement {
    return new HTMLElement("span", new Map([
        ["class", identifier],
        ["data-else", null]
    ]));
}

/**
 * Fills a binding. Does a bunch of side effects:
 * - Adding to the array of bindings
 * - Aliasing the expression to be in terms of this.data
 * @param partialBinding 
 * @param locals Variables introduced by for of statements
 * @param globals Variables outside of class
 */
export function addBinding(
    partialBinding: PartialBinding, 
    locals: Locals, 
    globals: Array<VariableReference>, 
    bindings: Array<IBinding>
) {
    const uniqueExpression = cloneAST(partialBinding.expression);
    const variablesInExpression = findVariables(partialBinding.expression, true);

    let referencesVariables: Array<VariableReferenceArray> = [];

    // Parse all referenced variables 
    for (const variable of variablesInExpression) {
        let inLocals = false;
        for (const { name, path } of locals) {
            if ((variable.tail as VariableReference).name === name) {
                inLocals = true;
                // Adjoins the path to the array with the path of the variable (slice(1) cuts out the iteration variable)
                referencesVariables.push(path.concat(variable.toChain().slice(1)));
            }
        }

        // Skip globals
        // !inLocals is there to support variable shadowing
        if (!inLocals && globals.some(global => global.isEqual(variable, true))) continue;

        if (!inLocals) {
            const thisVariableArr = variable.toChain();
            if (!referencesVariables.some(rv => variableReferenceArrayEqual(rv, thisVariableArr))) {
                referencesVariables.push(thisVariableArr);
            }

        }
    }

    if (referencesVariables.length > 0) {
        const binding: IBinding = {
            ...partialBinding,
            expression: uniqueExpression,
            referencesVariables
        }

        bindings.push(binding);
    }
}

/**
 * Returns whether variable reference arrays are equal
 */
function variableReferenceArrayEqual(vra1: VariableReferenceArray, vra2: VariableReferenceArray) {
    return (
        vra1.length === vra2.length
        && vra1.every(
            (part, index) => typeof part === "string" ? part === vra2[index] : typeof part === typeof vra2[index])
    )
}

/** 
 * Returns a getElem(*id*) expression 
 * For getting a single node under a for statement use `getSpecificElem`
*/
function getSingleElement(element: HTMLElement, nodeData: WeakMap<Node, NodeData>): Expression {
    let identifier = nodeData.get(element)?.identifier;
    // Should never throw
    if (!identifier) {
        assignToObjectMap(nodeData, element, "identifier", identifier = "PRISM_TEMP_IDENTIFIER");
        // throw Error("Cannot create getElem expression from node without set identifer");
    }
    return new Expression({
        lhs: VariableReference.fromChain("this", "getElem"),
        operation: Operation.Call,
        rhs: new ArgumentList([new Value(identifier, Type.string)])
    });
}

/**
 * Returns a chained .children[x] statement from which the instance parent value statement returns the instance of descendant
 * @param ancestor a ancestor of the descendant
 * @param element a descendant of the descendant
 */
export function getElement(element: HTMLElement, nodeData: WeakMap<Node, NodeData>): IValue {
    const { multiple, nullable: isRootElementNullable } = nodeData.get(element)!;

    if (!multiple) {
        return getSingleElement(element, nodeData);
    }

    // Work backwards up the parent chain until get to parent:
    const indexes: Array<number | "var"> = [];
    let point = element;
    while (nodeData.get(point)?.multiple) {
        if (nodeData.get(point.parent as HTMLElement)?.iteratorExpression) {
            indexes.push("var");
        } else {
            indexes.push(point.parent!.children.indexOf(point))
        }
        point = point.parent! as HTMLElement;
    }
    if (point instanceof HTMLDocument) {
        throw Error("getElementStatement - child is not descendant of parent");
    }

    // Point is now end
    let statement: IValue = getSingleElement(point, nodeData);
    let indexer = 0;

    // Reverse as worked upwards but statement works downwards
    for (let i = indexes.length - 1; i >= 0; i--) {
        const index = indexes[i];
        const childrenValue = isRootElementNullable ?
            newOptionalVariableReferenceFromChain(statement, "children")
            : VariableReference.fromChain(statement, "children");
        if (index === "var") {
            statement = new Expression({
                lhs: childrenValue,
                operation: isRootElementNullable ? Operation.OptionalIndex : Operation.Index,
                rhs: new VariableReference(String.fromCharCode(indexer++ + 120))
            });
        } else {
            statement = new Expression({
                lhs: childrenValue,
                operation: isRootElementNullable ? Operation.OptionalIndex : Operation.Index,
                rhs: new Value(indexes[i], Type.number)
            });
        }
    }

    return statement;
}

/**
 * Finds the corresponding type signature from a variableReferenceArray
 */
export function getTypeFromVariableReferenceArray(
    reference: VariableReferenceArray,
    dataType: IType
): IType {
    let type: IType = dataType;
    for (const part of reference) {
        if (typeof part === "object" || typeof part === "number") {
            if (!type.indexed) {
                throw Error(`Indexable property does not exist on "${typeof part === "object" ? part.alias : part}"`);
            }
            type = type.indexed;
        } else {
            if (!type.properties) {
                throw Error(`"${type.name}" does not have any properties`);
            }
            if (!type.properties.has(part)) {
                throw Error(`Property "${part}" does not exist on type: "${type.name}"`);
            }
            type = type.properties.get(part)!;
        }
    }
    return type;
}

/**
 * Will return the last arm of the variable reference array
 * @param arr A variable reference array
 * @example `["a", {alias: "b"}, "c"]` -> `["b", "c"]`
 */
export function getSlice(arr: VariableReferenceArray): Array<string> {
    const index = findLastIndex(arr, p => typeof p === "object");
    if (index < 0) return arr as Array<string>;
    return [(arr[index] as ForLoopVariable).alias, ...arr.slice(index + 1)] as Array<string>;
}