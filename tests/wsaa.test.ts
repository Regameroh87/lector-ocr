import { beforeEach, describe, expect, it } from "vitest";
import { _olvidarTickets, conseguirTicket, type AlmacenTickets, type TicketAcceso } from "../lib/arca/wsaa";

const ticket = (horas = 10, token = "t"): TicketAcceso => ({ token, sign: "s", expira: new Date(Date.now() + horas * 3600_000).toISOString() });

function almacen(inicial: Record<string, TicketAcceso> = {}): AlmacenTickets & { datos: Record<string, TicketAcceso> } {
  const datos = { ...inicial };
  return {
    datos,
    leer: async (k) => datos[k] ?? null,
    guardar: async (k, ta) => {
      datos[k] = ta;
    },
  };
}

const sinEspera = async () => {};

beforeEach(() => _olvidarTickets());

describe("conseguirTicket", () => {
  it("usa el ticket compartido sin pedir uno nuevo a ARCA", async () => {
    let logins = 0;
    const neon = almacen({ k: ticket(5, "compartido") });
    const ta = await conseguirTicket("k", { almacenes: [neon], login: async () => (logins++, ticket()) });
    expect(ta.token).toBe("compartido");
    expect(logins).toBe(0);
  });

  it("pide uno solo aunque lleguen varias facturas a la vez, y lo guarda para las otras instancias", async () => {
    let logins = 0;
    const neon = almacen();
    const login = async () => {
      logins++;
      await new Promise((ok) => setTimeout(ok, 10));
      return ticket(12, "nuevo");
    };
    const r = await Promise.all(Array.from({ length: 5 }, () => conseguirTicket("k", { almacenes: [neon], login })));
    expect(logins).toBe(1);
    expect(r.every((t) => t.token === "nuevo")).toBe(true);
    expect(neon.datos.k.token).toBe("nuevo");
  });

  it("ignora tickets por vencer y pide otro", async () => {
    const neon = almacen({ k: ticket(0.05, "viejo") }); // vence en 3 minutos
    const ta = await conseguirTicket("k", { almacenes: [neon], login: async () => ticket(12, "nuevo") });
    expect(ta.token).toBe("nuevo");
  });

  it("si ARCA dice que ya entregó uno, espera a que otra instancia lo guarde", async () => {
    const neon = almacen();
    let esperas = 0;
    const ta = await conseguirTicket("k", {
      almacenes: [neon],
      login: async () => {
        throw new Error("WSAA rechazó el login: El CEE ya posee un TA valido para el acceso al WSN solicitado");
      },
      esperar: async () => {
        if (++esperas === 2) neon.datos.k = ticket(12, "de-otra-instancia");
      },
    });
    expect(ta.token).toBe("de-otra-instancia");
  });

  it("explica el error si el ticket nunca aparece", async () => {
    const pedido = conseguirTicket("k", {
      almacenes: [almacen()],
      login: async () => {
        throw new Error("El CEE ya posee un TA valido");
      },
      esperar: sinEspera,
    });
    await expect(pedido).rejects.toThrow(/12 horas/);
  });

  it("si el almacén compartido falla, sigue funcionando", async () => {
    const roto: AlmacenTickets = {
      leer: async () => {
        throw new Error("sin base");
      },
      guardar: async () => {
        throw new Error("sin base");
      },
    };
    const ta = await conseguirTicket("k", { almacenes: [roto], login: async () => ticket(12, "nuevo") });
    expect(ta.token).toBe("nuevo");
  });
});
