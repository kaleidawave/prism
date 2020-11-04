import type { Component } from "./component";
import { h } from "./render";

/**
 * Router used under Prism. Singleton
 */
export class Router extends HTMLElement {
    // this router
    static t: HTMLElement;
    // Routes are injected by prism compiler
    static r: Array<[RegExp, string, string]>;

    // TODO not needed under context=client
    static loadedComponent: string | null = null;
    static loadedLayout: string | null = null;

    connectedCallback() {
        Router.t = this;
    }

    /* 
        Called when whole application is loaded in, if goTo creates a element that has not been registered then it cannot find its goto method 
    */
    static init() {
        window.onpopstate = () => {
            Router.goTo(document.location.pathname);
        }
        const fc = Router.t.firstElementChild;
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
        let r = this.t;
        if (pushState) history.pushState({}, "", url)
        for (const [pattern, component, layout] of this.r) {
            const match = url.match(pattern);
            if (match) {
                if (this.loadedComponent === component) {
                    if (layout) {
                        await (r.firstElementChild.firstElementChild as Component<any>).load?.(match.groups);
                    } else {
                        await (r.firstElementChild as Component<any>).load?.(match.groups);
                    }
                } else {
                    // Container
                    let c = r;
                    if (layout) {   
                        if (Router.loadedLayout === layout) {
                            c = r.firstElementChild as Component<any>;
                        } else {
                            const newLayout = h(layout);
                            r.firstElementChild ? r.firstElementChild.replaceWith(newLayout) : r.append(newLayout);
                            c = newLayout as HTMLElement;
                        }
                    }
                    Router.loadedComponent = component;
                    // New Component
                    const nC = h(component) as Component<any>;
                    await nC.load?.(match.groups);
                    // Rendering the component is deferred until till adding to dom which is next line
                    c.firstElementChild ? c.firstElementChild.replaceWith(nC) : c.append(nC);
                }
                return;
            }
        }
        throw Error(`No match found for ${url}`);
    }
}

window.customElements.define("router-component", Router);