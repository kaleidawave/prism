import { Statements } from "./statement";
import { IValue } from "../value/value";
import { IRenderSettings, TokenReader, defaultRenderSettings } from "../../../helpers";
import { JSToken } from "../../javascript";
import { Expression } from "../value/expression";
import { parseBlock, renderBlock } from "../constructs/block";

export class SwitchStatement {
    constructor(
        public expression: IValue,
        public cases: Array<[IValue | null, Array<Statements>]>, // TODO should LHS be of type IValue ???
    ) { }

    render(settings: IRenderSettings = defaultRenderSettings): string {
        let acc = "switch";
        acc += settings.minify ? "(" : " (";
        acc += this.expression.render(settings);
        acc += settings.minify ? "){" : ") {";
        let block = "";
        for (const [case_, statements] of this.cases) {
            if (case_) {
                block += "case ";
                block += case_.render(settings);
            } else {
                block += "default";
            }
            block += ":";
            block += renderBlock(statements, settings);
            if (settings.minify) block += ";";
        }
        if (settings.minify) {
            acc += block;
        } else {
            acc += ("\n" + block).replace(/\n/g, "\n" + " ".repeat(settings.indent));
            // After indentation, acc contains a leading " ".repeat(settings.indent); 
            acc = acc.substring(0, acc.length - settings.indent);
        }
        acc += "}";
        return acc;
    }

    get defaultCase(): Statements[] {
        return this.cases.find(([condition]) => condition === null)?.[1] || [];
    }

    static fromTokens(reader: TokenReader<JSToken>): SwitchStatement {
        reader.expectNext(JSToken.Switch);
        reader.expectNext(JSToken.OpenBracket);
        const expr = Expression.fromTokens(reader);
        reader.expectNext(JSToken.CloseBracket);
        reader.expectNext(JSToken.OpenCurly);
        const cases: Array<[IValue | null, Array<Statements>]> = [];
        while (reader.current.type !== JSToken.CloseCurly) {
            if (reader.current.type === JSToken.Case) {
                reader.move();
                const condition = Expression.fromTokens(reader);
                reader.expectNext(JSToken.Colon);
                const statements = parseBlock(reader, true);
                cases.push([condition, statements]);
            } else if (reader.current.type === JSToken.Default) {
                reader.move();
                reader.expectNext(JSToken.Colon);
                const statements = parseBlock(reader, true);
                cases.push([null, statements]);
            } else {
                reader.throwExpect("Expected case or default in switch statement");
            }
        }
        reader.move();
        return new SwitchStatement(expr, cases);
    }
}