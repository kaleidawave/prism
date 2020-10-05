import { IValue } from "./value";
import { TokenReader, IRenderSettings, defaultRenderSettings } from "../../../helpers";
import { JSToken } from "../../javascript";

export enum RegExpressionFlags {
    CaseInsensitive,
    Global,
    Multiline,
    DotAll,
    Unicode,
    Sticky
}

const flagMap: Map<string, RegExpressionFlags> = new Map([
    ["i", RegExpressionFlags.CaseInsensitive],
    ["g", RegExpressionFlags.Global],
    ["m", RegExpressionFlags.Multiline],
    ["s", RegExpressionFlags.DotAll],
    ["u", RegExpressionFlags.Unicode],
    ["y", RegExpressionFlags.Sticky],
]);

const mapFlag: Map<RegExpressionFlags, string> = new Map(Array.from(flagMap).map(([s, f]) => [f, s]));

export class RegExpLiteral {

    constructor (
        public expression: string,
        public flags?: Set<RegExpressionFlags>
    ) {}

    render(settings: IRenderSettings = defaultRenderSettings): string {
        let regexp = `/${this.expression}/`;
        if (this.flags) {
            for (const flag of this.flags) {
                regexp += mapFlag.get(flag);
            }
        }
        return regexp;
    }

    static fromTokens(reader: TokenReader<JSToken>): IValue {
        reader.expect(JSToken.RegexLiteral);
        const pattern = reader.current.value!;
        reader.move();
        // Parse flags
        let flags: Set<RegExpressionFlags>;
        if (reader.current.type === JSToken.Identifier) {
            flags = new Set();
            for (const char of reader.current.value!) {
                if (!flagMap.has(char)) reader.throwError(`Expected valid flag but received "${char}"`)
                const respectiveFlag = flagMap.get(char)!;
                flags.add(respectiveFlag);
            }
            reader.move();
        }
        return new RegExpLiteral(pattern, flags!);
    }   

}