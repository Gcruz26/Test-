"use client";

import { useEffect, useState } from "react";

const sidebarCollapsedStorageKey = "alfa-sidebar-collapsed";

function readStoredValue() {
  try {
    if (typeof window === "undefined") {
      return false;
    }

    return window.localStorage.getItem(sidebarCollapsedStorageKey) === "true";
  } catch {
    return false;
  }
}

export function useSidebarCollapse() {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    setIsCollapsed(readStoredValue());
    setIsHydrated(true);
  }, []);

  useEffect(() => {
    if (!isHydrated) {
      return;
    }

    try {
      window.localStorage.setItem(sidebarCollapsedStorageKey, String(isCollapsed));
    } catch {
      // Ignore storage failures and keep the UI interactive.
    }
  }, [isCollapsed, isHydrated]);

  return { isCollapsed, setIsCollapsed };
}
