import { JSToken, stringToTokens } from "../../javascript";
import { Statements } from "./statement";
import { VariableDeclaration, VariableContext } from "../statements/variable";
import { Expression, Operation } from "../value/expression";
import { TokenReader, IRenderSettings, defaultRenderSettings } from "../../../helpers";
import { IValue } from "../value/value";
import { renderBlock, parseBlock } from "../constructs/block";

// These tokens refer to object destructuring
const openers = new Set([JSToken.OpenSquare, JSToken.OpenCurly])
const closers = new Set([JSToken.CloseSquare, JSToken.CloseCurly])

/**
 * @example `let x = 2; x < 5; x++;`
 */
export class ForStatementExpression {

    // TODO these can be null
    constructor(
        public initializer: VariableDeclaration,
        public condition: Expression,
        public finalExpression: Expression
    ) { }

    static fromTokens(reader: TokenReader<JSToken>): ForStatementExpression {
        let initialization: VariableDeclaration | null = null;
        if (reader.current.type !== JSToken.SemiColon) {
            initialization = VariableDeclaration.fromTokens(reader);
            if (!initialization.value) {
                throw Error("Expected variable in for loop to have initial value");
            }
            reader.move(-1);
        }
        reader.expectNext(JSToken.SemiColon);
        let condition: Expression | null = null, finalExpression: Expression | null = null;
        if (reader.current.type !== JSToken.SemiColon) {
            condition = Expression.fromTokens(reader) as Expression;
        }
        reader.expectNext(JSToken.SemiColon);
        if (reader.current.type !== JSToken.SemiColon) {
            finalExpression = Expression.fromTokens(reader) as Expression;
        }
        // @ts-ignore TODO if all 3 are null then make it null for for(;;) {} else throw error
        return new ForStatementExpression(initialization, condition, finalExpression);
    }

    render(settings: IRenderSettings = defaultRenderSettings): string {
        let acc = "";
        if (this.initializer) acc += this.initializer.render(settings);
        acc += settings.minify ? ";" : "; ";
        if (this.condition) acc += this.condition.render(settings);
        acc += settings.minify ? ";" : "; ";
        if (this.finalExpression) acc += this.finalExpression.render(settings);
        return acc;
    }
}

const validIteratorExpressions = new Set([JSToken.Of, JSToken.In]);

export type ForLoopExpression = ForIteratorExpression | ForStatementExpression;

/**
 * Parses: `const|let|var ... of ...`
 * @example `const elem of elements`
 */
export class ForIteratorExpression {
    constructor(
        public variable: VariableDeclaration, // TODO allow string for utility
        public operation: Operation.Of | Operation.In,
        public subject: IValue,
    ) { }

    static fromTokens(reader: TokenReader<JSToken>): ForIteratorExpression {
        const variable = VariableDeclaration.fromTokens(reader, { context: VariableContext.For });
        if (!validIteratorExpressions.has(reader.current.type)) {
            reader.throwExpect(`Expected "of" or "in" expression in for statement`);
        }
        const operation = reader.current.type === JSToken.Of ? Operation.Of : Operation.In;
        reader.move();
        const subject = Expression.fromTokens(reader);
        return new ForIteratorExpression(variable, operation, subject);
    }

    render(settings: IRenderSettings = defaultRenderSettings): string {
        let acc = "";
        acc += this.variable.render(settings);
        acc += this.operation === Operation.Of ? " of " : " in ";
        acc += this.subject.render(settings);
        return acc;
    }
}

export class ForStatement {

    constructor(
        public expression: ForLoopExpression,
        public statements: Array<Statements>
    ) { }

    render(settings: IRenderSettings = defaultRenderSettings): string {
        let acc = "for (";
        acc += this.expression.render(settings);
        acc += ") {";
        acc += renderBlock(this.statements, settings);
        acc += "}";
        return acc;
    }

    static fromTokens(reader: TokenReader<JSToken>): ForStatement {
        reader.expectNext(JSToken.For);
        reader.expectNext(JSToken.OpenBracket);
        const expression: ForLoopExpression = ForStatement.parseForParameterFromTokens(reader);
        reader.expectNext(JSToken.CloseBracket);
        const statements = parseBlock(reader);
        return new ForStatement(expression, statements);
    }

    static parseForParameter(string: string): ForLoopExpression {
        const reader = stringToTokens(string);
        const expression = ForStatement.parseForParameterFromTokens(reader);
        reader.expect(JSToken.EOF);
        return expression;
    }

    static parseForParameterFromTokens(reader: TokenReader<JSToken>): ForLoopExpression {
        // Backup is used to because run has to start at a certain position
        let backup = false;
        if (new Set([JSToken.Const, JSToken.Let, JSToken.Var]).has(reader.current.type)) {
            reader.move();
            backup = true;
        }
        let bracketCount = 0;
        // Finds what is after the variable declaration
        const [operator] = reader.run((token) => {
            if (openers.has(token)) bracketCount++;
            else if (closers.has(token)) bracketCount--;
            if (bracketCount === 0) return true;
            else return false;
        }, true);

        if (backup) reader.move(-1);

        // If "of" or "in" do a iterator expression
        if (validIteratorExpressions.has(operator)) {
            return ForIteratorExpression.fromTokens(reader);
        } else {
            return ForStatementExpression.fromTokens(reader);
        }
    }
}