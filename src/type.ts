import type { ConditionalExcept } from "type-fest";

export type PickProperties<Base> = ConditionalExcept<
  Base,
  (...args: unknown[]) => unknown
>;
