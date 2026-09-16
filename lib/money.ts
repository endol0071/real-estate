import { z } from "zod";
export const MoneyUnitSchema = z.enum(["원", "만원", "억원"]);
export function toEok(value: number, unit: z.infer<typeof MoneyUnitSchema>): number {
  if (!Number.isFinite(value) || value <= 0) throw new Error("Invalid monetary value");
  return Number((value / ({ 원: 100000000, 만원: 10000, 억원: 1 }[unit])).toFixed(8));
}
