import { useSyncExternalStore } from "react";
import { Store } from "../data/store";

/** 页面层唯一的 store 实例（localStorage 持久化） */
export const store = new Store();

export function useAppState() {
  return useSyncExternalStore(
    (onChange) => store.subscribe(onChange),
    () => store.getState()
  );
}
