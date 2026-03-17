"use client";

import { createContext, useContext } from "react";
import type { User } from "@/types/auth";

export const AppUserContext = createContext<User | null>(null);

export function useAppUser() {
  return useContext(AppUserContext);
}
