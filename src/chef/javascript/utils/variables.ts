import { ClassDeclaration } from "../components/constructs/class";
import { ReturnStatement } from "../components/statements/statement";
import { Expression, Operation, VariableReference } from "../components/value/expression";
import { IfStatement, ElseStatement } from "../components/statements/if";
import { ValueTypes, Type, Value } from "../components/value/value";
import { ArgumentList, FunctionDeclaration } from "../components/constructs/function";
import { TemplateLiteral } from "../components/value/template-literal";
import { ObjectLiteral } from "../components/value/object";
import { ForIteratorExpression, ForStatementExpression, ForStatement } from "../components/statements/for";
import { VariableDeclaration } from "../components/statements/variable";
import { ArrayLiteral } from "../components/value/array";
import { astTypes } from "../javascript";

/**
 * Returns variables spanning from "this.*"
 * @param cls 
 */
export function getVariablesInClass(cls: ClassDeclaration): Array<VariableReference> {
    const variables: Array<VariableReference> = [];
    for (const member of cls.members) {
        for (const variable of findVariables(member)) {
            if (variable.toChain()[0] === "this") {
                variables.push(variable);
            }
        }
    }
    return variables;
}

/**
 * Walks through a statement and yields ALL variable references
 * TODO parent should maybe have a key of structure
 * @param parent Used for replacing variables
 */
export function variableReferenceWalker(
    statement: astTypes, 
    parent?: astTypes
): Array<{ variable: VariableReference, parent: astTypes }> {
    const variables: Array<{ variable: VariableReference, parent: astTypes }> = []
    if (statement instanceof VariableReference) {
        variables.push({ variable: statement, parent: parent! });
    } else if (statement instanceof Expression) {
        if (statement.operation === Operation.OptionalChain) {
            variables.push({ variable: variableReferenceFromOptionalChain(statement), parent: parent! });
        } else {
            variables.push(...variableReferenceWalker(statement.lhs, statement));
            if (statement.rhs) variables.push(...variableReferenceWalker(statement.rhs, statement));
        }
    } else if (statement instanceof ReturnStatement) {
        if (statement.returnValue) variables.push(...variableReferenceWalker(statement.returnValue, statement));
    } else if (statement instanceof FunctionDeclaration) {
        for (const statementInFunc of statement.statements) {
            variables.push(...variableReferenceWalker(statementInFunc, statement));
        }
    } else if (statement instanceof ArgumentList) {
        for (const value of statement.args) {
            variables.push(...variableReferenceWalker(value, statement));
        }
    } else if (statement instanceof TemplateLiteral) {
        for (const value of statement.entries) {
            if (typeof value !== "string") variables.push(...variableReferenceWalker(value, statement));
        }
    } else if (statement instanceof ObjectLiteral) {
        for (const [, value] of statement.values) {
            variables.push(...variableReferenceWalker(value, statement))
        }
    } else if (statement instanceof ForIteratorExpression) {
        variables.push(...variableReferenceWalker(statement.subject, statement));
    } else if (statement instanceof ForStatement) {
        variables.push(...variableReferenceWalker(statement.expression, statement));
        for (const s of statement.statements) {
            variables.push(...variableReferenceWalker(s, statement));
        }
    } else if (statement instanceof IfStatement) {
        variables.push(...variableReferenceWalker(statement.condition, statement));
        for (const s of statement.statements) {
            variables.push(...variableReferenceWalker(s, statement));
        }
    }
    return variables;
}

/**
 * Mimic constructor signature of `VariableReference` but uses optional chain
 */
export function newOptionalVariableReference(name: string, parent: ValueTypes) {
    return new Expression({
        lhs: parent,
        operation: Operation.OptionalChain,
        rhs: new VariableReference(name)
    });
}

/**
 * Mimics `VariableReference.fromChain` but uses optional chain and optional index
 */
export function newOptionalVariableReferenceFromChain(...items: Array<string | number | ValueTypes>): ValueTypes {
    let head: ValueTypes;
    if (typeof items[0] === "number") {
        throw Error("First arg to newOptionalVariableReferenceFromChain must be string");
    } else if (typeof items[0] === "string") {
        head = new VariableReference(items[0] as string);
    } else {
        head = items[0];
    }
    // Iterator through items appending forming linked list
    for (let i = 1; i < items.length; i++) {
        const currentProp = items[i];
        if (typeof currentProp === "number") {
            head = new Expression({
                lhs: head,
                operation: Operation.OptionalIndex,
                rhs: new Value(Type.number, currentProp)
            });
        } else if (typeof currentProp === "string") {
            head = new Expression({
                lhs: head,
                operation: Operation.OptionalChain,
                rhs: new VariableReference(currentProp)
            });
        } else if (currentProp instanceof VariableReference) {
            head = new Expression({
                lhs: head,
                operation: Operation.OptionalChain,
                rhs: currentProp
            });
        } else {
            throw Error("Cannot use prop in fromChain");
        }
    }
    return head;

}

/**
 * Returns a definite variable reference from a optional variable reference
 * @param expr 
 * @example `a?.b?.c` -> `a.b.c`
 */
export function variableReferenceFromOptionalChain(expr: Expression): VariableReference {
    if (expr.operation !== Operation.OptionalChain) {
        throw Error(`Expected optional chain received ${Operation[expr.operation]}`);
    }
    return new VariableReference(
        (expr.rhs as VariableReference).name,
        expr.lhs instanceof Expression && expr.lhs.operation === Operation.OptionalChain ? variableReferenceFromOptionalChain(expr.lhs) : expr.lhs
    );
}

/** 
 * Returns variables in a statement
 * @param allVariables whether to return 
*/
export function findVariables(statement: astTypes, allVariables: boolean = false): Array<VariableReference> {
    const variables: Array<VariableReference> = [];
    for (const {variable} of variableReferenceWalker(statement)) {
        // Check variable has not already been registered
        if (allVariables || !variables.some(regVariable => regVariable.isEqual(variable))) {
            variables.push(variable);
        }
    }
    return variables;
}

/**
 * Alias variables in place
 * TODO:
 *  Duplicate ...
 *  Also some sort of guard e.g I don't want functions to be aliased
 *  Pick up on new variables being introduced
 * @example (myProp, this) -> this.myProp
 * @param locals A set of variables to not alias
 */
export function aliasVariables(
    value: astTypes,
    parent: VariableReference,
    locals: Array<VariableReference> = []
): void {
    for (const {variable} of variableReferenceWalker(value)) {
        if (!locals.some(local => local.isEqual(variable, true))) {
            let parentVariable: VariableReference = variable;
            while (parentVariable.parent) {
                parentVariable = parentVariable.parent as VariableReference;
            }
            parentVariable.parent = parent;
        }
    }
}

/**
 * Replaces variable in expression inline
 */
export function replaceVariables(
    value: astTypes,
    replacer: ValueTypes | ((intercepted: VariableReference) => ValueTypes),
    targets: Array<VariableReference>
): void {
    for (const {variable, parent} of variableReferenceWalker(value)) {
        if (targets.some(targetVariable => targetVariable.isEqual(variable, true))) {
            // TODO Needed for fuzzy match. Redundant and slow otherwise
            let replaceVariable = variable;
            while (!targets.some(targetVariable => targetVariable.isEqual(replaceVariable, false))) {
                replaceVariable = variable.parent! as VariableReference;
            }

            let replacerValue: ValueTypes;
            if (typeof replacer === "function") {
                replacerValue = replacer(variable);
            } else {
                replacerValue = replacer;
            }
            // TODO use parent to not do this:
            // Clear keys, reassign to object, set prototype
            Object.keys(replaceVariable).forEach(key => delete replaceVariable[key]);
            Object.assign(replaceVariable, replacerValue);
            Object.setPrototypeOf(replaceVariable, Object.getPrototypeOf(replacerValue));
        }
    }
}

/**
 * TODO temp
 * Could do by rendering out ast and re parsing lol
 */
export function cloneAST(part: astTypes) {
    if (part === null) return null;

    if (part instanceof VariableReference) {
        return new VariableReference(part.name, part.parent ? cloneAST(part.parent) : undefined);
    } else if (part instanceof Value) {
        return new Value(part.type, part.value ?? "");
    } else if (part instanceof Expression) {
        return new Expression({
            lhs: cloneAST(part.lhs),
            operation: part.operation,
            rhs: part.rhs ? cloneAST(part.rhs) : undefined
        });
    } else if (part instanceof IfStatement) {
        return new IfStatement(
            cloneAST(part.condition),
            part.statements,
            part.consequent ? cloneAST(part.consequent) : undefined
        );
    } else if (part instanceof ElseStatement) {
        return new ElseStatement(
            part.condition ? cloneAST(part.condition) : undefined,
            part.statements,
            part.consequent ? cloneAST(part.consequent) : undefined);
    } else if (part instanceof TemplateLiteral) {
        return new TemplateLiteral(
            part.entries.map(entry => typeof entry === "string" ? entry : cloneAST(entry)),
            part.tag
        );
    } else if (part instanceof ArgumentList) {
        return new ArgumentList(part.args.map(arg => cloneAST(arg)));
    } else if (part instanceof ForIteratorExpression) {
        return new ForIteratorExpression(cloneAST(part.variable), part.operation, cloneAST(part.subject));
    } else if (part instanceof VariableDeclaration) {
        return new VariableDeclaration(part.entries ?? part.name, { ...part });
    } else if (part instanceof ForIteratorExpression) {
        return new ForIteratorExpression(cloneAST(part.variable), part.operation, cloneAST(part.subject));
    } else if (part instanceof ArrayLiteral) {
        return new ArrayLiteral(part.elements.map(cloneAST));
    } else if (part instanceof ForStatementExpression) {
        return new ForStatementExpression(
            part.initializer ? cloneAST(part.initializer) : null, 
            part.condition ? cloneAST(part.condition) : null, 
            part.finalExpression ? cloneAST(part.finalExpression) : null
        );
    } else if (part instanceof ObjectLiteral) {
        return new ObjectLiteral(
            part.values ? new Map(Array.from(part.values.entries()).map(([key, value]) => [key, cloneAST(value)])) : undefined,
            part.spreadValues ? new Set(Array.from(part.spreadValues).map(value => cloneAST(value))) : undefined,
        );
    } else {
        throw Error(`Could not clone part of instance "${part.constructor.name}"`)
    }
}