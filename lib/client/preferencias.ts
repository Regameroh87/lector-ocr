"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";

// Preferencias del usuario guardadas en el navegador (localStorage).
// Si el almacenamiento no está disponible (modo privado, bloqueado), se usa el valor por defecto.

const EVENTO = "facturas-ocr:preferencias";

function leer(clave: string): string | null {
  try {
    return window.localStorage.getItem(clave);
  } catch {
    return null;
  }
}

function suscribir(cb: () => void) {
  window.addEventListener("storage", cb);
  window.addEventListener(EVENTO, cb);
  return () => {
    window.removeEventListener("storage", cb);
    window.removeEventListener(EVENTO, cb);
  };
}

export function usePreferenciaBooleana(clave: string, porDefecto: boolean): [boolean, (v: boolean) => void] {
  const crudo = useSyncExternalStore(suscribir, () => leer(clave), () => null);
  const valor = crudo === null ? porDefecto : crudo === "1";
  const setValor = useCallback(
    (v: boolean) => {
      try {
        window.localStorage.setItem(clave, v ? "1" : "0");
      } catch {
        /* sin almacenamiento: el cambio dura hasta recargar */
      }
      window.dispatchEvent(new Event(EVENTO));
    },
    [clave],
  );
  return [valor, setValor];
}

/** Preferencia guardada como JSON. `validar` descarta lo que no tenga la forma esperada. */
export function usePreferenciaJson<T>(clave: string, porDefecto: T, validar: (x: unknown) => T): [T, (v: T) => void] {
  const crudo = useSyncExternalStore(suscribir, () => leer(clave), () => null);
  const valor = useMemo(() => {
    if (crudo === null) return porDefecto;
    try {
      return validar(JSON.parse(crudo));
    } catch {
      return porDefecto;
    }
    // porDefecto y validar se asumen estables
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [crudo]);
  const setValor = useCallback(
    (v: T) => {
      try {
        window.localStorage.setItem(clave, JSON.stringify(v));
      } catch {
        /* sin almacenamiento */
      }
      window.dispatchEvent(new Event(EVENTO));
    },
    [clave],
  );
  return [valor, setValor];
}
