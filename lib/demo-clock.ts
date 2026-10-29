/** localStorage key for demo mode: { offsetMs } while it runs, { exited: true } after Exit demo. */
export const DEMO_KEY = "cue.demo";

/**
 * Runs in <head> before any app code and shifts Date by the stored offset, so the scheduler, timers and stamps
 * all agree on the demo's now. It is a string because it must run before the bundle loads, and this file
 * imports nothing so the server layout can include it.
 */
export const DEMO_CLOCK_SCRIPT = `(()=>{try{const s=JSON.parse(localStorage.getItem(${JSON.stringify(DEMO_KEY)})||"null");if(!s||typeof s.offsetMs!=="number")return;const R=Date,o=s.offsetMs;function D(...a){if(!new.target)return new R(R.now()+o).toString();return Reflect.construct(R,a.length?a:[R.now()+o],new.target)}D.prototype=R.prototype;Object.setPrototypeOf(D,R);D.now=()=>R.now()+o;window.__cueRealNow=()=>R.now();window.Date=D}catch{}})();`;
