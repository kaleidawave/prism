import { HTMLElement, HTMLDocument, TextNode } from "./chef/html/html";
import { ClassDeclaration } from "./chef/javascript/components/constructs/class";
import { parseTemplate, PrismNode, PrismTextNode, IDependency, PrismHTMLElement, Template, ValueAspect } from "./templating/template";
import { Module } from "./chef/javascript/components/module";
import { buildClientRenderMethod, clientRenderPrismNode } from "./templating/builders/client-render";
import { buildEventBindings } from "./templating/builders/server-event-bindings";
import { constructBindings } from "./templating/builders/data-bindings";
import { FunctionDeclaration, ArgumentList, GetSet } from "./chef/javascript/components/constructs/function";
import { Expression, Operation } from "./chef/javascript/components/value/expression";
import { VariableDeclaration } from "./chef/javascript/components/statements/variable";
import { Value, Type, IValue } from "./chef/javascript/components/value/value";
import { ReturnStatement } from "./chef/javascript/components/statements/statement";
import { serverRenderPrismNode } from "./templating/builders/server-render";
import { GenerateDocString } from "./chef/javascript/components/statements/comments";
import { setNotFoundRoute, addRoute } from "./builders/client-side-routing";
import { DynamicUrl, stringToDynamicUrl } from "./chef/dynamic-url";
import { resolve, dirname, relative, join } from "path";
import { settings } from "./settings";
import { ObjectLiteral } from "./chef/javascript/components/value/object";
import { TemplateLiteral } from "./chef/javascript/components/value/template-literal";
import { buildMetaTags } from "./metatags";
import { Stylesheet } from "./chef/css/stylesheet";
import { prefixSelector, ISelector } from "./chef/css/selectors";
import { randomPrismId, getElem, thisDataVariable } from "./templating/helpers";
import { ImportStatement, ExportStatement } from "./chef/javascript/components/statements/import-export";
import { VariableReference } from "./chef/javascript/components/value/variable";
import { getImportPath, defaultRenderSettings } from "./chef/helpers";
import { IType, typeSignatureToIType } from "./chef/javascript/utils/types";
import { Rule } from "./chef/css/rule";
import { MediaRule } from "./chef/css/at-rules";
import { IfStatement, ElseStatement } from "./chef/javascript/components/statements/if";
import { TypeSignature } from "./chef/javascript/components/types/type-signature";
import { AsExpression } from "./chef/javascript/components/types/statements";
import { ForIteratorExpression } from "./chef/javascript/components/statements/for";
import { cloneAST, aliasVariables } from "./chef/javascript/utils/variables";

const registeredTags: Set<string> = new Set();

export class Component {
    title: IValue | null = null; // If page the document title

    isPage: boolean = false;
    routes: Set<DynamicUrl> | null = null; // The url to match the page on

    isLayout: boolean = false;

    className: string; // The class name of the component
    tag!: string; // Tag for component. Defaults to (ClassName)-component

    needsData: boolean = false; // If the component has any data and needs to be passed data
    hasSlots: boolean = false; // If the component has slots

    // The root data of the component
    componentClass: ClassDeclaration;
    clientModule: Module;
    serverModule?: Module;
    serverRenderFunction?: FunctionDeclaration;
    pageServerRenderFunction?: FunctionDeclaration;

    layout?: Component; // The layout the component extends (component must be a page to have a layout)
    dataTypes: Map<string, Type>; // TODO merge with some kind of root data

    filename: string; // The full filename to the component
    relativeFilename: string; // The filename relative to the given src folder

    metadata: Map<string, string | IValue> | null = null; // A set of metadata included during ssr

    clientGlobals: Array<VariableReference> = [];

    stylesheet: Stylesheet;

    imports: Array<ImportStatement>;
    exports: Map<string, any> | null = null;
    importedComponents: Map<string, Component>;

    dependencies: Array<IDependency>;

    // Used to prevent cyclic imports
    static parsingComponents: Set<string> = new Set();
    // Filename to registered component map
    static registeredComponents: Map<string, Component> = new Map();

    /**
     * Returns a component under a filename
     * If a component has been parsed will return it from the register and not re parse it
     */
    static registerComponent(filepath: string): Component {
        if (Component.parsingComponents.has(filepath)) {
            throw Error(`Cyclic import ${filepath}`); // TODO test and better error message
        }

        if (Component.registeredComponents.has(filepath)) {
            return Component.registeredComponents.get(filepath)!;
        } else {
            const component = Component.fromFile(filepath);
            Component.registeredComponents.set(filepath, component);
            return component;
        }
    }

    static fromFile(filename: string) {
        const componentFile = HTMLDocument.fromFile(filename, { comments: false });
        return new Component(componentFile, filename);
    }

    static fromString(component: string, filename?: string) {
        const componentFile = HTMLDocument.fromString(component, filename, { comments: false });
        return new Component(componentFile, filename);
    }

    private constructor(componentFile: HTMLDocument, filename?: string) {

        if (filename) {
            this.filename = filename;
            this.relativeFilename = relative(settings.projectPath, filename);
        } else {
            // TODO temp
            this.filename = this.relativeFilename = "anonymous";
        }

        // Read the template from file
        // Typescript cannot recognize that the only return type is HTMLElement due to "child instanceof HTMLElement"
        // which is why the "as" keyword is there :/
        const templateElement = componentFile.children.find(child =>
            child instanceof HTMLElement && child.tagName === "template") as HTMLElement;

        const scriptElement: HTMLElement = componentFile.children.find(child =>
            child instanceof HTMLElement && child.tagName === "script") as HTMLElement;

        const styleElement: HTMLElement = componentFile.children.find(child =>
            child instanceof HTMLElement && child.tagName === "style") as HTMLElement;

        if (!templateElement) {
            throw Error(`Expected <template> in "${filename}"`)
        }

        let componentClass: ClassDeclaration;
        let name: string;
        if (scriptElement) {
            this.clientModule = scriptElement.module!;

            // Find component class
            let componentClass_ = this.clientModule.classes?.find(cls => cls.base?.name === "Component");
            if (!componentClass_) {
                throw Error(`Could not find class that extends "Component" in "${filename}"`);
            }
            componentClass = componentClass_;
            name = componentClass.name!.name!;
        } else {
            name = randomPrismId();
            componentClass = new ClassDeclaration(name, [], { base: "Component" });
            this.clientModule = new Module([componentClass])
        }

        this.className = name;
        this.componentClass = componentClass;

        // If isomorphic generate a module for the server render
        if (settings.context === "isomorphic") {
            this.serverModule = new Module();
            this.serverModule.filename = join(
                settings.absoluteServerOutputPath,
                this.relativeFilename
            );
        }

        // Set client module to be cached. This is mainly to enable importing types from .prism files
        Module.registerCachedModule(this.clientModule, this.filename + ".ts");

        // Retrieve imported components
        this.imports = [];
        this.importedComponents = new Map();
        Component.parsingComponents.add(this.filename);
        for (const import_ of this.clientModule.imports) {
            // TODO other imports such as css etc
            if (import_.from.endsWith(".prism")) {
                const component = Component.registerComponent(resolve(dirname(this.filename), import_.from))
                this.importedComponents.set(component.className, component);
                const relativePath = getImportPath(this.relativeFilename, component.relativeFilename);
                import_.from = relativePath + ".js";
            } else {
                this.imports.push(import_);
            }
        }
        Component.parsingComponents.delete(this.filename);

        if (componentClass.methods?.has("connectedCallback") || componentClass.methods?.has("disconnectedCallback")) {
            throw Error(`Use "connected" and "disconnected" instead of "connectedCallback" and "disconnectedCallback"`);
        }

        // TODO clientGlobals is different to this.clientGlobals

        let passive: boolean = false,
            defaultData: ObjectLiteral | null = null,
            clientGlobals: Array<AsExpression> = [],
            globals: Array<VariableReference> = [];

        if (componentClass.decorators) {
            for (const decorator of componentClass.decorators || []) {
                switch (decorator.name) {
                    case "TagName":
                        const correctTagNameFormat =
                            decorator.args.length === 1 &&
                            (decorator.args[0] as Value).type === Type.string;

                        if (!correctTagNameFormat) {
                            throw Error("Tag name must have one argument of type string");
                        }

                        this.tag = (decorator.args[0] as Value).value!;
                        if (registeredTags.has(this.tag)) {
                            throw Error(`"${this.filename}" - "${this.tag}" already registered under another component`);
                        }
                        break;
                    case "Page":
                        const correctPageDecoratorFormat = decorator.args
                            .every(arg => arg instanceof Value && arg.type === Type.string);

                        if (!correctPageDecoratorFormat) {
                            throw Error(`"${this.filename}" - Page decorator arguments must be of type string`);
                        }

                        // TODO slots have not been calculated yet
                        if (this.hasSlots) {
                            throw Error(`"${this.filename}": Cannot have a page with slots`);
                        }

                        this.isPage = true;

                        for (const arg of decorator.args) {
                            if ((arg as Value).value === "*") {
                                setNotFoundRoute(this);
                            } else {
                                if (!this.routes) this.routes = new Set();
                                const routePattern = (arg as Value).value!;
                                const dynURL = stringToDynamicUrl(routePattern);
                                addRoute(dynURL, this);
                                this.routes.add(dynURL);
                            }
                        }
                        break;
                    case "Layout":
                        this.isLayout = true;
                        break;
                    case "UseLayout":
                        if (decorator.args.length !== 1 || !(decorator.args[0] instanceof VariableReference)) {
                            throw Error(`@UseLayout requires 1 parameter of type object literal in "${filename}"`);
                        }
                        if (!componentClass.decorators.some(decorator => decorator.name === "Page")) {
                            throw Error("Only pages can have layouts");
                        }
                        const layoutName = (decorator.args[0] as VariableReference).name;
                        const layout = this.importedComponents.get(layoutName);
                        if (!layout) {
                            throw Error(`Could not find layout ${layoutName} from imports`);
                        } else if (!layout.isLayout) {
                            throw Error("UseLayout component must be a layout")
                        }
                        this.layout = layout;
                        break;
                    case "Default":
                        if (decorator.args.length !== 1 || !(decorator.args[0] instanceof ObjectLiteral)) {
                            throw Error(`@Default requires 1 argument of type object literal in "${filename}"`)
                        }
                        defaultData = decorator.args[0] as ObjectLiteral;
                        break;
                    case "Passive":
                        passive = true;
                        break;
                    case "Globals":
                        if (!decorator.args.every(arg => arg instanceof VariableReference)) {
                            throw Error(`Arguments of @Globals must be variable references in "${filename}"`);
                        }
                        globals = decorator.args as Array<VariableReference>;
                        break;
                    case "ClientGlobals":
                        for (const arg of decorator.args) {
                            if (arg instanceof AsExpression) {
                                clientGlobals.push(arg);
                            } else if (arg instanceof VariableReference) {
                                clientGlobals.push(new AsExpression(arg, new TypeSignature("any")));
                            } else {
                                throw Error(`Arguments of @ClientGlobal must be variable references or as expression in "${filename}"`);
                            }
                        }
                        this.clientGlobals = clientGlobals.map(({ value }) => value as VariableReference)
                        globals.push(...this.clientGlobals);
                        break;
                    case "Title":
                        const title = decorator.args[0] as Value | TemplateLiteral;
                        if (!title) {
                            throw Error("Metadata decorators args incorrect");
                        }
                        if (title instanceof TemplateLiteral || (title instanceof Value && title.type === Type.string)) {
                            this.title = title;
                        } else {
                            throw Error("Title must be of type string or template literal")
                        }
                        break;
                    case "Metadata":
                        const mappings = (decorator.args[0] as ObjectLiteral).values;
                        if (!mappings) {
                            throw Error("Metadata decorators args incorrect");
                        }
                        this.metadata = new Map();
                        for (const [key, value] of mappings) {
                            if (typeof key !== "string") {
                                throw Error(`Metadata object literal keys must be constant in "${filename}"`);
                            }
                            if (value instanceof Value && value.type === Type.string) {
                                this.metadata.set(key as string, value.value!);
                            } else {
                                this.metadata.set(key as string, value);
                            }
                        }
                        break;
                    case "Singleton":
                    case "Shadow":
                        throw Error(`Not implement - @${decorator.name} in "${filename}"`);
                    default:
                        throw Error(`Unknown decorator ${decorator.name}. Prism does not support external decorators in "${filename}"`)
                }
            }
        }

        // If tag decorator not defined create a tag from the className
        if (typeof this.tag === "undefined") {
            // MySuperElement -> my-super-element
            const name = this.className.split(/([A-Z](?:[a-z]+))/g).filter(Boolean);
            // Web component tag name must contain dash
            if (name.length === 1) {
                name.push("component");
            }
            this.tag = name.join("-").toLowerCase();
        }

        // Add default data
        if (defaultData) {
            componentClass.addMember(new VariableDeclaration("_data", {
                value: defaultData
            }));
        }

        const componentDataTypeSignature = componentClass.base!.typeArguments?.[0] ?? new TypeSignature({ name: "any" });

        let template: Template;
        try {
            template = parseTemplate(
                templateElement as HTMLElement,
                settings.context === "isomorphic",
                globals,
                this.importedComponents,
            );
        } catch (error) {
            // Append the component filename to the error message
            error.message += ` in component "${this.filename}"`;
            throw error;
        }

        const { dependencies, slots, events } = template;

        // Add dynamic title and dependencies
        if (this.title) {
            let loadMethod: FunctionDeclaration;
            // Generate if does not exist yet 
            if (!componentClass.methods?.has("load")) {
                loadMethod = new FunctionDeclaration("load");
                componentClass.addMember(loadMethod);
            } else {
                loadMethod = componentClass.methods.get("load")!;
            }

            // Will set title on component being connected
            const aliasedTitleTL = cloneAST(this.title);
            aliasVariables(aliasedTitleTL, thisDataVariable);
            const titleSetter = new Expression({
                lhs: VariableReference.fromChain("document", "title"),
                operation: Operation.Assign,
                rhs: aliasedTitleTL
            });
            loadMethod.statements.push(titleSetter);

            // TODO title dependency, element? referencesVariables...?
            // findVariables(this.title)
            // dependencies.push({
            //     aspect: ValueAspect.DocumentTitle, 
            //     expression: this.title, 
            //     referencesVariables: []
            // })
        }

        // TODO temp
        dependencies
            .filter(dependency => [ValueAspect.Iterator, ValueAspect.Conditional].includes(dependency.aspect))
            .forEach(dependency => dependency.element.clientRenderMethod = dependency.element.identifier!);

        for (const dependency of dependencies) {
            if (dependency.aspect === ValueAspect.Iterator) {
                const expression = dependency.expression as ForIteratorExpression;
                const renderChildren = clientRenderPrismNode(
                    dependency.element.children[0] as PrismHTMLElement,
                    true,
                    [...globals, expression.variable.toReference()]
                );
                const renderFunction = new FunctionDeclaration(
                    "render" + dependency.element.identifier!,
                    [expression.variable],
                    [new ReturnStatement(renderChildren)]
                );
                componentClass.addMember(renderFunction);
            } else if (dependency.aspect === ValueAspect.Conditional) {
                // TODO very temp removal of the elements clientExpression to not clash 
                const clientExpression = dependency.element.clientExpression;
                delete dependency.element.clientExpression;
                const renderTruthyChild = clientRenderPrismNode(dependency.element as PrismHTMLElement, true, globals);
                dependency.element.clientExpression = clientExpression;

                const renderFalsyChild = clientRenderPrismNode(dependency.element.elseElement!, true, globals);

                const renderFunction = new FunctionDeclaration(
                    "render" + dependency.element.identifier!,
                    [],
                    [
                        new IfStatement(dependency.element.clientExpression! as IValue, [
                            new ReturnStatement(renderTruthyChild)
                        ], new ElseStatement(null, [
                            new ReturnStatement(renderFalsyChild)
                        ]))
                    ]
                );
                componentClass.addMember(renderFunction);
            }
        }

        if (slots.size > 1) {
            throw Error(`Prism only allows for a single slot "${this.filename}"`);
        } else if (slots.size === 1) {
            const [[, slotElement]] = slots;

            const parentOfSlotElement = slotElement.parent! as PrismHTMLElement;

            // The reference to a variable in which to call the append method on
            const referenceToSlotElement = parentOfSlotElement.tagName === "template"
                ? new VariableReference("super") : getElem(parentOfSlotElement);

            // Overrides the HTMLElements append method
            // It stores it in a property under the component which is refereed to during initial csr
            // If it has been connected though it will directly append it to the slot elem
            this.componentClass.addMember(
                new FunctionDeclaration(
                    "append",
                    [new VariableDeclaration("children", { spread: true })],
                    [
                        new Expression({
                            lhs: VariableReference.fromChain("this", "slotElement"),
                            operation: Operation.Assign,
                            rhs: new VariableReference("children")
                        }),
                        new IfStatement(VariableReference.fromChain("this", "isConnected"), [
                            new Expression({
                                lhs: new VariableReference("append", referenceToSlotElement),
                                operation: Operation.Call,
                                rhs: new Expression({ operation: Operation.Spread, lhs: new VariableReference("children") })
                            })
                        ])
                    ]
                )
            );
        }

        // If layout it generates override for firstChild which is a reference to the page component it wraps
        if (this.isLayout) {
            const getReferenceToSlotParent = getElem(slots.get("content")!.parent! as PrismHTMLElement);
            const getFirstChild = new VariableReference("firstElementChild", getReferenceToSlotParent);
            const getFirstChildGetter = new FunctionDeclaration("firstElementChild", [], [
                new ReturnStatement(getFirstChild)
            ], { getSet: GetSet.Get });
            componentClass.addMember(getFirstChildGetter);
        }

        // Parse stylesheet
        if (styleElement) {
            this.stylesheet = styleElement.stylesheet!;
            // Prefix all rules in the style tag to be descendants of the tag name
            const thisTagSelector: ISelector = { tagName: this.tag }
            for (const rule of this.stylesheet.rules) {
                if (rule instanceof Rule) {
                    rule.selectors = rule.selectors.map(selector1 => prefixSelector(selector1, thisTagSelector));
                } else if (rule instanceof MediaRule) {
                    rule.nestedRules.forEach(nestedRule => {
                        nestedRule.selectors = nestedRule.selectors.map(selector1 => prefixSelector(selector1, thisTagSelector));
                    })
                }
            }
        } else {
            this.stylesheet = new Stylesheet();
        }

        this.stylesheet.filename = join(
            settings.absoluteOutputPath,
            this.relativeFilename + ".css",
        );

        this.dependencies = dependencies;
        this.hasSlots = slots.size > 0;

        // Process the components data type
        let componentDataType: IType | null = null;
        if (componentClass.base!.typeArguments?.[0]) {
            try {
                componentDataType = typeSignatureToIType(componentClass.base!.typeArguments![0], this.clientModule);
                this.needsData = !Array.from(componentDataType.properties!.values())
                    .every(property => property.name === "HTMLElement");
            } catch (error) {
                error.message += ` in component "${this.filename}"`;
                throw error;
            }
        }

        // Build the render method
        const clientRenderMethod = buildClientRenderMethod(templateElement, true, globals);
        componentClass.addMember(clientRenderMethod);

        // Build event bindings for ssr components
        if (settings.context === "isomorphic") {
            for (const method of buildEventBindings(events)) {
                if (method.statements.length > 0) {
                    componentClass.addMember(method);
                }
            }
        }

        // Define component to customElement register call
        const define = new Expression({
            lhs: VariableReference.fromChain("window", "customElements", "define"),
            operation: Operation.Call,
            rhs: new ArgumentList([new Value(this.tag, Type.string), new VariableReference(this.className)])
        });

        this.clientModule.statements.push(define);

        // Construct bindings
        if (dependencies.length > 0 && !passive) {
            try {
                if (!componentDataType) {
                    // TODO dependency element debug not great
                    throw Error(`Data type required for a dependency around element ${dependencies[0].element.render(defaultRenderSettings, { inline: true })}`);
                }

                const bindingTree = constructBindings(dependencies, componentDataType, globals);
                const treeVariable = new VariableDeclaration("_bindings", { isStatic: true, value: bindingTree });
                componentClass.addMember(treeVariable);
            } catch (error) {
                error.message += ` in component "${this.filename}"`;
                throw error;
            }
        }

        this.clientModule.filename = join(
            settings.absoluteOutputPath,
            this.relativeFilename + ".js"
        );

        // Used by router to detect layout at runtime from SSR content
        if (settings.context === "isomorphic" && this.isLayout) {
            componentClass.addMember(new VariableDeclaration("layout", { value: new Value("true", Type.boolean) }));
        }

        // Build the server render module
        if (settings.context === "isomorphic") {

            for (const statement of this.clientModule.statements) {
                if (statement instanceof ClassDeclaration) {
                    // Don't copy the front side component definition
                    if (statement !== this.componentClass) this.serverModule!.statements.push(statement);
                } else if (statement instanceof ExportStatement) {
                    if (statement.exported !== this.componentClass) this.serverModule!.statements.push(statement);
                } else if (statement instanceof ImportStatement) {
                    // .js is added during parsing imported components
                    if (statement.from.endsWith(".prism.js")) {
                        const newImports: Array<string> = [];
                        let importedComponent: Component | null = null;
                        for (const [key] of statement.variable?.entries!) {
                            if (this.importedComponents.has(key as string)) {
                                importedComponent = this.importedComponents.get(key as string)!;
                                newImports.push(importedComponent.serverRenderFunction!.name!.name!)
                            } else {
                                newImports.push(key as string);
                            }
                        }
                        const newPath = getImportPath(
                            this.serverModule!.filename!,
                            importedComponent!.serverModule!.filename!
                        );
                        const newImport = new ImportStatement(newImports, newPath, statement.as, statement.typeOnly);
                        this.serverModule!.statements.push(newImport);
                    } else {
                        const newPath = getImportPath(
                            this.serverModule!.filename!,
                            resolve(dirname(this.filename), statement.from)
                        );
                        const newImport = new ImportStatement(statement.variable, newPath, statement.as, statement.typeOnly);
                        this.serverModule!.statements.push(newImport);
                    }
                } else if (statement !== define) {
                    this.serverModule!.statements.push(statement);
                }
            }

            // Construct ssr function parameters
            const parameters: Array<VariableDeclaration> = [];
            if (this.needsData) {
                const dataParameter = new VariableDeclaration(
                    this.isLayout ? "layoutData" : "data", 
                    { typeSignature: componentDataTypeSignature }
                );
                if (defaultData) {
                    dataParameter.value = defaultData;
                }
                parameters.push(dataParameter);
            }

            // Push client globals
            parameters.push(
                ...clientGlobals.map(clientGlobal =>
                    new VariableDeclaration(((clientGlobal.value as VariableReference).name), { typeSignature: clientGlobal.asType }))
            );

            // Whether to generate a argument to add a slot to the tag for attribute. Not needed on pages as they cannot be instantiated directly and thus no way user can add attribute set to component
            const generateAttributeArgument: boolean = !this.isPage;

            if (generateAttributeArgument) {
                parameters.push(new VariableDeclaration("attributes", {
                    typeSignature: new TypeSignature({ name: "string" }),
                    value: new Value("", Type.string)
                }));
            }

            if (this.hasSlots) {
                for (const slot of slots.keys()) {
                    parameters.push(new VariableDeclaration(`${slot}Slot`, { typeSignature: new TypeSignature({ name: "string" }) }));
                }
            }

            const renderFunction = new FunctionDeclaration(`render${this.className}Component`, parameters, []);

            // Append "data-ssr" to the server rendered component. Used at runtime.
            const componentAttributes: Map<string, string | null> = new Map([["data-ssr", null]]);

            // Generate a tag of self (instead of using template) (reuses template.element.children)
            const componentHtmlTag: PrismNode = new HTMLElement(this.tag, componentAttributes, templateElement.children, templateElement.parent);

            // Final argument is to add a entry onto the component that is sent attributes 
            const renderTemplateLiteral = serverRenderPrismNode(componentHtmlTag, globals, settings.minify, generateAttributeArgument);

            // TODO would this work just using the existing slot functionality?
            // TODO could do in the page render function
            if (this.layout) {
                // Generate this components markup and then pass it to the layout render function to be injected
                const innerContent = new VariableDeclaration("content", {
                    isConstant: true,
                    value: renderTemplateLiteral
                });
                renderFunction.statements.push(innerContent);

                // TODO data???
                const renderArgs = new Map([
                    ["attributes", new Value("", Type.string)],
                    ["data", new VariableReference("data")],
                    ["contentSlot", innerContent.toReference()]
                ] as Array<[string, IValue]>);

                for (const clientGlobal of this.clientGlobals) {
                    renderArgs.set((clientGlobal.tail as VariableReference).name, clientGlobal);
                }

                let argumentList: ArgumentList;
                try {
                    argumentList = this.layout.serverRenderFunction!.buildArgumentListFromArguments(renderArgs)
                } catch (error) {
                    throw Error(`Layout "${this.layout.filename}" has a client global not present in "${this.filename}"`);
                }
                const callLayoutSSRFunction = new Expression({
                    lhs: new VariableReference(this.layout.serverRenderFunction!.name!.name!),
                    operation: Operation.Call,
                    rhs: argumentList
                });

                renderFunction.statements.push(new ReturnStatement(callLayoutSSRFunction));
            } else {
                renderFunction.statements.push(new ReturnStatement(renderTemplateLiteral));
            }

            this.serverModule!.addExport(renderFunction);
            this.serverRenderFunction = renderFunction;

            // If has page decorator, add another function that renders the page into full document with head
            if (this.isPage) {
                const pageRenderArgs: Array<IValue> = this.needsData ? [new VariableReference("data")] : [];
                pageRenderArgs.push(...this.clientGlobals);

                const pageRenderCall: IValue = new Expression({
                    lhs: new VariableReference(renderFunction.name!.name!),
                    operation: Operation.Call,
                    rhs: new ArgumentList(pageRenderArgs)
                });

                // Build the metadata
                let metadataString = new TemplateLiteral();
                if (this.title) {
                    const title = new HTMLElement("title");
                    const tn: PrismTextNode = new TextNode("", title);
                    tn.value = this.title;
                    title.children.push(tn);
                    metadataString.addEntry(...serverRenderPrismNode(title, globals, settings.minify).entries);
                }

                if (this.metadata) {
                    for (const metaTag of buildMetaTags(this.metadata)) {
                        metadataString.addEntry(...serverRenderPrismNode(metaTag, globals, settings.minify).entries);
                        metadataString.addEntry("\n");
                    }
                }

                const metaDataArg: IValue = (this.title || this.metadata) ? metadataString : new Value("", Type.string);

                // Creates "return renderHTML(renderComponent(***))"
                const renderAsPage = new ReturnStatement(
                    new Expression({
                        lhs: new VariableReference("renderHTML"),
                        operation: Operation.Call,
                        rhs: new ArgumentList([pageRenderCall, metaDataArg])
                    })
                );

                const renderPageFunction = new FunctionDeclaration(
                    `render${this.className}Page`,
                    parameters,
                    [renderAsPage]
                );

                let description = "Server render function for ";
                if (filename) {
                    // Create a link back to the component
                    description += `[${this.className}](file:///${filename?.replace(/\\/g, "/")})`
                } else {
                    description += name;
                }

                // Generate a docstring for the function
                const functionDocumentationString = GenerateDocString({
                    text: description,
                    remarks: "Built using [Prism](https://github.com/kaleidawave/prism)",
                });
                this.serverModule!.statements.push(functionDocumentationString);
                this.pageServerRenderFunction = renderPageFunction;
                this.serverModule!.addExport(renderPageFunction);
            }

            // Add imports from the server module
            const imports: Array<VariableDeclaration> = [];

            if (this.isPage) {
                imports.push(new VariableDeclaration("renderHTML")); // Renders the component around the HTML document
            }
            if (this.needsData) {
                imports.push(new VariableDeclaration("escape")); // Escapes HTML values
            }

            if (imports.length > 0) {
                this.serverModule!.addImport(
                    imports,
                    "./" +
                    relative(
                        dirname(this.serverModule!.filename ?? ""),
                        join(settings.absoluteServerOutputPath, "prism")
                    ).replace(/\\/g, "/")
                );
            }
        }
    }
}