<script>
  import { spring } from "svelte/motion";
  import RangePips from "./RangePips.svelte";

  // range slider props
  export let range = false;
  export let pushy = false;
  export let min = 0;
  export let max = 100;
  export let step = 1;
  export let values = [(max + min) / 2];
  export let vertical = false;
  export let float = false;
  export let hover = true;

  // range pips / values props
  export let pips = false;
  export let pipstep = undefined;
  export let all = undefined;
  export let first = undefined;
  export let last = undefined;
  export let rest = undefined;

  // formatting props
  export let id = undefined;
  export let prefix = "";
  export let suffix = "";
  export let formatter = (v) => v;
  export let handleFormatter = formatter;

  // stylistic props
  export let precision = 2;
  export let springValues = { stiffness: 0.15, damping: 0.4 };

  // dom references
  let slider;

  // state management
  let focus = false;
  let handleActivated = false;
  let handlePressed = false;
  let keyboardActive = false;
  let activeHandle = values.length - 1;

  // save spring-tweened copies of the values for use
  // when changing values and animating the handle/range nicely
  let springPositions = spring(
    values.map((v) =>
      parseFloat((((v - min) / (max - min)) * 100).toFixed(precision))
    ),
    springValues
  );

  // watch the values array, and trim / clamp the values to the steps
  // and boundaries set up in the slider on change
  $: values = trimRange(values).map((v) => alignValueToStep(v));

  // update the spring function so that movement can happen in the UI
  $: {
    springPositions.set(values.map((v) => percentOf(v)));
  }

  /**
   * take in a value, and then calculate that value's percentage
   * of the overall range (min-max);
   * @param {number} val the value we're getting percent for
   * @return {number} the percentage value
   **/
  $: percentOf = function (val) {
    let perc = ((val - min) / (max - min)) * 100;
    if (perc >= 100) {
      return 100;
    } else if (perc <= 0) {
      return 0;
    } else {
      return parseFloat(perc.toFixed(precision));
    }
  };

  /**
   * clamp a value from the range so that it always
   * falls within the min/max values
   * @param {number} val the value to clamp
   * @return {number} the value after it's been clamped
   **/
  $: clampValue = function (val) {
    // return the min/max if outside of that range
    return val <= min ? min : val >= max ? max : val;
  };

  /**
   * align the value with the steps so that it
   * always sits on the closest (above/below) step
   * @param {number} val the value to align
   * @return {number} the value after it's been aligned
   **/
  $: alignValueToStep = function (val) {
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
  };

  /**
   * helper func to get the index of an element in it's DOM container
   * @param {object} el dom object reference we want the index of
   * @returns {number} the index of the input element
   **/
  function index(el) {
    if (!el) return -1;
    var i = 0;
    while ((el = el.previousElementSibling)) {
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

  /**
   * get the position (x/y) of a mouse/touch event on the screen
   * @param {event} e a mouse/touch event
   * @returns {object} position on screen (x,y)
   **/
  function eventPosition(e) {
    return vertical ? normalisedClient(e).clientY : normalisedClient(e).clientX;
  }

  /**
   * check if an element is a handle on the slider
   * @param {object} el dom object reference we want to check
   * @returns {boolean}
   **/
  function targetIsHandle(el) {
    const handles = slider.querySelectorAll(".handle");
    const isHandle = Array.prototype.includes.call(handles, el);
    const isChild = Array.prototype.some.call(handles, (e) => e.contains(el));
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
      iPos = clientPos - dims.top;
      iPercent = (iPos / dims.height) * 100;
      iVal = ((max - min) / 100) * iPercent + min;
    } else {
      iPos = clientPos - dims.left;
      iPercent = (iPos / dims.width) * 100;
      iVal = ((max - min) / 100) * iPercent + min;
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
      // if there are multiple handles, and not a range, then
      // we sort the handles values, and return the first one closest
      // to the interaction value
    } else {
      closest = values.indexOf(
        [...values].sort((a, b) => Math.abs(iVal - a) - Math.abs(iVal - b))[0]
      );
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
      iPos = clientPos - dims.top;
      iPercent = (iPos / dims.height) * 100;
      iVal = ((max - min) / 100) * iPercent + min;
    } else {
      iPos = clientPos - dims.left;
      iPercent = (iPos / dims.width) * 100;
      iVal = ((max - min) / 100) * iPercent + min;
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
    if (range) {
      // restrict the handles of a range-slider from
      // going past one-another unless "pushy" is true
      if (index === 0 && value > values[1]) {
        if (pushy) {
          values[1] = value;
        } else {
          value = values[1];
        }
      } else if (index === 1 && value < values[0]) {
        if (pushy) {
          values[0] = value;
        } else {
          value = values[0];
        }
      }
    }
    // set the value for the handle, and align/clamp it
    values[index] = value;
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
      focus = false;
      handleActivated = false;
      handlePressed = false;
    }
  }

  /**
   * when the user focusses the handle of a slider
   * set it to be active
   * @param {event} e the event from browser
   **/
  function sliderFocusHandle(e) {
    activeHandle = index(e.target);
    focus = true;
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
    focus = true;
    handleActivated = true;
    handlePressed = true;
    activeHandle = getClosestHandle(p);
    // for touch devices we want the handle to instantly
    // move to the position touched for more responsive feeling
    if (e.type === "touchstart") {
      handleInteract(p);
    }
  }

  /**
   * function to run when the user stops touching
   * down on the slider element anywhere
   * @param {event} e the event from browser
   **/
  function sliderInteractEnd(e) {
    handlePressed = false;
  }

  /**
   * unfocus the slider if the user clicked off of
   * it, somewhere else on the screen
   * @param {event} e the event from browser
   **/
  function bodyInteractStart(e) {
    keyboardActive = false;
    if (focus && e.target !== slider && !slider.contains(e.target)) {
      focus = false;
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
      focus = true;
      if (!targetIsHandle(el)) {
        handleInteract(eventPosition(e));
      }
    }
    handleActivated = false;
    handlePressed = false;
  }

  /**
   * if user triggers touchend on the body then we
   * defocus the slider completely
   * @param {event} e the event from browser
   **/
  function bodyTouchEnd(e) {
    handleActivated = false;
    handlePressed = false;
  }

  function bodyKeyDown(e) {
    if (e.target === slider || slider.contains(e.target)) {
      keyboardActive = true;
    }
  }
</script>

<style>
  :global(.rangeSlider) {
    --slider: var(--range-slider, #d7dada);
    --handle-inactive: var(--range-handle-inactive, #99a2a2);
    --handle: var(--range-handle, #838de7);
    --handle-focus: var(--range-handle-focus, #4a40d4);
    --handle-border: var(--range-handle-border, var(--handle));
    --range-inactive: var(--range-range-inactive, var(--handle-inactive));
    --range: var(--range-range, var(--handle-focus));
    --float-inactive: var(--range-float-inactive, var(--handle-inactive));
    --float: var(--range-float, var(--handle-focus));
    --float-text: var(--range-float-text, white);
  }
  :global(.rangeSlider) {
    position: relative;
    border-radius: 100px;
    height: 0.5em;
    margin: 1em;
  }
  :global(.rangeSlider, .rangeSlider *) {
    user-select: none;
  }
  :global(.rangeSlider.pips) {
    margin-bottom: 1.8em;
  }
  :global(.rangeSlider.pip-labels) {
    margin-bottom: 2.8em;
  }
  :global(.rangeSlider.vertical) {
    display: inline-block;
    border-radius: 100px;
    width: 0.5em;
    min-height: 200px;
  }
  :global(.rangeSlider.vertical.pips) {
    margin-right: 1.8em;
    margin-bottom: 1em;
  }
  :global(.rangeSlider.vertical.pip-labels) {
    margin-right: 2.8em;
    margin-bottom: 1em;
  }
  :global(.rangeSlider .rangeHandle) {
    position: absolute;
    display: block;
    height: 1.4em;
    width: 1.4em;
    top: 0.25em;
    left: 0.25em;
    transform: translateY(-50%) translateX(-50%);
    z-index: 2;
  }
  :global(.rangeSlider .rangeNub),
  :global(.rangeSlider .rangeHandle:before) {
    position: absolute;
    left: 0;
    top: 0;
    display: block;
    border-radius: 10em;
    height: 100%;
    width: 100%;
    transition: all 0.2s ease;
  }
  :global(.rangeSlider .rangeHandle:before) {
    content: "";
    left: 1px;
    top: 1px;
    bottom: 1px;
    right: 1px;
    height: auto;
    width: auto;
    box-shadow: 0 0 0 0px var(--handle-border);
    opacity: 0;
  }
  :global(.rangeSlider .rangeHandle.hoverable:hover:before) {
    box-shadow: 0 0 0 8px var(--handle-border);
    opacity: 0.2;
  }
  :global(.rangeSlider .rangeHandle.hoverable.press:before),
  :global(.rangeSlider .rangeHandle.hoverable.press:hover:before) {
    box-shadow: 0 0 0 12px var(--handle-border);
    opacity: 0.4;
  }
  :global(.rangeSlider.range:not(.min):not(.max) .rangeNub) {
    border-radius: 10em 10em 10em 1.6em;
  }
  :global(.rangeSlider.range .rangeHandle:nth-of-type(1) .rangeNub) {
    transform: rotate(-135deg);
  }
  :global(.rangeSlider.range .rangeHandle:nth-of-type(2) .rangeNub) {
    transform: rotate(45deg);
  }
  :global(.rangeSlider.range.vertical .rangeHandle:nth-of-type(1) .rangeNub) {
    transform: rotate(-45deg);
  }
  :global(.rangeSlider.range.vertical .rangeHandle:nth-of-type(2) .rangeNub) {
    transform: rotate(135deg);
  }
  :global(.rangeSlider .rangeFloat) {
    display: block;
    position: absolute;
    left: 50%;
    top: -0.5em;
    transform: translate(-50%, -100%);
    font-size: 1em;
    text-align: center;
    opacity: 0;
    pointer-events: none;
    white-space: nowrap;
    transition: all 0.2s ease;
    font-size: 0.9em;
    padding: 0.2em 0.4em;
    border-radius: 0.2em;
  }
  :global(.rangeSlider .rangeHandle.active .rangeFloat),
  :global(.rangeSlider .rangeHandle.hoverable:hover .rangeFloat) {
    opacity: 1;
    top: -0.2em;
    transform: translate(-50%, -100%);
  }
  :global(.rangeSlider .rangeBar) {
    position: absolute;
    display: block;
    transition: background 0.2s ease;
    border-radius: 1em;
    height: 0.5em;
    top: 0;
    user-select: none;
    z-index: 1;
  }
  :global(.rangeSlider.vertical .rangeBar) {
    width: 0.5em;
    height: auto;
  }
  :global(.rangeSlider) {
    background-color: #d7dada;
    background-color: var(--slider);
  }
  :global(.rangeSlider .rangeBar) {
    background-color: #99a2a2;
    background-color: var(--range-inactive);
  }
  :global(.rangeSlider.focus .rangeBar) {
    background-color: #838de7;
    background-color: var(--range);
  }
  :global(.rangeSlider .rangeNub) {
    background-color: #99a2a2;
    background-color: var(--handle-inactive);
  }
  :global(.rangeSlider.focus .rangeNub) {
    background-color: #838de7;
    background-color: var(--handle);
  }
  :global(.rangeSlider .rangeHandle.active .rangeNub) {
    background-color: #4a40d4;
    background-color: var(--handle-focus);
  }
  :global(.rangeSlider .rangeFloat) {
    color: white;
    color: var(--float-text);
    background-color: #99a2a2;
    background-color: var(--float-inactive);
  }
  :global(.rangeSlider.focus .rangeFloat) {
    background-color: #4a40d4;
    background-color: var(--float);
  }
</style>

<div
  {id}
  bind:this={slider}
  class="rangeSlider"
  class:range
  class:vertical
  class:focus
  class:min={range === 'min'}
  class:max={range === 'max'}
  class:pips
  class:pip-labels={all === 'label' || first === 'label' || last === 'label' || rest === 'label'}
  on:touchstart|preventDefault={sliderInteractStart}
  on:mousedown={sliderInteractStart}
  on:touchend|preventDefault={sliderInteractEnd}
  on:mouseup={sliderInteractEnd}
  on:touchstart
  on:mousedown
  on:touchend
  on:mouseup>
  {#each values as value, index}
    <span
      role="slider"
      tabindex="0"
      class="rangeHandle"
      class:hoverable={hover}
      class:active={focus && activeHandle === index}
      class:press={handlePressed && activeHandle === index}
      on:blur={sliderBlurHandle}
      on:focus={sliderFocusHandle}
      on:keydown={sliderKeydown}
      style="{vertical ? 'top' : 'left'}: {$springPositions[index]}%; z-index: {activeHandle === index ? 3 : 2};"
      aria-valuemin={range === true && index === 1 ? values[0] : min}
      aria-valuemax={range === true && index === 0 ? values[1] : max}
      aria-valuenow={value}
      aria-valuetext="{prefix}{handleFormatter(value)}{suffix}"
      aria-orientation={vertical ? 'vertical' : 'horizontal'}>
      <span class="rangeNub" />
      {#if float}
        <span class="rangeFloat">{prefix}{handleFormatter(value)}{suffix}</span>
      {/if}
    </span>
  {/each}
  {#if range}
    <span
      class="rangeBar"
      style="{vertical ? 'top' : 'left'}: {rangeStart($springPositions)}%; {vertical ? 'bottom' : 'right'}:
      {rangeEnd($springPositions)}%;" />
  {/if}
  {#if pips}
    <RangePips
      {values}
      {min}
      {max}
      {step}
      {range}
      {vertical}
      {all}
      {first}
      {last}
      {rest}
      {pipstep}
      {prefix}
      {suffix}
      {formatter}
      {focus}
      {percentOf} />
  {/if}
</div>

<svelte:window
  on:mousedown={bodyInteractStart}
  on:touchstart={bodyInteractStart}
  on:mousemove={bodyInteract}
  on:touchmove={bodyInteract}
  on:mouseup={bodyMouseUp}
  on:touchend={bodyTouchEnd}
  on:keydown={bodyKeyDown} />
