import { HTMLElement, HTMLDocument, TextNode, Node } from "./chef/html/html";
import { ClassDeclaration } from "./chef/javascript/components/constructs/class";
import { parseTemplate, IBinding, ITemplateData, BindingAspect, PartialBinding } from "./templating/template";
import { Module as JSModule } from "./chef/javascript/components/module";
import { buildClientRenderMethod, clientRenderPrismNode } from "./templating/builders/client-render";
import { buildEventBindings } from "./templating/builders/server-event-bindings";
import { constructBindings } from "./templating/builders/data-bindings";
import { FunctionDeclaration, ArgumentList, GetSet } from "./chef/javascript/components/constructs/function";
import { Expression, Operation, VariableReference } from "./chef/javascript/components/value/expression";
import { VariableDeclaration } from "./chef/javascript/components/statements/variable";
import { Value, Type, ValueTypes, nullValue } from "./chef/javascript/components/value/value";
import { ReturnStatement } from "./chef/javascript/components/statements/statement";
import { setNotFoundRoute, addRoute } from "./builders/client-side-routing";
import { DynamicUrl, stringToDynamicUrl } from "./chef/dynamic-url";
import { ObjectLiteral } from "./chef/javascript/components/value/object";
import { TemplateLiteral } from "./chef/javascript/components/value/template-literal";
import { Stylesheet } from "./chef/css/stylesheet";
import { prefixSelector, ISelector } from "./chef/css/selectors";
import { addBinding, getElement, hasDateProperty, randomPrismId, thisDataVariable } from "./templating/helpers";
import { ImportStatement } from "./chef/javascript/components/statements/import-export";
import { getImportPath, defaultRenderSettings, makeRenderSettings } from "./chef/helpers";
import { IType, typeSignatureToIType, inbuiltTypes } from "./chef/javascript/utils/types";
import { relative, dirname, join } from "path";
import { Rule } from "./chef/css/rule";
import { MediaRule } from "./chef/css/at-rules";
import { IfStatement, ElseStatement } from "./chef/javascript/components/statements/if";
import { TypeSignature } from "./chef/javascript/components/types/type-signature";
import { AsExpression } from "./chef/javascript/components/types/statements";
import { ForIteratorExpression } from "./chef/javascript/components/statements/for";
import { cloneAST, aliasVariables } from "./chef/javascript/utils/variables";
import { assignToObjectMap } from "./helpers";
import { IFinalPrismSettings } from "./settings";
import { IRuntimeFeatures, preludeImports } from "./builders/prism-client";
import { IFunctionDeclaration, IModule } from "./chef/abstract-asts";
import { buildMetaTags } from "./metatags";
import {
    IServerRenderSettings, ServerRenderedChunks, serverRenderPrismNode
} from "./templating/builders/server-render";
import {
    makeTsComponentServerModule as tsModuleFromServerRenderedChunks
} from "./builders/server-side-rendering/typescript";
import {
    makeRustComponentServerModule as rustModuleFromServerRenderedChunks
} from "./builders/server-side-rendering/rust";
import { DynamicStatement } from "./chef/rust/dynamic-statement";

export class Component {
    // Registered tag names, prevents duplicate tags
    static registeredTags: Set<string> = new Set();

    // Used to prevent cyclic imports
    static parsingComponents: Set<string> = new Set();
    // Filename to registered component map
    static registeredComponents: Map<string, Component> = new Map();

    title: ValueTypes | null = null; // If page the document title

    isPage: boolean = false;
    routes: Set<DynamicUrl> | null = null; // The url to match the page on

    isLayout: boolean = false;

    className: string; // The class name of the component
    tagName!: string; // Tag for component. Defaults to (ClassName)-component

    needsData: boolean = true; // If the component has any data and needs to be passed data
    hasSlots: boolean = false; // If the component has slots

    // The root data of the component
    templateElement!: HTMLElement;
    componentClass!: ClassDeclaration;
    clientModule!: JSModule;

    serverModule?: IModule<any>; // TODO any
    serverRenderFunction?: IFunctionDeclaration;
    destructuredServerRenderFunction?: IFunctionDeclaration;
    pageServerRenderFunction?: IFunctionDeclaration;
    layoutServerRenderFunctions?: [IFunctionDeclaration, IFunctionDeclaration];

    usesLayout?: Component; // The layout the component extends (component must be a page to have a layout)

    filename: string; // The full filename to the component
    relativeFilename: string; // The filename relative to the given src folder

    metadata: Map<string, string | ValueTypes> | null = null; // A set of metadata included during ssr

    clientGlobals: Array<[VariableReference, TypeSignature]> = [];
    customElementDefineStatement: Expression;
    defaultData?: ObjectLiteral;
    templateData: ITemplateData;

    // Whether to not add a parameter for sending data to component in favor of using default data
    noSSRData: boolean = false;

    stylesheet?: Stylesheet;

    imports: Array<ImportStatement>;
    exports: Map<string, any> | null = null;
    importedComponents: Map<string, Component>;

    bindings: Array<IBinding>;

    useShadowDOM: boolean;
    passive: boolean;
    globals: VariableReference[] = [];

    // Parameters for the SSR function
    serverRenderParameters: VariableDeclaration[];
    // The TS type signature for the component
    dataTypeSignature: TypeSignature;
    componentDataType: IType | null;

    // The template wrapped in a <*component-tag*> element
    componentHTMLTag: HTMLElement;
    // ServerRenderedChunks used for generating the concatenation for <head>
    metaDataChunks: ServerRenderedChunks;

    createdUsingDestructured: boolean = false;

    codeGenerated: boolean = false;

    // Whether to load content from server
    renderFromEndpoint?: DynamicUrl;

    // Set a capacity for the SSR buffer
    withCapacity: number = 0;

    /**
     * Returns a component under a filename
     * If a component has been parsed will return it from the register and not re parse it
     */
    static registerComponent(filepath: string, settings: IFinalPrismSettings, features: IRuntimeFeatures): Component {
        if (Component.parsingComponents.has(filepath)) {
            throw Error(`Cyclic import ${filepath}`); // TODO test and better error message
        }

        if (Component.registeredComponents.has(filepath)) {
            return Component.registeredComponents.get(filepath)!;
        } else {
            const component = Component.fromFile(filepath);
            component.processComponent(settings, features)
            Component.registeredComponents.set(filepath, component);
            return component;
        }
    }

    static fromFile(filename: string) {
        const componentFile = HTMLDocument.fromFile(filename, { comments: false });
        return new Component(componentFile);
    }

    static fromString(component: string, filename: string) {
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

        // If no script element then generate a standard module
        if (!scriptElement) {
            this.clientModule = new JSModule(this.filename, [
                new ClassDeclaration(randomPrismId(), [], { base: new TypeSignature("Component") })
            ]);
        } else {
            this.clientModule = scriptElement.module!;
        }

        const styleElement: HTMLElement = componentFile.children.find(child =>
            child instanceof HTMLElement && child.tagName === "style") as HTMLElement;

        if (styleElement) {
            const componentStylesheet = styleElement.stylesheet!;
            componentStylesheet.filename += ".css";
            this.stylesheet = componentStylesheet;
        }
    }

    processComponent(settings: IFinalPrismSettings, runtimeFeatures: IRuntimeFeatures) {
        this.relativeFilename = relative(settings.absoluteProjectPath, this.filename);

        // Find component class
        let componentClass = this.clientModule.classes?.find(cls => cls.base?.name === "Component");
        if (!componentClass) {
            throw Error(`Could not find class that extends "Component" in "${this.filename}"`);
        }
        if (typeof componentClass.name?.name === "undefined") {
            throw Error(`Expected class name on ${this.relativeFilename}`);
        }
        this.className = componentClass.name.name;
        this.componentClass = componentClass;

        // Set client module to be cached. This is mainly to enable importing types from .prism files
        JSModule.registerCachedModule(this.clientModule, this.filename + ".ts");

        // Retrieve imported components
        this.imports = [];
        this.importedComponents = new Map();
        Component.parsingComponents.add(this.filename);
        for (const import_ of this.clientModule.imports) {
            if (import_.from.endsWith(".prism")) {
                // TODO absolute imports, possible look in node_modules etc
                const componentPath: string = join(dirname(this.filename), import_.from);
                const component = Component.registerComponent(componentPath, settings, runtimeFeatures);

                // Only add to importedComponents if it is imported. (e.g may import a method not a component)
                // TODO export default & import x from ".."
                if (
                    import_.variable === null ||
                    import_.variable?.entries?.has(component.className)
                ) {
                    this.importedComponents.set(component.className, component);
                }

                // Change to relative path TODO check
                const relativePath = getImportPath(this.relativeFilename, component.relativeFilename);
                // For bundlers to know this is a JS file
                import_.from = relativePath + (settings.outputTypeScript ? ".ts" : ".js");
            } else {
                this.imports.push(import_);
            }

            // TODO other imports such as css etc
        }
        Component.parsingComponents.delete(this.filename);

        if (componentClass.methods?.has("connectedCallback") || componentClass.methods?.has("disconnectedCallback")) {
            throw Error(`Use "connected" and "disconnected" instead of "connectedCallback" and "disconnectedCallback"`);
        }

        if (componentClass.decorators) {
            try {
                this.processDecorators(settings);
            } catch (error) {
                // Append the component filename to the error message
                error.message += ` in component "${this.filename}"`;
                throw error;
            }
        }

        // If tag decorator not defined create a tag from the className
        if (typeof this.tagName === "undefined") {
            // MySuperElement -> my-super-element
            const name = this.className.split(/([A-Z](?:[a-z]+))/g).filter(Boolean);
            // Web component tag name must contain dash
            if (name.length === 1) {
                name.push("component");
            }
            this.tagName = name.join("-").toLowerCase();
        }

        // Add default data
        if (this.defaultData) {
            componentClass.addMember(new VariableDeclaration("_d", {
                value: this.defaultData
            }));
        }

        let templateData: ITemplateData;
        try {
            const tagToComponentMap = new Map(this.importedComponents);
            // Enables recursive components via <This> or using the <*TagName*>
            tagToComponentMap.set("This", this);
            tagToComponentMap.set(this.tagName, this);

            templateData = parseTemplate(this.templateElement, {
                staticSrc: settings.relativeBasePath,
                ssrEnabled: settings.context === "isomorphic",
                doClientSideRouting: settings.clientSideRouting,
                tagNameToComponentMap: tagToComponentMap
            }, this.globals);
        } catch (error) {
            // Append the component filename to the error message
            error.message += ` in component "${this.filename}"`;
            throw error;
        }

        this.templateData = templateData;

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
        }

        // Create methods that are needed for client side states updates
        // These methods are also needed for renderFromEndpoint components for when state changes
        for (const binding of templateData.bindings) {
            if (binding.aspect === BindingAspect.Iterator) {
                const expression = binding.expression as ForIteratorExpression;
                const renderChildren = clientRenderPrismNode(
                    binding.element!.children[0],
                    templateData.nodeData,
                    true,
                    [...this.globals, expression.variable.toReference()]
                );
                const elementIdentifer = templateData.nodeData.get(binding.element!)?.identifier!;
                const renderMethod = new FunctionDeclaration(
                    "render" + elementIdentifer,
                    [expression.variable],
                    [new ReturnStatement(renderChildren)]
                );
                componentClass.addMember(renderMethod);
                assignToObjectMap(templateData.nodeData, binding.element!, "clientRenderMethod", renderMethod);
            } else if (binding.aspect === BindingAspect.Conditional) {
                const { elseElement, identifier, conditionalExpression } = templateData.nodeData.get(binding.element!)!;
                // Final true is important here to make sure to now render a ternary expression
                const renderTruthyChild =
                    clientRenderPrismNode(binding.element!, templateData.nodeData, true, this.globals, true);
                const renderFalsyChild =
                    clientRenderPrismNode(elseElement!, templateData.nodeData, true, this.globals);

                const clientAliasedConditionExpression = cloneAST(conditionalExpression!);
                aliasVariables(clientAliasedConditionExpression, thisDataVariable, this.globals);

                const valueCheck = new Expression({
                    lhs: new VariableReference("value"),
                    operation: Operation.NullCoalescing,
                    rhs: clientAliasedConditionExpression
                });

                const renderMethod = new FunctionDeclaration(
                    "render" + identifier!,
                    [new VariableDeclaration("value", { value: nullValue })],
                    [
                        new IfStatement(valueCheck as ValueTypes, [
                            new ReturnStatement(renderTruthyChild)
                        ], new ElseStatement(null, [
                            new ReturnStatement(renderFalsyChild)
                        ]))
                    ]
                );
                componentClass.addMember(renderMethod);
                assignToObjectMap(templateData.nodeData, binding.element!, "clientRenderMethod", renderMethod);
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
                ? new VariableReference("super") : getElement(parentOfSlotElement, templateData.nodeData, this.templateElement);

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
            const getReferenceToSlotParent = getElement(contentSlot.parent as HTMLElement, templateData.nodeData, this.templateElement);
            const getFirstChild = new VariableReference("firstElementChild", getReferenceToSlotParent);
            const getFirstChildGetter = new FunctionDeclaration("firstElementChild", [], [
                new ReturnStatement(getFirstChild)
            ], { getSet: GetSet.Get });
            componentClass.addMember(getFirstChildGetter);
        }

        // Parse stylesheet
        if (this.stylesheet && !this.useShadowDOM) {
            // Prefix all rules in the style tag to be descendants of the tag name
            const thisTagSelector: ISelector = { tagName: this.tagName }
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

        // Throw error if page has slots
        if (this.isPage && this.hasSlots) {
            throw Error("Cannot have slot ");
        }

        if (this.useShadowDOM && this.hasSlots) {
            throw Error("Not implemented - <slot> in shadow dom enable component");
        }

        // If using shadow dom add runtime flag and imbed style element
        if (this.useShadowDOM) {
            if (this.stylesheet) {
                this.templateElement.children.push(
                    new HTMLElement("style", new Map, [
                        new TextNode(this.stylesheet.render(
                            makeRenderSettings({ minify: settings.minify })
                        ))
                    ])
                );
            }
        }

        if (this.title && !(this.title instanceof Value)) {
            const binding: PartialBinding = {
                aspect: BindingAspect.DocumentTitle,
                expression: this.title,
                // @ts-ignore no element for this binding
                element: null,
            }
            addBinding(binding, [], this.globals, this.bindings)
        }

        // Process the components data type
        let componentDataType: IType | null = null;
        if (componentClass.base!.typeArguments?.[0]) {
            try {
                componentDataType = typeSignatureToIType(componentClass.base!.typeArguments![0], this.clientModule);
                // TODO kinda temp
                this.needsData = typeof this.defaultData === "undefined";
            } catch (error) {
                error.message += ` in component "${this.filename}"`;
                throw error;
            }
        } else {
            this.needsData = false;
        }

        this.componentDataType = componentDataType;

        /**
         * Recursively detects if some part of the the type has an Array
         * @param type 
         */
        function hasArrayProperty(type: IType): boolean {
            return type.name === "Array" ||
                (
                    typeof type.properties !== "undefined" &&
                    Array.from(type.properties)
                        .some(([, property]) => hasArrayProperty(property))
                )
        }

        if (!runtimeFeatures.observableArrays && componentDataType && hasArrayProperty(componentDataType)) {
            runtimeFeatures.observableArrays = true;
        }

        const usesDate = componentDataType && hasDateProperty(componentDataType);

        if (!runtimeFeatures.observableDates && usesDate) {
            runtimeFeatures.observableDates = true;
        }

        if (!runtimeFeatures.observableArrays && componentDataType && hasArrayProperty(componentDataType)) {
            runtimeFeatures.observableArrays = true;
        }

        // This also covers <OtherComponent $data=""> due to resolved IType 
        if (!runtimeFeatures.subObjects && componentDataType && Array.from(componentDataType.properties!).some(([, property]) => !inbuiltTypes.has(property.name!))) {
            runtimeFeatures.subObjects = true;
        }

        let clientRenderMethod: FunctionDeclaration;
        if (this.renderFromEndpoint) {
            const url: Array<string | ValueTypes> = [];
            for (const part of this.renderFromEndpoint) {
                url.push("/")
                if (typeof part === "string") {
                    url.push(part)
                } else {
                    const name = new VariableReference(part.name);
                    const binding: PartialBinding = {
                        aspect: BindingAspect.ServerParameter,
                        expression: name,
                    };
                    addBinding(binding, [], this.globals, this.bindings)
                    url.push(VariableReference.fromChain("this", "data", name));
                }
            }
            // Fetch endpoint and set innerHTML response text
            clientRenderMethod = new FunctionDeclaration(
                "render",
                [],
                [
                    new Expression({
                        lhs: new VariableReference("then", new Expression({
                            lhs: new VariableReference("fetch"),
                            operation: Operation.Call,
                            rhs: new TemplateLiteral(url)
                        })),
                        operation: Operation.Call,
                        rhs: new FunctionDeclaration(
                            null,
                            ["resp"],
                            [
                                new Expression({
                                    lhs: VariableReference.fromChain("this", "innerHTML"),
                                    operation: Operation.Assign,
                                    rhs: new Expression({
                                        lhs: new Expression({
                                            lhs: VariableReference.fromChain("resp", "text"),
                                            operation: Operation.Call
                                        }),
                                        operation: Operation.Await
                                    })
                                }),
                                // add events when innerHTML set this.handleEvents?.(true)
                                new Expression({
                                    lhs: VariableReference.fromChain("this", "handleEvents"),
                                    operation: Operation.OptionalCall,
                                    rhs: new Value(Type.boolean, true)
                                })
                            ],
                            { isAsync: true, bound: false }
                        )
                    })
                ]
            );
        } else {
            // Build the render method
            clientRenderMethod = buildClientRenderMethod(
                this.templateElement,
                templateData.nodeData,
                true,
                this.useShadowDOM,
                this.globals
            );
        }
        componentClass.addMember(clientRenderMethod);

        // Build event bindings for ssr components
        if (settings.context === "isomorphic" && templateData.events.length > 0) {
            componentClass.addMember(
                buildEventBindings(templateData.events, settings.disableEventElements)
            );
        }

        // Define component to customElement register call
        this.customElementDefineStatement = new Expression({
            lhs: VariableReference.fromChain("customElements", "define"),
            operation: Operation.Call,
            rhs: new ArgumentList([new Value(Type.string, this.tagName), new VariableReference(this.className)])
        });

        this.clientModule.statements.push(this.customElementDefineStatement);
        
        // For bundlers to include css files
        if (this.stylesheet && !settings.bundleOutput && !this.useShadowDOM) {
            this.clientModule.statements.unshift(
                new ImportStatement(null, getImportPath(this.filename, this.stylesheet.filename))
            );
        }

        // Construct bindings
        if (templateData.bindings.length > 0 && !this.passive) {
            try {
                // TODO try and drop data type if `settings.context === "client"`. Observable requires some hints and the hints are generated using the data type
                if (!componentDataType) {
                    // TODO dependency element debug not great
                    throw Error(`Data type required for a dependency around element ${templateData.bindings[0].element!.render(defaultRenderSettings, { inline: true })}`);
                }

                const bindingTree = constructBindings(
                    this,
                    templateData.bindings,
                    templateData.nodeData,
                    componentDataType,
                    this.globals,
                    settings
                );

                const treeVariable = new VariableDeclaration("_bindings", { isStatic: true, value: bindingTree });
                componentClass.addMember(treeVariable);
            } catch (error) {
                error.message += ` in component "${this.filename}"`;
                throw error;
            }
        }

        // Used by router to detect layout at runtime from SSR content
        if (settings.context === "isomorphic" && this.isLayout) {
            componentClass.addMember(new VariableDeclaration("layout", { value: new Value(Type.boolean, true) }));
        }

        // Build the server render module
        if (settings.context === "isomorphic") {
            // TODO events.forEach(x => x.addAttribute("disable")) ...
            this.dataTypeSignature = this.componentClass.base!.typeArguments?.[0] ?? new TypeSignature({ name: "any" });

            // Construct ssr function parameters
            const parameters: Array<VariableDeclaration> = [];
            if (this.needsData && !this.noSSRData) {
                const dataParameter = new VariableDeclaration(
                    this.isLayout ? "layoutData" : "data",
                    { typeSignature: this.dataTypeSignature }
                );
                if (this.defaultData) {
                    dataParameter.value = this.defaultData;
                }
                parameters.push(dataParameter);
            }

            // Push client globals
            parameters.push(
                ...this.clientGlobals.map(clientGlobal =>
                    new VariableDeclaration(((clientGlobal[0] as VariableReference).name), { typeSignature: clientGlobal[1] }))
            );

            // // Append "data-ssr" to the server rendered component. Used at runtime.
            let componentAttributes: Map<string, string | null>;
            let componentHTMLTagChildren: Array<Node>;

            if (this.useShadowDOM) {
                // See https://web.dev/declarative-shadow-dom/
                if (settings.declarativeShadowDOM) {
                    componentHTMLTagChildren = [
                        new HTMLElement(
                            "template",
                            new Map([["shadowroot", "open"]]),
                            [new HTMLElement("slot")]
                        ),
                        ...this.templateElement.children
                    ];
                    componentAttributes = new Map([["data-ssr", null]]);
                } else {
                    componentAttributes = new Map;
                    componentHTMLTagChildren = [];
                }
            } else {
                componentAttributes = new Map([["data-ssr", null]]);
                componentHTMLTagChildren = this.templateElement.children;
            }

            // Generate a tag of self (instead of using template) (reuses template.element.children)
            this.componentHTMLTag = new HTMLElement(
                this.tagName,
                componentAttributes,
                componentHTMLTagChildren,
                this.templateElement.parent
            );

            if (!(this.isPage || this.isLayout)) {
                assignToObjectMap(
                    this.templateData.nodeData, this.componentHTMLTag,
                    "rawAttribute", new VariableReference("attributes")
                );
                parameters.push(new VariableDeclaration("attributes", {
                    typeSignature: new TypeSignature({ name: "string" }),
                    value: new Value(Type.string)
                }));
            }

            let metadataString: ServerRenderedChunks = [];
            if (this.isPage) {
                const ssrSettings: IServerRenderSettings = {
                    minify: settings.minify,
                    addDisableToElementWithEvents: settings.disableEventElements
                }
                // Build the metadata
                if (this.title) {
                    const title = new HTMLElement("title");
                    const titleTextNode = new TextNode("", title);
                    assignToObjectMap(this.templateData.nodeData, titleTextNode, "textNodeValue", this.title);
                    title.children.push(titleTextNode);
                    metadataString = metadataString.concat(serverRenderPrismNode(title, this.templateData.nodeData, ssrSettings));
                }

                if (this.metadata) {
                    const { metadataTags, nodeData: metaDataNodeData } = buildMetaTags(this.metadata)
                    for (const metaTag of metadataTags) {
                        metadataString = metadataString.concat(serverRenderPrismNode(metaTag, metaDataNodeData, ssrSettings, this.globals))
                        if (!settings.minify) {
                            metadataString.push("\n");
                        }
                    }
                }
            }

            this.metaDataChunks = metadataString;

            if (this.hasSlots) {
                for (const slot of this.templateData.slots.keys()) {
                    parameters.push(new VariableDeclaration(`${slot}Slot`, { typeSignature: new TypeSignature({ name: "string" }) }));
                }
            }

            this.serverRenderParameters = parameters;
        }
    }

    // TODO return object rather than defining properties on this
    processDecorators(settings: IFinalPrismSettings) {
        for (const decorator of this.componentClass.decorators || []) {
            switch (decorator.name) {
                case "TagName":
                    const correctTagNameFormat =
                        decorator.args.length === 1 &&
                        (decorator.args[0] as Value).type === Type.string;

                    if (!correctTagNameFormat) {
                        throw Error("Tag name must have one argument of type string");
                    }

                    this.tagName = (decorator.args[0] as Value).value!;
                    if (Component.registeredTags.has(this.tagName)) {
                        throw Error(`"${this.tagName}" already registered under another component`);
                    }
                    break;
                case "Page":
                    const correctPageDecoratorFormat = decorator.args
                        .every(arg => arg instanceof Value && arg.type === Type.string);

                    if (!correctPageDecoratorFormat) {
                        throw Error("Page decorator arguments must be of type string");
                    }

                    this.isPage = true;

                    for (const arg of decorator.args) {
                        if ((arg as Value).value === "*") {
                            setNotFoundRoute(this);
                        } else {
                            if (!this.routes) this.routes = new Set();
                            const routePattern = settings.relativeBasePath + (arg as Value).value!;
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
                    this.noSSRData = true;
                    break;
                case "UseLayout":
                    if (decorator.args.length !== 1 || !(decorator.args[0] instanceof VariableReference)) {
                        throw Error(`@UseLayout requires 1 parameter of type object literal`);
                    }
                    if (!this.componentClass.decorators!.some(decorator => decorator.name === "Page")) {
                        throw Error("Only pages can have layouts");
                    }
                    const layoutName = (decorator.args[0] as VariableReference).name;
                    const layout = this.importedComponents.get(layoutName);
                    if (!layout) {
                        throw Error(`Could not find layout ${layoutName} from imports"`);
                    } else if (!layout.isLayout) {
                        throw Error("UseLayout component must be a layout")
                    }
                    this.usesLayout = layout;
                    break;
                case "Default":
                    if (decorator.args.length !== 1 || !(decorator.args[0] instanceof ObjectLiteral)) {
                        throw Error(`@Default requires 1 argument of type object literal`)
                    }
                    this.defaultData = decorator.args[0] as ObjectLiteral;
                    break;
                case "Passive":
                    this.passive = true;
                    break;
                case "Globals":
                    if (!decorator.args.every(arg => arg instanceof VariableReference)) {
                        throw Error(`Arguments of @Globals must be variable references`);
                    }
                    this.globals = decorator.args as Array<VariableReference>;
                    break;
                case "ClientGlobals":
                    this.clientGlobals = [];
                    for (const arg of decorator.args) {
                        if (arg instanceof AsExpression) {
                            this.clientGlobals.push([arg.value as VariableReference, arg.asType]);
                        } else if (arg instanceof VariableReference) {
                            this.clientGlobals.push([arg, new TypeSignature("any")]);
                        } else {
                            throw Error(`Arguments of @ClientGlobal must be variable references or as expression`);
                        }
                    }
                    this.globals = this.globals.concat(this.clientGlobals.map(([value]) => value as VariableReference));
                    break;
                case "Title":
                    const title = decorator.args[0] as Value | TemplateLiteral;
                    if (!title) {
                        throw Error("Metadata decorators args incorrect");
                    }
                    if (
                        title instanceof TemplateLiteral ||
                        title instanceof VariableReference ||
                        (title instanceof Value && title.type === Type.string)
                    ) {
                        this.title = title;
                    } else {
                        throw Error("Title must be of type string, variable or template literal");
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
                            throw Error(`Metadata object literal keys must be constant`);
                        }
                        if (value instanceof Value && value.type === Type.string) {
                            this.metadata.set(key as string, value.value!);
                        } else {
                            this.metadata.set(key as string, value);
                        }
                    }
                    break;
                case "Shadow":
                    this.useShadowDOM = true;
                    break;
                case "RenderFromEndpoint":
                    const url = decorator.args[0] as Value;
                    if (url.type !== Type.string) {
                        throw Error(`RenderFromEndpoint required string argument in form "/x/:param"`);
                    }
                    this.renderFromEndpoint = stringToDynamicUrl(url.value!);
                    break;
                case "WithCapacity":
                    const capacity = decorator.args[0] as Value;
                    if (capacity.type !== Type.number) {
                        throw Error(`WithCapacity required number argument`);
                    }
                    this.withCapacity = parseInt(capacity.value!);
                    break;
                default:
                    throw Error(`Unknown decorator ${decorator.name}. Prism does not support external decorators`)
            }
        }

        // TODO Prism decorators have no other use other than for marking information. Removing 
        // to prevent TypeScript issues
        delete this.componentClass.decorators;
    }

    // TODO move over client side 
    generateCode(settings: IFinalPrismSettings) {
        if (this.codeGenerated) {
            return;
        }
        if (settings.context === "isomorphic") {
            const ssrSettings: IServerRenderSettings = {
                minify: settings.minify,
                addDisableToElementWithEvents: settings.disableEventElements
            }
            if (settings.backendLanguage === "rust") {
                rustModuleFromServerRenderedChunks(this, settings, ssrSettings);
                // TODO do this in `rustModuleFromServerRenderedChunks`
                const usesDate = this.componentDataType && hasDateProperty(this.componentDataType);
                if (usesDate) {
                    this.serverModule?.statements.unshift(
                        new DynamicStatement("use chrono::{DateTime, TimeZone, Utc};")
                    );
                }
            } else {
                tsModuleFromServerRenderedChunks(this, settings, ssrSettings);
            }
        }
        this.codeGenerated = true;

        // Set client module to now point to output path.
        this.clientModule.filename = join(
            settings.absoluteOutputPath,
            this.relativeFilename
        );

        // Add prism prelude. Remove "Router" if no clientSideRouting
        const prismPreludeImports = settings.clientSideRouting ?
            preludeImports :
            preludeImports.filter((varName) => varName.name !== "Router");

        const pathToPrismJS = getImportPath(
            this.clientModule.filename,
            join(settings.absoluteOutputPath, "prism")
        );
        const prismPreludeImport = new ImportStatement(prismPreludeImports, pathToPrismJS);

        // TODO bad method but prevents this being in the server module
        (prismPreludeImport as any).prismPrelude = true;
        this.clientModule.statements.unshift(prismPreludeImport);
    }
}