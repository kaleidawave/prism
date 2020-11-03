import { TokenReader, IRenderSettings, defaultRenderSettings, ScriptLanguages, IRenderable } from "../../../helpers";
import { commentTokens, JSToken } from "../../javascript";
import { tokenAsIdent, VariableReference } from "../value/variable";
import { Value, Type } from "../value/value";
import { VariableDeclaration } from "../statements/variable";
import { ObjectLiteral } from "../value/object";
import { Expression, Operation } from "../value/expression";

export class EnumDeclaration implements IRenderable {

    constructor(
        public name: string,
        public members: Map<string, Value>
    ) { }

    render(settings: IRenderSettings = defaultRenderSettings): string {
        if (settings.scriptLanguage === ScriptLanguages.Typescript) {
            let acc = "enum ";
            acc += this.name;
            acc += " {";
            acc += "\n";
            let cur = 0;
            for (const [key, value] of this.members) {
                acc += " ".repeat(settings.indent) + key;
                if (!(value instanceof Value) || (cur++).toString() !== value.value) {
                    acc += " = " + value.render(settings);
                }
                if (cur < this.members.size) acc += ",";
                acc += "\n";
            }
            acc += "}";
            return acc;
        } else {
            const enumAsObject = enumToFrozenObject(this);
            return enumAsObject.render(settings);
        }
    }

    static fromTokens(reader: TokenReader<JSToken>) {
        reader.expectNext(JSToken.Enum);
        const name = reader.current.value || tokenAsIdent(reader.current.type);
        reader.move();
        reader.expectNext(JSToken.OpenCurly);
        const members = new Map<string, Value>();
        let counter = 0;
        while (reader.current.type !== JSToken.CloseCurly) {
            if (commentTokens.includes(reader.current.type)) {
                reader.move();
                continue;
            }
            let value: Value;
            const member = reader.current.value || tokenAsIdent(reader.current.type);
            reader.move();
            if (reader.current.type === JSToken.Assign) {
                reader.move();
                value = Value.fromTokens(reader);
            } else {
                value = new Value(Type.number, counter++);
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

/**
 * De-sugars ts enum declarations
 * Frozen to prevent mutation during runtime
 * @example `enum X {Y, Z}` -> const X = Object.freeze({Y: 0, Z: 1})
 */
function enumToFrozenObject(enum_: EnumDeclaration): VariableDeclaration {
    const obj = new ObjectLiteral(enum_.members);
    const frozenObj = new Expression({
        lhs: VariableReference.fromChain("Object", "freeze"),
        operation: Operation.Call,
        rhs: obj
    })
    return new VariableDeclaration(enum_.name, { value: frozenObj });
}