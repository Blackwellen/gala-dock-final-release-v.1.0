"use client";

import { useSyncExternalStore } from "react";

const noop = () => () => {};
/** True after hydration on the client, false during SSR and the hydrating render — without setState-in-effect. */
export const useHydrated = () => useSyncExternalStore(noop, () => true, () => false);
