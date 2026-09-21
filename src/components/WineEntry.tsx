import { useState } from "react";
import type { WineSnapshot } from "../data/types";
import { validateWine } from "../domain/validation";
import { useCellar } from "../state/CellarContext";
import { WineForm } from "./WineForm";

// ============ 页面层：酒款录入 ============

export function WineEntry() {
  const { dispatch } = useCellar();
  const [message, setMessage] = useState<{ kind: "ok" | "block"; text: string } | null>(null);

  const handleAdd = (snapshot: WineSnapshot) => {
    const r = validateWine({ ...snapshot, id: "__new__" });
    dispatch({ type: "ADD_WINE", draft: snapshot });
    setMessage(
      r.ok
        ? { kind: "ok", text: "核验通过：酒款已建档并进入训练池，可被新批次抽取。" }
        : {
            kind: "block",
            text: `已存为待核资料：触发 ${r.conflicts.length} 条入训规则，修正前不会进入训练池。详见冲突清单。`,
          },
    );
  };

  return (
    <section className="panel">
      <div className="section-heading">
        <div>
          <p>资料录入</p>
          <h2>新酒款建档</h2>
        </div>
        <span className="rule-badge">入训前自动核验三规则</span>
      </div>
      <p className="panel-hint">
        录入时绑定<b>产区</b>（自动绑定法定品种表）、<b>法定品种</b>、<b>年份</b>与<b>适饮区间</b>。
        品种不符法定产区、年份早于灌装、适饮区间倒置的酒款可存为待核资料，但<b>不得进入训练</b>。
      </p>
      <WineForm submitLabel="录入酒款" onSubmit={handleAdd} />
      {message && (
        <p className={message.kind === "ok" ? "save-ok" : "save-block"} onClick={() => setMessage(null)}>
          {message.text}（点击关闭）
        </p>
      )}
    </section>
  );
}
