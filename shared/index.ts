import { z } from "zod";

// Official contract ids: "N-0117" (node), "S-0089" (survivor), "C-0042" (street).
export const NodoIdSchema = z.string().regex(/^N-\d{4}$/);
export const SobrevivienteIdSchema = z.string().regex(/^S-\d{4}$/);
export const CalleIdSchema = z.string().regex(/^C-\d{4}$/);

// POST /paso — body and response exactly as the official contract (AGENTS.md section 5).
export const PasoInputSchema = z.object({
  sobrevivienteId: SobrevivienteIdSchema,
  nodoActual: NodoIdSchema,
  turno: z.number().int().nonnegative(),
});

export const PasoOutputSchema = z.object({
  siguienteNodo: NodoIdSchema,
});

export type PasoInput = z.infer<typeof PasoInputSchema>;
export type PasoOutput = z.infer<typeof PasoOutputSchema>;
