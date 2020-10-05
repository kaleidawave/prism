import type { Component } from "./component";
import { h } from "./render";

/**
 * Router used under Prism. Singleton
 */
export class Router extends HTMLElement {
    static router: HTMLElement;
    // Routes are injected by prism compiler
    static routes: Array<[RegExp, string, string]>;

    static loadedComponent: string | null = null;
    static loadedLayout: string | null = null;

    connectedCallback() {
        Router.router = this;
    }

    /* 
        Called when whole application is loaded in, if goTo creates a element that has not been registered then it cannot find its goto method 
    */
    static init() {
        window.onpopstate = () => {
            Router.goTo(document.location.pathname);
        }
        const fc = Router.router.firstElementChild;
        if (!fc) {
            Router.goTo(window.location.pathname, false)
        } else {
            if ((fc as Component<any>)?.layout) {
                Router.loadedLayout = (fc as Component<any>).tagName.toLowerCase();
                Router.loadedComponent = ((fc as Component<any>).firstElementChild as Component<any>).tagName.toLowerCase();
            } else {
                Router.loadedComponent = (fc as Component<any>).tagName.toLowerCase();
            }
        }
    }

    /**
     * Used to bind anchor tags to ignore default behavior and do client side routing
     */
    static bind(event: MouseEvent) {
        Router.goTo((event.currentTarget as HTMLElement).getAttribute("href"));
        event.preventDefault();
    }

    /**
     * Only reason its async is for awaiting page load
     * TODO explain
     * @param url 
     * @param pushState 
     */
    static async goTo(url: string, pushState = true) {
        let router = this.router;
        if (pushState) history.pushState({}, "", url)
        for (const [pattern, component, layout] of this.routes) {
            const match = url.match(pattern);
            if (match) {
                if (this.loadedComponent === component) {
                    if (layout) {
                        await (router.firstElementChild.firstElementChild as Component<any>).load?.(match.groups);
                    } else {
                        await (router.firstElementChild as Component<any>).load?.(match.groups);
                    }
                } else {
                    let container = router;
                    if (layout) {   
                        if (Router.loadedLayout === layout) {
                            container = router.firstElementChild as Component<any>;
                        } else {
                            const newLayout = h(layout);
                            router.firstElementChild ? router.firstElementChild.replaceWith(newLayout) : router.append(newLayout);
                            container = newLayout;
                        }
                    }
                    Router.loadedComponent = component;
                    const newComponent = h(component) as Component<any>;
                    await newComponent.load?.(match.groups);
                    // Rendering the component is deferred until till adding to dom which is next line
                    container.firstElementChild ? container.firstElementChild.replaceWith(newComponent) : container.append(newComponent);
                }
                return;
            }
        }
        throw Error(`No match found for ${url}`);
    }
}

window.customElements.define("router-component", Router);