import { ValueTypes } from "./value";
import { TokenReader, IRenderSettings, defaultRenderSettings, IRenderable } from "../../../helpers";
import { JSToken } from "../../javascript";
import { Expression } from "./expression";

/**
 * Represents a array literal 
 * @example `[1,2,3]`
 */
export class ArrayLiteral implements IRenderable {

    constructor (
        public elements: ValueTypes[] = []
    ) {}

    render(settings: IRenderSettings = defaultRenderSettings): string {
        let acc = "[";
        // Multi dimension arrays are printed a little different
        const isMultiDimensionArray = this.elements.length > 0 && this.elements.every(element => element instanceof ArrayLiteral);
        if (!settings.minify && isMultiDimensionArray) acc += "\n";
        for (let i = 0; i < this.elements.length; i++) {
            if (!settings.minify && isMultiDimensionArray) acc += " ".repeat(settings.indent);
            const element = this.elements[i];
            acc += element.render(settings);
            if (i !== this.elements.length - 1) acc += settings.minify ? "," : ", ";
            if (!settings.minify && isMultiDimensionArray) acc += "\n";
        }
        return acc + "]"
    }
    
    static fromTokens(reader: TokenReader<JSToken>): ValueTypes {
        const array = new ArrayLiteral();
        reader.expectNext(JSToken.OpenSquare);
        while (reader.current.type !== JSToken.CloseSquare) {
            array.elements.push(Expression.fromTokens(reader));
            if (reader.current.type as JSToken === JSToken.CloseSquare) break;
            reader.expectNext(JSToken.Comma);
        }
        reader.move();
        return array;
    }
}