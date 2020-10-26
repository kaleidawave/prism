import { VariableDeclaration } from "./variable";
import { UseStatement } from "./use";
import { Expression } from "../values/expression";
import { FunctionDeclaration, ReturnStatement } from "./function";
import { defaultRenderSettings } from "../../helpers";
import { StructStatement } from "./struct";

export type Statements = Expression | VariableDeclaration | FunctionDeclaration | ReturnStatement | UseStatement | StructStatement;

export function renderStatements(statements: Array<Statements>, settings = defaultRenderSettings, doIndent: boolean = true): string {
    let acc = "";
    for (const statement of statements) {
        // TODO deep indent
        if (doIndent) acc += " ".repeat(settings.indent);
        acc += statement.render(settings);
        if (!(statement instanceof FunctionDeclaration || statement instanceof StructStatement)) {
            acc += ";";
        }
        acc += "\n";
    } 
    return acc;
}