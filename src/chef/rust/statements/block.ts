import { VariableDeclaration } from "./variable";
import { Expression } from "../values/expression";
import { FunctionDeclaration, ReturnStatement } from "./function";
import { defaultRenderSettings } from "../../helpers";

export type Statements = Expression | VariableDeclaration | FunctionDeclaration | ReturnStatement;

export function renderStatements(statements: Array<Statements>, settings = defaultRenderSettings, doIndent: boolean = true): string {
    let acc = "";
    for (const statement of statements) {
        // TODO deep indent
        if (doIndent) acc += " ".repeat(settings.indent);
        acc += statement.render(settings);
        if (!(statement instanceof FunctionDeclaration)) {
            acc += ";";
        }
        acc += "\n";
    } 
    return acc;
}