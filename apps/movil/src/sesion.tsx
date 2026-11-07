/**
 * Sesión del usuario en el móvil. El token de sesión de la API se guarda en el
 * almacén seguro del teléfono (Keychain / Keystore); en la versión web, en el
 * almacenamiento local.
 */
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { api, ErrorApi, type Yo } from "./api";

const CLAVE = "ancla.sesion";

const almacen = {
  leer: () => (Platform.OS === "web" ? AsyncStorage.getItem(CLAVE) : SecureStore.getItemAsync(CLAVE)),
  guardar: (v: string) => (Platform.OS === "web" ? AsyncStorage.setItem(CLAVE, v) : SecureStore.setItemAsync(CLAVE, v)),
  borrar: () => (Platform.OS === "web" ? AsyncStorage.removeItem(CLAVE) : SecureStore.deleteItemAsync(CLAVE)),
};

interface Sesion {
  cargando: boolean;
  token: string | null;
  yo: Yo | null;
  entrar: (r: { token: string }) => Promise<void>;
  salir: () => Promise<void>;
  seguir: (ticker: string, si: boolean) => Promise<void>;
  guardarMetricas: (ids: string[]) => Promise<void>;
  borrarCuenta: () => Promise<void>;
}

const Ctx = createContext<Sesion | null>(null);

export function ProveedorSesion({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [yo, setYo] = useState<Yo | null>(null);
  const [cargando, setCargando] = useState(true);

  const cargarYo = useCallback(async (t: string) => {
    try {
      setYo(await api.yo(t));
      setToken(t);
    } catch (e) {
      if (e instanceof ErrorApi && e.codigo === 401) { await almacen.borrar(); setToken(null); setYo(null); }
    }
  }, []);

  useEffect(() => {
    almacen.leer().then(async (t) => { if (t) await cargarYo(t); }).finally(() => setCargando(false));
  }, [cargarYo]);

  const valor: Sesion = {
    cargando, token, yo,
    entrar: async (r) => { await almacen.guardar(r.token); await cargarYo(r.token); },
    salir: async () => { await almacen.borrar(); setToken(null); setYo(null); },
    seguir: async (ticker, si) => {
      if (!token || !yo) return;
      const { seguidas } = await api.seguir(token, ticker, si);
      setYo({ ...yo, seguidas });
    },
    guardarMetricas: async (ids) => {
      if (!token || !yo) return;
      setYo({ ...yo, metricasExtra: ids });
      await api.guardarMetricas(token, ids);
    },
    borrarCuenta: async () => {
      if (!token) return;
      await api.borrarCuenta(token);
      await almacen.borrar(); setToken(null); setYo(null);
    },
  };
  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}

export function useSesion(): Sesion {
  const s = useContext(Ctx);
  if (!s) throw new Error("useSesion fuera de ProveedorSesion");
  return s;
}
