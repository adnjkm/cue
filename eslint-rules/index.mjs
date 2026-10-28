import prefsOwner from "./prefs-owner.mjs";
import tableWriters from "./table-writers.mjs";

const plugin = { rules: { "table-writers": tableWriters, "prefs-owner": prefsOwner } };
export default plugin;
