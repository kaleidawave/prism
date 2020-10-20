import { HTMLElement, HTMLDocument, TextNode } from "./chef/html/html";
import { ClassDeclaration } from "./chef/javascript/components/constructs/class";
import { parseTemplate, IBinding, ITemplateData, BindingAspect } from "./templating/template";
import { Module } from "./chef/javascript/components/module";
import { buildClientRenderMethod, clientRenderPrismNode } from "./templating/builders/client-render";
import { buildEventBindings } from "./templating/builders/server-event-bindings";
import { constructBindings } from "./templating/builders/data-bindings";
import { FunctionDeclaration, ArgumentList, GetSet } from "./chef/javascript/components/constructs/function";
import { Expression, Operation } from "./chef/javascript/components/value/expression";
import { VariableDeclaration } from "./chef/javascript/components/statements/variable";
import { Value, Type, IValue } from "./chef/javascript/components/value/value";
import { ReturnStatement } from "./chef/javascript/components/statements/statement";
import { IServerRenderSettings, serverRenderPrismNode } from "./templating/builders/server-render";
import { GenerateDocString } from "./chef/javascript/components/statements/comments";
import { setNotFoundRoute, addRoute } from "./builders/client-side-routing";
import { DynamicUrl, stringToDynamicUrl } from "./chef/dynamic-url";
import { resolve, dirname, relative, join } from "path";
import { ObjectLiteral } from "./chef/javascript/components/value/object";
import { TemplateLiteral } from "./chef/javascript/components/value/template-literal";
import { buildMetaTags } from "./metatags";
import { Stylesheet } from "./chef/css/stylesheet";
import { prefixSelector, ISelector } from "./chef/css/selectors";
import { getElement, randomPrismId, thisDataVariable } from "./templating/helpers";
import { ImportStatement, ExportStatement } from "./chef/javascript/components/statements/import-export";
import { VariableReference } from "./chef/javascript/components/value/variable";
import { getImportPath, defaultRenderSettings } from "./chef/helpers";
import { IType, typeSignatureToIType, inbuiltTypes } from "./chef/javascript/utils/types";
import { Rule } from "./chef/css/rule";
import { MediaRule } from "./chef/css/at-rules";
import { IfStatement, ElseStatement } from "./chef/javascript/components/statements/if";
import { TypeSignature } from "./chef/javascript/components/types/type-signature";
import { AsExpression } from "./chef/javascript/components/types/statements";
import { ForIteratorExpression } from "./chef/javascript/components/statements/for";
import { cloneAST, aliasVariables } from "./chef/javascript/utils/variables";
import { assignToObjectMap } from "./helpers";
import { IFinalPrismSettings } from "./settings";
import { IRuntimeFeatures } from "./builders/prism-client";

export class Component {
    static registeredTags: Set<string> = new Set()

    title: IValue | null = null; // If page the document title

    isPage: boolean = false;
    routes: Set<DynamicUrl> | null = null; // The url to match the page on

    isLayout: boolean = false;

    className: string; // The class name of the component
    tag!: string; // Tag for component. Defaults to (ClassName)-component

    needsData: boolean = false; // If the component has any data and needs to be passed data
    hasSlots: boolean = false; // If the component has slots

    // The root data of the component
    templateElement: HTMLElement;
    componentClass: ClassDeclaration;
    clientModule: Module;
    serverModule?: Module;
    serverRenderFunction?: FunctionDeclaration;
    pageServerRenderFunction?: FunctionDeclaration;

    usesLayout?: Component; // The layout the component extends (component must be a page to have a layout)
    dataTypes: Map<string, Type>; // TODO merge with some kind of root data

    filename: string; // The full filename to the component
    relativeFilename: string; // The filename relative to the given src folder

    metadata: Map<string, string | IValue> | null = null; // A set of metadata included during ssr

    clientGlobals: Array<VariableReference> = [];

    stylesheet?: Stylesheet;

    imports: Array<ImportStatement>;
    exports: Map<string, any> | null = null;
    importedComponents: Map<string, Component>;

    bindings: Array<IBinding>;

    // Used to prevent cyclic imports
    static parsingComponents: Set<string> = new Set();
    // Filename to registered component map
    static registeredComponents: Map<string, Component> = new Map();

    /**
     * Returns a component under a filename
     * If a component has been parsed will return it from the register and not re parse it
     */
    static async registerComponent(filepath: string, settings: IFinalPrismSettings, features: IRuntimeFeatures): Promise<Component> {
        if (Component.parsingComponents.has(filepath)) {
            throw Error(`Cyclic import ${filepath}`); // TODO test and better error message
        }

        if (Component.registeredComponents.has(filepath)) {
            return Component.registeredComponents.get(filepath)!;
        } else {
            const component = await Component.fromFile(filepath);
            await component.processComponent(settings, features)
            Component.registeredComponents.set(filepath, component);
            return component;
        }
    }

    static async fromFile(filename: string) {
        const componentFile = await HTMLDocument.fromFile(filename, { comments: false });
        return new Component(componentFile);
    }

    static fromString(component: string, filename?: string) {
        const componentFile = HTMLDocument.fromString(component, filename, { comments: false });
        return new Component(componentFile);
    }

    private constructor(componentFile: HTMLDocument) {
        this.filename = componentFile.filename;

        // Read the template from file
        this.templateElement = componentFile.children.find((child) =>
            child instanceof HTMLElement && child.tagName === "template") as HTMLElement;

        if (!this.templateElement) {
            throw Error("Component requires <template> element");
        }

        const scriptElement: HTMLElement = componentFile.children.find(child =>
            child instanceof HTMLElement && child.tagName === "script") as HTMLElement;

        if (!scriptElement) {
            this.clientModule = new Module([
                new ClassDeclaration(randomPrismId(), [], { base: new TypeSignature("Component") })
            ]);
        } else {
            this.clientModule = scriptElement.module!;
        }

        const styleElement: HTMLElement = componentFile.children.find(child =>
            child instanceof HTMLElement && child.tagName === "style") as HTMLElement;

        this.stylesheet = styleElement?.stylesheet;
    }

    async processComponent(settings: IFinalPrismSettings, runtimeFeatures: IRuntimeFeatures) {
        this.relativeFilename = relative(settings.projectPath, this.filename);

        // Find component class
        let componentClass = this.clientModule.classes?.find(cls => cls.base?.name === "Component");
        if (!componentClass) {
            throw Error(`Could not find class that extends "Component" in "${this.filename}"`);
        }

        this.className = componentClass.name!.name!;
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
                const component = await Component.registerComponent(resolve(dirname(this.filename), import_.from), settings, runtimeFeatures);
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
            globals: Array<VariableReference> = [],
            noSSRData = false;

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
                        if (Component.registeredTags.has(this.tag)) {
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
                    case "NoSSRData":
                        noSSRData = true;
                        break;
                    case "UseLayout":
                        if (decorator.args.length !== 1 || !(decorator.args[0] instanceof VariableReference)) {
                            throw Error(`@UseLayout requires 1 parameter of type object literal in "${this.filename}"`);
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
                        this.usesLayout = layout;
                        break;
                    case "Default":
                        if (decorator.args.length !== 1 || !(decorator.args[0] instanceof ObjectLiteral)) {
                            throw Error(`@Default requires 1 argument of type object literal in "${this.filename}"`)
                        }
                        defaultData = decorator.args[0] as ObjectLiteral;
                        break;
                    case "Passive":
                        passive = true;
                        break;
                    case "Globals":
                        if (!decorator.args.every(arg => arg instanceof VariableReference)) {
                            throw Error(`Arguments of @Globals must be variable references in "${this.filename}"`);
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
                                throw Error(`Arguments of @ClientGlobal must be variable references or as expression in "${this.filename}"`);
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
                                throw Error(`Metadata object literal keys must be constant in "${this.filename}"`);
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
                        throw Error(`Not implement - @${decorator.name} in "${this.filename}"`);
                    default:
                        throw Error(`Unknown decorator ${decorator.name}. Prism does not support external decorators in "${this.filename}"`)
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

        const componentDataTypeSignature = 
            componentClass.base!.typeArguments?.[0] ?? new TypeSignature({ name: "any" });

        let templateData: ITemplateData;
        try {
            templateData = parseTemplate(this.templateElement, {
                ssrEnabled: settings.context === "isomorphic",
                doClientSideRouting: settings.clientSideRouting,
                importedComponents: this.importedComponents
            }, globals);
        } catch (error) {
            // Append the component filename to the error message
            error.message += ` in component "${this.filename}"`;
            throw error;
        }

        if (templateData.hasSVG) {
            runtimeFeatures.svg = true;
        }

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

            // TODO title bindings, element? referencesVariables...?
            // findVariables(this.title)
            // bindings.push({
            //     aspect: ValueAspect.DocumentTitle, 
            //     expression: this.title, 
            //     referencesVariables: []
            // })
        }

        for (const binding of templateData.bindings) {
            if (binding.aspect === BindingAspect.Iterator) {
                const expression = binding.expression as ForIteratorExpression;
                const renderChildren = clientRenderPrismNode(
                    binding.element.children[0],
                    templateData.nodeData,
                    true,
                    [...globals, expression.variable.toReference()]
                );
                const elementIdentifer = templateData.nodeData.get(binding.element)?.identifier!;
                const renderMethod = new FunctionDeclaration(
                    "render" + elementIdentifer,
                    [expression.variable],
                    [new ReturnStatement(renderChildren)]
                );
                componentClass.addMember(renderMethod);
                assignToObjectMap(templateData.nodeData, binding.element, "clientRenderMethod", renderMethod);
            } else if (binding.aspect === BindingAspect.Conditional) {
                // Final true is important here to make sure 
                const renderTruthyChild =
                    clientRenderPrismNode(binding.element, templateData.nodeData, true, globals, true);

                const { elseElement, identifier, conditionalExpression } = templateData.nodeData.get(binding.element)!;
                const renderFalsyChild = clientRenderPrismNode(elseElement!, templateData.nodeData, true, globals);

                const clientAliasedConditionExpression = cloneAST(conditionalExpression!);
                aliasVariables(clientAliasedConditionExpression, thisDataVariable, globals);

                const renderMethod = new FunctionDeclaration(
                    "render" + identifier!,
                    [],
                    [
                        new IfStatement(clientAliasedConditionExpression as IValue, [
                            new ReturnStatement(renderTruthyChild)
                        ], new ElseStatement(null, [
                            new ReturnStatement(renderFalsyChild)
                        ]))
                    ]
                );
                componentClass.addMember(renderMethod);
                assignToObjectMap(templateData.nodeData, binding.element, "clientRenderMethod", renderMethod);
            }
        }

        if (templateData.bindings.some(binding => binding.aspect === BindingAspect.Conditional)) {
            runtimeFeatures.conditionals = true;
        }

        if (templateData.slots.size > 1) {
            throw Error(`Prism only allows for a single slot "${this.filename}"`);
        } else if (templateData.slots.size === 1) {
            const [[, slotElement]] = templateData.slots;

            const parentOfSlotElement = slotElement.parent as HTMLElement;

            // The reference to a variable in which to call the append method on
            const referenceToSlotElement = parentOfSlotElement.tagName === "template"
                ? new VariableReference("super") : getElement(parentOfSlotElement, templateData.nodeData);

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
            const contentSlot = templateData.slots.get("content");
            if (!contentSlot) {
                throw Error(`Layout must have content slot for page content`)
            }
            const getReferenceToSlotParent = getElement(contentSlot.parent as HTMLElement, templateData.nodeData);
            const getFirstChild = new VariableReference("firstElementChild", getReferenceToSlotParent);
            const getFirstChildGetter = new FunctionDeclaration("firstElementChild", [], [
                new ReturnStatement(getFirstChild)
            ], { getSet: GetSet.Get });
            componentClass.addMember(getFirstChildGetter);
        }

        // Parse stylesheet
        if (this.stylesheet) {
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

            this.stylesheet.filename = join(
                settings.absoluteOutputPath,
                this.relativeFilename + ".css",
            );
        }

        this.bindings = templateData.bindings;
        this.hasSlots = templateData.slots.size > 0;

        // Process the components data type
        let componentDataType: IType | null = null;
        if (componentClass.base!.typeArguments?.[0]) {
            try {
                componentDataType = await typeSignatureToIType(componentClass.base!.typeArguments![0], this.clientModule);
                this.needsData = !Array.from(componentDataType.properties!.values())
                    .every(property => property.name === "HTMLElement");
            } catch (error) {
                error.message += ` in component "${this.filename}"`;
                throw error;
            }
        }

        /**
         * Recursively detects if some part of the the type has an Array
         * @param type 
         */
        const hasArrayProperty = function hasArrayProperty(type: IType): boolean {
            if (type.name === "Array") return true;
            if (type.properties?.has("Array")) return true;
            if (type.properties && Array.from(type.properties).some(([,property]) => hasArrayProperty(property))) return true;
            return false;
        }

        if (!runtimeFeatures.observableArrays && componentDataType && hasArrayProperty(componentDataType)) {
            runtimeFeatures.observableArrays = true;
        }

        if (!runtimeFeatures.subObjects && componentDataType && Array.from(componentDataType.properties!).some(([,property]) => !inbuiltTypes.has(property.name!))) {
            runtimeFeatures.subObjects = true;
        }

        // Build the render method
        const clientRenderMethod = buildClientRenderMethod(this.templateElement, templateData.nodeData, true, globals);
        componentClass.addMember(clientRenderMethod);

        // Build event bindings for ssr components
        if (settings.context === "isomorphic") {
            for (const method of buildEventBindings(templateData.events, templateData.nodeData, settings.disableEventElements)) {
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
        if (templateData.bindings.length > 0 && !passive) {
            try {
                if (!componentDataType) {
                    // TODO dependency element debug not great
                    throw Error(`Data type required for a dependency around element ${templateData.bindings[0].element.render(defaultRenderSettings, { inline: true })}`);
                }

                const bindingTree = constructBindings(
                    templateData.bindings,
                    templateData.nodeData,
                    componentDataType,
                    globals,
                    settings
                );

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
            if (this.needsData && !noSSRData) {
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
                for (const slot of templateData.slots.keys()) {
                    parameters.push(new VariableDeclaration(`${slot}Slot`, { typeSignature: new TypeSignature({ name: "string" }) }));
                }
            }

            const renderFunction = new FunctionDeclaration(`render${this.className}Component`, parameters, []);

            if (defaultData && noSSRData) {
                renderFunction.statements.push(new VariableDeclaration("data", {
                    value: defaultData,
                    typeSignature: componentDataTypeSignature
                }));
            }

            // Append "data-ssr" to the server rendered component. Used at runtime.
            const componentAttributes: Map<string, string | null> = new Map([["data-ssr", null]]);

            // Generate a tag of self (instead of using template) (reuses template.element.children)
            const componentHtmlTag = new HTMLElement(this.tag, componentAttributes, this.templateElement.children, this.templateElement.parent);

            const ssrSettings: IServerRenderSettings = {
                dynamicAttribute: generateAttributeArgument,
                minify: settings.minify,
                addDisableToElementWithEvents: settings.disableEventElements
            }

            // Final argument is to add a entry onto the component that is sent attributes 
            const renderTemplateLiteral = serverRenderPrismNode(componentHtmlTag, templateData.nodeData, ssrSettings, globals);

            // TODO would this work just using the existing slot functionality?
            // TODO could do in the page render function
            if (this.usesLayout) {
                // Generate this components markup and then pass it to the layout render function to be injected
                const innerContent = new VariableDeclaration("content", {
                    isConstant: true,
                    value: renderTemplateLiteral
                });
                renderFunction.statements.push(innerContent);

                // TODO layout data is different to component data. Should be interpreted in same way as client global
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
                    argumentList = this.usesLayout.serverRenderFunction!.buildArgumentListFromArguments(renderArgs)
                } catch (error) {
                    throw Error(`Layout "${this.usesLayout.filename}" has a client global not present in "${this.filename}"`);
                }
                const callLayoutSSRFunction = new Expression({
                    lhs: new VariableReference(this.usesLayout.serverRenderFunction!.name!.name!),
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
                    const titleTextNode = new TextNode("", title);
                    assignToObjectMap(templateData.nodeData, titleTextNode, "textNodeValue", this.title);
                    title.children.push(titleTextNode);
                    metadataString.addEntry(
                        ...serverRenderPrismNode(title, templateData.nodeData, ssrSettings).entries
                    );
                }

                if (this.metadata) {
                    const { metadataTags, nodeData: metaDataNodeData } = buildMetaTags(this.metadata)
                    for (const metaTag of metadataTags) {
                        metadataString.addEntry(...serverRenderPrismNode(metaTag, metaDataNodeData, ssrSettings, globals).entries);
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
                if (this.filename) {
                    // Create a link back to the component
                    description += `[${this.className}](file:///${this.filename?.replace(/\\/g, "/")})`
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