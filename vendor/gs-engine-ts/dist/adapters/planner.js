/** Provider-independent seam. Implement this callback with your chosen LLM's JSON API.
 * Actual generation must use available capabilities and current world rules from encode().
 * This reference does not pretend a mock response is a live LLM integration. */
export class JsonPlanner {
    complete;
    encode;
    constructor(complete, encode) {
        this.complete = complete;
        this.encode = encode;
    }
    propose(context, reason, signal) {
        return this.complete(this.encode(context, reason), signal);
    }
}
