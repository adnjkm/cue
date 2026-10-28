"use client";

import type { ReactNode } from "react";
import type { NavKey } from "@/lib/routes";

/** Badges next to nav items while something runs. Reads the database only (wired with lib/db). */
export function useLiveBadges(): Partial<Record<NavKey, ReactNode>> {
  return {};
}
