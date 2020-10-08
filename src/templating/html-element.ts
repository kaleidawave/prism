import { PrismHTMLElement, IDependency, IEvent, ValueAspect, PrismNode, parsePrismNode, Locals, PartialDependency } from "./template";
import { addIdentifierToElement, addEvent, addDependency } from "./helpers";
import { VariableReference } from "../chef/javascript/components/value/variable";
import { IValue } from "../chef/javascript/components/value/value";
import { Expression } from "../chef/javascript/components/value/expression";
import { parseForNode } from "./constructs/for";
import { parseIfNode } from "./constructs/if";
import { parseStylingDeclarationsFromString } from "../chef/css/value";
import { TemplateLiteral } from "../chef/javascript/components/value/template-literal";
import { FunctionDeclaration } from "../chef/javascript/components/constructs/function";
import type { Component } from "../component";
import { HTMLComment } from "../chef/html/html";
import { settings } from "../settings";
import { defaultRenderSettings } from "../chef/helpers";

export function parseHTMLElement(
    element: PrismHTMLElement,
    slots: Map<string, PrismHTMLElement>,
    dependencies: Array<IDependency>,
    events: Array<IEvent>,
    importedComponents: Map<string, Component> | null,
    ssr: boolean,
    locals: Array<VariableReference>, // TODO eventually remove
    localData: Locals = [],
    nullable = false,
    multiple = false,
) {
    element.nullable = nullable; element.multiple = multiple;

    // If imported element:
    if (importedComponents?.has(element.tagName)) {
        const component = importedComponents.get(element.tagName)!;

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
        element.tagName = component.tag;
        // Used for binding ssr function call to component render function
        element.component = component;
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

        if (element.multiple) {
            throw Error("Slot cannot be used under a #for element");
        }

        addIdentifierToElement(element.parent! as PrismHTMLElement);

        // Future potential multiple slots but for now has not been implemented throughout
        const slotFor = element.attributes?.get("for") || "content";
        if (slots.has(slotFor)) {
            throw Error(`Duplicate slot for "${slotFor}"`);
        }
        slots.set(slotFor, element);
        element.slotFor = slotFor;
        return;
    }

    // If element has attributes
    if (element.attributes) {

        // If relative anchor tag
        if (
            element.tagName === "a" &&
            element.attributes.has("relative")
        ) {
            element.attributes.delete("relative");

            if (settings.clientSideRouting) {
                const identifier = addIdentifierToElement(element);

                const event: IEvent = {
                    nodeIdentifier: identifier,
                    element: element,
                    // Router.bind is a method will which call Router.goTo using the href of the element
                    callback: VariableReference.fromChain("Router", "bind") as VariableReference, 
                    event: "click",
                    required: false,
                    existsOnComponentClass: false
                }

                if (element.events) {
                    element.events.push(event);
                } else {
                    element.events = [event];
                }

                events.push(event);
            }
        }

        // TODO sort the attributes so #if comes later
        for (const [name, value] of element.attributes) {
            const subject = name.slice(1);

            // Dynamic attributes
            if (name === "$style") {
                if (!multiple) {
                    addIdentifierToElement(element);
                }
                const parts: Array<string | IValue> = [];
                for (const [key, [cssValue]] of parseStylingDeclarationsFromString(value!)) {
                    if (!cssValue || typeof cssValue === "string" || !("value" in cssValue)) {
                        throw Error(`Invalid CSS value around "${element.render(defaultRenderSettings, { inline: true })}"`);
                    }
                    const expression = Expression.fromString(cssValue.value);

                    parts.push(key + ":", expression, ";");

                    const dependency: PartialDependency = {
                        aspect: ValueAspect.Style,
                        expression,
                        element: element,
                        styleKey: key
                    }

                    addDependency(dependency, localData, locals, dependencies);
                }

                // With CSR: elem.style = "color: red" does work okay!;
                const styleTemplateLiteral = new TemplateLiteral(parts);
                if (element.dynamicAttributes) {
                    element.dynamicAttributes.set("style", styleTemplateLiteral);
                } else {
                    element.dynamicAttributes = new Map([["style", styleTemplateLiteral]]);
                }

                element.attributes.delete(name);
            } else if (name[0] === "$") {
                let expression: IValue;
                if (!value) {
                    // Allow shorthand #src <=> #src="src"
                    expression = new VariableReference(subject);
                } else {
                    expression = Expression.fromString(value);
                }

                if (!multiple) {
                    addIdentifierToElement(element);
                }

                let dependency: PartialDependency;
                if (element.component && subject === "data") {
                    dependency = {
                        aspect: ValueAspect.Data,
                        expression,
                        element,
                    }
                } else {
                    dependency = {
                        aspect: ValueAspect.Attribute,
                        attribute: subject,
                        expression,
                        element,
                    }
                }

                addDependency(dependency, localData, locals, dependencies);

                if (element.dynamicAttributes) {
                    element.dynamicAttributes.set(subject, expression);
                } else {
                    element.dynamicAttributes = new Map([[subject, expression]]);
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

                const identifier = addIdentifierToElement(element);

                const event: IEvent = {
                    nodeIdentifier: identifier,
                    element: element,
                    callback: methodReference,
                    event: subject,
                    required: true,
                    existsOnComponentClass: internal
                }

                addEvent(events, element, event);

                element.attributes.delete(name);

            } else if (name[0] === "#") {
                switch (subject) {
                    case "for":
                        parseForNode(element, slots, dependencies, events, importedComponents, ssr, locals, localData, nullable, multiple);
                        break;
                    case "if":
                        parseIfNode(element, slots, dependencies, events, importedComponents, ssr, locals, localData, nullable, multiple);
                        break;
                    default:
                        throw Error(`Unknown / unsupported construct "#${subject}"`);
                }

            }
        }
    }

    // If element has clientRenderFunction its children have already been parsed
    if (!element.clientExpression) {
        for (const child of element.children as Array<PrismNode>) {
            parsePrismNode(child, slots, dependencies, events, importedComponents, ssr, locals, localData, nullable, multiple);
        }
    }
}