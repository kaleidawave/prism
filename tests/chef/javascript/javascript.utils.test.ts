import { VariableReference } from "../../../src/chef/javascript/components/value/variable";
import { Group } from "../../../src/chef/javascript/components/value/group";
import { Module } from "../../../src/chef/javascript/components/module";
import { aliasVariables, findVariables, replaceVariables } from "../../../src/chef/javascript/utils/variables";
import { Expression, Operation } from "../../../src/chef/javascript/components/value/expression";
import { FunctionDeclaration, ArgumentList } from "../../../src/chef/javascript/components/constructs/function";
import { compileIIFE, reverseValue } from "../../../src/chef/javascript/utils/reverse";
import { Type, Value } from "../../../src/chef/javascript/components/value/value";
import { ReturnStatement } from "../../../src/chef/javascript/components/statements/statement";
import { TemplateLiteral } from "../../../src/chef/javascript/components/value/template-literal";
import { typeSignatureToIType } from "../../../src/chef/javascript/utils/types";
import { TypeSignature } from "../../../src/chef/javascript/components/types/type-signature";

describe("Variables", () => {
    test("fromChain", () => {
        const variableFromChain = VariableReference.fromChain("this", "data", "member");

        expect(variableFromChain).toMatchObject({
            name: "member",
            parent: {
                name: "data",
                parent: {
                    name: "this"
                }
            }
        });
    });

    test("toChain", () => {
        const variable = new VariableReference("x", new VariableReference("y", new VariableReference("z")));

        expect(variable.toChain()).toMatchObject(["z", "y", "x"]);
    });

    describe("isEqual", () => {
        test("Produces true", () => {
            const variable1 = new VariableReference("x", new VariableReference("y"));
            const variable2 = new VariableReference("x", new VariableReference("y"));

            expect(variable1.isEqual(variable2)).toBeTruthy();
        });

        test("Produces false", () => {
            const variable1 = new VariableReference("x", new VariableReference("y"));
            const variable2 = new VariableReference("x", new VariableReference("t"));

            expect(variable1.isEqual(variable2)).toBeFalsy();
        });
    });
});

describe("Includes", () => {

    test("In template literals", () => {
        const expression = Expression.fromString("`Hello ${name}`");
        const variablesInLiteral = findVariables(expression);
        expect(variablesInLiteral[0].name).toBe("name");
    });

    test("If statement", () => {
        const mod = Module.fromString("if (a) {}");
        const variables = findVariables(mod.statements[0]);
        expect(variables[0].name).toBe("a");
    });

    test("For of loop", () => {
        const mod = Module.fromString("for (const x of items) {}");
        const variables = findVariables(mod.statements[0]);
        expect(variables[0].name).toBe("items");
    });

    test("Argument list", () => {
        const expr = Expression.fromString("console.log(x, y)");
        const variables = findVariables(expr);
        expect(variables[0].name).toBe("x");
        expect(variables[1].name).toBe("y");
    });

    test("No duplicates", () => {
        const expr = Expression.fromString("2 < x && x < 4");
        const variables = findVariables(expr);
        expect(variables).toHaveLength(1);
    });
});

describe("Alias", () => {
    test("Alias", () => {
        const expr = Expression.fromString("a + b");
        aliasVariables(expr, VariableReference.fromChain("this", "data") as VariableReference);
        expect(expr.render()).toBe("this.data.a + this.data.b");
    });
});

describe("Replace variables", () => {
    test("Operator", () => {
        const expr = new Expression({
            lhs: new VariableReference("myNum"),
            operation: Operation.Multiply,
            rhs: new Value(5, Type.number)
        });

        replaceVariables(expr, new Value(4, Type.number), [new VariableReference("myNum")]);

        expect(expr).toMatchObject({
            lhs: { value: "4", type: Type.number },
            operation: Operation.Multiply,
            rhs: { value: "5", type: Type.number }
        })
    });
});

describe("Reverse expression", () => {
    test("Template literal", () => {
        const expr = new TemplateLiteral([
            "Name: ",
            new VariableReference("name")
        ]);

        const reverseExpression = reverseValue(expr) as Expression;

        expect(reverseExpression).toBeInstanceOf(Expression);
        expect(reverseExpression).toMatchObject({
            lhs: { name: "slice", parent: { name: "value" } },
            operation: Operation.Call,
            rhs: { args: [{ value: "6" }] }
        });
    });
});

test("Compile IIFE", () => {
    const iife = new Expression({
        lhs: new Group(
            new FunctionDeclaration(null, ["test"], [
                new ReturnStatement(
                    new Expression({
                        lhs: new VariableReference("test"),
                        operation: Operation.Multiply,
                        rhs: new Value(8, Type.number)
                    })
                )
            ])
        ),
        operation: Operation.Call,
        rhs: new ArgumentList([new Value(2, Type.number)])
    });

    const compiled = compileIIFE(iife);

    expect(compiled).toBeInstanceOf(Expression);
    expect(compiled).toMatchObject({
        lhs: { value: "2", type: Type.number },
        operation: Operation.Multiply,
        rhs: { value: "8", type: Type.number }
    })
});

describe("Types", () => {
    test("Properties from interface", () => {
        const mod = Module.fromString(`interface A {foo: string}`);

        const typeMap = typeSignatureToIType(new TypeSignature("A"), mod);
        expect(typeMap.name).toBe("A");
        expect(typeMap.properties?.has("foo")).toBeTruthy();
        expect(typeMap.properties!.get("foo")).toMatchObject({ name: "string" });
    });

    test("Resolves enum", () => {
        const mod = Module.fromString(`enum X { A, B }`);

        const type_ = typeSignatureToIType(new TypeSignature("X"), mod);
        expect(type_).toMatchObject({name: "number"});
    });

    test("Resolves string enum", () => {
        const mod = Module.fromString(`enum Y { A = "a", B = "b" }`);

        const type_ = typeSignatureToIType(new TypeSignature("Y"), mod);
        expect(type_).toMatchObject({name: "string"});
    });

    test("Resolves string union", () => {
        const mod = Module.fromString(`type Z = "a" | "b" | "c"`);

        const type_ = typeSignatureToIType(new TypeSignature("Z"), mod);
        expect(type_).toMatchObject({name: "string"});
    });
});