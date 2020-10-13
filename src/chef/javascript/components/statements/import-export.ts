import { IStatement, ParseStatement } from "./statement";
import { VariableDeclaration, VariableContext } from "../statements/variable";
import { ClassDeclaration } from "../constructs/class";
import { FunctionDeclaration } from "../constructs/function";
import { TokenReader, IRenderSettings, ScriptLanguages, ModuleFormat, defaultRenderSettings } from "../../../helpers";
import { JSToken } from "../../javascript";
import { InterfaceDeclaration } from "../types/interface";

const extensions = [".ts", ".js"];

export class ImportStatement implements IStatement {

    variable: VariableDeclaration | null;

    /**
     * @param variable Either single variable declaration -> import x from "x" or if array does import { x } from "x";
     */
    constructor(
        variable: VariableDeclaration | VariableDeclaration[] | string[] | null,
        public from: string,
        public as: string | null = null,
        public typeOnly: boolean = false
    ) {
        if (variable) {
            let importedVariable: VariableDeclaration;
            if (Array.isArray(variable)) {
                if (typeof variable[0] === "string") {
                    importedVariable = new VariableDeclaration(
                        new Map((variable as Array<string>).map(part => [part, new VariableDeclaration(part)]))
                    );
                } else {
                    importedVariable = new VariableDeclaration(
                        new Map((variable as Array<VariableDeclaration>).map(part => [part.name, part]))
                    );
                }
            } else {
                importedVariable = variable;
            }
            importedVariable.context = VariableContext.Import;
            this.variable = importedVariable;
        } else {
            this.variable = null;
        }
    }

    render(settings: IRenderSettings = defaultRenderSettings): string {
        // Skip over only type imports
        if (settings.scriptLanguage !== ScriptLanguages.Typescript && this.typeOnly) {
            return "";
        }

        let targetFile: string = this.from;
        if (settings.includeExtensionsInImports) {
            const extension = settings.scriptLanguage === ScriptLanguages.Typescript ? ".ts" : ".js";
            if (extensions.every(ext => !targetFile.endsWith(ext))) {
                targetFile += extension;
            }
        }

        if (settings.moduleFormat === ModuleFormat.ESM) {
            let acc = "import ";
            if (this.variable) {
                if (this.typeOnly) acc += "type ";
                acc += this.variable.render(settings);
                acc += " from "
            } else if (this.as) {
                acc += `* as ${this.as} from `;
            }
            acc += `"${targetFile}"`;
            return acc;
        } else {
            // CommonJS require syntax
            // TODO import * ?
            if (!this.variable) {
                return `require("${targetFile}")`;
            } else {
                return `const ${this.variable.render(settings)} = require("${targetFile}")`;
            }
        }
    }

    static fromTokens(reader: TokenReader<JSToken>): ImportStatement {
        reader.expectNext(JSToken.Import);
        // 'Import * as x from "module"'
        if (reader.current.type === JSToken.Multiply) {
            reader.move();
            reader.expectNext(JSToken.As);
            reader.expect(JSToken.Identifier);
            const importAlias = reader.current.value;
            reader.move();
            reader.expectNext(JSToken.From);
            reader.expect(JSToken.StringLiteral);
            const from = reader.current.value!;
            reader.move();
            return new ImportStatement(null, from, importAlias);
        }
        // 'Import "module"' as side effect
        else if (reader.current.type === JSToken.StringLiteral) {
            const from = reader.current.value!;
            reader.move();
            return new ImportStatement(null, from);
        }
        // 'Import x from "module"' or 'import {a, b} from "module"'
        else {
            let typeOnly: boolean = false;
            if (reader.current.type === JSToken.Type) {
                reader.move();
                typeOnly = true;
            }
            const imports = VariableDeclaration.fromTokens(reader, { context: VariableContext.Parameter });
            reader.expectNext(JSToken.From);
            reader.expect(JSToken.StringLiteral);
            const from = reader.current.value;
            reader.move();
            return new ImportStatement(imports, from!, null, typeOnly);
        }
    }
}

export class ExportStatement implements IStatement {

    constructor(
        public exported: IStatement,
        public isDefault: boolean = false,
    ) { }

    render(settings: IRenderSettings = defaultRenderSettings): string {
        if (settings.moduleFormat === ModuleFormat.ESM) {
            let acc = "export ";
            if (this.isDefault) {
                acc += "default "
            }
            const serializedExport = this.exported.render(settings);
            if (!serializedExport) return "";
            return acc + serializedExport;
        } else if (settings.moduleFormat === ModuleFormat.CJS) {
            if (this.exported instanceof ClassDeclaration || this.exported instanceof FunctionDeclaration || this.exported instanceof VariableDeclaration || this.exported instanceof InterfaceDeclaration) {
                /**
                 * this.exported is rendered first because: `export function x() {}` !== module.exports.x = function x() {}. As in the second example x is not hoisted or something like that...
                 */
                let acc = this.exported.render(settings);
                if (!acc) return "";
                
                acc += "\n";
                acc += "module.exports";

                // TODO what if export default class {}. This is covered up by non nullable operator
                const exportName = this.exported instanceof VariableDeclaration ? this.exported.name : this.exported.name!.name;

                if (!this.isDefault) {
                    acc += `.${exportName}`;
                }
                acc += ` = ${exportName}`;
                return acc;
            } else {
                // TODO export 2 + 2;
                throw Error(`Not Supported - Rendering exported member ${this.exported.constructor.name}`);
            }
        } else {
            throw Error(`Unknown moduleFormat ${settings.moduleFormat}`);
        }
    }

    static fromTokens(reader: TokenReader<JSToken>): ExportStatement {
        reader.expectNext(JSToken.Export);
        let isDefault = false;
        if (reader.current.type === JSToken.Default) {
            isDefault = true;
            reader.move();
        }
        const exported = ParseStatement(reader);
        return new ExportStatement(exported, isDefault);
    }

}