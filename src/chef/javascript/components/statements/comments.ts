import { IRenderSettings, ScriptLanguages, defaultRenderSettings } from "../../../helpers";

export class Comment {

    constructor(
        public comment: string,
        public multiline: boolean = false
    ) { }

    render(settings: IRenderSettings = defaultRenderSettings): string {
        // TODO source map comments should be kept during minification
        if (settings.minify || !settings.comments) {
            return "";
        }

        if (settings.comments === "docstring") {
            if (!this.multiline || this.comment[0] !== "*") {
                return "";
            }
        }
        if (settings.comments === "info") {
            if (this.comment.startsWith("TODO")) {
                return "";
            }
        }

        // TODO "@ts-check" can be used in .js files
        if (this.comment.startsWith("@ts-") && settings.scriptLanguage !== ScriptLanguages.Typescript) {
            return "";
        }

        if (this.multiline) {
            return `/*${this.comment} */`;
        } else {
            return `// ${this.comment}`;
        }
    }
}

interface IDocString {
    text: string,
    remarks: string,
    public: string,
    see: string,
}

/**
 * Generates a documentation comment in the tsdoc standard
 * #inception
 * @see [tsdoc](https://github.com/microsoft/tsdoc)
 */
export function GenerateDocString(content: Partial<IDocString>): Comment {
    let comment = "*\n";
    for (const [name, value] of Object.entries(content)) {
        if (name === "text") {
            comment += ` * ${value}\n`;
        } else {
            comment += ` * @${name} ${value}\n`;
        }
    }
    return new Comment(comment, true);
}