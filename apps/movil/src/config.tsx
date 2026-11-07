/**
 * Preferencias del usuario en el móvil (tema, acento, divisa y uso anónimo), guardadas en
 * el dispositivo. La divisa se aplica a todos los montos con `establecerDivisa`.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useColorScheme } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  ACENTOS, CLAVE_PREFERENCIAS, leerPreferencias, PREFERENCIAS_POR_DEFECTO, type Preferencias,
} from "@ancla/valoracion/apariencia";
import { divisa, establecerDivisa } from "@ancla/valoracion/formato";
import { api, type Divisas } from "./api";
import { claro, oscuro, type Tema } from "./tema";

const CLAVE_SESION_ANONIMA = "apj.sesionAnonima";

interface Config {
  pref: Preferencias;
  cambiar: (p: Partial<Preferencias>) => void;
  tema: Tema;
  divisas: Divisas | null;
  /** Cambia cuando cambia la divisa: sirve de `key` para volver a pintar los montos. */
  version: string;
  /** Anota que se vio una empresa (si el usuario no lo desactivó). */
  registrarVista: (ticker: string) => void;
}

const Ctx = createContext<Config | null>(null);

function idAleatorio(): string {
  const c = globalThis.crypto as Crypto | undefined;
  if (c?.randomUUID) return c.randomUUID();
  return "s-" + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function ProveedorConfig({ children }: { children: ReactNode }) {
  const sistema = useColorScheme();
  const [pref, setPref] = useState<Preferencias>(PREFERENCIAS_POR_DEFECTO);
  const [divisas, setDivisas] = useState<Divisas | null>(null);
  const [sesion, setSesion] = useState<string | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(CLAVE_PREFERENCIAS).then((t) => setPref(leerPreferencias(t))).catch(() => {});
    AsyncStorage.getItem(CLAVE_SESION_ANONIMA).then(async (s) => {
      const id = s ?? idAleatorio();
      if (!s) await AsyncStorage.setItem(CLAVE_SESION_ANONIMA, id);
      setSesion(id);
    }).catch(() => {});
    api.divisas().then(setDivisas).catch(() => {});
  }, []);

  const d = divisa(pref.divisa, divisas?.tasas);
  establecerDivisa(d); // antes de pintar: los hijos formatean con esta divisa

  const cambiar = useCallback((p: Partial<Preferencias>) => {
    setPref((prev) => {
      const nuevo = { ...prev, ...p };
      AsyncStorage.setItem(CLAVE_PREFERENCIAS, JSON.stringify(nuevo)).catch(() => {});
      return nuevo;
    });
  }, []);

  const tema = useMemo<Tema>(() => {
    const modo = pref.tema === "sistema" ? (sistema === "dark" ? "oscuro" : "claro") : pref.tema;
    const a = ACENTOS[pref.acento];
    return modo === "oscuro" ? { ...oscuro, ...a.oscuro } : { ...claro, ...a.claro };
  }, [pref.tema, pref.acento, sistema]);

  const registrarVista = useCallback((ticker: string) => {
    if (pref.analitica && sesion) api.evento("vista", ticker, sesion).catch(() => {});
  }, [pref.analitica, sesion]);

  return (
    <Ctx.Provider value={{ pref, cambiar, tema, divisas, version: `${d.codigo}:${d.porUsd}`, registrarVista }}>
      {children}
    </Ctx.Provider>
  );
}

export function useConfig(): Config {
  const c = useContext(Ctx);
  if (!c) throw new Error("useConfig fuera de ProveedorConfig");
  return c;
}
