"use client";

import React, { createContext, useContext, useState, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";

export interface UserProfile {
  id: string;
  email: string;
  full_name: string;
  role: "superadmin" | "admin" | "agent";
  is_active: boolean;
  last_login_at?: string;
}

interface AuthContextType {
  user: UserProfile | null;
  token: string | null;
  isLoading: boolean;
  login: (email: string, pass: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
  refreshUser: () => Promise<void>;
  isSuperadmin: boolean;
  isAdmin: boolean;
  isAgent: boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  token: null,
  isLoading: true,
  login: async () => ({ success: false }),
  logout: () => {},
  refreshUser: async () => {},
  isSuperadmin: false,
  isAdmin: false,
  isAgent: false
});

const getApiBase = () => {
  if (typeof window !== "undefined") {
    if (process.env.NEXT_PUBLIC_API_URL) return process.env.NEXT_PUBLIC_API_URL;
    if (window.location.port === "3000") {
      return `${window.location.protocol}//${window.location.hostname}:8000/api`;
    }
    return `${window.location.origin}/api`;
  }
  return process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000/api";
};

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    // Read token on initial load
    try {
      const storedToken = localStorage.getItem("smartflo_token");
      if (storedToken) {
        setToken(storedToken);
        verifyAndFetchUser(storedToken);
        return;
      }
    } catch {}
    setIsLoading(false);
  }, []);

  useEffect(() => {
    if (!isLoading) {
      if (!user && pathname !== "/login") {
        router.push("/login");
      } else if (user && pathname === "/login") {
        router.push("/");
      }
    }
  }, [user, isLoading, pathname]);

  const verifyAndFetchUser = async (authToken: string) => {
    try {
      const apiBase = getApiBase();
      const res = await fetch(`${apiBase}/auth/me`, {
        headers: {
          Authorization: `Bearer ${authToken}`
        }
      });
      if (res.ok) {
        const data = await res.json();
        setUser(data.user);
      } else {
        // Token expired or invalid
        logout();
      }
    } catch {
      // Offline fallback: keep token but set loading false
    } finally {
      setIsLoading(false);
    }
  };

  const login = async (email: string, pass: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const apiBase = getApiBase();
      const res = await fetch(`${apiBase}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password: pass })
      });
      const data = await res.json();
      if (res.ok && data.success && data.access_token) {
        setToken(data.access_token);
        setUser(data.user);
        try {
          localStorage.setItem("smartflo_token", data.access_token);
          document.cookie = `smartflo_token=${data.access_token}; path=/; max-age=604800; SameSite=Lax`;
        } catch {}
        router.push("/");
        return { success: true };
      }
      return { success: false, error: data.detail || "Invalid login credentials." };
    } catch (err: any) {
      return { success: false, error: err?.message || "Connection error to authentication server." };
    }
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    try {
      localStorage.removeItem("smartflo_token");
      document.cookie = "smartflo_token=; path=/; max-age=0";
    } catch {}
    router.push("/login");
  };

  const refreshUser = async () => {
    if (token) {
      await verifyAndFetchUser(token);
    }
  };

  const isSuperadmin = user?.role === "superadmin";
  const isAdmin = user?.role === "admin" || isSuperadmin;
  const isAgent = user?.role === "agent";

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isLoading,
        login,
        logout,
        refreshUser,
        isSuperadmin,
        isAdmin,
        isAgent
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
