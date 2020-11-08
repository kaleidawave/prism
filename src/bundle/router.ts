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
    // loaded component
    static lc: string | null = null;
    // loaded layout
    static ll: string | null = null;

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
                Router.ll = (fc as Component<any>).tagName.toLowerCase();
                Router.lc = ((fc as Component<any>).firstElementChild as Component<any>).tagName.toLowerCase();
            } else {
                Router.lc = (fc as Component<any>).tagName.toLowerCase();
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
     * @param ps push state
     */
    static async goTo(url: string, ps = true) {
        let r = this.t;
        if (ps) history.pushState({}, "", url)
        // pattern component layout
        for (const [p, comp, lay] of this.r) {
            // match
            const m = url.match(p);
            if (m) {
                if (this.lc === comp) {
                    if (lay) {
                        await (r.firstElementChild.firstElementChild as Component<any>).load?.(m.groups);
                    } else {
                        await (r.firstElementChild as Component<any>).load?.(m.groups);
                    }
                } else {
                    // Container
                    let c = r;
                    if (lay) {   
                        if (Router.ll === lay) {
                            c = r.firstElementChild as Component<any>;
                        } else {
                            const newLayout = h(lay);
                            r.firstElementChild ? r.firstElementChild.replaceWith(newLayout) : r.append(newLayout);
                            c = newLayout as HTMLElement;
                        }
                    }
                    Router.lc = comp;
                    // New Component
                    const nC = h(comp) as Component<any>;
                    await nC.load?.(m.groups);
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