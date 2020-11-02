import { defaultRenderSettings, IRenderable, IRenderSettings, TokenReader } from "../../../helpers";
import { JSToken } from "../../javascript";
import { ArgumentList } from "../constructs/function";
import { ValueTypes } from "../value/value";

export class Decorator implements IRenderable {
    private _argumentList?: ArgumentList; // Arguments sent to decorator

    constructor(
        public name: string,
        args?: Array<ValueTypes> | ArgumentList
    ) {
        if (args) {
            if (args instanceof ArgumentList) {
                this._argumentList = args;
            } else {
                this._argumentList = new ArgumentList(args);
            }
        }
    }

    render(settings: IRenderSettings = defaultRenderSettings): string {
        let acc = "@" + this.name;
        if (this._argumentList) {
            acc += this._argumentList.render(settings);
        }
        return acc;
    }

    // Get arguments parsed to decorator function
    get args() {
        return this._argumentList?.args ?? [];
    }

    static fromTokens(reader: TokenReader<JSToken>) {
        reader.expect(JSToken.At);
        const { value: name } = reader.next();
        reader.expectNext(JSToken.Identifier);
        if (reader.current.type === JSToken.OpenBracket) {
            return new Decorator(name!, ArgumentList.fromTokens(reader));
        } else {
            return new Decorator(name!);
        }
    }
}