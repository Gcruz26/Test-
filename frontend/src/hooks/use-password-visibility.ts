"use client";

import { useState } from "react";

export function usePasswordVisibility() {
  const [isVisible, setIsVisible] = useState(false);

  function toggleVisibility() {
    setIsVisible((current) => !current);
  }

  return {
    isVisible,
    inputType: isVisible ? "text" : "password",
    toggleVisibility,
  };
}
