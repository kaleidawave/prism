import { Statements, ParseStatement } from "../statements/statement";
import { TokenReader, IRenderSettings, defaultRenderSettings } from "../../../helpers";
import { JSToken } from "../../javascript";
import { ImportStatement, ExportStatement } from "../statements/import-export";
import { ClassDeclaration } from "./class";
import { FunctionDeclaration } from "./function";

const endingSwitchBlockTokens = new Set([JSToken.Default, JSToken.Case, JSToken.CloseCurly])

/**
 * Parses blocks from statements for, if, function etc
 * @param inSwitch If parsing a switch statement
 */
export function parseBlock(reader: TokenReader<JSToken>, inSwitch = false): Array<Statements> {
    if (reader.current.type === JSToken.OpenCurly || inSwitch) {
        if (reader.current.type === JSToken.OpenCurly) reader.move();
        const statements: Array<Statements> = [];
        while (reader.current.type as JSToken !== JSToken.CloseCurly) {
            statements.push(ParseStatement(reader));
            if (reader.current.type as JSToken === JSToken.SemiColon) reader.move();
            if (inSwitch && endingSwitchBlockTokens.has(reader.current.type)) return statements;
        }
        reader.move();
        return statements;
    } else {
        // If using shorthand block (without {}) then just parse in a single expression
        const statement = ParseStatement(reader);
        if (reader.current.type as JSToken === JSToken.SemiColon) reader.move();
        return [statement];
    }
}

/**
 * Renders out a "block" / list of statements
 * Handles indentation and pretty printing 
 * DOES NOT INCLUDE SURROUNDING CURLY BRACES
 * @param indent whether to indent block members
 */
export function renderBlock(block: Array<Statements>, settings: IRenderSettings = defaultRenderSettings, indent = true) {
    let acc = "";
    for (let i = 0; i < block.length; i++) {
        const statement = block[i];
        if (!statement) continue; // Not sure the case when the statement is falsy but handles this
        const serializedStatement = statement.render(settings);
        if (!serializedStatement) continue; // Handles "" from comment render if settings.comments is false

        if (settings.minify) {
            acc += serializedStatement;
            if (i + 1 < block.length) {
                // Minified statements have issues where cannot detect 
                acc += ";";
            }
        } else if (indent) {
            acc += ("\n" + serializedStatement).replace(/\n/g, "\n" + " ".repeat(settings.indent));
        } else {
            acc += serializedStatement;

            if (i + 1 < block.length) {
                acc += "\n";

                // Add padding around imports, classes and functions
                if (statement instanceof ImportStatement) {
                    // If next statement is import statement
                    if (block[i + 1] instanceof ImportStatement) continue;
                    acc += "\n";
                } else if (statement instanceof ClassDeclaration || statement instanceof FunctionDeclaration) {
                    acc += "\n";
                } else if (statement instanceof ExportStatement && (
                    statement.exported instanceof ClassDeclaration ||
                    statement.exported instanceof FunctionDeclaration)
                ) {
                    acc += "\n";
                }
            }
        }
    }
    if (block.length > 0 && !settings.minify && indent) acc += "\n";
    return acc;
} 