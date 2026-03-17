"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { fetchCurrentUser } from "../api/auth";

export function AuthRedirect() {
  const router = useRouter();

  useEffect(() => {
    fetchCurrentUser()
      .then(() => {
        router.replace("/dashboard");
      })
      .catch(() => {
        router.replace("/login");
      });
  }, [router]);

  return <div className="loading">Loading...</div>;
}
