"use client";

import { KeyboardEvent, useState } from "react";

export function useCapsLock() {
  const [isCapsLockOn, setIsCapsLockOn] = useState(false);

  function updateCapsLock(event: KeyboardEvent<HTMLInputElement>) {
    setIsCapsLockOn(event.getModifierState("CapsLock"));
  }

  function resetCapsLock() {
    setIsCapsLockOn(false);
  }

  return {
    isCapsLockOn,
    updateCapsLock,
    resetCapsLock,
  };
}
