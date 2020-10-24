import { IValue } from "./value";
import { TokenReader, IRenderSettings, makeRenderSettings, IRenderOptions, defaultRenderSettings, IRenderable } from "../../../helpers";
import { commentTokens, JSToken } from "../../javascript";
import { Expression } from "./expression";
import { VariableReference, tokenAsIdent } from "./variable";
import { FunctionDeclaration, functionPrefixes } from "../constructs/function";

type ObjectLiteralKey = string | IValue;

export class ObjectLiteral implements IRenderable {

    constructor(
        public values: Map<ObjectLiteralKey, IValue> = new Map(),
        public spreadValues: Set<IValue> = new Set()
    ) {
        for (const [, value] of values) {
            if (value instanceof FunctionDeclaration) {
                value.parent = this;
            }
        }
    }

    render(settings: IRenderSettings = defaultRenderSettings, options: Partial<IRenderOptions> = {}): string {
        settings = makeRenderSettings(settings);
        let acc = "{";
        // @ts-ignore ts does not like null as value for object literal key BUT I want 
        const values = Array.from(this.values).concat(Array.from(this.spreadValues).map(v => [null, v]));
        for (let i = 0; i < values.length; i++) {
            const [key, value] = values[i];
            if (!(settings.minify || options.inline)) {
                acc += "\n" + " ".repeat(settings.indent);
            }
            if (key === null) {
                acc += `...${value.render(settings)}`;
            }  
            // If function and bound use shorthand
            else if (value instanceof FunctionDeclaration && value.bound) {
                acc += value.render(settings).replace(/\n/g, "\n" + " ".repeat(settings.indent));
            }
            // If key matches name of variable referenced used, use shorthand
            else if (value instanceof VariableReference && !value.parent && key === value.name) {
                acc += settings.minify ? key : ` ${key}`;
            } else {
                const serializedValue = value.render(settings, options);

                let serializedKey: string;
                if (typeof key === "string") {
                    if (key.match(/^[a-zA-Z]([\w]*?)$/m)) {
                        serializedKey = key;
                    } else {
                        // If key has non valid identifer characters wrap in string
                        serializedKey = `"${key}"`;
                    }
                } else {
                    serializedKey = key.render();
                }

                if (settings.minify || options.inline) {
                    acc += settings.minify ? serializedKey : ` ${serializedKey}`;
                    acc += ":"
                    acc += settings.minify ? serializedValue : ` ${serializedValue}`;
                } else {
                    acc += serializedKey;
                    acc += ": "
                    acc += serializedValue.replace(/\n/g, "\n" + " ".repeat(settings.indent));
                }
            }
            if (i + 1 < values.length) {
                acc += ",";
            } else if (!(settings.minify || options.inline)) {
                acc += "\n";
            }
        }
        if (!settings.minify && options.inline && values.length > 0) acc += " ";
        return acc + "}";
    }

    static fromTokens(reader: TokenReader<JSToken>): IValue {
        reader.expectNext(JSToken.OpenCurly);
        const values: Map<ObjectLiteralKey, IValue> = new Map();
        const spreadValues: Set<IValue> = new Set();
        const objectLiteral = new ObjectLiteral(values, spreadValues);
        while (reader.current.type !== JSToken.CloseCurly) {
            const funcModifiers: Set<JSToken> = new Set();
            while (
                functionPrefixes.includes(reader.current.type)
                && ![JSToken.Colon, JSToken.Comma, JSToken.OpenBracket].includes(reader.peek()!.type)
            ) {
                funcModifiers.add(reader.current.type);
                reader.move();
            }

            let key: ObjectLiteralKey | null = null;
            // Skip comments
            if (commentTokens.includes(reader.current.type)) {
                reader.move();
                continue;
            }

            // If function
            if (reader.peek()?.type === JSToken.OpenBracket) {
                const func = FunctionDeclaration.fromTokens(reader, objectLiteral, funcModifiers);
                values.set(func.actualName!, func);

                if (reader.current.type as JSToken === JSToken.CloseCurly) break;
                reader.expectNext(JSToken.Comma);
                continue;
            }
            // Computed property
            else if (reader.current.type === JSToken.OpenSquare) {
                reader.move();
                key = Expression.fromTokens(reader);
                reader.expectNext(JSToken.CloseSquare);
            } 
            // Spread prop
            else if (reader.current.type === JSToken.Spread) {
                reader.move();
                const value = Expression.fromTokens(reader);
                spreadValues.add(value);
            } else {
                if (reader.current.type === JSToken.Identifier || reader.current.type === JSToken.StringLiteral) {
                    key = reader.current.value!;
                } else {
                    try {
                        key = tokenAsIdent(reader.current.type);
                    } catch (error) {
                        reader.throwExpect("Expected value object literal key");
                    }
                }
                reader.move();
            } 
            // Shorthand { x } === { x: x }
            if (   
                key !== null && typeof key === "string" &&
                [JSToken.Comma, JSToken.CloseCurly].includes(reader.current.type)
            ) {
                values.set(key, new VariableReference(key));
            } else if (key) {
                reader.expectNext(JSToken.Colon);
                const value = Expression.fromTokens(reader);
                values.set(key, value);
            }

            if (reader.current.type as JSToken === JSToken.CloseCurly) break;
            reader.expectNext(JSToken.Comma);
        }
        reader.move();
        return objectLiteral;
    }
}