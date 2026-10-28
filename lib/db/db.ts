import Dexie, { type Table } from "dexie";
import { dexieStores, type Keys, type TableName, type Tables } from "./schema";

export type CueDb = Dexie & { [K in TableName]: Table<Tables[K], Keys[K]> };

function open(): CueDb {
  const d = new Dexie("cue") as CueDb;
  d.version(1).stores(dexieStores());
  return d;
}

/** The one Dexie instance. Writes are narrowed per workstream by the cue/table-writers lint rule. */
export const db: CueDb = open();
