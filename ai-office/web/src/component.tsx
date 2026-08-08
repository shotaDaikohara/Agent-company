import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
// ドット絵素材（CC0, 2dPig "Pixel Office"）。esbuildのdataurlローダーでバンドルへ直接埋め込む
// （UIはMCP ResourceとしてHTML文字列1本を返す構成のため、別ファイル配信ができない）。
import charManager from "./assets/char_manager.png";
import charResearch from "./assets/char_research.png";
import charCreate from "./assets/char_create.png";
import charReview from "./assets/char_review.png";

const css = `
:root { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; color: #17202a; }
* { box-sizing: border-box; }
body { margin: 0; background: #efe8d7; }
button { font: inherit; }
.office-shell { min-height: 620px; padding: 14px; background: #d8caa9; }
.topbar { display:flex; justify-content:space-between; align-items:center; padding:10px 14px; background:#2f3b35; color:#fff9e8; border:4px solid #17211d; box-shadow:4px 4px 0 #6e624a; }
.brand { font-size:22px; font-weight:800; letter-spacing:1px; }
.metrics { font-size:12px; opacity:.9; }
.main { display:grid; grid-template-columns: 3fr 2fr; gap:12px; margin-top:12px; }
.pixel-panel { background:#f7f0dd; border:4px solid #6c5b3f; box-shadow:4px 4px 0 #8f7a58; }
.map { min-height:430px; padding:12px; position:relative; background-image: linear-gradient(#d9c69f 1px, transparent 1px), linear-gradient(90deg,#d9c69f 1px,transparent 1px); background-size:24px 24px; }
.room-grid { display:grid; grid-template-columns: 1fr 1fr; grid-template-rows:1fr 1fr; gap:10px; height:100%; }
.room { min-height:180px; border:3px solid #856f4e; background:rgba(255,250,230,.78); padding:10px; position:relative; }
.room h3 { margin:0; font-size:13px; background:#6c5b3f; color:white; display:inline-block; padding:3px 7px; }
.desk { position:absolute; width:76px; height:38px; border:3px solid #5c4932; background:#a98255; bottom:26px; left:50%; transform:translateX(-50%); }
.avatar { position:absolute; left:50%; bottom:26px; transform:translateX(-50%); height:64px; width:auto; image-rendering:pixelated; filter:drop-shadow(2px 3px 0 rgba(0,0,0,.25)); }
.avatar.idle { opacity:.55; filter:drop-shadow(2px 3px 0 rgba(0,0,0,.25)) grayscale(.4); }
.avatar.working { animation:bob .7s steps(2,end) infinite; }
@keyframes bob { 50% { transform:translate(-50%,-3px); } }
.status-chip { position:absolute; right:7px; top:7px; font-size:10px; padding:2px 5px; border:2px solid #514733; background:#fff8db; }
.status-chip.wait { background:#ffe09b; } .status-chip.done { background:#c8e6c9; } .status-chip.error { background:#ffc7bd; }
.task-label { position:absolute; left:8px; bottom:5px; right:8px; font-size:10px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.detail { padding:14px; min-height:430px; }
.detail h2 { margin:0 0 8px; font-size:18px; }
.meta { display:flex; gap:6px; flex-wrap:wrap; margin-bottom:10px; }
.badge { border:2px solid #76664a; padding:2px 6px; background:#fff; font-size:11px; }
.progress { height:14px; border:2px solid #6c5b3f; background:#e1d6bc; margin:8px 0 14px; }
.progress > span { display:block; height:100%; background:#5c8c68; }
.subtasks { display:flex; flex-direction:column; gap:6px; max-height:210px; overflow:auto; }
.subtask { padding:7px; border:2px solid #aa9671; background:#fffaf0; font-size:11px; }
.actions { margin-top:12px; display:flex; gap:7px; flex-wrap:wrap; }
.actions button { border:3px solid #4f493b; background:#fff3c4; padding:6px 8px; cursor:pointer; box-shadow:2px 2px 0 #8b7a5d; }
.actions button.danger { background:#ffd0c8; }
.jobbar { margin-top:12px; display:flex; gap:8px; overflow:auto; padding:9px; }
.jobcard { min-width:210px; padding:8px; border:3px solid #716044; background:#fff9e9; cursor:pointer; }
.jobcard.selected { outline:4px solid #526d82; }
.jobtitle { font-weight:800; font-size:12px; }
.jobmeta { font-size:10px; margin-top:4px; opacity:.8; }
.empty { padding:30px; text-align:center; }
.note { font-size:10px; opacity:.65; margin-top:8px; }
@media (max-width: 760px) { .main { grid-template-columns:1fr; } .room { min-height:150px; } }
`;

type DashboardJob = {
  id:string; title:string; goal:string; priority:"HIGH"|"NORMAL"|"LOW"; status:string;
  currentStep:string|null; waitingReason:string|null; completedCount:number; totalCount:number; updatedAt:string;
};
type Subtask = { id:string; type:"RESEARCH"|"CREATE"|"REVIEW"|"ACTION"; instruction:string; status:string; output:string|null; planVersion:number };
type JobContext = { job:any; currentSubtasks:Subtask[]; reusedSubtasks:Subtask[]; recentEvents:any[] };
type DashboardPayload = { dashboard:DashboardJob[]; selected:JobContext|null };

declare global { interface Window { openai?: any } }

function useInitialToolResult(): DashboardPayload {
  const initial = window.openai?.toolOutput?.structuredContent ?? window.openai?.toolOutput ?? {};
  const [payload, setPayload] = useState<DashboardPayload>({ dashboard: initial.dashboard ?? [], selected: initial.selected ?? null });
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.source !== window.parent) return;
      const msg = event.data;
      if (!msg || msg.jsonrpc !== "2.0" || msg.method !== "ui/notifications/tool-result") return;
      const sc = msg.params?.structuredContent;
      if (sc?.dashboard) setPayload({ dashboard: sc.dashboard, selected: sc.selected ?? null });
    };
    window.addEventListener("message", onMessage, { passive:true });
    return () => window.removeEventListener("message", onMessage);
  }, []);
  return payload;
}

let nextRequestId = 1;
const pendingRequests = new Map<number, { resolve:(value:any)=>void; reject:(reason:any)=>void }>();
window.addEventListener("message", (event: MessageEvent) => {
  if (event.source !== window.parent) return;
  const message = event.data;
  if (!message || message.jsonrpc !== "2.0" || message.id === undefined) return;
  const pending = pendingRequests.get(message.id);
  if (!pending) return;
  pendingRequests.delete(message.id);
  if (message.error) pending.reject(message.error);
  else pending.resolve(message.result);
}, { passive:true });

function requestHost(method:string, params:Record<string,unknown>) {
  const id = nextRequestId++;
  window.parent.postMessage({ jsonrpc:"2.0", id, method, params }, "*");
  return new Promise<any>((resolve,reject) => pendingRequests.set(id,{resolve,reject}));
}

async function callTool(name:string, args:Record<string,unknown>) {
  return requestHost("tools/call", { name, arguments: args });
}

const SPRITE_BY_TYPE: Record<string, string> = {
  MANAGER: charManager,
  RESEARCH: charResearch,
  CREATE: charCreate,
  REVIEW: charReview,
};

function avatarClass(status:string) {
  if (status === "IN_PROGRESS") return "avatar working";
  if (status === "TODO") return "avatar idle";
  return "avatar";
}
function chipClass(status:string) {
  if (status === "WAITING_USER") return "status-chip wait";
  if (status === "DONE") return "status-chip done";
  if (status === "FAILED") return "status-chip error";
  return "status-chip";
}

function Room({ title, type, task }:{title:string; type:string; task?:Subtask}) {
  const status = task?.status ?? "TODO";
  return <div className="room">
    <h3>{title}</h3>
    <span className={chipClass(status)}>{status}</span>
    <img className={avatarClass(status)} src={SPRITE_BY_TYPE[type]} alt="" />
    <div className="desk"/>
    <div className="task-label">{task?.instruction ?? "待機"}</div>
  </div>;
}

function App() {
  const initial = useInitialToolResult();
  const [dashboard,setDashboard] = useState(initial.dashboard);
  const [selected,setSelected] = useState<JobContext|null>(initial.selected);
  const selectedId = selected?.job?.id ?? dashboard[0]?.id;
  useEffect(() => { setDashboard(initial.dashboard); setSelected(initial.selected); }, [initial]);

  async function selectJob(jobId:string) {
    const result = await callTool("get_job", { jobId });
    const context = result?.structuredContent?.context;
    if (context) {
      setSelected(context);
      window.openai?.setWidgetState?.({ selectedJobId: jobId });
    }
  }
  async function refresh() {
    const result = await callTool("get_dashboard", {});
    const nextDashboard = result?.structuredContent?.dashboard ?? [];
    setDashboard(nextDashboard);
    const targetId = selectedId ?? nextDashboard[0]?.id;
    if (targetId) await selectJob(targetId);
    else setSelected(null);
  }
  async function changePriority(priority:"HIGH"|"NORMAL"|"LOW") {
    if (!selectedId) return;
    const result = await callTool("change_priority", { jobId:selectedId, priority });
    if (result?.structuredContent?.dashboard) setDashboard(result.structuredContent.dashboard);
    if (result?.structuredContent?.context) setSelected(result.structuredContent.context);
  }
  async function cancelSelected() {
    if (!selectedId) return;
    if (!window.confirm("この案件を中止します。履歴は保持されます。よろしいですか？")) return;
    const result = await callTool("cancel_job", { jobId:selectedId });
    if (result?.structuredContent?.dashboard) setDashboard(result.structuredContent.dashboard);
    if (result?.structuredContent?.context) setSelected(result.structuredContent.context);
  }

  const tasks = selected?.currentSubtasks ?? [];
  const byType = useMemo(() => {
    const rank = (status:string) => status === "IN_PROGRESS" ? 0 : status === "WAITING_USER" ? 1 : status === "TODO" ? 2 : status === "FAILED" ? 3 : status === "DONE" ? 4 : 5;
    const result:Record<string,Subtask> = {};
    for (const task of [...tasks].sort((a,b) => rank(a.status) - rank(b.status))) {
      if (!result[task.type]) result[task.type] = task;
    }
    return result;
  }, [tasks]);
  const job = selected?.job;
  const pct = tasks.length ? Math.round(tasks.filter((t) => t.status === "DONE").length / tasks.length * 100) : 0;

  return <><style>{css}</style><div className="office-shell">
    <div className="topbar"><div className="brand">AI OFFICE</div><div className="metrics">案件 {dashboard.length} / 独自LLM API: なし</div></div>
    <div className="main">
      <div className="pixel-panel map"><div className="room-grid">
        <Room title="部長室" type="MANAGER" task={tasks.find((t) => t.status === "WAITING_USER")}/>
        <Room title="調査席" type="RESEARCH" task={byType.RESEARCH}/>
        <Room title="企画席" type="CREATE" task={byType.CREATE}/>
        <Room title="レビュー席" type="REVIEW" task={byType.REVIEW}/>
      </div></div>
      <div className="pixel-panel detail">
        {!job ? <div className="empty">まだ案件がありません。ChatGPTに仕事を依頼してください。</div> : <>
          <h2>{job.title}</h2>
          <div className="meta"><span className="badge">{job.status}</span><span className="badge">優先度 {job.priority}</span><span className="badge">PLAN v{job.planVersion}</span></div>
          <div><b>目的</b><br/>{job.goal}</div>
          <div className="progress"><span style={{width:`${pct}%`}}/></div>
          <div className="subtasks">{tasks.map((t) => <div className="subtask" key={t.id}><b>{t.type}</b> · {t.status}<br/>{t.instruction}{t.output ? <><br/><small>成果: {t.output}</small></> : null}</div>)}</div>
          <div className="actions"><button onClick={refresh}>更新</button><button onClick={() => changePriority("HIGH")}>最優先</button><button onClick={() => changePriority("NORMAL")}>通常</button><button onClick={() => changePriority("LOW")}>低</button><button className="danger" onClick={cancelSelected}>案件を中止</button></div>
          <div className="note">社員キャラクターは独立AIではなく、ChatGPTが担当する作業工程の可視化です。IN_PROGRESSは案件の進行状態であり、バックグラウンド計算の継続を意味しません。</div>
        </>}
      </div>
    </div>
    <div className="pixel-panel jobbar">{dashboard.map((j) => <div key={j.id} className={`jobcard ${j.id===selectedId?"selected":""}`} onClick={() => selectJob(j.id)}><div className="jobtitle">{j.title}</div><div className="jobmeta">{j.status} · {j.priority} · {j.completedCount}/{j.totalCount}<br/>{j.currentStep ?? "次の処理なし"}</div></div>)}</div>
  </div></>;
}

createRoot(document.getElementById("root")!).render(<App/>);
