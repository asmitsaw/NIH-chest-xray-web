import { createContext, useContext, useState } from 'react';
import { api, session } from './api';
const Ctx = createContext(null);
export const useAuth = () => useContext(Ctx);
export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => session.get()?.user || null);
  const login = async (u, p) => { const r = await api.login(u, p); session.set(r); setUser(r.user); };
  const logout = () => { session.clear(); setUser(null); };
  return <Ctx.Provider value={{ user, login, logout }}>{children}</Ctx.Provider>;
}
