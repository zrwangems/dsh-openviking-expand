import { n as SourceKind } from "./kind-69_GYeNl.js";
import { Context } from "@deepseek-ai/cordis";
import { z } from "zod";
declare const ConfigSchema: z.ZodObject<{
  label: z.ZodDefault<z.ZodString>;
}, z.core.$strict>;
declare const vikaKind: SourceKind<z.infer<typeof ConfigSchema>>;
declare const name = "vika-vika";
declare const inject: string[];
declare function apply(ctx: Context): void;
export { apply, inject, name, vikaKind };