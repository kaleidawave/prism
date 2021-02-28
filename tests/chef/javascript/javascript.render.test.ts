import { Expression, Operation, VariableReference } from "../../../src/chef/javascript/components/value/expression";
import { Group } from "../../../src/chef/javascript/components/value/group";
import { VariableDeclaration } from "../../../src/chef/javascript/components/statements/variable";
import { ArgumentList, FunctionDeclaration, GetSet } from "../../../src/chef/javascript/components/constructs/function";
import { Value, Type } from "../../../src/chef/javascript/components/value/value";
import { IfStatement, ElseStatement } from "../../../src/chef/javascript/components/statements/if";
import { ReturnStatement, BreakStatement, ContinueStatement } from "../../../src/chef/javascript/components/statements/statement";
import { TemplateLiteral } from "../../../src/chef/javascript/components/value/template-literal";
import { ForStatement, ForIteratorExpression, ForStatementExpression } from "../../../src/chef/javascript/components/statements/for";
import { WhileStatement } from "../../../src/chef/javascript/components/statements/while";
import { ArrayLiteral } from "../../../src/chef/javascript/components/value/array";
import { ObjectLiteral } from "../../../src/chef/javascript/components/value/object";
import { ClassDeclaration } from "../../../src/chef/javascript/components/constructs/class";
import { RegExpLiteral, RegExpressionFlags } from "../../../src/chef/javascript/components/value/regex";
import { ImportStatement, ExportStatement } from "../../../src/chef/javascript/components/statements/import-export";
import { ModuleFormat, ScriptLanguages, makeRenderSettings, defaultRenderSettings } from "../../../src/chef/helpers";
import { TypeSignature } from "../../../src/chef/javascript/components/types/type-signature";
import { TryBlock, CatchBlock } from "../../../src/chef/javascript/components/statements/try-catch";
import { SwitchStatement } from "../../../src/chef/javascript/components/statements/switch";
import { InterfaceDeclaration } from "../../../src/chef/javascript/components/types/interface";
import { EnumDeclaration } from "../../../src/chef/javascript/components/types/enum";

const minificationSettings = makeRenderSettings({ minify: true });
const typescriptSettings = makeRenderSettings({ scriptLanguage: ScriptLanguages.Typescript, minify: true });

describe("Chaining, indexing, calling", () => {
    test("Console.log", () => {
        const expr = new Expression({
            lhs: VariableReference.fromChain("console", "log"),
            operation: Operation.Call,
            rhs: new ArgumentList([new Value(Type.string, "Hello World")])
        });

        expect(expr.render()).toBe(`console.log("Hello World")`)
    });

    test("Index", () => {
        const expr = new Expression({
            lhs: new VariableReference("arr"),
            operation: Operation.Index,
            rhs: new Value(Type.number, 4)
        });

        expect(expr.render()).toBe("arr[4]");
    });

    test("Initialization", () => {
        const expr = new Expression({
            lhs: new VariableReference("Rectangle"),
            operation: Operation.Initialize,
            rhs: new ArgumentList([
                new Value(Type.number, 4),
                new Value(Type.number, 10)
            ])
        });

        expect(expr.render()).toBe("new Rectangle(4, 10)");
    });
});

describe("Variables", () => {
    test("Constant", () => {
        const variable = new VariableDeclaration("var1", { isConstant: true });
        expect(variable.render()).toBe("const var1");
    });

    test("Let", () => {
        const variable = new VariableDeclaration("var1", { isConstant: false });
        expect(variable.render()).toBe("let var1");
    });

    test("Value", () => {
        const variable = new VariableDeclaration("var1", { value: new Value(Type.number, 42) });
        expect(variable.render()).toBe("const var1 = 42");
    });

    test("Array destructuring", () => {
        const variable = new VariableDeclaration(new Map([
            [0, new VariableDeclaration("a")],
            [1, new VariableDeclaration("b")]
        ]), { value: new VariableReference("x") });
        expect(variable.render()).toBe("const [a, b] = x");
    });

    test("Object destructuring", () => {
        const variable = new VariableDeclaration(new Map([
            ["a", new VariableDeclaration("a")],
            ["b", new VariableDeclaration("b")]
        ]), { value: new VariableReference("x") });
        expect(variable.render()).toBe("const {a, b} = x");
    });
});

describe("Operators", () => {
    describe("Binary operators", () => {
        test("Add", () => {
            const expr = new Expression({
                lhs: new Value(Type.number, 4),
                operation: Operation.Add,
                rhs: new Value(Type.number, 15)
            });

            expect(expr.render()).toBe("4 + 15");
        });

        test("Logical and", () => {
            const expr = new Expression({
                lhs: new Value(Type.boolean, true),
                operation: Operation.LogAnd,
                rhs: new Value(Type.boolean, false)
            });

            expect(expr.render()).toBe("true && false");
        });

        test("Logical or", () => {
            const expr = new Expression({
                lhs: new VariableReference("a"),
                operation: Operation.LogOr,
                rhs: new VariableReference("b")
            });

            expect(expr.render()).toBe("a || b");
        });

        test("Less than", () => {
            const expr = new Expression({
                lhs: new VariableReference("a"),
                operation: Operation.LessThan,
                rhs: new VariableReference("b")
            });

            expect(expr.render()).toBe("a < b");
        });

        test("Greater than", () => {
            const expr = new Expression({
                lhs: new VariableReference("a"),
                operation: Operation.GreaterThan,
                rhs: new VariableReference("b")
            });

            expect(expr.render()).toBe("a > b");
        });

        test("Strict equals", () => {
            const expr = new Expression({
                lhs: new VariableReference("a"),
                operation: Operation.StrictEqual,
                rhs: new VariableReference("b")
            });

            expect(expr.render()).toBe("a === b");
        });

        test("Strict not equals", () => {
            const expr = new Expression({
                lhs: new VariableReference("a"),
                operation: Operation.StrictNotEqual,
                rhs: new VariableReference("b")
            });

            expect(expr.render()).toBe("a !== b");
        });

        // TODO other x operators
    });

    describe("Other infix", () => {
        test("Assignment", () => {
            const expr = new Expression({
                lhs: new VariableReference("a"),
                operation: Operation.Assign,
                rhs: new Value(Type.number, 12)
            });

            expect(expr.render()).toBe("a = 12");
        });

        test("In", () => {
            const expr = new Expression({
                lhs: new VariableReference("myProp"),
                operation: Operation.In,
                rhs: new VariableReference("myObj")
            });

            expect(expr.render()).toBe("myProp in myObj");
        });

        test("Instanceof", () => {
            const expr = new Expression({
                lhs: new VariableReference("myCar"),
                operation: Operation.InstanceOf,
                rhs: new VariableReference("Car")
            });

            expect(expr.render()).toBe("myCar instanceof Car");
        });
    });

    describe("Unary operators", () => {
        test("Increment", () => {
            const expr = new Expression({
                lhs: new VariableReference("x"),
                operation: Operation.PostfixIncrement
            });

            expect(expr.render()).toBe("x++");
        });

        test("Decrement", () => {
            const expr = new Expression({
                lhs: new VariableReference("x"),
                operation: Operation.PostfixDecrement
            });

            expect(expr.render()).toBe("x--");
        });

        test("Spread", () => {
            const expr = new Expression({
                lhs: new VariableReference("x"),
                operation: Operation.Spread
            });

            expect(expr.render()).toBe("...x");
        });

        test("Await", () => {
            const expr = new Expression({
                lhs: new Expression({
                    lhs: new VariableReference("getFromDB"),
                    operation: Operation.Call,
                    rhs: new ArgumentList()
                }),
                operation: Operation.Await
            });

            expect(expr.render()).toBe("await getFromDB()");
        });

        test("Yield", () => {
            const expr = new Expression({
                lhs: new Value(Type.number, 2),
                operation: Operation.Yield
            });

            expect(expr.render()).toBe("yield 2");
        });

        test("Delegated Yield", () => {
            const expr = new Expression({
                lhs: new VariableReference("array"),
                operation: Operation.DelegatedYield
            });

            expect(expr.render()).toBe("yield* array");
        });
    });

    test("Ternary operator", () => {
        const expr = new Expression({
            lhs: new VariableReference("myBool"),
            operation: Operation.Ternary,
            rhs: new ArgumentList([
                new Value(Type.number, 4),
                new Value(Type.number, 2)
            ])
        });

        expect(expr.render()).toBe("myBool ? 4 : 2");
    });

    test("Optional chaining", () => {
        const expr = new Expression({
            lhs: new VariableReference("myObj"),
            operation: Operation.OptionalChain,
            rhs: new VariableReference("prop")
        });

        expect(expr.render()).toBe("myObj?.prop");
    });

    test("Optional calling", () => {
        const expr = new Expression({
            lhs: new VariableReference("func"),
            operation: Operation.OptionalCall,
            rhs: new ArgumentList([
                new Value(Type.number, 4)
            ])
        });

        expect(expr.render()).toBe("func?.(4)");
    });

    test("Group", () => {
        const expr = new Expression({
            lhs: new Group(new Expression({
                lhs: new Value(Type.number, 2),
                operation: Operation.Multiply,
                rhs: new Value(Type.number, 3)
            })),
            operation: Operation.Add,
            rhs: new Value(Type.number, 4)
        });

        expect(expr.render()).toBe("(2 * 3) + 4");
    });

});

describe("Function", () => {
    test("Function", () => {
        const func = new FunctionDeclaration("myFunc", [], []);

        expect(func.render()).toBe("function myFunc() {}");
    });

    describe("Parameters", () => {
        test("Parameters", () => {
            const func = new FunctionDeclaration("myFunc", ["x", "y"], []);

            expect(func.render()).toBe("function myFunc(x, y) {}");
        });

        test("Spread parameter", () => {
            const func = new FunctionDeclaration("myFunc", [
                new VariableDeclaration("params", { spread: true })
            ]);

            expect(func.render()).toBe("function myFunc(...params) {}");
        });

        test("Parameter type", () => {
            const func = new FunctionDeclaration("myFunc", [
                new VariableDeclaration("x", { typeSignature: new TypeSignature("string") })
            ]);

            expect(func.render(typescriptSettings))
                .toBe("function myFunc(x: string){}");
        });

        test("Parameter default value", () => {
            const func = new FunctionDeclaration("myFunc", [
                new VariableDeclaration("x", { value: new Value(Type.number, 4) })
            ]);

            expect(func.render()).toBe("function myFunc(x = 4) {}");
        });
    })

    test("Return statement", () => {
        const returnStatement = new ReturnStatement(new Expression({
            lhs: new VariableReference("x"),
            operation: Operation.Add,
            rhs: new VariableReference("y")
        }));

        expect(returnStatement.render()).toBe("return x + y")
    });

    test("Return type", () => {
        const func = new FunctionDeclaration("myFunc", [], [], { returnType: new TypeSignature({ name: "number" }) });

        expect(func.render(typescriptSettings)).toBe("function myFunc(): number{}")
    });

    describe("Arrow function", () => {
        test("Single parameter", () => {
            const arrowFunction = new FunctionDeclaration(
                null, ["x"],
                [new ReturnStatement(new Value(Type.number, 2))],
                { bound: false }
            );

            expect(arrowFunction.render()).toBe("x => 2");
        });

        test("Multiple parameters", () => {
            const arrowFunction = new FunctionDeclaration(
                null, ["x", "y"],
                [new ReturnStatement(new Expression({
                    lhs: new VariableReference("x"),
                    operation: Operation.Add,
                    rhs: new VariableReference("y")
                }))],
                { bound: false }
            );

            expect(arrowFunction.render()).toBe("(x, y) => x + y");
        });

        test("Body", () => {
            const arrowFunction = new FunctionDeclaration(
                null, ["x"],
                [new IfStatement(new Expression({
                    lhs: new VariableReference("x"),
                    operation: Operation.GreaterThan,
                    rhs: new Value(Type.number, 4)
                }), [new ReturnStatement(new Value(Type.string, "abc"))])],
                { bound: false }
            );

            expect(arrowFunction.render(minificationSettings)).toBe(`x=>{if(x>4){return"abc"}}`);
        });
    });

    test("Generator", () => {
        const generatorFunction = new FunctionDeclaration("func", [], [], { isGenerator: true });

        expect(generatorFunction.render()).toBe("function* func() {}")
    });

    test("Async", () => {
        const asyncFunction = new FunctionDeclaration("func", [], [], { isAsync: true });

        expect(asyncFunction.render()).toBe("async function func() {}")
    });
});

describe("Conditional", () => {
    test("If statement", () => {
        const ifStatement = new IfStatement(
            new Expression({
                lhs: new VariableReference("num1"),
                operation: Operation.GreaterThan,
                rhs: new Value(Type.number, 3)
            }),
            []
        );

        expect(ifStatement.render()).toBe("if (num1 > 3) {}")
    });

    test("Else statement", () => {
        const ifElseStatement = new IfStatement(
            new Value(Type.boolean, true),
            [],
            new ElseStatement(null, [])
        );

        expect(ifElseStatement.render()).toBe("if (true) {} else {}")
    });

    test("Switch statement", () => {
        const switchStatement = new SwitchStatement(
            new VariableReference("x"),
            [
                [new Value(Type.number, 4), [new BreakStatement()]],
                [new Value(Type.number, 5), [new BreakStatement()]],
            ]
        );

        expect(switchStatement.render(minificationSettings)).toBe(`switch(x){case 4:break;case 5:break;}`)
    });
});

describe("Loops", () => {
    test("For of loop", () => {
        const forLoop = new ForStatement(new ForIteratorExpression(
            new VariableDeclaration("x", { isConstant: true }),
            Operation.Of,
            new VariableReference("array")
        ), []);

        expect(forLoop.render()).toBe("for (const x of array) {}");
    });

    test("For i loop", () => {
        const forLoop = new ForStatement(new ForStatementExpression(
            new VariableDeclaration("i", { isConstant: false, value: new Value(Type.number, 0) }),
            new Expression({
                lhs: new VariableReference("i"),
                operation: Operation.LessThan,
                rhs: new Value(Type.number, 5)
            }),
            new Expression({
                lhs: new VariableReference("i"),
                operation: Operation.PostfixIncrement
            })
        ), []);

        expect(forLoop.render()).toBe("for (let i = 0; i < 5; i++) {}");
    });

    test("While loop", () => {
        const whileLoop = new WhileStatement(new Value(Type.boolean, true), []);

        expect(whileLoop.render()).toBe("while (true) {}")
    });

    test("Break", () => {
        const breakStatement = new BreakStatement();

        expect(breakStatement.render()).toBe("break");
    });

    test("Continue", () => {
        const continueStatement = new ContinueStatement();

        expect(continueStatement.render()).toBe("continue");
    });
});

describe("Class", () => {
    test("Method", () => {
        const cls = new ClassDeclaration("Class1", [
            new FunctionDeclaration("myMethod")
        ]);

        expect(cls.render(minificationSettings)).toBe("class Class1{myMethod(){}}")
    });

    test("Member", () => {
        const cls = new ClassDeclaration("Class1", [
            new VariableDeclaration("member", {
                value: new Value(Type.number, 7)
            })
        ]);

        expect(cls.render(minificationSettings)).toBe("class Class1{member=7}")
    });

    test("Static members", () => {
        const cls = new ClassDeclaration("Class1", [
            new VariableDeclaration("staticMember", {
                isStatic: true,
                value: new Value(Type.number, 4)
            })
        ]);

        expect(cls.render(minificationSettings)).toBe("class Class1{static staticMember=4}")
    });

    test("Base", () => {
        const cls = new ClassDeclaration("Class1", [], { base: "HTMLElement" });

        expect(cls.render()).toBe("class Class1 extends HTMLElement {}")
    });

    test("Getter", () => {
        const getterFunc = new FunctionDeclaration("x", [], [], { getSet: GetSet.Get });
        const cls = new ClassDeclaration("Class1", [getterFunc]);

        expect(cls.render(minificationSettings)).toBe("class Class1{get x(){}}")
    });

    test("Setter", () => {
        const setterFunc = new FunctionDeclaration("x", ["value"], [], { getSet: GetSet.Set });
        const cls = new ClassDeclaration("Class1", [setterFunc]);

        expect(cls.render(minificationSettings)).toBe("class Class1{set x(value){}}")
    });

    test("Abstract", () => {
        const cls = new ClassDeclaration("AbstractClass", [], { isAbstract: true });

        expect(cls.render(typescriptSettings)).toBe("abstract class AbstractClass{}")
    });

    test("Abstract member", () => {
        const cls = new ClassDeclaration("AbstractClass", [
            new VariableDeclaration("abstractMember", { isAbstract: true })
        ], {
            isAbstract: true
        });

        expect(cls.render(typescriptSettings)).toBe("abstract class AbstractClass{abstract abstractMember}")
    });
});

describe("Values", () => {

    test("Null", () => {
        expect(new Value(Type.object).render()).toBe("null");
    });

    test("Undefined", () => {
        expect(new Value(Type.undefined).render()).toBe("undefined");
    });

    test("Number", () => {
        expect(new Value(Type.number, 4.5).render()).toBe("4.5");
    });

    test("Booleans", () => {
        expect(new Value(Type.boolean, true).render()).toBe("true");
        expect(new Value(Type.boolean, false).render()).toBe("false");
    });

    describe("Regexp", () => {
        test("Regexp", () => {
            expect(new RegExpLiteral("ab+c").render()).toBe("/ab+c/");
        });

        test("Regexp w flags", () => {
            expect(new RegExpLiteral("ab+c", new Set([RegExpressionFlags.Unicode])).render()).toBe("/ab+c/u");
        });
    });

    test("Array literal", () => {
        const array = new ArrayLiteral([
            new Value(Type.number, 4),
            new Value(Type.number, 2),
            new Value(Type.number, 3)
        ]);

        expect(array.render()).toBe("[4, 2, 3]");
    });

    describe("Object literal", () => {
        test("Simple object literal", () => {
            const objectLiteral = new ObjectLiteral(new Map([
                ["a", new Value(Type.number, 4)],
                ["b", new Value(Type.number, 12)]
            ]));

            expect(objectLiteral.render(defaultRenderSettings, { inline: true })).toBe("{ a: 4, b: 12 }");
        });

        test("Object literal with function", () => {
            const objectLiteral = new ObjectLiteral();
            const func = new FunctionDeclaration("func", [], [], { parent: objectLiteral });
            objectLiteral.values.set("func", func);

            expect(objectLiteral.render(defaultRenderSettings, { inline: true })).toBe("{func() {} }");
        });

        test("Shorthand member variable value", () => {
            const objectLiteral = new ObjectLiteral(new Map([
                ["variable", new VariableReference("variable")],
            ]));

            expect(objectLiteral.render(defaultRenderSettings, { inline: true })).toBe("{ variable }");
        });
    });

    describe("Template literal", () => {
        test("With value", () => {
            const templateLiteral = new TemplateLiteral(["Hello ", new VariableReference("name")]);

            expect(templateLiteral.render()).toBe("`Hello ${name}`");
        });
    });
});

describe("import, export", () => {
    const esmFormat = makeRenderSettings({ moduleFormat: ModuleFormat.ESM });

    test("ESM Import", () => {
        const importStatement = new ImportStatement(new VariableDeclaration("db"), "db");

        expect(importStatement.render(esmFormat)).toBe(`import db from "db"`);
    });

    test("Type only", () => {
        const importStatement = new ImportStatement([new VariableDeclaration("IUser")], "./models/user", null, true);

        expect(importStatement.render(typescriptSettings)).toBe(`import type {IUser} from "./models/user"`);
    });

    test("ESM Import (with destructuring)", () => {
        const importStatement = new ImportStatement([new VariableDeclaration("a"), new VariableDeclaration("b")], "myModule.js");

        expect(importStatement.render(esmFormat)).toBe(`import {a, b} from "myModule.js"`);
    });

    test("ESM Import (as side effect)", () => {
        const importStatement = new ImportStatement(null, "myBadSideEffectModule.js");

        expect(importStatement.render(esmFormat)).toBe(`import "myBadSideEffectModule.js"`);
    });

    const cjsFormat = makeRenderSettings({ moduleFormat: ModuleFormat.CJS });

    test("CJS Import (require)", () => {
        const importStatement = new ImportStatement(new VariableDeclaration("helpers"), "helpers.js");

        expect(importStatement.render(cjsFormat)).toBe(`const helpers = require("helpers.js")`);
    });

    test("CJS Import destructured", () => {
        const importStatement = new ImportStatement([new VariableDeclaration("someFunc")], "helpers.js");

        expect(importStatement.render(cjsFormat)).toBe(`const {someFunc} = require("helpers.js")`);
    });

    const exportedFunction = new FunctionDeclaration("someFunc");

    test("ESM export", () => {
        const exportStatement = new ExportStatement(exportedFunction);

        expect(exportStatement.render(esmFormat)).toBe("export function someFunc() {}");
    });

    test("ESM default export", () => {
        const exportStatement = new ExportStatement(exportedFunction, true);

        expect(exportStatement.render(esmFormat)).toBe("export default function someFunc() {}");
    });

    test("CJS export", () => {
        const exportStatement = new ExportStatement(exportedFunction, false);

        expect(exportStatement.render(cjsFormat)).toBe("function someFunc() {}\nmodule.exports.someFunc = someFunc");
    });

    test("CJS default export", () => {
        const exportStatement = new ExportStatement(exportedFunction, true);

        expect(exportStatement.render(cjsFormat)).toBe("function someFunc() {}\nmodule.exports = someFunc");
    });
});

describe("Interfaces", () => {
    test("Interface", () => {
        const interface_ = new InterfaceDeclaration("IUser", null, new Map([["username", new TypeSignature("string")]]));

        expect(interface_.render(typescriptSettings)).toBe("interface IUser {\n    username: string\n}\n");
    });

    test("Optional member", () => {
        const interface_ = new InterfaceDeclaration(
            "IUser", null, 
            new Map([["username", new TypeSignature("string")]]), 
            new Map,
            new Set(["username"])
        );

        expect(interface_.render(typescriptSettings)).toBe("interface IUser {\n    username?: string\n}\n");
    });

    test("Extends", () => {
        const interface_ = new InterfaceDeclaration("IUser", new TypeSignature("IPartialUser"));

        expect(interface_.render(typescriptSettings)).toBe("interface IUser extends IPartialUser {}\n");
    });

    test.todo("Function type");
});

describe("Enums", () => {
    test("Enum", () => {
        const enum_ = new EnumDeclaration("X", new Map([
            ["A", new Value(Type.number, 0)],
            ["B", new Value(Type.number, 1)],
        ]));

        expect(enum_.render(typescriptSettings)).toBe("enum X {\n    A,\n    B\n}\n");
    });
    
    test("Render enum to JS object", () => {
        const enum_ = new EnumDeclaration("X", new Map([
            ["A", new Value(Type.number, 0)],
            ["B", new Value(Type.number, 1)],
        ]));
    
        expect(enum_.render(minificationSettings)).toBe("const X=Object.freeze({A:0,B:1})");
    });
});

describe("Type signatures", () => {
    test("Simple type", () => {
        const ts = new TypeSignature("number");

        expect(ts.render(typescriptSettings)).toBe("number");
    });

    test("Generic argument", () => {
        const ts = new TypeSignature({ name: "Array", typeArguments: [new TypeSignature("string")] });

        expect(ts.render(typescriptSettings)).toBe("Array<string>");
    });

    test("Union type", () => {
        const ts = new TypeSignature({
            name: "Union", typeArguments: [
                new TypeSignature("string"),
                new TypeSignature("number")]
        });

        expect(ts.render(typescriptSettings)).toBe("string | number");
    });

    test("Intersection type", () => {
        const ts = new TypeSignature({
            name: "Intersection", typeArguments: [
                new TypeSignature("a"),
                new TypeSignature("b")]
        });

        expect(ts.render(typescriptSettings)).toBe("a & b");
    });

    test("Literal type", () => {
        const ts = new TypeSignature({
            value: new Value(Type.string, "abc")
        });

        expect(ts.render(typescriptSettings)).toBe(`"abc"`);
    });

    test("Tuple type", () => {
        const ts = new TypeSignature({
            name: "Tuple", typeArguments: [
                new TypeSignature("number"),
                new TypeSignature("boolean")]
        });

        expect(ts.render(typescriptSettings)).toBe("[number, boolean]");
    });

    test.todo("Function");
    test.todo("Mapped types");
});

test("Try catch", () => {
    const tryStatement = new TryBlock([], new CatchBlock(new VariableDeclaration("error"), []));

    expect(tryStatement.render(minificationSettings)).toBe("try{}catch(error){}");
});