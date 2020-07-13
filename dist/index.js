(function (global, factory) {
    typeof exports === 'object' && typeof module !== 'undefined' ? module.exports = factory() :
    typeof define === 'function' && define.amd ? define(factory) :
    (global = global || self, global.RangeSliderPips = factory());
}(this, (function () { 'use strict';

    function noop() { }
    function run(fn) {
        return fn();
    }
    function blank_object() {
        return Object.create(null);
    }
    function run_all(fns) {
        fns.forEach(run);
    }
    function is_function(thing) {
        return typeof thing === 'function';
    }
    function safe_not_equal(a, b) {
        return a != a ? b == b : a !== b || ((a && typeof a === 'object') || typeof a === 'function');
    }
    function subscribe(store, ...callbacks) {
        if (store == null) {
            return noop;
        }
        const unsub = store.subscribe(...callbacks);
        return unsub.unsubscribe ? () => unsub.unsubscribe() : unsub;
    }
    function component_subscribe(component, store, callback) {
        component.$$.on_destroy.push(subscribe(store, callback));
    }

    const is_client = typeof window !== 'undefined';
    let now = is_client
        ? () => window.performance.now()
        : () => Date.now();
    let raf = is_client ? cb => requestAnimationFrame(cb) : noop;

    const tasks = new Set();
    function run_tasks(now) {
        tasks.forEach(task => {
            if (!task.c(now)) {
                tasks.delete(task);
                task.f();
            }
        });
        if (tasks.size !== 0)
            raf(run_tasks);
    }
    /**
     * Creates a new task that runs on each raf frame
     * until it returns a falsy value or is aborted
     */
    function loop(callback) {
        let task;
        if (tasks.size === 0)
            raf(run_tasks);
        return {
            promise: new Promise(fulfill => {
                tasks.add(task = { c: callback, f: fulfill });
            }),
            abort() {
                tasks.delete(task);
            }
        };
    }

    function append(target, node) {
        target.appendChild(node);
    }
    function insert(target, node, anchor) {
        target.insertBefore(node, anchor || null);
    }
    function detach(node) {
        node.parentNode.removeChild(node);
    }
    function destroy_each(iterations, detaching) {
        for (let i = 0; i < iterations.length; i += 1) {
            if (iterations[i])
                iterations[i].d(detaching);
        }
    }
    function element(name) {
        return document.createElement(name);
    }
    function text(data) {
        return document.createTextNode(data);
    }
    function space() {
        return text(' ');
    }
    function empty() {
        return text('');
    }
    function listen(node, event, handler, options) {
        node.addEventListener(event, handler, options);
        return () => node.removeEventListener(event, handler, options);
    }
    function prevent_default(fn) {
        return function (event) {
            event.preventDefault();
            // @ts-ignore
            return fn.call(this, event);
        };
    }
    function attr(node, attribute, value) {
        if (value == null)
            node.removeAttribute(attribute);
        else if (node.getAttribute(attribute) !== value)
            node.setAttribute(attribute, value);
    }
    function children(element) {
        return Array.from(element.childNodes);
    }
    function set_data(text, data) {
        data = '' + data;
        if (text.wholeText !== data)
            text.data = data;
    }
    function toggle_class(element, name, toggle) {
        element.classList[toggle ? 'add' : 'remove'](name);
    }

    let current_component;
    function set_current_component(component) {
        current_component = component;
    }

    const dirty_components = [];
    const binding_callbacks = [];
    const render_callbacks = [];
    const flush_callbacks = [];
    const resolved_promise = Promise.resolve();
    let update_scheduled = false;
    function schedule_update() {
        if (!update_scheduled) {
            update_scheduled = true;
            resolved_promise.then(flush);
        }
    }
    function add_render_callback(fn) {
        render_callbacks.push(fn);
    }
    let flushing = false;
    const seen_callbacks = new Set();
    function flush() {
        if (flushing)
            return;
        flushing = true;
        do {
            // first, call beforeUpdate functions
            // and update components
            for (let i = 0; i < dirty_components.length; i += 1) {
                const component = dirty_components[i];
                set_current_component(component);
                update(component.$$);
            }
            dirty_components.length = 0;
            while (binding_callbacks.length)
                binding_callbacks.pop()();
            // then, once components are updated, call
            // afterUpdate functions. This may cause
            // subsequent updates...
            for (let i = 0; i < render_callbacks.length; i += 1) {
                const callback = render_callbacks[i];
                if (!seen_callbacks.has(callback)) {
                    // ...so guard against infinite loops
                    seen_callbacks.add(callback);
                    callback();
                }
            }
            render_callbacks.length = 0;
        } while (dirty_components.length);
        while (flush_callbacks.length) {
            flush_callbacks.pop()();
        }
        update_scheduled = false;
        flushing = false;
        seen_callbacks.clear();
    }
    function update($$) {
        if ($$.fragment !== null) {
            $$.update();
            run_all($$.before_update);
            const dirty = $$.dirty;
            $$.dirty = [-1];
            $$.fragment && $$.fragment.p($$.ctx, dirty);
            $$.after_update.forEach(add_render_callback);
        }
    }
    const outroing = new Set();
    let outros;
    function group_outros() {
        outros = {
            r: 0,
            c: [],
            p: outros // parent group
        };
    }
    function check_outros() {
        if (!outros.r) {
            run_all(outros.c);
        }
        outros = outros.p;
    }
    function transition_in(block, local) {
        if (block && block.i) {
            outroing.delete(block);
            block.i(local);
        }
    }
    function transition_out(block, local, detach, callback) {
        if (block && block.o) {
            if (outroing.has(block))
                return;
            outroing.add(block);
            outros.c.push(() => {
                outroing.delete(block);
                if (callback) {
                    if (detach)
                        block.d(1);
                    callback();
                }
            });
            block.o(local);
        }
    }
    function create_component(block) {
        block && block.c();
    }
    function mount_component(component, target, anchor) {
        const { fragment, on_mount, on_destroy, after_update } = component.$$;
        fragment && fragment.m(target, anchor);
        // onMount happens before the initial afterUpdate
        add_render_callback(() => {
            const new_on_destroy = on_mount.map(run).filter(is_function);
            if (on_destroy) {
                on_destroy.push(...new_on_destroy);
            }
            else {
                // Edge case - component was destroyed immediately,
                // most likely as a result of a binding initialising
                run_all(new_on_destroy);
            }
            component.$$.on_mount = [];
        });
        after_update.forEach(add_render_callback);
    }
    function destroy_component(component, detaching) {
        const $$ = component.$$;
        if ($$.fragment !== null) {
            run_all($$.on_destroy);
            $$.fragment && $$.fragment.d(detaching);
            // TODO null out other refs, including component.$$ (but need to
            // preserve final state?)
            $$.on_destroy = $$.fragment = null;
            $$.ctx = [];
        }
    }
    function make_dirty(component, i) {
        if (component.$$.dirty[0] === -1) {
            dirty_components.push(component);
            schedule_update();
            component.$$.dirty.fill(0);
        }
        component.$$.dirty[(i / 31) | 0] |= (1 << (i % 31));
    }
    function init(component, options, instance, create_fragment, not_equal, props, dirty = [-1]) {
        const parent_component = current_component;
        set_current_component(component);
        const prop_values = options.props || {};
        const $$ = component.$$ = {
            fragment: null,
            ctx: null,
            // state
            props,
            update: noop,
            not_equal,
            bound: blank_object(),
            // lifecycle
            on_mount: [],
            on_destroy: [],
            before_update: [],
            after_update: [],
            context: new Map(parent_component ? parent_component.$$.context : []),
            // everything else
            callbacks: blank_object(),
            dirty
        };
        let ready = false;
        $$.ctx = instance
            ? instance(component, prop_values, (i, ret, ...rest) => {
                const value = rest.length ? rest[0] : ret;
                if ($$.ctx && not_equal($$.ctx[i], $$.ctx[i] = value)) {
                    if ($$.bound[i])
                        $$.bound[i](value);
                    if (ready)
                        make_dirty(component, i);
                }
                return ret;
            })
            : [];
        $$.update();
        ready = true;
        run_all($$.before_update);
        // `false` as a special case of no DOM component
        $$.fragment = create_fragment ? create_fragment($$.ctx) : false;
        if (options.target) {
            if (options.hydrate) {
                const nodes = children(options.target);
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                $$.fragment && $$.fragment.l(nodes);
                nodes.forEach(detach);
            }
            else {
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                $$.fragment && $$.fragment.c();
            }
            if (options.intro)
                transition_in(component.$$.fragment);
            mount_component(component, options.target, options.anchor);
            flush();
        }
        set_current_component(parent_component);
    }
    class SvelteComponent {
        $destroy() {
            destroy_component(this, 1);
            this.$destroy = noop;
        }
        $on(type, callback) {
            const callbacks = (this.$$.callbacks[type] || (this.$$.callbacks[type] = []));
            callbacks.push(callback);
            return () => {
                const index = callbacks.indexOf(callback);
                if (index !== -1)
                    callbacks.splice(index, 1);
            };
        }
        $set() {
            // overridden by instance, if it has props
        }
    }

    const subscriber_queue = [];
    /**
     * Create a `Writable` store that allows both updating and reading by subscription.
     * @param {*=}value initial value
     * @param {StartStopNotifier=}start start and stop notifications for subscriptions
     */
    function writable(value, start = noop) {
        let stop;
        const subscribers = [];
        function set(new_value) {
            if (safe_not_equal(value, new_value)) {
                value = new_value;
                if (stop) { // store is ready
                    const run_queue = !subscriber_queue.length;
                    for (let i = 0; i < subscribers.length; i += 1) {
                        const s = subscribers[i];
                        s[1]();
                        subscriber_queue.push(s, value);
                    }
                    if (run_queue) {
                        for (let i = 0; i < subscriber_queue.length; i += 2) {
                            subscriber_queue[i][0](subscriber_queue[i + 1]);
                        }
                        subscriber_queue.length = 0;
                    }
                }
            }
        }
        function update(fn) {
            set(fn(value));
        }
        function subscribe(run, invalidate = noop) {
            const subscriber = [run, invalidate];
            subscribers.push(subscriber);
            if (subscribers.length === 1) {
                stop = start(set) || noop;
            }
            run(value);
            return () => {
                const index = subscribers.indexOf(subscriber);
                if (index !== -1) {
                    subscribers.splice(index, 1);
                }
                if (subscribers.length === 0) {
                    stop();
                    stop = null;
                }
            };
        }
        return { set, update, subscribe };
    }

    function is_date(obj) {
        return Object.prototype.toString.call(obj) === '[object Date]';
    }

    function tick_spring(ctx, last_value, current_value, target_value) {
        if (typeof current_value === 'number' || is_date(current_value)) {
            // @ts-ignore
            const delta = target_value - current_value;
            // @ts-ignore
            const velocity = (current_value - last_value) / (ctx.dt || 1 / 60); // guard div by 0
            const spring = ctx.opts.stiffness * delta;
            const damper = ctx.opts.damping * velocity;
            const acceleration = (spring - damper) * ctx.inv_mass;
            const d = (velocity + acceleration) * ctx.dt;
            if (Math.abs(d) < ctx.opts.precision && Math.abs(delta) < ctx.opts.precision) {
                return target_value; // settled
            }
            else {
                ctx.settled = false; // signal loop to keep ticking
                // @ts-ignore
                return is_date(current_value) ?
                    new Date(current_value.getTime() + d) : current_value + d;
            }
        }
        else if (Array.isArray(current_value)) {
            // @ts-ignore
            return current_value.map((_, i) => tick_spring(ctx, last_value[i], current_value[i], target_value[i]));
        }
        else if (typeof current_value === 'object') {
            const next_value = {};
            for (const k in current_value)
                // @ts-ignore
                next_value[k] = tick_spring(ctx, last_value[k], current_value[k], target_value[k]);
            // @ts-ignore
            return next_value;
        }
        else {
            throw new Error(`Cannot spring ${typeof current_value} values`);
        }
    }
    function spring(value, opts = {}) {
        const store = writable(value);
        const { stiffness = 0.15, damping = 0.8, precision = 0.01 } = opts;
        let last_time;
        let task;
        let current_token;
        let last_value = value;
        let target_value = value;
        let inv_mass = 1;
        let inv_mass_recovery_rate = 0;
        let cancel_task = false;
        function set(new_value, opts = {}) {
            target_value = new_value;
            const token = current_token = {};
            if (value == null || opts.hard || (spring.stiffness >= 1 && spring.damping >= 1)) {
                cancel_task = true; // cancel any running animation
                last_time = now();
                last_value = new_value;
                store.set(value = target_value);
                return Promise.resolve();
            }
            else if (opts.soft) {
                const rate = opts.soft === true ? .5 : +opts.soft;
                inv_mass_recovery_rate = 1 / (rate * 60);
                inv_mass = 0; // infinite mass, unaffected by spring forces
            }
            if (!task) {
                last_time = now();
                cancel_task = false;
                task = loop(now => {
                    if (cancel_task) {
                        cancel_task = false;
                        task = null;
                        return false;
                    }
                    inv_mass = Math.min(inv_mass + inv_mass_recovery_rate, 1);
                    const ctx = {
                        inv_mass,
                        opts: spring,
                        settled: true,
                        dt: (now - last_time) * 60 / 1000
                    };
                    const next_value = tick_spring(ctx, last_value, value, target_value);
                    last_time = now;
                    last_value = value;
                    store.set(value = next_value);
                    if (ctx.settled)
                        task = null;
                    return !ctx.settled;
                });
            }
            return new Promise(fulfil => {
                task.promise.then(() => {
                    if (token === current_token)
                        fulfil();
                });
            });
        }
        const spring = {
            set,
            update: (fn, opts) => set(fn(target_value, value), opts),
            subscribe: store.subscribe,
            stiffness,
            damping,
            precision
        };
        return spring;
    }

    /* src/RangePips.svelte generated by Svelte v3.24.0 */

    function add_css() {
    	var style = element("style");
    	style.id = "svelte-18fdv99-style";
    	style.textContent = ".rangeSlider{--pip:var(--range-pip, lightslategray);--pip-text:var(--range-pip-text, var(--pip));--pip-active:var(--range-pip-active, darkslategrey);--pip-active-text:var(--range-pip-active-text, var(--pip-active));--pip-in-range:var(--range-pip-in-range, var(--pip-active));--pip-in-range-text:var(--range-pip-in-range-text, var(--pip-active-text))}.rangeSlider__pips{position:absolute;height:1em;left:0;right:0;bottom:-1em}.rangeSlider__pips.vertical{height:auto;width:1em;left:100%;right:auto;top:0;bottom:0}.rangeSlider__pips .pip{height:0.4em;position:absolute;top:0.25em;width:1px;white-space:nowrap}.rangeSlider__pips.vertical .pip{height:1px;width:0.4em;top:0;left:0.25em}.rangeSlider__pips .pip.selected{height:0.75em}.rangeSlider__pips.vertical .pip.selected{height:1px;width:0.75em}.rangeSlider__pips .pipVal{position:absolute;top:0.4em;transform:translate(-50%, 25%)}.rangeSlider__pips.vertical .pipVal{position:absolute;top:0;left:0.4em;transform:translate(25%, -50%)}.rangeSlider__pips .pip.selected .pipVal{font-weight:bold;top:0.75em}.rangeSlider__pips.vertical .pip.selected .pipVal{top:0;left:0.75em}.rangeSlider__pips .pip, .rangeSlider__pips .pipVal{transition:all 0.15s ease}.rangeSlider__pips .pip{color:lightslategray;color:var(--pip-text);background-color:lightslategray;background-color:var(--pip)}.rangeSlider__pips .pip.selected{color:darkslategrey;color:var(--pip-active-text);background-color:darkslategrey;background-color:var(--pip-active)}.rangeSlider__pips .pip.in-range{color:darkslategrey;color:var(--pip-in-range-text);background-color:darkslategrey;background-color:var(--pip-in-range)}";
    	append(document.head, style);
    }

    function get_each_context(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[19] = list[i];
    	child_ctx[21] = i;
    	return child_ctx;
    }

    // (134:2) {#if first}
    function create_if_block_5(ctx) {
    	let span;
    	let span_style_value;
    	let if_block = /*first*/ ctx[2] === "label" && create_if_block_6(ctx);

    	return {
    		c() {
    			span = element("span");
    			if (if_block) if_block.c();
    			attr(span, "class", "pip first");
    			attr(span, "style", span_style_value = "" + ((/*vertical*/ ctx[8] ? "top" : "left") + ": 0%;"));
    			toggle_class(span, "selected", /*isSelected*/ ctx[13](/*min*/ ctx[0]));
    			toggle_class(span, "in-range", /*inRange*/ ctx[14](/*min*/ ctx[0]));
    		},
    		m(target, anchor) {
    			insert(target, span, anchor);
    			if (if_block) if_block.m(span, null);
    		},
    		p(ctx, dirty) {
    			if (/*first*/ ctx[2] === "label") {
    				if (if_block) {
    					if_block.p(ctx, dirty);
    				} else {
    					if_block = create_if_block_6(ctx);
    					if_block.c();
    					if_block.m(span, null);
    				}
    			} else if (if_block) {
    				if_block.d(1);
    				if_block = null;
    			}

    			if (dirty & /*vertical*/ 256 && span_style_value !== (span_style_value = "" + ((/*vertical*/ ctx[8] ? "top" : "left") + ": 0%;"))) {
    				attr(span, "style", span_style_value);
    			}

    			if (dirty & /*isSelected, min*/ 8193) {
    				toggle_class(span, "selected", /*isSelected*/ ctx[13](/*min*/ ctx[0]));
    			}

    			if (dirty & /*inRange, min*/ 16385) {
    				toggle_class(span, "in-range", /*inRange*/ ctx[14](/*min*/ ctx[0]));
    			}
    		},
    		d(detaching) {
    			if (detaching) detach(span);
    			if (if_block) if_block.d();
    		}
    	};
    }

    // (140:6) {#if first === 'label'}
    function create_if_block_6(ctx) {
    	let span;
    	let t0;
    	let t1_value = /*formatter*/ ctx[7](/*min*/ ctx[0]) + "";
    	let t1;
    	let t2;

    	return {
    		c() {
    			span = element("span");
    			t0 = text(/*prefix*/ ctx[5]);
    			t1 = text(t1_value);
    			t2 = text(/*suffix*/ ctx[6]);
    			attr(span, "class", "pipVal");
    		},
    		m(target, anchor) {
    			insert(target, span, anchor);
    			append(span, t0);
    			append(span, t1);
    			append(span, t2);
    		},
    		p(ctx, dirty) {
    			if (dirty & /*prefix*/ 32) set_data(t0, /*prefix*/ ctx[5]);
    			if (dirty & /*formatter, min*/ 129 && t1_value !== (t1_value = /*formatter*/ ctx[7](/*min*/ ctx[0]) + "")) set_data(t1, t1_value);
    			if (dirty & /*suffix*/ 64) set_data(t2, /*suffix*/ ctx[6]);
    		},
    		d(detaching) {
    			if (detaching) detach(span);
    		}
    	};
    }

    // (147:2) {#if rest}
    function create_if_block_2(ctx) {
    	let each_1_anchor;
    	let each_value = Array(/*pipCount*/ ctx[11] + 1);
    	let each_blocks = [];

    	for (let i = 0; i < each_value.length; i += 1) {
    		each_blocks[i] = create_each_block(get_each_context(ctx, each_value, i));
    	}

    	return {
    		c() {
    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			each_1_anchor = empty();
    		},
    		m(target, anchor) {
    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(target, anchor);
    			}

    			insert(target, each_1_anchor, anchor);
    		},
    		p(ctx, dirty) {
    			if (dirty & /*vertical, percentOf, pipVal, isSelected, inRange, suffix, formatter, prefix, rest, min, max, pipCount*/ 32243) {
    				each_value = Array(/*pipCount*/ ctx[11] + 1);
    				let i;

    				for (i = 0; i < each_value.length; i += 1) {
    					const child_ctx = get_each_context(ctx, each_value, i);

    					if (each_blocks[i]) {
    						each_blocks[i].p(child_ctx, dirty);
    					} else {
    						each_blocks[i] = create_each_block(child_ctx);
    						each_blocks[i].c();
    						each_blocks[i].m(each_1_anchor.parentNode, each_1_anchor);
    					}
    				}

    				for (; i < each_blocks.length; i += 1) {
    					each_blocks[i].d(1);
    				}

    				each_blocks.length = each_value.length;
    			}
    		},
    		d(detaching) {
    			destroy_each(each_blocks, detaching);
    			if (detaching) detach(each_1_anchor);
    		}
    	};
    }

    // (149:6) {#if pipVal(i) !== min && pipVal(i) !== max}
    function create_if_block_3(ctx) {
    	let span;
    	let t;
    	let span_style_value;
    	let if_block = /*rest*/ ctx[4] === "label" && create_if_block_4(ctx);

    	return {
    		c() {
    			span = element("span");
    			if (if_block) if_block.c();
    			t = space();
    			attr(span, "class", "pip");
    			attr(span, "style", span_style_value = "" + ((/*vertical*/ ctx[8] ? "top" : "left") + ": " + /*percentOf*/ ctx[10](/*pipVal*/ ctx[12](/*i*/ ctx[21])) + "%;"));
    			toggle_class(span, "selected", /*isSelected*/ ctx[13](/*pipVal*/ ctx[12](/*i*/ ctx[21])));
    			toggle_class(span, "in-range", /*inRange*/ ctx[14](/*pipVal*/ ctx[12](/*i*/ ctx[21])));
    		},
    		m(target, anchor) {
    			insert(target, span, anchor);
    			if (if_block) if_block.m(span, null);
    			append(span, t);
    		},
    		p(ctx, dirty) {
    			if (/*rest*/ ctx[4] === "label") {
    				if (if_block) {
    					if_block.p(ctx, dirty);
    				} else {
    					if_block = create_if_block_4(ctx);
    					if_block.c();
    					if_block.m(span, t);
    				}
    			} else if (if_block) {
    				if_block.d(1);
    				if_block = null;
    			}

    			if (dirty & /*vertical, percentOf, pipVal*/ 5376 && span_style_value !== (span_style_value = "" + ((/*vertical*/ ctx[8] ? "top" : "left") + ": " + /*percentOf*/ ctx[10](/*pipVal*/ ctx[12](/*i*/ ctx[21])) + "%;"))) {
    				attr(span, "style", span_style_value);
    			}

    			if (dirty & /*isSelected, pipVal*/ 12288) {
    				toggle_class(span, "selected", /*isSelected*/ ctx[13](/*pipVal*/ ctx[12](/*i*/ ctx[21])));
    			}

    			if (dirty & /*inRange, pipVal*/ 20480) {
    				toggle_class(span, "in-range", /*inRange*/ ctx[14](/*pipVal*/ ctx[12](/*i*/ ctx[21])));
    			}
    		},
    		d(detaching) {
    			if (detaching) detach(span);
    			if (if_block) if_block.d();
    		}
    	};
    }

    // (155:10) {#if rest === 'label'}
    function create_if_block_4(ctx) {
    	let span;
    	let t0;
    	let t1_value = /*formatter*/ ctx[7](/*pipVal*/ ctx[12](/*i*/ ctx[21])) + "";
    	let t1;
    	let t2;

    	return {
    		c() {
    			span = element("span");
    			t0 = text(/*prefix*/ ctx[5]);
    			t1 = text(t1_value);
    			t2 = text(/*suffix*/ ctx[6]);
    			attr(span, "class", "pipVal");
    		},
    		m(target, anchor) {
    			insert(target, span, anchor);
    			append(span, t0);
    			append(span, t1);
    			append(span, t2);
    		},
    		p(ctx, dirty) {
    			if (dirty & /*prefix*/ 32) set_data(t0, /*prefix*/ ctx[5]);
    			if (dirty & /*formatter, pipVal*/ 4224 && t1_value !== (t1_value = /*formatter*/ ctx[7](/*pipVal*/ ctx[12](/*i*/ ctx[21])) + "")) set_data(t1, t1_value);
    			if (dirty & /*suffix*/ 64) set_data(t2, /*suffix*/ ctx[6]);
    		},
    		d(detaching) {
    			if (detaching) detach(span);
    		}
    	};
    }

    // (148:4) {#each Array(pipCount + 1) as _, i}
    function create_each_block(ctx) {
    	let show_if = /*pipVal*/ ctx[12](/*i*/ ctx[21]) !== /*min*/ ctx[0] && /*pipVal*/ ctx[12](/*i*/ ctx[21]) !== /*max*/ ctx[1];
    	let if_block_anchor;
    	let if_block = show_if && create_if_block_3(ctx);

    	return {
    		c() {
    			if (if_block) if_block.c();
    			if_block_anchor = empty();
    		},
    		m(target, anchor) {
    			if (if_block) if_block.m(target, anchor);
    			insert(target, if_block_anchor, anchor);
    		},
    		p(ctx, dirty) {
    			if (dirty & /*pipVal, min, max*/ 4099) show_if = /*pipVal*/ ctx[12](/*i*/ ctx[21]) !== /*min*/ ctx[0] && /*pipVal*/ ctx[12](/*i*/ ctx[21]) !== /*max*/ ctx[1];

    			if (show_if) {
    				if (if_block) {
    					if_block.p(ctx, dirty);
    				} else {
    					if_block = create_if_block_3(ctx);
    					if_block.c();
    					if_block.m(if_block_anchor.parentNode, if_block_anchor);
    				}
    			} else if (if_block) {
    				if_block.d(1);
    				if_block = null;
    			}
    		},
    		d(detaching) {
    			if (if_block) if_block.d(detaching);
    			if (detaching) detach(if_block_anchor);
    		}
    	};
    }

    // (164:2) {#if last}
    function create_if_block(ctx) {
    	let span;
    	let span_style_value;
    	let if_block = /*last*/ ctx[3] === "label" && create_if_block_1(ctx);

    	return {
    		c() {
    			span = element("span");
    			if (if_block) if_block.c();
    			attr(span, "class", "pip last");
    			attr(span, "style", span_style_value = "" + ((/*vertical*/ ctx[8] ? "top" : "left") + ": 100%;"));
    			toggle_class(span, "selected", /*isSelected*/ ctx[13](/*max*/ ctx[1]));
    			toggle_class(span, "in-range", /*inRange*/ ctx[14](/*max*/ ctx[1]));
    		},
    		m(target, anchor) {
    			insert(target, span, anchor);
    			if (if_block) if_block.m(span, null);
    		},
    		p(ctx, dirty) {
    			if (/*last*/ ctx[3] === "label") {
    				if (if_block) {
    					if_block.p(ctx, dirty);
    				} else {
    					if_block = create_if_block_1(ctx);
    					if_block.c();
    					if_block.m(span, null);
    				}
    			} else if (if_block) {
    				if_block.d(1);
    				if_block = null;
    			}

    			if (dirty & /*vertical*/ 256 && span_style_value !== (span_style_value = "" + ((/*vertical*/ ctx[8] ? "top" : "left") + ": 100%;"))) {
    				attr(span, "style", span_style_value);
    			}

    			if (dirty & /*isSelected, max*/ 8194) {
    				toggle_class(span, "selected", /*isSelected*/ ctx[13](/*max*/ ctx[1]));
    			}

    			if (dirty & /*inRange, max*/ 16386) {
    				toggle_class(span, "in-range", /*inRange*/ ctx[14](/*max*/ ctx[1]));
    			}
    		},
    		d(detaching) {
    			if (detaching) detach(span);
    			if (if_block) if_block.d();
    		}
    	};
    }

    // (170:6) {#if last === 'label'}
    function create_if_block_1(ctx) {
    	let span;
    	let t0;
    	let t1_value = /*formatter*/ ctx[7](/*max*/ ctx[1]) + "";
    	let t1;
    	let t2;

    	return {
    		c() {
    			span = element("span");
    			t0 = text(/*prefix*/ ctx[5]);
    			t1 = text(t1_value);
    			t2 = text(/*suffix*/ ctx[6]);
    			attr(span, "class", "pipVal");
    		},
    		m(target, anchor) {
    			insert(target, span, anchor);
    			append(span, t0);
    			append(span, t1);
    			append(span, t2);
    		},
    		p(ctx, dirty) {
    			if (dirty & /*prefix*/ 32) set_data(t0, /*prefix*/ ctx[5]);
    			if (dirty & /*formatter, max*/ 130 && t1_value !== (t1_value = /*formatter*/ ctx[7](/*max*/ ctx[1]) + "")) set_data(t1, t1_value);
    			if (dirty & /*suffix*/ 64) set_data(t2, /*suffix*/ ctx[6]);
    		},
    		d(detaching) {
    			if (detaching) detach(span);
    		}
    	};
    }

    function create_fragment(ctx) {
    	let div;
    	let t0;
    	let t1;
    	let if_block0 = /*first*/ ctx[2] && create_if_block_5(ctx);
    	let if_block1 = /*rest*/ ctx[4] && create_if_block_2(ctx);
    	let if_block2 = /*last*/ ctx[3] && create_if_block(ctx);

    	return {
    		c() {
    			div = element("div");
    			if (if_block0) if_block0.c();
    			t0 = space();
    			if (if_block1) if_block1.c();
    			t1 = space();
    			if (if_block2) if_block2.c();
    			attr(div, "class", "rangeSlider__pips");
    			toggle_class(div, "focus", /*focus*/ ctx[9]);
    			toggle_class(div, "vertical", /*vertical*/ ctx[8]);
    		},
    		m(target, anchor) {
    			insert(target, div, anchor);
    			if (if_block0) if_block0.m(div, null);
    			append(div, t0);
    			if (if_block1) if_block1.m(div, null);
    			append(div, t1);
    			if (if_block2) if_block2.m(div, null);
    		},
    		p(ctx, [dirty]) {
    			if (/*first*/ ctx[2]) {
    				if (if_block0) {
    					if_block0.p(ctx, dirty);
    				} else {
    					if_block0 = create_if_block_5(ctx);
    					if_block0.c();
    					if_block0.m(div, t0);
    				}
    			} else if (if_block0) {
    				if_block0.d(1);
    				if_block0 = null;
    			}

    			if (/*rest*/ ctx[4]) {
    				if (if_block1) {
    					if_block1.p(ctx, dirty);
    				} else {
    					if_block1 = create_if_block_2(ctx);
    					if_block1.c();
    					if_block1.m(div, t1);
    				}
    			} else if (if_block1) {
    				if_block1.d(1);
    				if_block1 = null;
    			}

    			if (/*last*/ ctx[3]) {
    				if (if_block2) {
    					if_block2.p(ctx, dirty);
    				} else {
    					if_block2 = create_if_block(ctx);
    					if_block2.c();
    					if_block2.m(div, null);
    				}
    			} else if (if_block2) {
    				if_block2.d(1);
    				if_block2 = null;
    			}

    			if (dirty & /*focus*/ 512) {
    				toggle_class(div, "focus", /*focus*/ ctx[9]);
    			}

    			if (dirty & /*vertical*/ 256) {
    				toggle_class(div, "vertical", /*vertical*/ ctx[8]);
    			}
    		},
    		i: noop,
    		o: noop,
    		d(detaching) {
    			if (detaching) detach(div);
    			if (if_block0) if_block0.d();
    			if (if_block1) if_block1.d();
    			if (if_block2) if_block2.d();
    		}
    	};
    }

    function instance($$self, $$props, $$invalidate) {
    	let { range = false } = $$props;
    	let { min = 0 } = $$props;
    	let { max = 100 } = $$props;
    	let { step = 1 } = $$props;
    	let { values = [(max + min) / 2] } = $$props;

    	let { pipstep = (max - min) / step >= (vertical ? 50 : 100)
    	? (max - min) / (vertical ? 10 : 20)
    	: 1 } = $$props;

    	let { first = true } = $$props;
    	let { last = true } = $$props;
    	let { rest = true } = $$props;
    	let { prefix = "" } = $$props;
    	let { suffix = "" } = $$props;
    	let { formatter = v => v } = $$props;
    	let { vertical = false } = $$props;
    	let { focus } = $$props;
    	let { percentOf } = $$props;

    	$$self.$set = $$props => {
    		if ("range" in $$props) $$invalidate(15, range = $$props.range);
    		if ("min" in $$props) $$invalidate(0, min = $$props.min);
    		if ("max" in $$props) $$invalidate(1, max = $$props.max);
    		if ("step" in $$props) $$invalidate(16, step = $$props.step);
    		if ("values" in $$props) $$invalidate(17, values = $$props.values);
    		if ("pipstep" in $$props) $$invalidate(18, pipstep = $$props.pipstep);
    		if ("first" in $$props) $$invalidate(2, first = $$props.first);
    		if ("last" in $$props) $$invalidate(3, last = $$props.last);
    		if ("rest" in $$props) $$invalidate(4, rest = $$props.rest);
    		if ("prefix" in $$props) $$invalidate(5, prefix = $$props.prefix);
    		if ("suffix" in $$props) $$invalidate(6, suffix = $$props.suffix);
    		if ("formatter" in $$props) $$invalidate(7, formatter = $$props.formatter);
    		if ("vertical" in $$props) $$invalidate(8, vertical = $$props.vertical);
    		if ("focus" in $$props) $$invalidate(9, focus = $$props.focus);
    		if ("percentOf" in $$props) $$invalidate(10, percentOf = $$props.percentOf);
    	};

    	let pipCount;
    	let pipVal;
    	let isSelected;
    	let inRange;

    	$$self.$$.update = () => {
    		if ($$self.$$.dirty & /*max, min, step, pipstep*/ 327683) {
    			 $$invalidate(11, pipCount = parseInt((max - min) / (step * pipstep), 10));
    		}

    		if ($$self.$$.dirty & /*min, step, pipstep*/ 327681) {
    			 $$invalidate(12, pipVal = function (val) {
    				return min + val * step * pipstep;
    			});
    		}

    		if ($$self.$$.dirty & /*values*/ 131072) {
    			 $$invalidate(13, isSelected = function (val) {
    				return values.some(v => v === val);
    			});
    		}

    		if ($$self.$$.dirty & /*range, values*/ 163840) {
    			 $$invalidate(14, inRange = function (val) {
    				if (range === "min") {
    					return values[0] < val;
    				} else if (range === "max") {
    					return values[0] > val;
    				} else if (range) {
    					return values[0] < val && values[1] > val;
    				}
    			});
    		}
    	};

    	return [
    		min,
    		max,
    		first,
    		last,
    		rest,
    		prefix,
    		suffix,
    		formatter,
    		vertical,
    		focus,
    		percentOf,
    		pipCount,
    		pipVal,
    		isSelected,
    		inRange,
    		range,
    		step,
    		values,
    		pipstep
    	];
    }

    class RangePips extends SvelteComponent {
    	constructor(options) {
    		super();
    		if (!document.getElementById("svelte-18fdv99-style")) add_css();

    		init(this, options, instance, create_fragment, safe_not_equal, {
    			range: 15,
    			min: 0,
    			max: 1,
    			step: 16,
    			values: 17,
    			pipstep: 18,
    			first: 2,
    			last: 3,
    			rest: 4,
    			prefix: 5,
    			suffix: 6,
    			formatter: 7,
    			vertical: 8,
    			focus: 9,
    			percentOf: 10
    		});
    	}
    }

    /* src/RangeSlider.svelte generated by Svelte v3.24.0 */

    function add_css$1() {
    	var style = element("style");
    	style.id = "svelte-5rwgh7-style";
    	style.textContent = ".rangeSlider{--slider:var(--range-slider, #d7dada);--handle-inactive:var(--range-handle-inactive, #99a2a2);--handle:var(--range-handle, #838de7);--handle-focus:var(--range-handle-focus, #4a40d4);--range-inactive:var(--range-range-inactive, var(--handle-inactive));--range:var(--range-range, var(--handle-focus));--float:var(--range-float, var(--handle-focus));--float-text:var(--range-float-text, white)}.rangeSlider{position:relative;border-radius:100px;height:0.5em;margin:1em}.rangeSlider, .rangeSlider *{user-select:none}.rangeSlider.pips{margin-bottom:1.8em}.rangeSlider.pip-labels{margin-bottom:2.8em}.rangeSlider.vertical{display:inline-block;border-radius:100px;width:0.5em;min-height:200px}.rangeSlider.vertical.pips{margin-right:1.8em;margin-bottom:1em}.rangeSlider.vertical.pip-labels{margin-right:2.8em;margin-bottom:1em}.rangeSlider .rangeHandle{position:absolute;display:block;height:1.4em;width:1.4em;top:0.25em;left:0.25em;transform:translateY(-50%) translateX(-50%);z-index:2}.rangeSlider .rangeNub{position:absolute;left:0;top:0;display:block;border-radius:10em;height:100%;width:100%;transition:all 0.2s ease}.rangeSlider.range:not(.min):not(.max) .rangeNub{border-radius:10em 10em 10em 1.6em}.rangeSlider.range .rangeHandle:nth-of-type(1) .rangeNub{transform:rotate(-135deg)}.rangeSlider.range .rangeHandle:nth-of-type(2) .rangeNub{transform:rotate(45deg)}.rangeSlider.range.vertical .rangeHandle:nth-of-type(1) .rangeNub{transform:rotate(-45deg)}.rangeSlider.range.vertical .rangeHandle:nth-of-type(2) .rangeNub{transform:rotate(135deg)}.rangeSlider .rangeFloat{display:block;position:absolute;left:50%;top:-0.5em;transform:translate(-50%, -100%);font-size:1em;text-align:center;opacity:0;pointer-events:none;white-space:nowrap;transition:all 0.2s ease;font-size:0.9em;padding:0.2em 0.4em;border-radius:0.2em}.rangeSlider .rangeHandle.active .rangeFloat{opacity:1;top:-0.2em;transform:translate(-50%, -100%)}.rangeSlider .rangeBar{position:absolute;display:block;transition:background 0.2s ease;border-radius:1em;height:0.5em;top:0;user-select:none;z-index:1}.rangeSlider.vertical .rangeBar{width:0.5em;height:auto}.rangeSlider{background-color:#d7dada;background-color:var(--slider)}.rangeSlider .rangeBar{background-color:#99a2a2;background-color:var(--range-inactive)}.rangeSlider.focus .rangeBar{background-color:#838de7;background-color:var(--range)}.rangeSlider .rangeNub{background-color:#99a2a2;background-color:var(--handle-inactive)}.rangeSlider.focus .rangeNub{background-color:#838de7;background-color:var(--handle)}.rangeSlider .rangeHandle.active .rangeNub{background-color:#4a40d4;background-color:var(--handle-focus)}.rangeSlider .rangeFloat{color:white;color:var(--float-text)}.rangeSlider.focus .rangeFloat{background-color:#4a40d4;background-color:var(--float)}";
    	append(document.head, style);
    }

    function get_each_context$1(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[48] = list[i];
    	child_ctx[50] = i;
    	return child_ctx;
    }

    // (621:6) {#if float}
    function create_if_block_2$1(ctx) {
    	let span;
    	let t0;
    	let t1_value = /*handleFormatter*/ ctx[14](/*value*/ ctx[48]) + "";
    	let t1;
    	let t2;

    	return {
    		c() {
    			span = element("span");
    			t0 = text(/*prefix*/ ctx[11]);
    			t1 = text(t1_value);
    			t2 = text(/*suffix*/ ctx[12]);
    			attr(span, "class", "rangeFloat");
    		},
    		m(target, anchor) {
    			insert(target, span, anchor);
    			append(span, t0);
    			append(span, t1);
    			append(span, t2);
    		},
    		p(ctx, dirty) {
    			if (dirty[0] & /*prefix*/ 2048) set_data(t0, /*prefix*/ ctx[11]);
    			if (dirty[0] & /*handleFormatter, values*/ 16385 && t1_value !== (t1_value = /*handleFormatter*/ ctx[14](/*value*/ ctx[48]) + "")) set_data(t1, t1_value);
    			if (dirty[0] & /*suffix*/ 4096) set_data(t2, /*suffix*/ ctx[12]);
    		},
    		d(detaching) {
    			if (detaching) detach(span);
    		}
    	};
    }

    // (605:2) {#each values as value, index}
    function create_each_block$1(ctx) {
    	let span1;
    	let span0;
    	let t;
    	let span1_style_value;
    	let span1_aria_valuemin_value;
    	let span1_aria_valuemax_value;
    	let span1_aria_valuenow_value;
    	let span1_aria_valuetext_value;
    	let span1_aria_orientation_value;
    	let mounted;
    	let dispose;
    	let if_block = /*float*/ ctx[15] && create_if_block_2$1(ctx);

    	return {
    		c() {
    			span1 = element("span");
    			span0 = element("span");
    			t = space();
    			if (if_block) if_block.c();
    			attr(span0, "class", "rangeNub");
    			attr(span1, "role", "slider");
    			attr(span1, "class", "rangeHandle");
    			attr(span1, "tabindex", "0");
    			attr(span1, "style", span1_style_value = "" + ((/*vertical*/ ctx[16] ? "top" : "left") + ": " + /*$springPositions*/ ctx[21][/*index*/ ctx[50]] + "%; z-index: " + (/*activeHandle*/ ctx[19] === /*index*/ ctx[50] ? 3 : 2) + ";"));

    			attr(span1, "aria-valuemin", span1_aria_valuemin_value = /*range*/ ctx[1] === true && /*index*/ ctx[50] === 1
    			? /*values*/ ctx[0][0]
    			: /*min*/ ctx[2]);

    			attr(span1, "aria-valuemax", span1_aria_valuemax_value = /*range*/ ctx[1] === true && /*index*/ ctx[50] === 0
    			? /*values*/ ctx[0][1]
    			: /*max*/ ctx[3]);

    			attr(span1, "aria-valuenow", span1_aria_valuenow_value = /*value*/ ctx[48]);
    			attr(span1, "aria-valuetext", span1_aria_valuetext_value = "" + (/*prefix*/ ctx[11] + /*handleFormatter*/ ctx[14](/*value*/ ctx[48]) + /*suffix*/ ctx[12]));
    			attr(span1, "aria-orientation", span1_aria_orientation_value = /*vertical*/ ctx[16] ? "vertical" : "horizontal");
    			toggle_class(span1, "active", /*focus*/ ctx[18] && /*activeHandle*/ ctx[19] === /*index*/ ctx[50]);
    		},
    		m(target, anchor) {
    			insert(target, span1, anchor);
    			append(span1, span0);
    			append(span1, t);
    			if (if_block) if_block.m(span1, null);

    			if (!mounted) {
    				dispose = [
    					listen(span1, "blur", /*sliderBlurHandle*/ ctx[25]),
    					listen(span1, "focus", /*sliderFocusHandle*/ ctx[26]),
    					listen(span1, "keydown", /*sliderKeydown*/ ctx[27])
    				];

    				mounted = true;
    			}
    		},
    		p(ctx, dirty) {
    			if (/*float*/ ctx[15]) {
    				if (if_block) {
    					if_block.p(ctx, dirty);
    				} else {
    					if_block = create_if_block_2$1(ctx);
    					if_block.c();
    					if_block.m(span1, null);
    				}
    			} else if (if_block) {
    				if_block.d(1);
    				if_block = null;
    			}

    			if (dirty[0] & /*vertical, $springPositions, activeHandle*/ 2686976 && span1_style_value !== (span1_style_value = "" + ((/*vertical*/ ctx[16] ? "top" : "left") + ": " + /*$springPositions*/ ctx[21][/*index*/ ctx[50]] + "%; z-index: " + (/*activeHandle*/ ctx[19] === /*index*/ ctx[50] ? 3 : 2) + ";"))) {
    				attr(span1, "style", span1_style_value);
    			}

    			if (dirty[0] & /*range, values, min*/ 7 && span1_aria_valuemin_value !== (span1_aria_valuemin_value = /*range*/ ctx[1] === true && /*index*/ ctx[50] === 1
    			? /*values*/ ctx[0][0]
    			: /*min*/ ctx[2])) {
    				attr(span1, "aria-valuemin", span1_aria_valuemin_value);
    			}

    			if (dirty[0] & /*range, values, max*/ 11 && span1_aria_valuemax_value !== (span1_aria_valuemax_value = /*range*/ ctx[1] === true && /*index*/ ctx[50] === 0
    			? /*values*/ ctx[0][1]
    			: /*max*/ ctx[3])) {
    				attr(span1, "aria-valuemax", span1_aria_valuemax_value);
    			}

    			if (dirty[0] & /*values*/ 1 && span1_aria_valuenow_value !== (span1_aria_valuenow_value = /*value*/ ctx[48])) {
    				attr(span1, "aria-valuenow", span1_aria_valuenow_value);
    			}

    			if (dirty[0] & /*prefix, handleFormatter, values, suffix*/ 22529 && span1_aria_valuetext_value !== (span1_aria_valuetext_value = "" + (/*prefix*/ ctx[11] + /*handleFormatter*/ ctx[14](/*value*/ ctx[48]) + /*suffix*/ ctx[12]))) {
    				attr(span1, "aria-valuetext", span1_aria_valuetext_value);
    			}

    			if (dirty[0] & /*vertical*/ 65536 && span1_aria_orientation_value !== (span1_aria_orientation_value = /*vertical*/ ctx[16] ? "vertical" : "horizontal")) {
    				attr(span1, "aria-orientation", span1_aria_orientation_value);
    			}

    			if (dirty[0] & /*focus, activeHandle*/ 786432) {
    				toggle_class(span1, "active", /*focus*/ ctx[18] && /*activeHandle*/ ctx[19] === /*index*/ ctx[50]);
    			}
    		},
    		d(detaching) {
    			if (detaching) detach(span1);
    			if (if_block) if_block.d();
    			mounted = false;
    			run_all(dispose);
    		}
    	};
    }

    // (626:2) {#if range}
    function create_if_block_1$1(ctx) {
    	let span;
    	let span_style_value;

    	return {
    		c() {
    			span = element("span");
    			attr(span, "class", "rangeBar");
    			attr(span, "style", span_style_value = "" + ((/*vertical*/ ctx[16] ? "top" : "left") + ": " + /*rangeStart*/ ctx[23](/*$springPositions*/ ctx[21]) + "%; " + (/*vertical*/ ctx[16] ? "bottom" : "right") + ":\n      " + /*rangeEnd*/ ctx[24](/*$springPositions*/ ctx[21]) + "%;"));
    		},
    		m(target, anchor) {
    			insert(target, span, anchor);
    		},
    		p(ctx, dirty) {
    			if (dirty[0] & /*vertical, $springPositions*/ 2162688 && span_style_value !== (span_style_value = "" + ((/*vertical*/ ctx[16] ? "top" : "left") + ": " + /*rangeStart*/ ctx[23](/*$springPositions*/ ctx[21]) + "%; " + (/*vertical*/ ctx[16] ? "bottom" : "right") + ":\n      " + /*rangeEnd*/ ctx[24](/*$springPositions*/ ctx[21]) + "%;"))) {
    				attr(span, "style", span_style_value);
    			}
    		},
    		d(detaching) {
    			if (detaching) detach(span);
    		}
    	};
    }

    // (632:2) {#if pips}
    function create_if_block$1(ctx) {
    	let rangepips;
    	let current;

    	rangepips = new RangePips({
    			props: {
    				values: /*values*/ ctx[0],
    				min: /*min*/ ctx[2],
    				max: /*max*/ ctx[3],
    				step: /*step*/ ctx[4],
    				range: /*range*/ ctx[1],
    				vertical: /*vertical*/ ctx[16],
    				first: /*first*/ ctx[7],
    				last: /*last*/ ctx[8],
    				rest: /*rest*/ ctx[9],
    				pipstep: /*pipstep*/ ctx[6],
    				prefix: /*prefix*/ ctx[11],
    				suffix: /*suffix*/ ctx[12],
    				formatter: /*formatter*/ ctx[13],
    				focus: /*focus*/ ctx[18],
    				percentOf: /*percentOf*/ ctx[20]
    			}
    		});

    	return {
    		c() {
    			create_component(rangepips.$$.fragment);
    		},
    		m(target, anchor) {
    			mount_component(rangepips, target, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			const rangepips_changes = {};
    			if (dirty[0] & /*values*/ 1) rangepips_changes.values = /*values*/ ctx[0];
    			if (dirty[0] & /*min*/ 4) rangepips_changes.min = /*min*/ ctx[2];
    			if (dirty[0] & /*max*/ 8) rangepips_changes.max = /*max*/ ctx[3];
    			if (dirty[0] & /*step*/ 16) rangepips_changes.step = /*step*/ ctx[4];
    			if (dirty[0] & /*range*/ 2) rangepips_changes.range = /*range*/ ctx[1];
    			if (dirty[0] & /*vertical*/ 65536) rangepips_changes.vertical = /*vertical*/ ctx[16];
    			if (dirty[0] & /*first*/ 128) rangepips_changes.first = /*first*/ ctx[7];
    			if (dirty[0] & /*last*/ 256) rangepips_changes.last = /*last*/ ctx[8];
    			if (dirty[0] & /*rest*/ 512) rangepips_changes.rest = /*rest*/ ctx[9];
    			if (dirty[0] & /*pipstep*/ 64) rangepips_changes.pipstep = /*pipstep*/ ctx[6];
    			if (dirty[0] & /*prefix*/ 2048) rangepips_changes.prefix = /*prefix*/ ctx[11];
    			if (dirty[0] & /*suffix*/ 4096) rangepips_changes.suffix = /*suffix*/ ctx[12];
    			if (dirty[0] & /*formatter*/ 8192) rangepips_changes.formatter = /*formatter*/ ctx[13];
    			if (dirty[0] & /*focus*/ 262144) rangepips_changes.focus = /*focus*/ ctx[18];
    			if (dirty[0] & /*percentOf*/ 1048576) rangepips_changes.percentOf = /*percentOf*/ ctx[20];
    			rangepips.$set(rangepips_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(rangepips.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(rangepips.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			destroy_component(rangepips, detaching);
    		}
    	};
    }

    function create_fragment$1(ctx) {
    	let div;
    	let t0;
    	let t1;
    	let current;
    	let mounted;
    	let dispose;
    	let each_value = /*values*/ ctx[0];
    	let each_blocks = [];

    	for (let i = 0; i < each_value.length; i += 1) {
    		each_blocks[i] = create_each_block$1(get_each_context$1(ctx, each_value, i));
    	}

    	let if_block0 = /*range*/ ctx[1] && create_if_block_1$1(ctx);
    	let if_block1 = /*pips*/ ctx[5] && create_if_block$1(ctx);

    	return {
    		c() {
    			div = element("div");

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			t0 = space();
    			if (if_block0) if_block0.c();
    			t1 = space();
    			if (if_block1) if_block1.c();
    			attr(div, "id", /*id*/ ctx[10]);
    			attr(div, "class", "rangeSlider");
    			toggle_class(div, "min", /*range*/ ctx[1] === "min");
    			toggle_class(div, "range", /*range*/ ctx[1]);
    			toggle_class(div, "vertical", /*vertical*/ ctx[16]);
    			toggle_class(div, "focus", /*focus*/ ctx[18]);
    			toggle_class(div, "max", /*range*/ ctx[1] === "max");
    			toggle_class(div, "pips", /*pips*/ ctx[5]);
    			toggle_class(div, "pip-labels", /*first*/ ctx[7] === "label" || /*last*/ ctx[8] === "label" || /*rest*/ ctx[9] === "label");
    		},
    		m(target, anchor) {
    			insert(target, div, anchor);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(div, null);
    			}

    			append(div, t0);
    			if (if_block0) if_block0.m(div, null);
    			append(div, t1);
    			if (if_block1) if_block1.m(div, null);
    			/*div_binding*/ ctx[36](div);
    			current = true;

    			if (!mounted) {
    				dispose = [
    					listen(window, "mousedown", /*bodyInteractStart*/ ctx[29]),
    					listen(window, "touchstart", /*bodyInteractStart*/ ctx[29]),
    					listen(window, "mousemove", /*bodyInteract*/ ctx[30]),
    					listen(window, "touchmove", /*bodyInteract*/ ctx[30]),
    					listen(window, "mouseup", /*bodyMouseUp*/ ctx[31]),
    					listen(window, "touchend", /*bodyTouchEnd*/ ctx[32]),
    					listen(window, "keydown", /*bodyKeyDown*/ ctx[33]),
    					listen(div, "touchstart", prevent_default(/*sliderInteractStart*/ ctx[28])),
    					listen(div, "mousedown", /*sliderInteractStart*/ ctx[28])
    				];

    				mounted = true;
    			}
    		},
    		p(ctx, dirty) {
    			if (dirty[0] & /*vertical, $springPositions, activeHandle, range, values, min, max, prefix, handleFormatter, suffix, focus, sliderKeydown, sliderBlurHandle, sliderFocusHandle, float*/ 237885455) {
    				each_value = /*values*/ ctx[0];
    				let i;

    				for (i = 0; i < each_value.length; i += 1) {
    					const child_ctx = get_each_context$1(ctx, each_value, i);

    					if (each_blocks[i]) {
    						each_blocks[i].p(child_ctx, dirty);
    					} else {
    						each_blocks[i] = create_each_block$1(child_ctx);
    						each_blocks[i].c();
    						each_blocks[i].m(div, t0);
    					}
    				}

    				for (; i < each_blocks.length; i += 1) {
    					each_blocks[i].d(1);
    				}

    				each_blocks.length = each_value.length;
    			}

    			if (/*range*/ ctx[1]) {
    				if (if_block0) {
    					if_block0.p(ctx, dirty);
    				} else {
    					if_block0 = create_if_block_1$1(ctx);
    					if_block0.c();
    					if_block0.m(div, t1);
    				}
    			} else if (if_block0) {
    				if_block0.d(1);
    				if_block0 = null;
    			}

    			if (/*pips*/ ctx[5]) {
    				if (if_block1) {
    					if_block1.p(ctx, dirty);

    					if (dirty[0] & /*pips*/ 32) {
    						transition_in(if_block1, 1);
    					}
    				} else {
    					if_block1 = create_if_block$1(ctx);
    					if_block1.c();
    					transition_in(if_block1, 1);
    					if_block1.m(div, null);
    				}
    			} else if (if_block1) {
    				group_outros();

    				transition_out(if_block1, 1, 1, () => {
    					if_block1 = null;
    				});

    				check_outros();
    			}

    			if (!current || dirty[0] & /*id*/ 1024) {
    				attr(div, "id", /*id*/ ctx[10]);
    			}

    			if (dirty[0] & /*range*/ 2) {
    				toggle_class(div, "min", /*range*/ ctx[1] === "min");
    			}

    			if (dirty[0] & /*range*/ 2) {
    				toggle_class(div, "range", /*range*/ ctx[1]);
    			}

    			if (dirty[0] & /*vertical*/ 65536) {
    				toggle_class(div, "vertical", /*vertical*/ ctx[16]);
    			}

    			if (dirty[0] & /*focus*/ 262144) {
    				toggle_class(div, "focus", /*focus*/ ctx[18]);
    			}

    			if (dirty[0] & /*range*/ 2) {
    				toggle_class(div, "max", /*range*/ ctx[1] === "max");
    			}

    			if (dirty[0] & /*pips*/ 32) {
    				toggle_class(div, "pips", /*pips*/ ctx[5]);
    			}

    			if (dirty[0] & /*first, last, rest*/ 896) {
    				toggle_class(div, "pip-labels", /*first*/ ctx[7] === "label" || /*last*/ ctx[8] === "label" || /*rest*/ ctx[9] === "label");
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in(if_block1);
    			current = true;
    		},
    		o(local) {
    			transition_out(if_block1);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(div);
    			destroy_each(each_blocks, detaching);
    			if (if_block0) if_block0.d();
    			if (if_block1) if_block1.d();
    			/*div_binding*/ ctx[36](null);
    			mounted = false;
    			run_all(dispose);
    		}
    	};
    }

    function index(el) {
    	if (!el) return -1;
    	var i = 0;

    	while (el = el.previousElementSibling) {
    		i++;
    	}

    	return i;
    }

    /**
     * noramlise a mouse or touch event to return the
     * client (x/y) object for that event
     * @param {event} e a mouse/touch event to normalise
     * @returns {object} normalised event client object (x,y)
     **/
    function normalisedClient(e) {
    	if (e.type.includes("touch")) {
    		return e.touches[0];
    	} else {
    		return e;
    	}
    }

    function instance$1($$self, $$props, $$invalidate) {
    	let $springPositions;
    	let { range = false } = $$props;
    	let { min = 0 } = $$props;
    	let { max = 100 } = $$props;
    	let { step = 1 } = $$props;
    	let { values = [(max + min) / 2] } = $$props;
    	let { pips = false } = $$props;
    	let { pipstep } = $$props;
    	let { first } = $$props;
    	let { last } = $$props;
    	let { rest } = $$props;
    	let { id } = $$props;
    	let { prefix = "" } = $$props;
    	let { suffix = "" } = $$props;
    	let { formatter = v => v } = $$props;
    	let { handleFormatter = formatter } = $$props;
    	let { float = false } = $$props;
    	let { vertical = false } = $$props;
    	let { precision = 2 } = $$props;
    	let { springValues = { stiffness: 0.15, damping: 0.4 } } = $$props;

    	// dom references
    	let slider;

    	// state management
    	let focus = false;

    	let handleActivated = false;
    	let keyboardActive = false;
    	let activeHandle = values.length - 1;

    	// save spring-tweened copies of the values for use
    	// when changing values and animating the handle/range nicely
    	let springPositions = spring(values.map(v => 50), springValues);

    	component_subscribe($$self, springPositions, value => $$invalidate(21, $springPositions = value));

    	/**
     * get the position (x/y) of a mouse/touch event on the screen
     * @param {event} e a mouse/touch event
     * @returns {object} position on screen (x,y)
     **/
    	function eventPosition(e) {
    		return vertical
    		? normalisedClient(e).clientY
    		: normalisedClient(e).clientX;
    	}

    	/**
     * check if an element is a handle on the slider
     * @param {object} el dom object reference we want to check
     * @returns {boolean}
     **/
    	function targetIsHandle(el) {
    		const handles = slider.querySelectorAll(".handle");
    		const isHandle = Array.prototype.includes.call(handles, el);
    		const isChild = Array.prototype.some.call(handles, e => e.contains(el));
    		return isHandle || isChild;
    	}

    	/**
     * take in the value from the "range" parameter and see if
     * we should make a min/max/range slider.
     * @param {array} values the input values for the rangeSlider
     * @return {array} the range array for creating a rangeSlider
     **/
    	function trimRange(values) {
    		if (range === "min" || range === "max") {
    			return values.slice(0, 1);
    		} else if (range) {
    			return values.slice(0, 2);
    		} else {
    			return values;
    		}
    	}

    	/**
     * helper to return the slider dimensions for finding
     * the closest handle to user interaction
     * @return {object} the range slider DOM client rect
     **/
    	function getSliderDimensions() {
    		return slider.getBoundingClientRect();
    	}

    	/**
     * helper to return closest handle to user interaction
     * @param {number} clientPos the pixel (clientX/Y) to check against
     * @return {number} the index of the closest handle to clientPos
     **/
    	function getClosestHandle(clientPos) {
    		// first make sure we have the latest dimensions
    		// of the slider, as it may have changed size
    		const dims = getSliderDimensions();

    		// calculate the interaction position, percent and value
    		let iPos = 0;

    		let iPercent = 0;
    		let iVal = 0;

    		if (vertical) {
    			iPos = clientPos - dims.y;
    			iPercent = iPos / dims.height * 100;
    			iVal = (max - min) / 100 * iPercent + min;
    		} else {
    			iPos = clientPos - dims.x;
    			iPercent = iPos / dims.width * 100;
    			iVal = (max - min) / 100 * iPercent + min;
    		}

    		let closest;

    		// if we have a range, and the handles are at the same
    		// position, we want a simple check if the interaction
    		// value is greater than return the second handle
    		if (range === true && values[0] === values[1]) {
    			if (iVal > values[1]) {
    				return 1;
    			} else {
    				return 0;
    			}
    		} else // we sort the handles values, and return the first one closest
    		// to the interaction value
    		{
    			closest = values.indexOf([...values].sort((a, b) => Math.abs(iVal - a) - Math.abs(iVal - b))[0]); // if there are multiple handles, and not a range, then
    		}

    		return closest;
    	}

    	/**
     * take the interaction position on the slider, convert
     * it to a value on the range, and then send that value
     * through to the moveHandle() method to set the active
     * handle's position
     * @param {number} clientPos the clientX/Y of the interaction
     **/
    	function handleInteract(clientPos) {
    		// first make sure we have the latest dimensions
    		// of the slider, as it may have changed size
    		const dims = getSliderDimensions();

    		// calculate the interaction position, percent and value
    		let iPos = 0;

    		let iPercent = 0;
    		let iVal = 0;

    		if (vertical) {
    			iPos = clientPos - dims.y;
    			iPercent = iPos / dims.height * 100;
    			iVal = (max - min) / 100 * iPercent + min;
    		} else {
    			iPos = clientPos - dims.x;
    			iPercent = iPos / dims.width * 100;
    			iVal = (max - min) / 100 * iPercent + min;
    		}

    		// move handle to the value
    		moveHandle(activeHandle, iVal);
    	}

    	/**
     * move a handle to a specific value, respecting the clamp/align rules
     * @param {number} index the index of the handle we want to move
     * @param {number} value the value to move the handle to
     * @return {number} the value that was moved to (after alignment/clamping)
     **/
    	function moveHandle(index, value) {
    		// restrict the handles of a range-slider from
    		// going past one-another
    		if (range && index === 0 && value > values[1]) {
    			value = values[1];
    		} else if (range && index === 1 && value < values[0]) {
    			value = values[0];
    		}

    		// set the value for the handle, and align/clamp it
    		$$invalidate(0, values[index] = value, values);
    	}

    	/**
     * helper to find the beginning range value for use with css style
     * @param {array} values the input values for the rangeSlider
     * @return {number} the beginning of the range
     **/
    	function rangeStart(values) {
    		if (range === "min") {
    			return 0;
    		} else {
    			return values[0];
    		}
    	}

    	/**
     * helper to find the ending range value for use with css style
     * @param {array} values the input values for the rangeSlider
     * @return {number} the end of the range
     **/
    	function rangeEnd(values) {
    		if (range === "max") {
    			return 0;
    		} else if (range === "min") {
    			return 100 - values[0];
    		} else {
    			return 100 - values[1];
    		}
    	}

    	/**
     * when the user has unfocussed (blurred) from the
     * slider, deactivated all handles
     * @param {event} e the event from browser
     **/
    	function sliderBlurHandle(e) {
    		if (keyboardActive) {
    			$$invalidate(18, focus = false);
    			handleActivated = false;
    		}
    	}

    	/**
     * when the user focusses the handle of a slider
     * set it to be active
     * @param {event} e the event from browser
     **/
    	function sliderFocusHandle(e) {
    		$$invalidate(19, activeHandle = index(e.target));
    		$$invalidate(18, focus = true);
    	}

    	/**
     * handle the keyboard accessible features by checking the
     * input type, and modfier key then moving handle by appropriate amount
     * @param {event} e the event from browser
     **/
    	function sliderKeydown(e) {
    		const handle = index(e.target);
    		let jump = e.ctrlKey || e.metaKey || e.shiftKey ? step * 10 : step;
    		let prevent = false;

    		switch (e.key) {
    			case "PageDown":
    				jump *= 10;
    			case "ArrowRight":
    			case "ArrowUp":
    				moveHandle(handle, values[handle] + jump);
    				prevent = true;
    				break;
    			case "PageUp":
    				jump *= 10;
    			case "ArrowLeft":
    			case "ArrowDown":
    				moveHandle(handle, values[handle] - jump);
    				prevent = true;
    				break;
    			case "Home":
    				moveHandle(handle, min);
    				prevent = true;
    				break;
    			case "End":
    				moveHandle(handle, max);
    				prevent = true;
    				break;
    		}

    		if (prevent) {
    			e.preventDefault();
    			e.stopPropagation();
    		}
    	}

    	/**
     * function to run when the user touches
     * down on the slider element anywhere
     * @param {event} e the event from browser
     **/
    	function sliderInteractStart(e) {
    		const p = eventPosition(e);

    		// set the closest handle as active
    		$$invalidate(18, focus = true);

    		handleActivated = true;
    		$$invalidate(19, activeHandle = getClosestHandle(p));

    		// for touch devices we want the handle to instantly
    		// move to the position touched for more responsive feeling
    		if (e.type === "touchstart") {
    			handleInteract(p);
    		}
    	}

    	/**
     * unfocus the slider if the user clicked off of
     * it, somewhere else on the screen
     * @param {event} e the event from browser
     **/
    	function bodyInteractStart(e) {
    		keyboardActive = false;

    		if (focus && e.target !== slider && !slider.contains(e.target)) {
    			$$invalidate(18, focus = false);
    		}
    	}

    	/**
     * send the clientX through to handle the interaction
     * whenever the user moves acros screen while active
     * @param {event} e the event from browser
     **/
    	function bodyInteract(e) {
    		if (handleActivated) {
    			handleInteract(eventPosition(e));
    		}
    	}

    	/**
     * if user triggers mouseup on the body while
     * a handle is active (without moving) then we
     * trigger an interact event there
     * @param {event} e the event from browser
     **/
    	function bodyMouseUp(e) {
    		const el = e.target;

    		// this only works if a handle is active, which can
    		// only happen if there was sliderInteractStart triggered
    		// on the slider, already
    		if (handleActivated && (el === slider || slider.contains(el))) {
    			$$invalidate(18, focus = true);

    			if (!targetIsHandle(el)) {
    				handleInteract(eventPosition(e));
    			}
    		}

    		handleActivated = false;
    	}

    	/**
     * if user triggers touchend on the body then we
     * defocus the slider completely
     * @param {event} e the event from browser
     **/
    	function bodyTouchEnd(e) {
    		handleActivated = false;
    	}

    	function bodyKeyDown(e) {
    		if (e.target === slider || slider.contains(e.target)) {
    			keyboardActive = true;
    		}
    	}

    	function div_binding($$value) {
    		binding_callbacks[$$value ? "unshift" : "push"](() => {
    			slider = $$value;
    			$$invalidate(17, slider);
    		});
    	}

    	$$self.$set = $$props => {
    		if ("range" in $$props) $$invalidate(1, range = $$props.range);
    		if ("min" in $$props) $$invalidate(2, min = $$props.min);
    		if ("max" in $$props) $$invalidate(3, max = $$props.max);
    		if ("step" in $$props) $$invalidate(4, step = $$props.step);
    		if ("values" in $$props) $$invalidate(0, values = $$props.values);
    		if ("pips" in $$props) $$invalidate(5, pips = $$props.pips);
    		if ("pipstep" in $$props) $$invalidate(6, pipstep = $$props.pipstep);
    		if ("first" in $$props) $$invalidate(7, first = $$props.first);
    		if ("last" in $$props) $$invalidate(8, last = $$props.last);
    		if ("rest" in $$props) $$invalidate(9, rest = $$props.rest);
    		if ("id" in $$props) $$invalidate(10, id = $$props.id);
    		if ("prefix" in $$props) $$invalidate(11, prefix = $$props.prefix);
    		if ("suffix" in $$props) $$invalidate(12, suffix = $$props.suffix);
    		if ("formatter" in $$props) $$invalidate(13, formatter = $$props.formatter);
    		if ("handleFormatter" in $$props) $$invalidate(14, handleFormatter = $$props.handleFormatter);
    		if ("float" in $$props) $$invalidate(15, float = $$props.float);
    		if ("vertical" in $$props) $$invalidate(16, vertical = $$props.vertical);
    		if ("precision" in $$props) $$invalidate(34, precision = $$props.precision);
    		if ("springValues" in $$props) $$invalidate(35, springValues = $$props.springValues);
    	};

    	let percentOf;
    	let clampValue;
    	let alignValueToStep;

    	$$self.$$.update = () => {
    		if ($$self.$$.dirty[0] & /*min, max*/ 12) {
    			/**
     * clamp a value from the range so that it always
     * falls within the min/max values
     * @param {number} val the value to clamp
     * @return {number} the value after it's been clamped
     **/
    			 $$invalidate(40, clampValue = function (val) {
    				// return the min/max if outside of that range
    				return val <= min ? min : val >= max ? max : val;
    			});
    		}

    		if ($$self.$$.dirty[0] & /*min, max, step*/ 28 | $$self.$$.dirty[1] & /*clampValue, precision*/ 520) {
    			/**
     * align the value with the steps so that it
     * always sits on the closest (above/below) step
     * @param {number} val the value to align
     * @return {number} the value after it's been aligned
     **/
    			 $$invalidate(39, alignValueToStep = function (val) {
    				// sanity check for performance
    				if (val <= min) {
    					return min;
    				} else if (val >= max) {
    					return max;
    				}

    				// find the middle-point between steps
    				// and see if the value is closer to the
    				// next step, or previous step
    				let remainder = (val - min) % step;

    				let aligned = val - remainder;

    				if (Math.abs(remainder) * 2 >= step) {
    					aligned += remainder > 0 ? step : -step;
    				}

    				// make sure the value is within acceptable limits
    				aligned = clampValue(aligned);

    				// make sure the returned value is set to the precision desired
    				// this is also because javascript often returns weird floats
    				// when dealing with odd numbers and percentages
    				return parseFloat(aligned.toFixed(precision));
    			});
    		}

    		if ($$self.$$.dirty[0] & /*values*/ 1 | $$self.$$.dirty[1] & /*alignValueToStep*/ 256) {
    			// watch the values array, and trim / clamp the values to the steps
    			// and boundaries set up in the slider on change
    			 $$invalidate(0, values = trimRange(values).map(v => alignValueToStep(v)));
    		}

    		if ($$self.$$.dirty[0] & /*min, max*/ 12 | $$self.$$.dirty[1] & /*precision*/ 8) {
    			/**
     * take in a value, and then calculate that value's percentage
     * of the overall range (min-max);
     * @param {number} val the value we're getting percent for
     * @return {number} the percentage value
     **/
    			 $$invalidate(20, percentOf = function (val) {
    				let perc = (val - min) / (max - min) * 100;

    				if (perc >= 100) {
    					return 100;
    				} else if (perc <= 0) {
    					return 0;
    				} else {
    					return parseFloat(perc.toFixed(precision));
    				}
    			});
    		}

    		if ($$self.$$.dirty[0] & /*values, percentOf*/ 1048577) {
    			// update the spring function so that movement can happen in the UI
    			 {
    				springPositions.set(values.map(v => percentOf(v)));
    			}
    		}
    	};

    	return [
    		values,
    		range,
    		min,
    		max,
    		step,
    		pips,
    		pipstep,
    		first,
    		last,
    		rest,
    		id,
    		prefix,
    		suffix,
    		formatter,
    		handleFormatter,
    		float,
    		vertical,
    		slider,
    		focus,
    		activeHandle,
    		percentOf,
    		$springPositions,
    		springPositions,
    		rangeStart,
    		rangeEnd,
    		sliderBlurHandle,
    		sliderFocusHandle,
    		sliderKeydown,
    		sliderInteractStart,
    		bodyInteractStart,
    		bodyInteract,
    		bodyMouseUp,
    		bodyTouchEnd,
    		bodyKeyDown,
    		precision,
    		springValues,
    		div_binding
    	];
    }

    class RangeSlider extends SvelteComponent {
    	constructor(options) {
    		super();
    		if (!document.getElementById("svelte-5rwgh7-style")) add_css$1();

    		init(
    			this,
    			options,
    			instance$1,
    			create_fragment$1,
    			safe_not_equal,
    			{
    				range: 1,
    				min: 2,
    				max: 3,
    				step: 4,
    				values: 0,
    				pips: 5,
    				pipstep: 6,
    				first: 7,
    				last: 8,
    				rest: 9,
    				id: 10,
    				prefix: 11,
    				suffix: 12,
    				formatter: 13,
    				handleFormatter: 14,
    				float: 15,
    				vertical: 16,
    				precision: 34,
    				springValues: 35
    			},
    			[-1, -1]
    		);
    	}
    }

    return RangeSlider;

})));
