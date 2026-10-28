import "server-only";
import { cookies } from "next/headers";

/** The sidebar's open or collapsed choice, written by SidebarProvider; null when the student never chose. */
export async function storedSidebarOpen(): Promise<boolean | null> {
  const value = (await cookies()).get("sidebar_state")?.value;
  return value === "true" ? true : value === "false" ? false : null;
}
