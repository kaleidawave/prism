import { IEvent, BindingAspect, parseNode, Locals, PartialBinding, ITemplateData, ITemplateConfig } from "./template";
import { addIdentifierToElement, addEvent, addBinding } from "./helpers";
import { VariableReference } from "../chef/javascript/components/value/variable";
import { ValueTypes } from "../chef/javascript/components/value/value";
import { Expression } from "../chef/javascript/components/value/expression";
import { parseForNode } from "./constructs/for";
import { parseIfNode } from "./constructs/if";
import { parseStylingDeclarationsFromString } from "../chef/css/value";
import { TemplateLiteral } from "../chef/javascript/components/value/template-literal";
import { FunctionDeclaration } from "../chef/javascript/components/constructs/function";
import { HTMLComment, HTMLDocument, HTMLElement } from "../chef/html/html";
import { defaultRenderSettings } from "../chef/helpers";
import { assignToObjectMap } from "../helpers";
import { posix } from "path";

export function parseHTMLElement(
    element: HTMLElement,
    templateData: ITemplateData,
    templateConfig: ITemplateConfig,
    locals: Array<VariableReference>, // TODO eventually remove
    localData: Locals = [],
    nullable = false,
    multiple = false,
) {
    assignToObjectMap(templateData.nodeData, element, "nullable", nullable);
    assignToObjectMap(templateData.nodeData, element, "multiple", multiple);

    // If imported element:
    if (templateConfig.tagNameToComponentMap.has(element.tagName)) {
        const component = templateConfig.tagNameToComponentMap.get(element.tagName)!;

        if (!component) {
            throw Error(`Cannot find imported component of name ${element.tagName}`)
        }

        // Assert that if component needs data then the "$data" attribute is present
        if (component.needsData && !element.attributes?.has("$data")) {
            // TODO filename and render the node
            throw Error(`Component: "${component.className}" requires data and was not passed data through "$data" at  and "${element.render(defaultRenderSettings, { inline: true })}"`);
        }

        if (component.hasSlots && element.children.length === 0) {
            throw Error(`Component: "${component.className}" requires content and "${element.render(defaultRenderSettings, { inline: true })}" has no children`);
        }

        if (component.isPage) {
            throw Error(`Component: "${component.className}" is a page and cannot be used within markup`);
        }

        // Modify the tag to match mentioned component tag (used by client side render)
        element.tagName = component.tagName;
        // Used for binding ssr function call to component render function
        assignToObjectMap(templateData.nodeData, element, "component", component);
    }

    if (element.tagName === "svg") {
        templateData.hasSVG = true;
    }

    // If element is slot 
    if (element.tagName === "slot") {
        if (element.children.length > 0) {
            throw Error("Slots elements cannot have children");
        }

        // Slot can only be single children
        if (element.parent!.children.filter(child => !(child instanceof HTMLComment)).length > 1) {
            throw Error("Slot element must be single child of element");
        }

        if (multiple) {
            throw Error("Slot cannot be used under a #for element");
        }

        if (!(element.parent instanceof HTMLDocument)) {
            addIdentifierToElement(element.parent!, templateData.nodeData);
        }

        // Future potential multiple slots but for now has not been implemented throughout
        const slotFor = element.attributes?.get("for") ?? "content";
        if (templateData.slots.has(slotFor)) {
            throw Error(`Duplicate slot for "${slotFor}"`);
        }
        templateData.slots.set(slotFor, element);
        assignToObjectMap(templateData.nodeData, element, "slotFor", slotFor);
        return;
    }

    let childrenParsed = false;

    // If element has attributes
    if (element.attributes) {
        // If relative anchor tag
        if (
            element.tagName === "a" &&
            element.attributes.has("relative")
        ) {
            element.attributes.delete("relative");

            if (templateConfig.doClientSideRouting) {
                const identifier = addIdentifierToElement(element, templateData.nodeData);

                const event: IEvent = {
                    nodeIdentifier: identifier,
                    element: element,
                    // Router.bind is a method will which call Router.goTo using the href of the element
                    callback: VariableReference.fromChain("Router", "bind") as VariableReference,
                    event: "click",
                    required: false, // A 
                    existsOnComponentClass: false
                }

                addEvent(templateData.events, element, event, templateData.nodeData);
            }

            // Rewrite href to be in terms staticSrc
            const href = element.attributes.get("href");
            // TODO prefix hrefs for dynamic routes
            if (href) {
                element.attributes.set("href", posix.join(templateConfig.staticSrc, href));
            }
        }

        // TODO sort the attributes so #if comes later
        for (const [name, value] of element.attributes) {
            const subject = name.slice(1);

            // If element is multiple then can be retrieved using root parent
            if (
                !multiple &&
                "#$@".split("").some(prefix => name.startsWith(prefix)) &&
                typeof templateData.nodeData.get(element)?.identifier === "undefined"
            ) {
                addIdentifierToElement(element, templateData.nodeData);
            }

            // Dynamic attributes
            if (name === "$style") {
                const parts: Array<string | ValueTypes> = [];
                for (const [key, [cssValue]] of parseStylingDeclarationsFromString(value!)) {
                    if (!cssValue || typeof cssValue === "string" || !("value" in cssValue)) {
                        throw Error(`Invalid CSS value around "${element.render(defaultRenderSettings, { inline: true })}"`);
                    }
                    const expression = Expression.fromString(cssValue.value);

                    parts.push(key + ":", expression, ";");

                    const binding: PartialBinding = {
                        aspect: BindingAspect.Style,
                        expression,
                        element: element,
                        styleKey: key
                    }

                    addBinding(binding, localData, locals, templateData.bindings);
                }

                // With CSR: elem.style = "color: red" does work okay!;
                const styleTemplateLiteral = new TemplateLiteral(parts);
                const dynamicAttributes = templateData.nodeData.get(element)?.dynamicAttributes;
                if (dynamicAttributes) {
                    dynamicAttributes.set("style", styleTemplateLiteral);
                } else {
                    assignToObjectMap(
                        templateData.nodeData,
                        element,
                        "dynamicAttributes",
                        new Map([["style", styleTemplateLiteral]])
                    );
                }

                element.attributes.delete(name);
            } else if (name[0] === "$") {
                let expression: ValueTypes;
                if (!value) {
                    // Allows shorthand #src <=> #src="src"
                    expression = new VariableReference(subject);
                } else {
                    expression = Expression.fromString(value);
                }

                let binding: PartialBinding;
                if (templateData.nodeData.get(element)?.component && subject === "data") {
                    binding = {
                        aspect: BindingAspect.Data,
                        expression,
                        element,
                    }
                } else {
                    binding = {
                        aspect: BindingAspect.Attribute,
                        attribute: subject,
                        expression,
                        element,
                    }
                }

                addBinding(binding, localData, locals, templateData.bindings);

                const dynamicAttributes = templateData.nodeData.get(element)?.dynamicAttributes;
                if (dynamicAttributes) {
                    dynamicAttributes.set(subject, expression);
                } else {
                    assignToObjectMap(
                        templateData.nodeData,
                        element,
                        "dynamicAttributes",
                        new Map([[subject, expression]])
                    );
                }

                element.attributes.delete(name);

            } else if (name[0] === "@") {
                // Event binding 
                // TODO inline function & add to component.methods
                if (!value) {
                    throw Error(`Expected handler for event "${name}"`);
                }

                const methodReference = Expression.fromString(value) as VariableReference;

                if (methodReference instanceof FunctionDeclaration) {
                    throw Error("Not implemented - anonymous function in event listener");
                }

                if (!(methodReference instanceof VariableReference)) {
                    throw Error("Expected variable reference in event callback");
                }

                const internal = !locals.some(local => local.isEqual(methodReference, true));

                const identifier = addIdentifierToElement(element, templateData.nodeData);

                const event: IEvent = {
                    nodeIdentifier: identifier,
                    element: element,
                    callback: methodReference,
                    event: subject,
                    required: true,
                    existsOnComponentClass: internal
                }

                addEvent(templateData.events, element, event, templateData.nodeData);

                element.attributes.delete(name);

            } else if (name[0] === "#") {
                switch (subject) {
                    case "for":
                        childrenParsed = true;
                        parseForNode(element, templateData, templateConfig, locals, localData, nullable, multiple);
                        break;
                    case "if":
                        childrenParsed = true;
                        parseIfNode(element, templateData, templateConfig, locals, localData, multiple);
                        break;
                    case "html":
                        if (element.children.length > 0) throw Error(`Element with #html cannot have any children`);
                        if (!value) throw Error(`Expected value for #html construct`);
                        const htmlValue = Expression.fromString(value);
                        assignToObjectMap(templateData.nodeData, element, "rawInnerHTML", htmlValue);
                        addBinding(
                            { aspect: BindingAspect.InnerHTML, element, expression: htmlValue },
                            localData,
                            locals,
                            templateData.bindings
                        );
                        element.attributes.delete(name);
                        break;
                    default:
                        throw Error(`Unknown / unsupported construct "#${subject}"`);
                }

            }
        }
    }

    if (childrenParsed) {
        return;
    }

    for (const child of element.children) {
        parseNode(child, templateData, templateConfig, locals, localData, nullable, multiple);
    }
}