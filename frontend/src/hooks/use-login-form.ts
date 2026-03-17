"use client";

import { FormEvent, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { login } from "@/api/auth";

type UseLoginFormOptions = {
  nextPath: string;
};

const REMEMBERED_EMAIL_KEY = "alfa:last-login-email";
const DEFAULT_DEV_EMAIL = "admin@alfa.local";
const DEFAULT_DEV_PASSWORD = "admin123";

export function useLoginForm({ nextPath }: UseLoginFormOptions) {
  const router = useRouter();
  const [email, setEmailState] = useState(DEFAULT_DEV_EMAIL);
  const [password, setPassword] = useState(DEFAULT_DEV_PASSWORD);
  const [error, setError] = useState("");
  const [rememberEmail, setRememberEmail] = useState(true);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const rememberedEmail = window.localStorage.getItem(REMEMBERED_EMAIL_KEY);
    if (rememberedEmail && rememberedEmail.trim() && rememberedEmail !== DEFAULT_DEV_EMAIL) {
      setEmailState(rememberedEmail);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    if (rememberEmail && email.trim()) {
      window.localStorage.setItem(REMEMBERED_EMAIL_KEY, email.trim());
      return;
    }

    window.localStorage.removeItem(REMEMBERED_EMAIL_KEY);
  }, [email, rememberEmail]);

  function setEmail(value: string) {
    setError("");
    setEmailState(value);
  }

  function updatePassword(value: string) {
    setError("");
    setPassword(value);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    startTransition(async () => {
      try {
        await login(email, password);
        router.replace(nextPath);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Login failed");
      }
    });
  }

  return {
    email,
    password,
    error,
    rememberEmail,
    isPending,
    setEmail,
    setPassword: updatePassword,
    setRememberEmail,
    handleSubmit,
  };
}
