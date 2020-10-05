import { TokenReader, IRenderSettings, defaultRenderSettings } from "../../../helpers";
import { JSToken } from "../../javascript";
import { IStatement } from "./statement";
import { Expression } from "../value/expression";
import { IValue } from "../value/value";
import { parseBlock, renderBlock } from "../constructs/block";

export class IfStatement implements IStatement {
    constructor(
        public condition: IValue, 
        public statements: Array<IStatement> = [], 
        public consequent: ElseStatement | null = null
    ) { }

    render(settings: IRenderSettings = defaultRenderSettings): string {
        let acc = "if";
        acc += settings.minify ? "(" : " (";
        acc += this.condition.render(settings);
        acc += settings.minify ? "){" : ") {";
        // TODO if statements.length === 1 then can drop curly braces
        acc += renderBlock(this.statements, settings);
        acc += "}";
        if (!this.consequent) {
            return acc;
        } else {
            if (!settings.minify) acc += " ";
            acc += this.consequent.render(settings);
            return acc;
        }
    }

    static fromTokens(reader: TokenReader<JSToken>): IfStatement {
        reader.expectNext(JSToken.If);
        reader.expectNext(JSToken.OpenBracket);
        // Parse condition
        const condition = Expression.fromTokens(reader);
        reader.expectNext(JSToken.CloseBracket);
        // Parse statements
        const statements = parseBlock(reader);
        let consequent: ElseStatement | null = null;
        if (reader.current.type === JSToken.Else) {
            consequent = ElseStatement.fromTokens(reader);
        }
        return new IfStatement(condition, statements, consequent);
    }
}

export class ElseStatement implements IStatement {
    constructor(
        public condition: IValue | null = null,
        public statements: Array<IStatement>,
        public consequent: ElseStatement | null = null
    ) {}

    render(settings: IRenderSettings = defaultRenderSettings): string {
        let acc = "else";
        if (this.condition !== null || typeof this.condition === "undefined") {
            acc += settings.minify ? " if(" : " if (";
            acc += this.condition.render(settings);
            acc += settings.minify ? "){" : ") {";
        } else {
            acc += settings.minify ? "{" : " {";
        }
        acc += renderBlock(this.statements, settings);
        acc += "}";
        if (!this.consequent) {
            return acc;
        } else {
            if (!settings.minify) acc += " ";
            acc += this.consequent.render(settings);
            return acc;
        }
    }

    static fromTokens(reader: TokenReader<JSToken>): ElseStatement {
        reader.expectNext(JSToken.Else);
        let condition: IValue | null = null;
        if (reader.current.type === JSToken.If) {
            reader.move();
            reader.expectNext(JSToken.OpenBracket);
            condition = Expression.fromTokens(reader);
            reader.expectNext(JSToken.CloseBracket);
        }
        const statements = parseBlock(reader);
        let consequent: ElseStatement | null = null;
        if (reader.current.type === JSToken.Else) {
            consequent = ElseStatement.fromTokens(reader);
        }
        return new ElseStatement(condition, statements, consequent);
    }
}
