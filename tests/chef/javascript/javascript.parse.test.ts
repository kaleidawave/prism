import { Module } from "../../../src/chef/javascript/components/module";
import { Expression, Operation } from "../../../src/chef/javascript/components/value/expression";
import { Group } from "../../../src/chef/javascript/components/value/group";
import { IfStatement } from "../../../src/chef/javascript/components/statements/if";
import { SwitchStatement } from "../../../src/chef/javascript/components/statements/switch";
import { VariableDeclaration } from "../../../src/chef/javascript/components/statements/variable";
import { ObjectLiteral } from "../../../src/chef/javascript/components/value/object";
import { ClassDeclaration } from "../../../src/chef/javascript/components/constructs/class";
import { FunctionDeclaration, ArgumentList, GetSet } from "../../../src/chef/javascript/components/constructs/function";
import { Value, Type } from "../../../src/chef/javascript/components/value/value";
import { ArrayLiteral } from "../../../src/chef/javascript/components/value/array";
import { ForStatement, ForIteratorExpression, ForStatementExpression } from "../../../src/chef/javascript/components/statements/for";
import { TemplateLiteral } from "../../../src/chef/javascript/components/value/template-literal";
import { TryBlock, ThrowStatement } from "../../../src/chef/javascript/components/statements/try-catch";
import { InterfaceDeclaration } from "../../../src/chef/javascript/components/types/interface";
import { AsExpression, TypeDeclaration } from "../../../src/chef/javascript/components/types/statements";
import { RegExpLiteral, RegExpressionFlags } from "../../../src/chef/javascript/components/value/regex";
import { EnumDeclaration } from "../../../src/chef/javascript/components/types/enum";
import { ExportStatement, ImportStatement } from "../../../src/chef/javascript/components/statements/import-export";
import { ReturnStatement } from "../../../src/chef/javascript/components/statements/statement";
import { WhileStatement, DoWhileStatement } from "../../../src/chef/javascript/components/statements/while";
import { VariableReference } from "../../../src/chef/javascript/components/value/variable";

describe("Calling functions", () => {
    test("Call", () => {
        const expr = Expression.fromString("myFunc('Hello World')");

        expect(expr).toMatchObject({
            lhs: { name: "myFunc" },
            operation: Operation.Call,
            rhs: { args: [{ value: "Hello World", type: Type.string }] }
        });
    });

    test("Call with multiple arguments", () => {
        const expr = Expression.fromString("myFunc('Hello World', 4, true)");

        expect(expr).toMatchObject({
            lhs: { name: "myFunc" },
            operation: Operation.Call,
            rhs: {
                args: [
                    { value: "Hello World", type: Type.string },
                    { value: "4", type: Type.number },
                    { value: "true", type: Type.boolean },
                ]
            }
        });
    });

    test("Call without arguments", () => {
        const expr = Expression.fromString("myFunc()");

        expect(expr).toMatchObject({
            lhs: { name: "myFunc" },
            operation: Operation.Call,
            rhs: { args: [] }
        });
    });

    test("Operations in arguments", () => {
        const expr = Expression.fromString("myFunction(2, 1 + 6)");
        expect(expr).toMatchObject({
            lhs: { name: "myFunction" },
            operation: Operation.Call,
            rhs: {
                args: [
                    { value: "2", type: Type.number },
                    {
                        lhs: { value: "1", type: Type.number },
                        operation: Operation.Add,
                        rhs: { value: "6", type: Type.number }
                    }
                ]
            }
        });
    });

    test("Deep arguments", () => {
        const expr = Expression.fromString("myFunction(x.get(4), array[2].item(6))");
        expect(expr).toMatchObject({
            lhs: { name: "myFunction" },
            operation: Operation.Call,
            rhs: {
                args: [
                    {
                        lhs: { name: "get", parent: { name: "x" } },
                        operation: Operation.Call,
                        rhs: { args: [{ value: "4", type: Type.number }] }
                    },
                    {
                        lhs: {
                            name: "item", parent: {
                                lhs: { name: "array" },
                                operation: Operation.Index,
                                rhs: { value: "2", type: Type.number }
                            }
                        },
                        operation: Operation.Call,
                        rhs: { args: [{ value: "6", type: Type.number }] }
                    }
                ]
            }
        });
    });
});

describe("Indexing", () => {
    test("Indexing", () => {
        const expr = Expression.fromString("myArray[4]");

        expect(expr).toMatchObject({
            lhs: { name: "myArray" },
            operation: Operation.Index,
            rhs: {
                value: "4", type: Type.number
            }
        });
    });
});

describe("Chaining", () => {
    test("Chaining", () => {
        const expr = Expression.fromString("myObj.prop1.prop2.myFunction()");

        expect(expr).toMatchObject({
            lhs: {
                name: "myFunction",
                parent: {
                    name: "prop2",
                    parent: {
                        name: "prop1",
                        parent: {
                            name: "myObj"
                        }
                    }
                }
            },
            operation: Operation.Call,
            rhs: { args: [] }
        });
    });

    test("Optional chaining", () => {
        const expr = Expression.fromString("myObj?.prop1?.prop2");
        expect(expr).toMatchObject({
            lhs: {
                lhs: { name: "myObj" },
                operation: Operation.OptionalChain,
                rhs: { name: "prop1" }
            },
            operation: Operation.OptionalChain,
            rhs: { name: "prop2" }
        });
    });

    test("Optional indexing", () => {
        const expr = Expression.fromString("myObj?.[4]");
        expect(expr).toMatchObject({
            lhs: { name: "myObj" },
            operation: Operation.OptionalIndex,
            rhs: { value: "4", type: Type.number }
        });
    });

    test("Optional calling", () => {
        const expr = Expression.fromString("possibleFunc?.(arg1)");
        expect(expr).toMatchObject({
            lhs: { name: "possibleFunc" },
            operation: Operation.OptionalCall,
            rhs: { args: [{ name: "arg1" }] }
        });
    });
});

describe("Variables", () => {
    test("Variable name", () => {
        const variable = VariableDeclaration.fromString("const variable1 = 'Hello World';");
        expect(variable.name).toBe("variable1");
    });

    test("Variable value", () => {
        const variable = VariableDeclaration.fromString("const variable1 = 'Hello World';");
        expect(variable.name).toBe("variable1");
        expect(variable.value).toEqual({ value: "Hello World", type: Type.string });
    });

    test("Var declarations", () => {
        const variable = VariableDeclaration.fromString("var x;");
        expect(variable.isConstant).toBe(false);
    });

    test("Let declarations", () => {
        const variable = VariableDeclaration.fromString("let variable;");
        expect(variable.isConstant).toBe(false);
    });

    test("Const declarations", () => {
        const variable = VariableDeclaration.fromString("const constant = 2;");
        expect(variable.isConstant).toBe(true);
    });

    test("Unicode variable names", () => {
        const variable = VariableDeclaration.fromString("const \\u{0061} = 2;");
        expect(variable.name).toBe("\\u{0061}");
    });

    // TODO not implemented
    xtest("Multiple variables declared", () => {
        const variable = VariableDeclaration.fromString("let a = 0, b = 2;");
        expect(variable.entries?.has("a"));
        expect(variable.entries?.has("b"));
    });

    describe("Destructuring", () => {
        test("Array destructor", () => {
            const variable = VariableDeclaration.fromString("const [name] = myArray");
            expect(variable.entries?.get(0)).toMatchObject({ name: "name" });
        });

        test("Array destructor with empty", () => {
            const variable = VariableDeclaration.fromString("const [,name] = myArray");
            expect(variable.entries?.get(0)).toBeNull();
            expect(variable.entries?.get(1)).toMatchObject({ name: "name" });
        });

        test("Nested array destructor", () => {
            const variable = VariableDeclaration.fromString("const [[a, b]] = myArray");
            expect(variable.entries?.size).toBe(1);
            expect(variable.entries?.has(0)).toBeTruthy();
            const nestedArray = variable.entries!.get(0);
            expect(nestedArray?.entries?.get(0)).toMatchObject({ name: "a" });
            expect(nestedArray?.entries?.get(1)).toMatchObject({ name: "b" });
        });

        test("Array destructor with default", () => {
            const variable = VariableDeclaration.fromString("const [a, b = 3] = [1]");
            expect(variable.entries?.size).toBe(2);
            expect(variable.entries?.get(0)).toMatchObject({ name: "a" })
            expect(variable.entries?.get(1)).toMatchObject({
                name: "b",
                value: {
                    value: "3",
                    type: Type.number
                }
            });
        });

        test("Array destructor with spread", () => {
            const variable = VariableDeclaration.fromString("const [a, ...b] = myArray");

            expect(variable.entries?.size).toBe(2);
            expect(variable.entries?.get(0)).toMatchObject({ name: "a" });
            expect(variable.entries?.get(1)).toMatchObject({ name: "b", spread: true });
        });

        test("Object destructor", () => {
            const variable = VariableDeclaration.fromString("const {a, b} = myObj");

            expect(variable.entries?.size).toBe(2);
            expect(variable.entries?.get("a")).toMatchObject({ name: "a" });
            expect(variable.entries?.get("b")).toMatchObject({ name: "b" });
        });

        test("Object destructor with alias", () => {
            const variable = VariableDeclaration.fromString("const {a: c, b} = myObj");
            expect(variable.entries!.has("a")).toBeTruthy();
            expect(variable.entries!.get("a")).toMatchObject({ name: "c" });
            expect(variable.entries!.has("b")).toBeTruthy();
            expect(variable.entries!.get("b")).toMatchObject({ name: "b" });
        });

        test("Object destructor with default", () => {
            const variable = VariableDeclaration.fromString("const {a, b = 3} = myObj");
            expect(variable.entries!.has("a")).toBeTruthy();
            expect(variable.entries!.get("a")).toMatchObject({ name: "a" });
            expect(variable.entries!.has("b")).toBeTruthy();
            expect(variable.entries!.get("b")).toMatchObject({ name: "b", value: { value: "3", type: Type.number } });
        });

        test("Object destructor with spread", () => {
            const variable = VariableDeclaration.fromString("const {a, ...b} = myObj");
            expect(variable.entries!.has("a")).toBeTruthy();
            expect(variable.entries!.get("a")).toMatchObject({ name: "a" });
            expect(variable.entries!.has("b")).toBeTruthy();
            expect(variable.entries!.get("b")).toMatchObject({ name: "b", spread: true });
        });

        test.todo("Deep object destructor");
    });
});

describe("Operators", () => {
    describe("Math", () => {
        test("Addition", () => {
            const expr = Expression.fromString("4 + 5");
            expect(expr).toMatchObject({
                lhs: { value: "4", type: Type.number },
                operation: Operation.Add,
                rhs: { value: "5", type: Type.number },
            });
        });

        test("Subtraction", () => {
            const expr = Expression.fromString("14 - 2");
            expect(expr).toMatchObject({
                lhs: { value: "14", type: Type.number },
                operation: Operation.Subtract,
                rhs: { value: "2", type: Type.number }
            });
        });

        test("Multiplication", () => {
            const expr = Expression.fromString("4 * 5");
            expect(expr).toMatchObject({
                lhs: { value: "4", type: Type.number },
                operation: Operation.Multiply,
                rhs: { value: "5", type: Type.number },
            });
        });

        test("Division", () => {
            const expr = Expression.fromString("4 / 5");
            expect(expr).toMatchObject({
                lhs: { value: "4", type: Type.number },
                operation: Operation.Divide,
                rhs: { value: "5", type: Type.number },
            });
        });

        test("Exponent", () => {
            const expr = Expression.fromString("2 ** 3");
            expect(expr).toMatchObject({
                lhs: { value: "2", type: Type.number },
                operation: Operation.Exponent,
                rhs: { value: "3", type: Type.number },
            });
        });

        test("Modulo", () => {
            const expr = Expression.fromString("12 % 2");
            expect(expr).toMatchObject({
                lhs: { value: "12", type: Type.number },
                operation: Operation.Modulo,
                rhs: { value: "2", type: Type.number },
            });
        });

        test("Operator precedence", () => {
            const expr = Expression.fromString("2 + 3 * 5");
            expect(expr).toMatchObject({
                lhs: { value: "2", type: Type.number },
                operation: Operation.Add,
                rhs: {
                    lhs: { value: "3", type: Type.number },
                    operation: Operation.Multiply,
                    rhs: { value: "5", type: Type.number }
                },
            });
        });
    });

    describe("Assignment", () => {
        test("Assignment", () => {
            const expr = Expression.fromString("myNum = 4");

            expect(expr).toMatchObject({
                lhs: { name: "myNum" },
                operation: Operation.Assign,
                rhs: { value: "4", type: Type.number }
            });
        });

        test("Additional assignment", () => {
            const expr = Expression.fromString("myNum += 2");

            expect(expr).toMatchObject({
                lhs: { name: "myNum" },
                operation: Operation.AddAssign,
                rhs: { value: "2", type: Type.number }
            });
        });

        // TODO 11 more https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Assignment_Operators
    })

    describe("Equivalence", () => {
        test("<", () => {
            const comparison = Expression.fromString("x < 4");

            expect(comparison).toMatchObject({
                lhs: { name: 'x' },
                operation: Operation.LessThan,
                rhs: { value: "4", type: Type.number }
            });
        });

        test(">", () => {
            const comparison = Expression.fromString("x + 2 > 4");

            expect(comparison).toMatchObject({
                lhs: {
                    lhs: { name: 'x' },
                    operation: Operation.Add,
                    rhs: { value: "2", type: Type.number }
                },
                operation: Operation.GreaterThan,
                rhs: { value: "4", type: Type.number }
            });
        });

        test(">=", () => {
            const comparison = Expression.fromString("2 >= 4 + 5");

            expect(comparison).toMatchObject({
                lhs: { value: "2", type: Type.number },
                operation: Operation.GreaterThanEqual,
                rhs: {
                    lhs: { value: "4", type: Type.number },
                    operation: Operation.Add,
                    rhs: { value: "5", type: Type.number }
                }
            });
        });

        test("<=", () => {
            const comparison = Expression.fromString("2 + x <= 4 - 6");

            expect(comparison).toMatchObject({
                lhs: {
                    lhs: { value: "2", type: Type.number },
                    operation: Operation.Add,
                    rhs: { name: 'x' }
                },
                operation: Operation.LessThanEqual,
                rhs: {
                    lhs: { value: "4", type: Type.number },
                    operation: Operation.Subtract,
                    rhs: { value: "6", type: Type.number }
                }
            });
        });

        test("===", () => {
            const expr = Expression.fromString("x === 4");

            expect(expr).toMatchObject({
                lhs: { name: "x" },
                operation: Operation.StrictEqual,
                rhs: { value: "4", type: Type.number }
            });
        });

        test("!==", () => {
            const expr = Expression.fromString("2 - 3 !== 4");

            expect(expr).toMatchObject({
                lhs: {
                    lhs: { value: "2", type: Type.number },
                    operation: Operation.Subtract,
                    rhs: { value: "3", type: Type.number }
                },
                operation: Operation.StrictNotEqual,
                rhs: { value: "4", type: Type.number }
            });
        });

        test("==", () => {
            const expr = Expression.fromString("x == 4");

            expect(expr).toMatchObject({
                lhs: { name: "x" },
                operation: Operation.Equal,
                rhs: { value: "4", type: Type.number }
            });
        });

        test("!=", () => {
            const expr = Expression.fromString("2 - 3 != 4");

            expect(expr).toMatchObject({
                lhs: {
                    lhs: { value: "2", type: Type.number },
                    operation: Operation.Subtract,
                    rhs: { value: "3", type: Type.number }
                },
                operation: Operation.NotEqual,
                rhs: { value: "4", type: Type.number }
            });
        });
    });

    describe("Logical & bitwise", () => {

        test("&& - Logical And", () => {
            const expr = Expression.fromString("4 > 2 && true");

            expect(expr).toMatchObject({
                lhs: {
                    lhs: { value: "4", type: Type.number },
                    operation: Operation.GreaterThan,
                    rhs: { value: "2", type: Type.number }
                },
                operation: Operation.LogAnd,
                rhs: { value: "true", type: Type.boolean }
            });
        });

        test("|| - Logical Or", () => {
            const expr = Expression.fromString("1 === 1 || true");

            expect(expr).toMatchObject({
                lhs: {
                    lhs: { value: "1", type: Type.number },
                    operation: Operation.StrictEqual,
                    rhs: { value: "1", type: Type.number }
                },
                operation: Operation.LogOr,
                rhs: { value: "true", type: Type.boolean }
            });
        });

        test("& - Bitwise And", () => {
            const expr = Expression.fromString("0 & 1");
            expect(expr).toMatchObject({
                lhs: { value: "0", type: Type.number },
                operation: Operation.BitAnd,
                rhs: { value: "1", type: Type.number }
            });
        });

        test("| - Bitwise Or", () => {
            const expr = Expression.fromString("0 | 1");
            expect(expr).toMatchObject({
                lhs: { value: "0", type: Type.number },
                operation: Operation.BitOr,
                rhs: { value: "1", type: Type.number }
            });
        });

        test("^ - Bitwise Xor", () => {
            const expr = Expression.fromString("0 ^ 1");
            expect(expr).toMatchObject({
                lhs: { value: "0", type: Type.number },
                operation: Operation.BitXOr,
                rhs: { value: "1", type: Type.number }
            });
        });

        test("<< - Bit Shift Left", () => {
            const expr = Expression.fromString("0 << 1");
            expect(expr).toMatchObject({
                lhs: { value: "0", type: Type.number },
                operation: Operation.BitShiftLeft,
                rhs: { value: "1", type: Type.number }
            });
        });

        test(">> - Bit Shift Right", () => {
            const expr = Expression.fromString("0 >> 1");
            expect(expr).toMatchObject({
                lhs: { value: "0", type: Type.number },
                operation: Operation.BitShiftRight,
                rhs: { value: "1", type: Type.number }
            });
        });

        test(">>> - Unary Bit Shift Right", () => {
            const expr = Expression.fromString("0 >>> 1");
            expect(expr).toMatchObject({
                lhs: { value: "0", type: Type.number },
                operation: Operation.BitUShiftRight,
                rhs: { value: "1", type: Type.number }
            });
        });
    });

    describe("Other infix operators", () => {
        test("In", () => {
            const expr = Expression.fromString("prop in myObj");
            expect(expr).toMatchObject({
                lhs: { name: "prop" },
                operation: Operation.In,
                rhs: { name: "myObj" }
            });
        });

        test("Instanceof", () => {
            const expr = Expression.fromString("myInstance instanceof Car");
            expect(expr).toMatchObject({
                lhs: { name: "myInstance" },
                operation: Operation.InstanceOf,
                rhs: { name: "Car" }
            });
        });

        test("Nullish coalescing", () => {
            const expr = Expression.fromString("possibleNull ?? 'String'");
            expect(expr).toMatchObject({
                lhs: { name: "possibleNull" },
                operation: Operation.NullCoalescing,
                rhs: { value: "String", type: Type.string }
            });
        });

        test("As statement", () => {
            const expr = Expression.fromString("2 as Number");
            expect(expr).toBeInstanceOf(AsExpression);
            expect(expr).toMatchObject({
                value: { value: "2", type: Type.number },
                asType: { name: "Number" }
            });
        })
    });

    describe("Unary", () => {
        test("Not", () => {
            const expr = Expression.fromString("x = !x");
            expect(expr).toMatchObject({
                lhs: { name: "x" },
                operation: Operation.Assign,
                rhs: {
                    lhs: { name: "x" },
                    operation: Operation.LogNot
                }
            });
        });

        test("Not precedence", () => {
            const expr = Expression.fromString("![1, 2, 3].includes(a)");
            expect(expr).toMatchObject({
                lhs: {
                    lhs: {
                        name: "includes",
                        parent: {
                            elements: [{ value: "1" }, { value: "2" }, { value: "3" },]
                        }
                    },
                    operation: Operation.Call,
                    rhs: { args: [{ name: "a" }] }
                },
                operation: Operation.LogNot,
            });
        })

        test("Typeof", () => {
            const expr = Expression.fromString("typeof variable === 'string'");
            expect(expr).toMatchObject({
                lhs: {
                    lhs: { name: "variable" },
                    operation: Operation.TypeOf
                },
                operation: Operation.StrictEqual,
                rhs: { value: "string", type: Type.string }
            });
        });

        test("Delete", () => {
            const expr = Expression.fromString("delete myObj.prop");
            expect(expr).toMatchObject({
                lhs: {
                    name: "prop",
                    parent: { name: "myObj" }
                },
                operation: Operation.Delete
            });
        });

        test("Plus", () => {
            const expr = Expression.fromString("+4");
            expect(expr).toMatchObject({
                lhs: { value: "4", type: Type.number },
                operation: Operation.UnaryPlus
            });
        });

        test("Negative", () => {
            const expr = Expression.fromString("-4 - 2");
            expect(expr).toMatchObject({
                lhs: {
                    lhs: { value: "4", type: Type.number },
                    operation: Operation.UnaryNegation
                },
                operation: Operation.Subtract,
                rhs: { value: "2", type: Type.number }
            });
        });

        test("Prefix increment", () => {
            const expr = Expression.fromString("++x");
            expect(expr).toMatchObject({
                lhs: { name: "x" },
                operation: Operation.PrefixIncrement
            });
        });

        test("Postfix increment", () => {
            const expr = Expression.fromString("x++");
            expect(expr).toMatchObject({
                lhs: { name: "x" },
                operation: Operation.PostfixIncrement
            });
        });

        test("Prefix decrement", () => {
            const expr = Expression.fromString("--x");
            expect(expr).toMatchObject({
                lhs: { name: "x" },
                operation: Operation.PrefixDecrement
            });
        });

        test("Postfix decrement", () => {
            const expr = Expression.fromString("x--");
            expect(expr).toMatchObject({
                lhs: { name: "x" },
                operation: Operation.PostfixDecrement
            });
        });
    });

    describe("Ternary / Conditional", () => {
        test("Single value condition", () => {
            const expr = Expression.fromString("true ? 4 + 2 : 5");
            expect(expr).toMatchObject({
                lhs: { value: "true", type: Type.boolean },
                operation: Operation.Ternary,
                rhs: {
                    args: [
                        {
                            lhs: { value: "4", type: Type.number },
                            operation: Operation.Add,
                            rhs: { value: "2", type: Type.number }
                        },
                        { value: "5", type: Type.number }
                    ]
                }
            });
        });

        test("Expression value condition", () => {
            const expr = Expression.fromString("typeof myObj === 'string' ? 7 : value");
            expect(expr).toMatchObject({
                lhs: {
                    lhs: {
                        lhs: { name: "myObj" },
                        operation: Operation.TypeOf
                    },
                    operation: Operation.StrictEqual,
                    rhs: { value: "string", type: Type.string }
                },
                operation: Operation.Ternary,
                rhs: {
                    args: [
                        { value: "7", type: Type.number },
                        { name: "value" }
                    ]
                }
            });
        });
    });

    describe("Grouping", () => {
        test("Group", () => {
            const expr = Expression.fromString("(1 + 2) * 3");
            expect(expr).toMatchObject({
                lhs: {
                    value: {
                        lhs: { value: "1", type: Type.number },
                        operation: Operation.Add,
                        rhs: { value: "2", type: Type.number }
                    }
                },
                operation: Operation.Multiply,
                rhs: { value: "3", type: Type.number }
            });
        });

        test("Property on group", () => {
            const expr = Expression.fromString("(1 + 2).toString()");
            expect(expr).toMatchObject({
                lhs: {
                    name: "toString",
                    parent: {
                        value: {
                            lhs: { value: "1", type: Type.number },
                            operation: Operation.Add,
                            rhs: { value: "2", type: Type.number }
                        }
                    }
                },
                operation: Operation.Call,
                rhs: { args: [] }
            });
        });
    })
});

describe("Conditional", () => {
    test("Statements", () => {
        const call = Module.fromString(`if (true) { 
            // Some stuff
        }`);

        expect(call.statements).toHaveLength(1);
    });

    test("Basic", () => {
        const call = Module.fromString(`if (myNum > 4) { }`);

        expect(call.statements[0]).toMatchObject({
            condition: {
                lhs: { name: "myNum" },
                operation: Operation.GreaterThan,
                rhs: { value: "4", type: Type.number }

            },
            statements: []
        });
    });

    test("Shorthand", () => {
        const call = Module.fromString(`if (myNum > 4) console.log("Hello World")`);

        expect(call.statements[0]).toMatchObject({
            condition: {
                lhs: { name: "myNum" },
                operation: Operation.GreaterThan,
                rhs: { value: "4", type: Type.number }

            },
            statements: [{
                lhs: { name: "log", parent: { name: "console" } },
                operation: Operation.Call,
                rhs: { args: [{ value: "Hello World", type: Type.string }] }
            }]
        });
    });

    test("If else chain", () => {
        const chain =
            `if (myNum > 4) { 
                // do thing 
            } else if (myNum === 2) {
                // do other thing
            }`
        const call = Module.fromString(chain);
        const ifStatement = call.statements[0] as IfStatement;

        expect(ifStatement).toMatchObject({
            condition: { lhs: { name: "myNum" }, operation: Operation.GreaterThan, rhs: { value: "4", type: Type.number } },
            consequent: {
                condition: { lhs: { name: "myNum" }, operation: Operation.StrictEqual, rhs: { value: "2", type: Type.number } },
            }
        });
    });

    test("Else", () => {
        const chain =
            `if (myNum > 4) { 
                // do thing 
            } else {
                // do other things
            }`;
        const call = Module.fromString(chain);
        const ifStatement = call.statements[0] as IfStatement;

        expect(ifStatement).toMatchObject({
            condition: { lhs: { name: "myNum" }, operation: Operation.GreaterThan, rhs: { value: "4", type: Type.number } },
            consequent: {
                condition: null,
            }
        });
    });

    test("Shorthand else", () => {
        const chain =
            `if (myNum > 4) x = 4
            else x = 2`;
        const call = Module.fromString(chain);
        const ifStatement = call.statements[0] as IfStatement;

        expect(ifStatement).toMatchObject({
            condition: {
                lhs: { name: "myNum" },
                operation: Operation.GreaterThan,
                rhs: { value: "4", type: Type.number }
            },
            statements: [{
                lhs: { name: "x" },
                operation: Operation.Assign,
                rhs: { value: "4", type: Type.number }
            }],
            consequent: {
                condition: null,
                statements: [{
                    lhs: { name: "x" },
                    operation: Operation.Assign,
                    rhs: { value: "2", type: Type.number }
                }],
            }
        });
    });
});

describe("For", () => {
    test("ICF expression", () => {
        const mod = Module.fromString("for (let i = 0; i < 5; i++) {}");
        const forLoopExpressionStatements = (mod.statements[0] as ForStatement).expression as ForStatementExpression;

        expect(forLoopExpressionStatements).toMatchObject({
            initializer: {
                isConstant: false,
                name: "i",
                value: { value: "0" },
            },
            condition: {
                lhs: { name: "i" },
                operation: Operation.LessThan,
                rhs: { value: "5" }
            },
            finalExpression: {
                lhs: { name: "i" },
                operation: Operation.PostfixIncrement,
            }
        });
    });

    xtest("Null expressions", () => {
        const mod = Module.fromString("for (;;) { }");
        const forLoop = mod.statements[0] as ForStatement;
        expect(forLoop.expression).toMatchObject([null, null, null])
    });

    test("For of", () => {
        const mod = Module.fromString("for (const item of array) {}");
        const forLoop = mod.statements[0] as ForStatement;
        expect(forLoop.expression).toMatchObject({
            variable: { name: "item", isConstant: true },
            operation: Operation.Of,
            subject: { name: "array" }
        });
    });

    test("For of (with destructuring)", () => {
        const mod = Module.fromString("for (const [a, b] of array) {}");
        const forLoop = mod.statements[0] as ForStatement;
        const forLoopStatement = forLoop.expression as ForIteratorExpression;
        expect(forLoopStatement.variable.entries!.has(0)).toBeTruthy();
        expect(forLoopStatement.variable.entries!.get(0)).toMatchObject({ name: "a" });
        expect(forLoopStatement.variable.entries!.has(1)).toBeTruthy();
        expect(forLoopStatement.variable.entries!.get(1)).toMatchObject({ name: "b" });

        expect(forLoopStatement).toMatchObject({
            variable: { isConstant: true },
            operation: Operation.Of,
            subject: { name: "array" }
        });
    });

    test("For in", () => {
        const mod = Module.fromString("for (const prop in obj) {}");
        const forLoop = mod.statements[0] as ForStatement;
        const forLoopStatement = forLoop.expression as ForIteratorExpression;
        expect(forLoopStatement).toMatchObject({
            variable: { name: "prop", isConstant: true },
            operation: Operation.In,
            subject: { name: "obj" }
        });
    });

    test("Statements", () => {
        const mod = Module.fromString("for (let i = 0; i < 5; i++) { console.log(i) }");
        const forLoop = mod.statements[0] as ForStatement;
        expect(forLoop.statements).toMatchObject([
            {
                lhs: { name: "log", parent: { name: "console" } },
                operation: Operation.Call,
                rhs: { args: [{ name: "i" }] }
            }
        ])
    });

    test("Shorthand", () => {
        const mod = Module.fromString("for (let i = 0; i < 5; i++) doThing()");
        const forLoop = mod.statements[0] as ForStatement;
    });

});

describe("While", () => {
    test("Condition", () => {
        const mod = Module.fromString(`while (x > 4) { }`);
        const whileStatement = mod.statements[0] as WhileStatement;
        expect(whileStatement).toBeInstanceOf(WhileStatement);
        expect(whileStatement.expression).toMatchObject({
            lhs: { name: "x" },
            operation: Operation.GreaterThan,
            rhs: { value: "4", type: Type.number }
        });
    });

    test("Statements", () => {
        const mod = Module.fromString(`while (x > 4) { x++ }`);
        const whileStatement = mod.statements[0] as WhileStatement;
        expect(whileStatement).toBeInstanceOf(WhileStatement);
        expect(whileStatement.statements[0]).toMatchObject({
            lhs: { name: "x" },
            operation: Operation.PostfixIncrement
        });
    });

    test("Do while", () => {
        const mod = Module.fromString(`do x-- while (x > 0)`);
        const whileStatement = mod.statements[0] as DoWhileStatement;
        expect(whileStatement).toBeInstanceOf(DoWhileStatement);
        expect(whileStatement.statements[0]).toMatchObject({
            lhs: { name: "x" },
            operation: Operation.PostfixDecrement
        });
        expect(whileStatement.expression).toMatchObject({
            lhs: { name: "x" },
            operation: Operation.GreaterThan,
            rhs: { value: "0", type: Type.number }
        });
    });
});

describe("Switch", () => {
    test("Statement", () => {
        const mod = Module.fromString(`switch (x.member) { }`);
        const switchStatement = mod.statements[0] as SwitchStatement;
        expect(switchStatement).toBeInstanceOf(SwitchStatement);
        expect(switchStatement.expression).toEqual({
            name: "member", parent: { name: "x" }
        });
    });

    test("Single case", () => {
        const mod = Module.fromString(`switch (age) { case 3: console.log(age); break; }`);
        const switchStatement = mod.statements[0] as SwitchStatement;
        expect(switchStatement).toBeInstanceOf(SwitchStatement);
        expect(switchStatement.cases.length).toBe(1);
        expect(switchStatement.cases[0][0]).toMatchObject({ value: "3", type: Type.number });
    });

    test("Multiple cases", () => {
        const mod = Module.fromString(`switch (age) { case 3: console.log(age); case 4: return 2 }`);
        const switchStatement = mod.statements[0] as SwitchStatement;
        expect(switchStatement).toBeInstanceOf(SwitchStatement);
        expect(switchStatement.cases.length).toBe(2);
        expect(switchStatement.cases[0][0]).toMatchObject({ value: "3", type: Type.number });
        expect(switchStatement.cases[1][0]).toMatchObject({ value: "4", type: Type.number });
    });

    test.todo("Case cascading");

    test("Default", () => {
        const mod = Module.fromString(`switch (age) { default: console.log(age); break; }`);
        const switchStatement = mod.statements[0] as SwitchStatement;
        expect(switchStatement).toBeInstanceOf(SwitchStatement);
        expect(switchStatement.defaultCase).toBeTruthy();
    });

    test.todo("Block");
});

describe("Try & catch", () => {
    test("Try block", () => {
        const code = `try { console.log() } catch (error) {}`;
        const mod = Module.fromString(code);
        const tryBlock = mod.statements[0] as TryBlock;
        expect(tryBlock).toBeInstanceOf(TryBlock);
        expect(tryBlock.statements).toHaveLength(1);
    });

    test("Throwing value", () => {
        const mod = Module.fromString("throw Error('error'); throw 2");
        expect(mod.statements).toHaveLength(2);
        expect(mod.statements[0]).toBeInstanceOf(ThrowStatement);
        expect(mod.statements[1]).toBeInstanceOf(ThrowStatement);

        expect((mod.statements[0] as ThrowStatement).value).toMatchObject({
            lhs: { name: "Error" },
            operation: Operation.Call,
            rhs: { args: [{ value: "error", type: Type.string }] }
        });

        expect((mod.statements[1] as ThrowStatement).value).toMatchObject({ value: "2", type: Type.number });
    });

    test("Catch block", () => {
        const code = `try { } catch (error) {x++}`;
        const mod = Module.fromString(code);
        const tryBlock = mod.statements[0] as TryBlock;
        expect(tryBlock.catchBlock).toBeTruthy();
        expect(tryBlock.catchBlock!.errorVariable).toMatchObject({
            name: "error"
        });
        expect(tryBlock.catchBlock!.statements).toHaveLength(1);
    });

    test("Finally block", () => {
        const code = `try {} catch (error) {} finally {x++}`;
        const mod = Module.fromString(code);
        const tryBlock = mod.statements[0] as TryBlock;
        expect(tryBlock.finallyBlock).toBeTruthy();
        expect(tryBlock.finallyBlock!.statements).toHaveLength(1);
    });
});

describe("Classes", () => {
    test("Name", () => {
        const classDeclaration = ClassDeclaration.fromString("class Test {}");
        expect(classDeclaration.name?.name).toBe("Test");
    });

    test("Base", () => {
        const classDeclaration = ClassDeclaration.fromString("class Test extends HTMLElement {}");
        expect(classDeclaration.base?.name).toBe("HTMLElement");
    });

    test("Methods", () => {
        const classDeclaration = ClassDeclaration.fromString(`class Test { myMethod() {} }`);

        expect(classDeclaration.methods?.has("myMethod")).toBeTruthy();
        expect(classDeclaration.methods?.get("myMethod")!.parameters).toHaveLength(0);
    });

    test("Class fields", () => {
        const classDeclaration = ClassDeclaration.fromString(`class Test { prop1 = "string1" prop2 = "test" }`);

        expect(classDeclaration.fields?.has("prop1")).toBeTruthy();
        expect(classDeclaration.fields?.get("prop1")!).toBeInstanceOf(VariableDeclaration);
        expect((classDeclaration.fields?.get("prop1")!.value as Value).value).toBe("string1");

        expect(classDeclaration.fields?.has("prop2")).toBeTruthy();
        expect(classDeclaration.fields?.get("prop2")!).toBeInstanceOf(VariableDeclaration);
        expect((classDeclaration.fields?.get("prop2")!.value as Value).value).toBe("test");
    });

    test("Optional class field", () => {
        const classDeclaration = ClassDeclaration.fromString(`class Test { prop?: string }`);

        expect(classDeclaration.fields?.has("prop")).toBeTruthy();
        expect(classDeclaration.fields?.get("prop")!).toBeInstanceOf(VariableDeclaration);
        expect((classDeclaration.fields?.get("prop")!.isOptional)).toBeTruthy();
    });

    test("Class decorator (with no args)", () => {
        const mod = Module.fromString(`@Page class Page1 {}`);
        const classDeclaration = mod.statements[0] as ClassDeclaration;

        expect(classDeclaration.decorators).toMatchObject([
            { name: "Page", args: [] }
        ]);
    });

    test("Class decorator (with args)", () => {
        const mod = Module.fromString(`@Page("/") class Page1 {}`);
        const classDeclaration = mod.statements[0] as ClassDeclaration;

        expect(classDeclaration.decorators).toMatchObject([
            { name: "Page", args: [{ value: "/", type: Type.string }] }
        ]);
    });

    test("Method decorator", () => {
        const classDeclaration = ClassDeclaration.fromString(`class Test { @enumerable(false) stuff() {} }`);

        const stuffMethod = classDeclaration.methods?.get("stuff")!;
        expect(stuffMethod).toBeTruthy();
        expect(stuffMethod.decorators).toBeTruthy();

        expect(stuffMethod.decorators).toHaveLength(1);
        expect(stuffMethod.decorators![0]!.args).toHaveLength(1);
        expect(stuffMethod.decorators![0]!.args[0]).toMatchObject({ value: "false", type: Type.boolean });
    });

    test("Getter", () => {
        const classDeclaration = ClassDeclaration.fromString(`class Test { get data() { return "data" } }`);

        const getMethod = classDeclaration.getters?.get("data")!;
        expect(getMethod).toBeTruthy();
        expect(getMethod.getSet).toEqual(GetSet.Get);
    });

    test("Setter", () => {
        const classDeclaration = ClassDeclaration.fromString(`class Test { set name(name) { this._name = name } }`);

        const setMethod = classDeclaration.setters?.get("name");
        expect(setMethod).toBeTruthy();
        expect(setMethod!.getSet).toEqual(GetSet.Set);
    });

    test("Setter & getter with same name", () => {
        const clsDec = ClassDeclaration.fromString(`class Test { set name(name) { } get name() {} }`);

        expect(clsDec.getters?.has("name")).toBeTruthy();
        expect(clsDec.setters?.has("name")).toBeTruthy();
    });

    test("Constructor", () => {
        const clsDec = ClassDeclaration.fromString(`class Test { constructor() {doStuff()} }`);

        expect(clsDec.classConstructor).toBeTruthy();
        expect(clsDec.classConstructor!.statements[0]).toMatchObject({
            lhs: { name: "doStuff" },
            operation: Operation.Call,
            rhs: { args: [] }
        })
    });

    xtest("Computed prop", () => {
        const code = `class MyArray extends Array {
            static get [Symbol.species]() { return Array; }
        }`;

        const mod = Module.fromString(code);
        const cls = mod.statements[0] as ClassDeclaration;

        expect(cls); // TODO
    });

    test("Async member", () => {
        const code = `class Class1 {
            async func() {}
        }`;

        const mod = Module.fromString(code);
        const cls = mod.statements[0] as ClassDeclaration;

        expect(cls.methods?.has("func")).toBeTruthy();
        expect(cls.methods!.get("func")!.isAsync).toBeTruthy();
    });

    test.todo("Static get");

    test("Static members", () => {
        const code = `class Class1 {
            static member
        }`;

        const mod = Module.fromString(code);
        const cls = mod.statements[0] as ClassDeclaration;

        expect(cls.staticFields?.has("member")).toBeTruthy();
        expect(cls.staticFields!.get("member")).toBeInstanceOf(VariableDeclaration);
    });

    test("Static function", () => {
        const code = `class Class1 {
            static doStuff() { }
        }`;

        const mod = Module.fromString(code);
        const cls = mod.statements[0] as ClassDeclaration;

        expect(cls.staticMethods?.has("doStuff")).toBeTruthy();
        expect(cls.staticMethods!.get("doStuff")).toBeInstanceOf(FunctionDeclaration);
    });

    test("Base Generics", () => {
        const code = `class Class1<IData> {}`;

        const mod = Module.fromString(code);
        const cls = mod.statements[0] as ClassDeclaration;

        expect(cls.name!.typeArguments).toBeTruthy();
        expect(cls.name!.typeArguments).toHaveLength(1);
        expect(cls.name!.typeArguments![0].name).toBe("IData");
    });

    test("Extends Generics", () => {
        const code = `class Class1 extends Component<IData> {}`;

        const mod = Module.fromString(code);
        const cls = mod.statements[0] as ClassDeclaration;

        expect(cls.base!.typeArguments).toBeTruthy();
        expect(cls.base!.typeArguments).toHaveLength(1);
        expect(cls.base!.typeArguments![0].name).toBe("IData");
    });

    test("Abstract class", () => {
        const code = `abstract class Class1 {}`;

        const mod = Module.fromString(code);
        const cls = mod.statements[0] as ClassDeclaration;

        expect(cls.isAbstract).toBeTruthy();
    });

    test("Abstract method", () => {
        const code = `abstract class Class1 { abstract doThing(): number }`;

        const mod = Module.fromString(code);
        const cls = mod.statements[0] as ClassDeclaration;

        expect(cls.methods?.has("doThing")).toBeTruthy();
        expect(cls.methods!.get("doThing")!.isAbstract).toBeTruthy();
    });

    test("Abstract class field", () => {
        const code = `abstract class Class1 { abstract name: string }`;

        const mod = Module.fromString(code);
        const cls = mod.statements[0] as ClassDeclaration;

        expect(cls.fields?.has("name")).toBeTruthy();
        expect(cls.fields!.get("name")!.isAbstract).toBeTruthy();
    });

    test.todo("Class expressions (named)");
    test.todo("Class expressions (unnamed)");
    test.todo("Implements");
    test.todo("Mix-ins");
});

describe("Function", () => {
    test("function name", () => {
        const mod = Module.fromString(`function test() {}`);
        const func = mod.statements[0] as FunctionDeclaration;
        expect(func.name?.name).toBe("test");
    });

    describe("Async", () => {
        test("Async", () => {
            const mod = Module.fromString(`async function test() {}`);
            const func = mod.statements[0] as FunctionDeclaration;
            expect(func.isAsync).toBeTruthy();
        });

        test("Await", () => {
            const expression = Expression.fromString(`await test()`);
            expect(expression).toMatchObject({
                operation: Operation.Await,
                lhs: {
                    lhs: { name: "test" },
                    operation: Operation.Call,
                    rhs: { args: [] }
                }
            });
        });

        test("Await in expression", () => {
            const expression = Expression.fromString("log(await body)");
            expect(expression).toMatchObject({
                lhs: { name: "log" },
                operation: Operation.Call,
                rhs: {
                    args: [{
                        operation: Operation.Await,
                        lhs: { name: "body" },
                    }]
                }
            })
        });
    });

    describe("Parameters", () => {
        test("Simple parameter", () => {
            const mod = Module.fromString(`function test(x) {}`);
            const func = mod.statements[0] as FunctionDeclaration;
            expect(func.parameters).toHaveLength(1);
            expect(func.parameters[0]).toMatchObject({
                name: "x",
            })
        });

        test("Type", () => {
            const mod = Module.fromString(`function test(x: string) {}`);
            const func = mod.statements[0] as FunctionDeclaration;
            expect(func.parameters).toHaveLength(1);
            expect(func.parameters[0]).toMatchObject({
                name: "x",
                typeSignature: { name: "string" }
            })
        });

        test("Spread", () => {
            const mod = Module.fromString(`function test(...args) {}`);
            const func = mod.statements[0] as FunctionDeclaration;
            expect(func.parameters).toHaveLength(1);
            expect(func.parameters[0]).toMatchObject({
                name: "args",
                spread: true
            });
        });

        test("Default value", () => {
            const mod = Module.fromString(`function test(arg1 = 4) {}`);
            const func = mod.statements[0] as FunctionDeclaration;
            expect(func.parameters).toHaveLength(1);
            expect(func.parameters[0]).toMatchObject({
                name: "arg1",
                value: { value: "4", type: Type.number }
            });
        });

        test("Optional Parameter", () => {
            const mod = Module.fromString(`function test(arg1?:string) {}`);
            const func = mod.statements[0] as FunctionDeclaration;
            expect(func.parameters).toHaveLength(1);
            expect(func.parameters[0]).toMatchObject({
                name: "arg1",
                isOptional: true
            });
        });

        test("Array destructor", () => {
            const mod = Module.fromString(`function test([a, b]) {}`);
            const func = mod.statements[0] as FunctionDeclaration;
            expect(func.parameters[0].entries?.size).toBe(2);
            expect(func.parameters[0].entries!.has(0)).toBeTruthy();
            expect(func.parameters[0].entries!.get(0)).toMatchObject({ name: "a" });
            expect(func.parameters[0].entries!.has(1)).toBeTruthy();
            expect(func.parameters[0].entries!.get(1)).toMatchObject({ name: "b" });
        });

        test("Object destructor", () => {
            const mod = Module.fromString(`function test({x, y}) {}`);
            const func = mod.statements[0] as FunctionDeclaration;
            expect(func.parameters[0].entries?.size).toBe(2);
            expect(func.parameters[0].entries!.has("x")).toBeTruthy();
            expect(func.parameters[0].entries!.get("x")).toMatchObject({ name: "x" });
            expect(func.parameters[0].entries!.has("y")).toBeTruthy();
            expect(func.parameters[0].entries!.get("y")).toMatchObject({ name: "y" });
        });
    });

    test("Return expression", () => {
        const mod = Module.fromString(`function test() {return "Hello World"}`);
        const func = mod.statements[0] as FunctionDeclaration;
        expect(func.statements[0]).toMatchObject({
            returnValue: {
                value: "Hello World", type: Type.string
            }
        });
    });

    test("Return expression (without value)", () => {
        const mod = Module.fromString(`function test() {return;}`);
        const func = mod.statements[0] as FunctionDeclaration;
        expect(func.statements[0]).toMatchObject({
            returnValue: null
        });
    });

    test.todo("Decorators");

    describe("Generators", () => {
        test("Generator function", () => {
            const func = FunctionDeclaration.fromString("function* generator() {}");

            expect(func.isGenerator).toBeTruthy();
        });

        test("Yield statement", () => {
            const func = FunctionDeclaration.fromString("function* generator() { yield 2 }");

            expect(func.statements[0]).toMatchObject({
                lhs: { value: "2", type: Type.number },
                operation: Operation.Yield
            });
        });

        test("Delegated yield statement", () => {
            const func = FunctionDeclaration.fromString("function* generator() { yield* [2,3,4] }");

            expect((func.statements[0] as Expression).operation).toBe(Operation.DelegatedYield);
            expect((func.statements[0] as Expression).lhs).toBeInstanceOf(ArrayLiteral);
        });
    })
});

describe("Values", () => {
    test("Null", () => {
        const var1 = VariableDeclaration.fromString("const variable = null");
        expect((var1.value as Value).type).toBe(Type.object);
        expect((var1.value as Value).value).toBe(null);
    });

    test("Undefined", () => {
        const var1 = VariableDeclaration.fromString("const variable = undefined");
        expect((var1.value as Value).type).toBe(Type.undefined);
        expect((var1.value as Value).value).toBeNull();
    });

    test("Boolean", () => {
        const variable1 = VariableDeclaration.fromString("const x = true");
        expect((variable1.value as Value).type).toBe(Type.boolean);
        expect((variable1.value as Value).value).toBe("true");

        const variable2 = VariableDeclaration.fromString("const x = false");
        expect((variable2.value as Value).type).toBe(Type.boolean);
        expect((variable2.value as Value).value).toBe("false");
    });

    describe("Number", () => {
        test("Standard", () => {
            const value = Expression.fromString("14");
            expect(value).toBeInstanceOf(Value);
            expect((value as Value).type).toBe(Type.number);
            expect((value as Value).value).toBe("14");
        });

        test("Hex literals", () => {
            const value = Expression.fromString("0xA5C3");
            expect(value).toBeInstanceOf(Value);
            expect((value as Value).type).toBe(Type.number);
            expect((value as Value).value).toBe("0xA5C3");
        });

        test("Binary literals", () => {
            const value = Expression.fromString("0b0101");
            expect(value).toBeInstanceOf(Value);
            expect((value as Value).type).toBe(Type.number);
            expect((value as Value).value).toBe("0b0101");
        });

        test("Octal literals", () => {
            const value = Expression.fromString("0o1223");
            expect(value).toBeInstanceOf(Value);
            expect((value as Value).type).toBe(Type.number);
            expect((value as Value).value).toBe("0o1223");
        });

        test("Decimal", () => {
            const value = Expression.fromString("12.41");
            expect(value).toBeInstanceOf(Value);
            expect((value as Value).type).toBe(Type.number);
            expect((value as Value).value).toBe("12.41");
        });

        test("Shorthand Decimal", () => {
            const value = Expression.fromString(".41");
            expect(value).toBeInstanceOf(Value);
            expect((value as Value).type).toBe(Type.number);
            expect((value as Value).value).toBe(".41");
        });

        test("Separators", () => {
            const value = Expression.fromString("100_000");
            expect(value).toBeInstanceOf(Value);
            expect((value as Value).type).toBe(Type.number);
            expect((value as Value).value).toBe("100_000");
        });

        test("Exponential", () => {
            const value = Expression.fromString("1e10");
            expect(value).toBeInstanceOf(Value);
            expect((value as Value).type).toBe(Type.number);
            expect((value as Value).value).toBe("1e10");
        });

        test("Big int", () => {
            const value = Expression.fromString("4n");
            expect(value).toBeInstanceOf(Value);
            expect((value as Value).type).toBe(Type.bigint);
            expect((value as Value).value).toBe("4n");
        });
    });

    describe("Strings", () => {
        test("String", () => {
            const variable1 = VariableDeclaration.fromString("const x = 'Hello World'");
            expect((variable1.value as Value).value).toBe("Hello World");

            const variable2 = VariableDeclaration.fromString('const y = "Hello World"');
            expect((variable2.value as Value).value).toBe("Hello World");

        });

        test("Escaped quote", () => {
            const variable3 = VariableDeclaration.fromString('const y = "Double quote:\\""');
            expect((variable3.value as Value).value).toBe("Double quote:\\\"");
        });
    });

    describe("Regex", () => {
        test("Regex", () => {
            const regexp = VariableDeclaration.fromString("const x = /test/");
            expect(regexp.value).toBeInstanceOf(RegExpLiteral);
        });

        test.todo("Escaped");

        test("Flags", () => {
            const expr = Expression.fromString("myStr.replace(/xmas/i, 'christmas')");
            const { args: [regExpr, string1] } = (expr as Expression).rhs as ArgumentList;
            expect(regExpr).toBeTruthy();
            expect(regExpr).toBeInstanceOf(RegExpLiteral);
            expect((regExpr as RegExpLiteral)?.expression).toBe("xmas");
            expect((regExpr as RegExpLiteral)?.flags).toBeTruthy();
            expect((regExpr as RegExpLiteral)?.flags!.size).toBe(1);
            expect((regExpr as RegExpLiteral)?.flags!.has(RegExpressionFlags.CaseInsensitive)).toBe(true);
            expect(string1).toEqual({ value: "christmas", type: Type.string });
        });
    });

    describe("Array", () => {
        test("Simple array", () => {
            const array = VariableDeclaration.fromString("const array1 = [1, 2, 3]");

            expect((array.value as ArrayLiteral).elements).toHaveLength(3);
            expect((array.value as ArrayLiteral).elements).toMatchObject([
                { value: "1", type: Type.number },
                { value: "2", type: Type.number },
                { value: "3", type: Type.number }
            ]);
        });

        test("Spread", () => {
            const array = VariableDeclaration.fromString("const array1 = [1, ...a]");

            expect((array.value as ArrayLiteral).elements).toHaveLength(2);
            expect((array.value as ArrayLiteral).elements).toMatchObject([
                { value: "1", type: Type.number },
                {
                    lhs: { name: "a" },
                    operation: Operation.Spread
                }
            ]);
        });

        test("Nested array", () => {
            const arrayVariable = VariableDeclaration.fromString("const array1 = [[1, 2]]");
            const array = arrayVariable.value as ArrayLiteral;

            expect(array.elements).toHaveLength(1);
            expect(array.elements[0]).toBeInstanceOf(ArrayLiteral);
            expect((array.elements[0] as ArrayLiteral).elements).toHaveLength(2);
            expect((array.elements[0] as ArrayLiteral).elements).toMatchObject([
                { value: "1", type: Type.number },
                { value: "2", type: Type.number },
            ]);
        });
    });

    describe("Object", () => {
        test("Keys", () => {
            const obj = VariableDeclaration.fromString("const obj1 = {x: 4, r: 'Hello World'}");
            const ol = obj.value as ObjectLiteral;

            expect(ol.values.size).toBe(2);
            expect(ol.values.get("x")).toEqual({ value: "4", type: Type.number });
            expect(ol.values.get("r")).toEqual({ value: "Hello World", type: Type.string });
        });

        test("Key with token name", () => {
            const obj = VariableDeclaration.fromString("const obj1 = {get: 4, set: 5}");
            const ol = obj.value as ObjectLiteral;

            expect(ol.values.size).toBe(2);
            expect(ol.values.get("get")).toEqual({ value: "4", type: Type.number });
            expect(ol.values.get("set")).toEqual({ value: "5", type: Type.number });
        });

        test("Key as string", () => {
            const obj = VariableDeclaration.fromString(`const x = { "hello": 4, r: 2 }`);
            const ol = obj.value as ObjectLiteral;

            expect(ol.values.size).toBe(2);
            expect(ol.values.get("hello")).toEqual({ value: "4", type: Type.number });
            expect(ol.values.get("r")).toEqual({ value: "2", type: Type.number });
        });

        test("Key without value", () => {
            const obj1 = VariableDeclaration.fromString("const obj1 = {myVar, x: 5}");
            const ol1 = obj1.value as ObjectLiteral;

            expect(ol1.values.size).toBe(2);
            expect(ol1.values.get("myVar")).toEqual({ name: "myVar" });
            expect(ol1.values.get("x")).toEqual({ value: "5", type: Type.number });

            const obj2 = VariableDeclaration.fromString("const obj2 = {a, b}");
            const ol2 = obj2.value as ObjectLiteral;

            expect(ol2.values.size).toBe(2);
            expect(ol2.values.get("a")).toEqual({ name: "a" });
            expect(ol2.values.get("b")).toEqual({ name: "b" });
        });

        test("Spread", () => {
            const obj1 = VariableDeclaration.fromString("const obj1 = {a: 5, ...obj2}");
            const ol1 = obj1.value as ObjectLiteral;

            // values does not contain spread values thus size===1
            expect(ol1.values.size).toBe(1);
            expect(ol1.values.get("a")).toEqual({ value: "5", type: Type.number });
            const spreadVal = Array.from(ol1.spreadValues);
            expect(spreadVal).toHaveLength(1);
            expect(spreadVal[0]).toEqual(new VariableReference("obj2"));
        });

        xtest("Computed properties", () => {
            const obj = VariableDeclaration.fromString("const obj1 = {[myVar]: 2, x: 5}");
            const ol = obj.value as ObjectLiteral;

            expect(ol.values.size).toBe(2);
            // TODO key is reference :/
            // expect(ol.values.get(new VariableDeclaration("myVar"))).toEqual({ value: "2", type: Type.number });
            // expect(ol.values.get("x")).toEqual({ value: "5", type: Type.number });
        });

        test.todo("Key with function");
        test.todo("get and set");
    });

    describe("Anonymous function", () => {
        test("Single parameters", () => {
            const anomFunc = Expression.fromString(`x => x + 2`);

            expect(anomFunc).toBeInstanceOf(FunctionDeclaration);
            expect((anomFunc as FunctionDeclaration).parameters).toHaveLength(1);
            expect((anomFunc as FunctionDeclaration).parameters).toMatchObject([{ name: "x" }]);
        });

        test("Multiple parameters", () => {
            const anomFunc = Expression.fromString(`(x, y) => { console.log(x, y) }`);

            expect(anomFunc).toBeInstanceOf(FunctionDeclaration);
            expect((anomFunc as FunctionDeclaration).parameters).toHaveLength(2);
            expect((anomFunc as FunctionDeclaration).parameters).toMatchObject([{ name: "x" }, { name: "y" }]);
        });

        test("With arrow symbol", () => {
            const var1 = VariableDeclaration.fromString("const func = t => {}");
            expect(var1.value).toBeInstanceOf(FunctionDeclaration);
            expect((var1.value as FunctionDeclaration).parameters).toMatchObject([{ name: "t" }]);
            expect((var1.value as FunctionDeclaration).statements).toHaveLength(0);
        });

        test("With function keyword", () => {
            const var1 = VariableDeclaration.fromString("const func = function(t) {}");
            expect(var1.value).toBeInstanceOf(FunctionDeclaration);
            expect((var1.value as FunctionDeclaration).parameters).toMatchObject([{ name: "t" }]);
            expect((var1.value as FunctionDeclaration).statements).toHaveLength(0);
        });

        test("Used as callback", () => {
            const cbExpr = Expression.fromString(`test(x => {})`);
            expect(cbExpr).toMatchObject({
                lhs: { name: "test" },
                operation: Operation.Call,
                rhs: {
                    args: [{
                        parameters: [{ name: "x" }],
                        statements: []
                    }]
                }
            });
        });

        test("IIFE (immediately invoked function execution)", () => {
            const iife = Expression.fromString(`((a, b) => {console.log(a, b)})()`) as Expression;
            expect(iife.lhs).toBeInstanceOf(Group);
            expect((iife.lhs as Group).value).toBeInstanceOf(FunctionDeclaration);
            expect(iife).toMatchObject({
                lhs: {
                    value: {
                        parameters: [{ name: "a" }, { name: "b" }],
                        statements: [{
                            lhs: { name: "log", parent: { name: "console" } },
                            operation: Operation.Call,
                            rhs: { args: [{ name: "a" }, { name: "b" }] }
                        }]
                    }
                },
                operation: Operation.Call,
                rhs: { args: [] }
            });
        });

        test("With shorthand return", () => {
            const func = Expression.fromString("(x, y) => x + y");

            expect(func).toMatchObject({
                parameters: [{ name: "x" }, { name: "y" }],
                statements: [{
                    returnValue: {
                        lhs: { name: "x" },
                        operation: Operation.Add,
                        rhs: { name: "y" }
                    }
                }]
            });
        });

        test("Return grouped object literal", () => {
            const func = Expression.fromString("(x, y) => ({p: x + y})") as FunctionDeclaration;
            const returnStatement = func.statements[0] as ReturnStatement;

            expect(returnStatement).toBeInstanceOf(ReturnStatement)
            expect(returnStatement.returnValue).toBeInstanceOf(Group);
            expect((returnStatement.returnValue as Group).value).toBeInstanceOf(ObjectLiteral);
        });

        test("Async arrow function", () => {
            const func = Expression.fromString("async (x) => {await x}") as FunctionDeclaration;

            expect(func.isAsync).toBeTruthy();
        });

    });

    describe("Template literals", () => {
        test("Interpolation", () => {
            const tl = Expression.fromString("`Hello ${name}`") as TemplateLiteral;
            expect(tl.entries).toEqual(["Hello ", { name: "name" }]);
        });

        test("Escaped characters", () => {
            const tl = Expression.fromString("`Test \\${name}`") as TemplateLiteral;
            expect(tl.entries).toEqual(["Test \\${name}"]);
        });

        test("Tagged template literal", () => {
            const tl = Expression.fromString("html`<h1>Hello World</h1>`") as TemplateLiteral;
            expect(tl.entries[0]).toBe("<h1>Hello World</h1>");
            expect(tl.tag).toBe("html");
        });

        test("Nested template literals", () => {
            const tl = Expression.fromString("`<h1>${`Hello ${name}` + ''}</h1>`") as TemplateLiteral;
            // Template literals collapse nested literals if possible thus the addition to break this
            expect(tl).toMatchObject({
                entries: [
                    "<h1>",
                    {
                        lhs: {
                            entries: [
                                "Hello ",
                                { name: "name" }
                            ],
                        },
                        operation: Operation.Add
                    },
                    "</h1>"
                ]
            });
        });
    });

    describe("Initialization", () => {
        test("New instance", () => {
            const var1 = VariableDeclaration.fromString("const car = new Car()");
            expect(var1.value).toBeInstanceOf(Expression);
            expect(var1.value).toMatchObject({
                lhs: { name: "Car" },
                operation: Operation.Initialize,
                rhs: { args: [] }
            });
        });

        test("Constructor function with member operator", () => {
            const var1 = VariableDeclaration.fromString("const dateFormatter = new Intl.DateTimeFormat()");
            expect(var1.value).toBeInstanceOf(Expression);
            expect((var1.value as Expression).lhs).toMatchObject({
                name: "DateTimeFormat", parent: { name: "Intl" }
            });
        });

        test("Constructor function no arguments", () => {
            const var1 = VariableDeclaration.fromString("const x = new X");
            expect(var1.value).toBeInstanceOf(Expression);
            expect(var1.value).toMatchObject({
                lhs: { name: "X" },
                operation: Operation.Initialize,
                rhs: { args: [] }
            });
        });

        test("New instance with arguments", () => {
            const var1 = VariableDeclaration.fromString("const rect = new Rectangle(10, 20)");
            expect(var1.value).toBeInstanceOf(Expression);
            expect(var1.value).toMatchObject({
                lhs: { name: "Rectangle" },
                operation: Operation.Initialize,
                rhs: {
                    args: [
                        { value: "10", type: Type.number },
                        { value: "20", type: Type.number },
                    ]
                }
            });
        });
    });
});

describe("Comments", () => {
    test("Single line", () => {
        const module = `
        // Comment 1
        // Comment 2`;

        const mod = Module.fromString(module);
        expect(mod.statements).toMatchObject([
            { comment: "Comment 1", multiline: false },
            { comment: "Comment 2", multiline: false },
        ]);
    });

    test("Multiline comments", () => {
        const mod = Module.fromString(`/* Long comment */`);
        expect(mod.statements[0]).toMatchObject({
            comment: "Long comment",
            multiline: true
        });
    });
});

describe("Typescript", () => {
    describe("Enum", () => {
        test("Enum name", () => {
            const mod = Module.fromString("enum Direction {Up, Down}");
            const directionEnum = mod.statements[0] as EnumDeclaration;
            expect(directionEnum.name).toBe("Direction");
        });

        test("Enum constants", () => {
            const mod = Module.fromString("enum Direction {Up, Down}");
            const directionEnum = mod.statements[0] as EnumDeclaration;
            expect(directionEnum.members.size).toBe(2);
            expect(directionEnum.members.get("Up")).toEqual({ value: "0", type: Type.number });
            expect(directionEnum.members.get("Down")).toEqual({ value: "1", type: Type.number });
        });

        xtest("Enum member with value", () => {
            const mod = Module.fromString("enum Direction {Up, Down = 3}");
            const directionEnum = mod.statements[0] as EnumDeclaration;
            expect(directionEnum.members.size).toBe(2);
            expect(directionEnum.members.get("Up")).toEqual({ value: "0", type: Type.number });
            expect(directionEnum.members.get("Down")).toEqual({ value: "3", type: Type.number });
        });

    });

    describe("Interface", () => {
        test("Interface name", () => {
            const mod = Module.fromString("interface IData {}");
            const interface_ = mod.statements[0] as InterfaceDeclaration;
            expect(interface_.name.name).toBe("IData");
        });

        test("Extends name", () => {
            const mod = Module.fromString("interface ICar extends IVehicle {}");
            const interface_ = mod.statements[0] as InterfaceDeclaration;
            expect(interface_.name.name).toBe("ICar");
            expect(interface_.extendsType?.name).toBe("IVehicle");
        });

        test("Generic", () => {
            const mod = Module.fromString("interface ICollection<T> {}");
            const interface_ = mod.statements[0] as InterfaceDeclaration;
            expect(interface_.name.name).toBe("ICollection");
            expect(interface_.name.typeArguments).toEqual([
                { name: "T" }
            ]);
        });

        test("Optional member", () => {
            const mod = Module.fromString("interface IShape { color?: string }");
            const interface_ = mod.statements[0] as InterfaceDeclaration;
            expect(interface_.members.has("color")).toBeTruthy();
            expect(interface_.optionalProperties.has("color"));
        });

        test.todo("Primitive member");

        test("Type member", () => {
            const mod = Module.fromString("interface IPerson { name: string, age: number }");
            const interface_ = mod.statements[0] as InterfaceDeclaration;
            expect(interface_.members.size).toBe(2);
            expect(interface_.members.get("name")).toEqual({ name: "string" });
            expect(interface_.members.get("age")).toEqual({ name: "number" });
        });

        test("Function member", () => {
            const mod = Module.fromString("interface IPerson { sayName: () => void }");
            const interface_ = mod.statements[0] as InterfaceDeclaration;
            expect(interface_.members.size).toBe(1);
            expect(interface_.members.get("sayName")!.functionParameters!.size).toBe(0);
            expect(interface_.members.get("sayName")!.functionReturnType!.name).toBe("void");
        });

        test("Function member with parameter", () => {
            const mod = Module.fromString("interface IPoint { distance: (point2: IPoint) => Number }");
            const interface_ = mod.statements[0] as InterfaceDeclaration;
            expect(interface_.members.size).toBe(1);
            const distanceDeclaration = interface_.members.get("distance");
            expect(distanceDeclaration).toBeTruthy();
            expect(distanceDeclaration!.functionParameters?.has("point2")).toBeTruthy();
            expect(distanceDeclaration!.functionParameters?.get("point2")!.name).toBe("IPoint");
            expect(distanceDeclaration!.functionReturnType).toEqual({ name: "Number" });
        });
    });

    describe("Type statements", () => {
        test("Type alias", () => {
            const typeAlias = Module.fromString("type numberArray = Array<number>").statements[0] as TypeDeclaration;
            expect(typeAlias).toBeInstanceOf(TypeDeclaration);
            expect(typeAlias.name.name).toBe("numberArray");
            expect(typeAlias.value.name).toBe("Array");
            expect(typeAlias.value.typeArguments).toMatchObject([{ name: "number" }]);
        });

        test("Nested generics", () => {
            const typeAlias = Module.fromString("type numberStructure = Map<string, Array<number>>").statements[0] as TypeDeclaration;
            expect(typeAlias).toBeInstanceOf(TypeDeclaration);
            expect(typeAlias.name.name).toBe("numberStructure");
            expect(typeAlias.value.name).toBe("Map");
            expect(typeAlias.value.typeArguments).toMatchObject([
                { name: "string" },
                { name: "Array", typeArguments: [{ name: "number" }] }
            ]);
        });

        test.todo("Mapped types");

        test("Array shorthand", () => {
            const typeAlias = Module.fromString("type stringArray = string[]").statements[0] as TypeDeclaration;

            expect(typeAlias.name.name).toBe("stringArray");
            expect(typeAlias.value.name).toBe("Array");
            expect(typeAlias.value.typeArguments).toMatchObject([
                { name: "string" },
            ]);
        });

        test("Literal types", () => {
            const typeAlias = Module.fromString("type abcString = 'abc'").statements[0] as TypeDeclaration;

            expect(typeAlias.value.value).toBeDefined();
            expect(typeAlias.value.value).toBeInstanceOf(Value);
            expect(typeAlias.value.value!.type).toBe(Type.string);
            expect(typeAlias.value.value!.value).toBe("abc");
        });

        test("Union types", () => {
            const typeAlias = Module.fromString("type aOrB = a | b").statements[0] as TypeDeclaration;

            expect(typeAlias.value.name).toBe("Union");
            expect(typeAlias.value.typeArguments).toMatchObject([
                { name: "a" },
                { name: "b" },
            ]);
        });

        test("Intersection types", () => {
            const typeAlias = Module.fromString("type aAndBIntersection = a & b").statements[0] as TypeDeclaration;

            expect(typeAlias.value.name).toBe("Intersection");
            expect(typeAlias.value.typeArguments).toMatchObject([
                { name: "a" },
                { name: "b" },
            ]);
        });
    });
});

describe("Imports", () => {
    test("Import side effects", () => {
        const mod = Module.fromString(`import "./myScript"`);

        expect(mod.statements[0]).toBeInstanceOf(ImportStatement);
        expect(mod.statements[0]).toMatchObject({
            from: "./myScript",
            variable: null
        });
    });

    test("Import entire module", () => {
        const mod = Module.fromString(`import myScript from "./myScript"`);

        expect(mod.statements[0]).toBeInstanceOf(ImportStatement);
        expect(mod.statements[0]).toMatchObject({
            from: "./myScript",
            variable: { name: "myScript" }
        });
    });

    test("Import with destructuring", () => {
        const mod = Module.fromString(`import {a, b, c} from "./myScript"`);
        const importStatement = mod.statements[0] as ImportStatement;

        expect(importStatement).toBeInstanceOf(ImportStatement);
        expect(importStatement.from).toBe("./myScript");
        expect(importStatement.variable?.entries?.has("a")).toBeTruthy();
        expect(importStatement.variable?.entries?.has("b")).toBeTruthy();
        expect(importStatement.variable?.entries?.has("c")).toBeTruthy();
    });

    test("Import * as", () => {
        const mod = Module.fromString(`import * as express from "express"`);
        const importStatement = mod.statements[0] as ImportStatement;

        expect(importStatement.variable).toBeNull();
        expect(importStatement.as).toBe("express");
        expect(importStatement.from).toBe("express");
    });

    test("Dynamic import", () => {
        const mod = Module.fromString(`import("/myMod.mjs")`);

        expect(mod.statements[0]).toBeInstanceOf(Expression);
        expect(mod.statements[0]).toMatchObject({
            lhs: { name: "import" },
            operation: Operation.Call,
            rhs: { args: [{ value: "/myMod.mjs", type: Type.string }] }
        });
    });

    test("Dynamic import in argument list", () => {
        const expr = Expression.fromString(`doStuff(import("/stuff.mjs"))`);

        expect(expr).toMatchObject({
            lhs: { name: "doStuff" },
            operation: Operation.Call,
            rhs: {
                args: [
                    {
                        lhs: { name: "import" },
                        operation: Operation.Call,
                        rhs: { args: [{ value: "/stuff.mjs", type: Type.string }] }
                    }
                ]
            }
        });
    });
});

describe("Export", () => {
    test("Export variable", () => {
        const mod = Module.fromString("export const x = 4");
        const exportStatement = mod.statements[0] as ExportStatement;

        expect(exportStatement).toBeInstanceOf(ExportStatement);
        expect(exportStatement.exported).toBeInstanceOf(VariableDeclaration);
        expect(exportStatement.exported).toMatchObject({
            name: "x",
            isConstant: true,
            value: { value: "4", type: Type.number }
        });
    });

    test("Export class", () => {
        const mod = Module.fromString("export class Y {}");
        const exportStatement = mod.statements[0] as ExportStatement;

        expect(exportStatement).toBeInstanceOf(ExportStatement);
        expect(exportStatement.exported).toBeInstanceOf(ClassDeclaration);
        expect((exportStatement.exported as ClassDeclaration).name).toMatchObject({ name: "Y" });
    });

    test("Export function", () => {
        const mod = Module.fromString("export function z() {}");
        const exportStatement = mod.statements[0] as ExportStatement;

        expect(exportStatement).toBeInstanceOf(ExportStatement);
        expect(exportStatement.exported).toBeInstanceOf(FunctionDeclaration);
        expect((exportStatement.exported as ClassDeclaration).name).toMatchObject({ name: "z" });
    });

    test("Default export", () => {
        const mod = Module.fromString("export default function z() {}");
        const exportStatement = mod.statements[0] as ExportStatement;

        expect(exportStatement).toBeInstanceOf(ExportStatement);
        expect(exportStatement.isDefault).toBeTruthy();
        expect(exportStatement.exported).toBeInstanceOf(FunctionDeclaration);
        expect((exportStatement.exported as ClassDeclaration).name).toMatchObject({ name: "z" });
    });

    test("Export with decorators", () => {
        const mod = Module.fromString("@Page export class Component {}");
        const exportStatement = mod.statements[0] as ExportStatement;

        expect(exportStatement).toBeTruthy();
        expect(exportStatement!.exported).toBeInstanceOf(ClassDeclaration);
        expect((exportStatement!.exported as ClassDeclaration).decorators).toMatchObject([
            { name: "Page" }
        ]);
    });
});