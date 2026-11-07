import { useSyncExternalStore } from "react";
import { envEngine, type EnvSnapshot } from "../envdb/env-engine";

/** Phase and generation of the background envdb session. */
export function useEnvEngine(): EnvSnapshot {
  return useSyncExternalStore(envEngine.subscribe, envEngine.getSnapshot);
}
