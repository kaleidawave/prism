import { IStatement } from "../statements/statement";
import { TokenReader, IRenderSettings, defaultRenderSettings, ScriptLanguages } from "../../../helpers";
import { JSToken } from "../../javascript";
import { tokenAsIdent } from "../value/variable";
import { IValue, Value, Type } from "../value/value";
import { Expression } from "../value/expression";

export class EnumDeclaration implements IStatement {

    constructor(
        public name: string,
        public members: Map<string, IValue>
    ) { }

    render(settings: IRenderSettings = defaultRenderSettings): string {
        if (settings.scriptLanguage === ScriptLanguages.Typescript) {
            let acc = "enum ";
            acc += this.name;
            acc += "{";
            let cur = 0;
            for (const [key, value] of this.members) {
                acc += " ".repeat(settings.indent) + key;
                if (!(value instanceof Value) || (cur++).toString() !== value.value) {
                    acc += " = " + value.render(settings);
                }
                acc += ",\n";
            }
            acc += "}";
            return acc;
        } else {
            // TODO render javascript as object literal possibly?
            throw new Error("Method not implemented.");
        }
    }

    static fromTokens(reader: TokenReader<JSToken>) {
        reader.expectNext(JSToken.Enum);
        const name = reader.current.value || tokenAsIdent(reader.current.type);
        reader.move();
        reader.expectNext(JSToken.OpenCurly);
        const members = new Map<string, IValue>();
        let counter = 0;
        while (reader.current.type !== JSToken.CloseCurly) {
            let value: IValue;
            const member = reader.current.value || tokenAsIdent(reader.current.type);
            reader.move();
            if (reader.current.type === JSToken.Assign) {
                value = Expression.fromTokens(reader);
            } else {
                value = new Value(counter++, Type.number);  
            }
            members.set(member, value);

            if (reader.current.type === JSToken.CloseBracket) break;
            // Commas in interfaces are not necessary
            if (reader.current.type === JSToken.Comma) reader.move();
        }
        reader.move();
        return new EnumDeclaration(name, members);
    }
}