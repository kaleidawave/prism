import { TokenReader, IRenderSettings, makeRenderSettings } from "../helpers";
import { CSSToken, stringToTokens } from "./css";
import { Rule } from "./rule";
import { readFile, writeFile, IFile } from "../filesystem";
import { AtRule, AtRuleFromTokens } from "./at-rules";

export class Stylesheet implements IFile {

    constructor(
        public filename: string,
        public rules: Array<AtRule | Rule> = []
    ) { }

    static fromTokens(reader: TokenReader<CSSToken>, filename: string): Stylesheet {
        const rules: Array<AtRule | Rule> = [];
        while (reader.current.type !== CSSToken.EOF) {
            if (reader.current.type === CSSToken.Comment) {
                reader.move();
                continue;
            }
            if (reader.current.type === CSSToken.At) {
                rules.push(AtRuleFromTokens(reader));
            } else {
                rules.push(...Rule.fromTokens(reader));
            }
        }
        return new Stylesheet(filename, rules);
    }

    render(partialSettings: Partial<IRenderSettings> = {}): string {
        const settings = makeRenderSettings(partialSettings);
        let acc = "";
        for (let i = 0; i < this.rules.length; i++) {
            acc += this.rules[i].render(settings);
            if (!settings.minify && i + 1 < this.rules.length) acc += "\n";
        }
        return acc;
    }

    static fromString(content: string, filename: string = "anom.css", columnOffset?: number, lineOffset?: number): Stylesheet {
        const reader = stringToTokens(content, {
            file: filename,
            columnOffset,
            lineOffset
        });

        const styleSheet = Stylesheet.fromTokens(reader, filename);
        reader.expect(CSSToken.EOF);
        return styleSheet;
    }

    static async fromFile(filename: string): Promise<Stylesheet> {
        return Stylesheet.fromString(await readFile(filename), filename);
    }

    combine(stylesheet2: Stylesheet): void {
        this.rules.push(...stylesheet2.rules);
    }

    writeToFile(settings: Partial<IRenderSettings> = {}, filename?: string) {
        writeFile(filename ?? this.filename!, this.render(settings));
    }
}