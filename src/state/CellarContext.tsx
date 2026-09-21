import { createContext, useContext, useEffect, useMemo, useReducer } from "react";
import type { ReactNode } from "react";
import type { CellarState } from "../data/types";
import { cellarReducer, loadState, saveState, type CellarAction } from "./store";

// ============ 状态层：React 上下文，刷新后从 localStorage 恢复 ============

interface CellarContextValue {
  state: CellarState;
  dispatch: React.Dispatch<CellarAction>;
}

const CellarContext = createContext<CellarContextValue | null>(null);

export function CellarProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(cellarReducer, undefined, loadState);

  // 每次状态变更都落盘；刷新后酒款、批次与版本链保持一致
  useEffect(() => {
    saveState(state);
  }, [state]);

  const value = useMemo(() => ({ state, dispatch }), [state]);
  return <CellarContext.Provider value={value}>{children}</CellarContext.Provider>;
}

export function useCellar(): CellarContextValue {
  const ctx = useContext(CellarContext);
  if (!ctx) throw new Error("useCellar 必须在 CellarProvider 内使用");
  return ctx;
}
