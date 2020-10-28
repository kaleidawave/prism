import { VariableDeclaration } from "./variable";
import { UseStatement } from "./use";
import { Expression } from "../values/expression";
import { FunctionDeclaration, ReturnStatement } from "./function";
import { defaultRenderSettings } from "../../helpers";
import { StructStatement } from "./struct";
import { IfStatement } from "./if";
import { ForStatement } from "./for";

export type StatementTypes = Expression | VariableDeclaration | FunctionDeclaration | ReturnStatement | UseStatement | StructStatement | IfStatement | ForStatement;

export function renderStatements(statements: Array<StatementTypes>, settings = defaultRenderSettings, doIndent: boolean = true): string {
    let acc = "";
    for (const statement of statements) {
        if (doIndent) acc += " ".repeat(settings.indent);
        acc += statement.render(settings); //.replace(/\n/, "\n" + " ".repeat(settings.indent));
        if (!(statement instanceof FunctionDeclaration || statement instanceof StructStatement || statement instanceof ForStatement || statement instanceof IfStatement)) {
            acc += ";";
        }
        acc += "\n";
    } 
    return acc;
}