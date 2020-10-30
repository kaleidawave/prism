import { VariableDeclaration } from "./variable";
import { UseStatement } from "./use";
import { Expression } from "../values/expression";
import { FunctionDeclaration, ReturnStatement } from "./function";
import { defaultRenderSettings } from "../../helpers";
import { StructStatement } from "./struct";
import { IfStatement } from "./if";
import { ForStatement } from "./for";
import { ModStatement } from "./mod";
import { DeriveStatement } from "./derive";

export type StatementTypes = Expression | VariableDeclaration | FunctionDeclaration | ReturnStatement | UseStatement | StructStatement | IfStatement | ForStatement | ModStatement | DeriveStatement;

export function renderStatements(statements: Array<StatementTypes>, settings = defaultRenderSettings, doIndent: boolean = true): string {
    let acc = "";
    for (const statement of statements) {
        const doNotAddSemiColon = statement instanceof FunctionDeclaration || statement instanceof StructStatement || statement instanceof ForStatement || statement instanceof IfStatement || statement instanceof DeriveStatement;
        if (doIndent) {
            acc += ("\n" + statement.render(settings) + (doNotAddSemiColon ? "" : ";")).replace(/\n/g, "\n" + " ".repeat(settings.indent));
        } else {
            acc += statement.render(settings) + (doNotAddSemiColon ? "" : ";") + "\n";
        }
    } 
    if (statements.length > 0 && doIndent) acc += "\n";
    return acc;
}