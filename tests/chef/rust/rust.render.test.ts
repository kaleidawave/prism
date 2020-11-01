import { FunctionDeclaration } from "../../../src/chef/rust/statements/function";
import { ForStatement } from "../../../src/chef/rust/statements/for";
import { IfStatement } from "../../../src/chef/rust/statements/if";
import { StructStatement, TypeSignature } from "../../../src/chef/rust/statements/struct";
import { defaultRenderSettings } from "../../../src/chef/helpers";
import { VariableDeclaration } from "../../../src/chef/rust/statements/variable";
import { VariableReference } from "../../../src/chef/rust/values/variable";
import { Expression, Operation } from "../../../src/chef/rust/values/expression";

const rustRenderSettings = defaultRenderSettings;

describe("Statements", () => {
    describe("Function", () => {
        test("Function name", () => {
            const func = new FunctionDeclaration("function_x", [], null, []);
            expect(func.render(rustRenderSettings)).toBe("fn function_x() {}")
        });

        test("Function parameters", () => {
            const func = new FunctionDeclaration("function_x", [["param1", new TypeSignature("String")]], null, []);
            expect(func.render(rustRenderSettings)).toBe("fn function_x(param1: String) {}");
        });

        test("Public function", () => {
            const func = new FunctionDeclaration("function_x", [], null, [], true);
            expect(func.render(rustRenderSettings)).toBe("pub fn function_x() {}");
        });

        test("Return type", () => {
            const func = new FunctionDeclaration("function_x", [], new TypeSignature("String"), []);
            expect(func.render(rustRenderSettings)).toBe("fn function_x() -> String {}");
        });
    });

    describe("If", () => {
        test("Condition", () => {
            const ifStatement = new IfStatement(new VariableReference("x"), []);
            expect(ifStatement.render(rustRenderSettings)).toBe("if x {}");
        });
    });

    describe("For", () => {
        test("Condition", () => {
            const forStatement = new ForStatement("y", new VariableReference("x"), []);
            expect(forStatement.render(rustRenderSettings)).toBe("for y in x {}");
        });
    });

    describe("Struct", () => {
        test("Name", () => {
            const structStatement = new StructStatement(new TypeSignature("x"), new Map);
            expect(structStatement.render(rustRenderSettings)).toBe("struct x {}");
        });

        test.todo("Type signature");
        test.todo("Public fields");
        test.todo("Public");
    });

    describe("Variable declaration", () => {
        test("Name", () => {
            const variable = new VariableDeclaration("x");
            expect(variable.render(rustRenderSettings)).toBe("let x");
        });

        test("Mutable", () => {
            const variable = new VariableDeclaration("x", true);
            expect(variable.render(rustRenderSettings)).toBe("let mut x");
        });
    });
});

describe("Values", () => {
    describe("Variable reference", () => {
        test("Name", () => {
            const variable = new VariableReference("x");
            expect(variable.render(rustRenderSettings)).toBe("x");
        });

        test("Parent", () => {
            const variable = new VariableReference("x", new VariableReference("y"));
            expect(variable.render(rustRenderSettings)).toBe("y.x");
        });

        test("Scoped", () => {
            const variable = new VariableReference("x", new VariableReference("y"), true);
            expect(variable.render(rustRenderSettings)).toBe("y::x");
        });
    });

    describe("Expression", () => {
        test("Call", () => {
            const expr = new Expression(
                new VariableReference("x"),
                Operation.Call
            );
            expect(expr.render(rustRenderSettings)).toBe("x()");
        });

        test("Borrow", () => {
            const expr = new Expression(
                new VariableReference("x"),
                Operation.Borrow
            );
            expect(expr.render(rustRenderSettings)).toBe("&x");
        });
    });
});