import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { api, getAccessToken, setAccessToken } from "../api";
import type { AppUser, Portal } from "../api";

interface AuthContextValue {
  user: AppUser | null;
  loading: boolean;
  login: (username: string, password: string, portal?: Portal) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(Boolean(getAccessToken()));

  useEffect(() => {
    let active = true;
    const clearExpired = () => {
      setAccessToken(null);
      setUser(null);
      setLoading(false);
    };
    window.addEventListener("auth:expired", clearExpired);
    if (getAccessToken()) {
      api.me().then((currentUser) => {
        if (active) setUser(currentUser);
      }).catch(() => {
        if (active) clearExpired();
      }).finally(() => {
        if (active) setLoading(false);
      });
    }
    return () => {
      active = false;
      window.removeEventListener("auth:expired", clearExpired);
    };
  }, []);

  useEffect(() => {
    if (!user) return;
    const timer = window.setInterval(() => {
      void api.me().catch(() => undefined);
    }, 45000);
    return () => window.clearInterval(timer);
  }, [user?.id]);

  const value = useMemo<AuthContextValue>(() => ({
    user,
    loading,
    async login(username, password, portal = "agc") {
      const result = await api.login(username, password, portal);
      setAccessToken(result.access_token);
      setUser(result.user);
    },
    async logout() {
      try { await api.logout(); } finally {
        setAccessToken(null);
        setUser(null);
      }
    },
  }), [user, loading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth musí být použit uvnitř AuthProvider.");
  return value;
}
