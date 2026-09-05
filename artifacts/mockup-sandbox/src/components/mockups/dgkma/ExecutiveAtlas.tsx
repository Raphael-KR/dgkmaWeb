import { useMemo, useState } from "react";

type Member = {
  name: string;
  role: string;
  generation: string;
  branch: string;
  initials: string;
  tone: string;
  contact: string;
};

const members: Member[] = [
  { name: "최윤용", role: "회장", generation: "22기", branch: "서울", initials: "최윤", tone: "#d96b43", contact: "서울 마포구" },
  { name: "정수아", role: "이사", generation: "22기", branch: "경기", initials: "정수", tone: "#587f77", contact: "경기 성남시" },
  { name: "전가윤", role: "이사", generation: "21기", branch: "서울", initials: "전가", tone: "#b58a48", contact: "서울 서초구" },
  { name: "이상운", role: "감사", generation: "20기", branch: "부산", initials: "이상", tone: "#6b6a87", contact: "부산 해운대구" },
  { name: "오창영", role: "감사", generation: "19기", branch: "서울", initials: "오창", tone: "#7a8b63", contact: "서울 성동구" },
  { name: "김효정", role: "이사", generation: "18기", branch: "대전", initials: "김효", tone: "#ba6a78", contact: "대전 유성구" },
];

function SearchIcon() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></svg>;
}

function CloseIcon() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m6 6 12 12M18 6 6 18" /></svg>;
}

export default function ExecutiveAtlas() {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("전체");
  const [selected, setSelected] = useState<Member | null>(null);
  const [saved, setSaved] = useState<string[]>([]);
  const [notice, setNotice] = useState("");

  const filtered = useMemo(() => members.filter((member) => {
    const matchesFilter = filter === "전체" || member.branch === filter || member.generation === filter;
    const matchesQuery = `${member.name}${member.role}${member.branch}${member.generation}`.includes(query);
    return matchesFilter && matchesQuery;
  }), [filter, query]);

  const toggleSaved = (name: string) => {
    setSaved((current) => current.includes(name) ? current.filter((item) => item !== name) : [...current, name]);
    setNotice(saved.includes(name) ? "즐겨찾기에서 삭제했어요" : "내 연락처에 저장했어요");
    window.setTimeout(() => setNotice(""), 1800);
  };

  return (
    <div className="atlas-shell">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Noto+Sans+KR:wght@400;500;700&display=swap');
        .atlas-shell { min-height:100vh; background:#f7f3ed; color:#282622; font-family:'Noto Sans KR','DM Sans',sans-serif; }
        .atlas-top { background:#173f3b; color:#f9f3e8; padding:30px clamp(22px,4vw,58px) 28px; }
        .atlas-nav { display:flex; align-items:center; justify-content:space-between; max-width:1180px; margin:auto; }
        .atlas-brand { letter-spacing:.18em; font-size:12px; font-weight:700; }
        .atlas-mark { width:34px; height:34px; border:1px solid #c8a96b; display:grid; place-items:center; color:#d8b56b; font-family:Georgia,serif; font-size:18px; }
        .atlas-kicker { max-width:1180px; margin:62px auto 0; color:#d3ad62; font-size:11px; letter-spacing:.22em; font-weight:700; }
        .atlas-heading { max-width:1180px; margin:12px auto 0; font-family:Georgia,'Times New Roman',serif; font-weight:400; font-size:clamp(34px,5vw,62px); line-height:1.05; letter-spacing:-.045em; }
        .atlas-sub { max-width:1180px; margin:16px auto 0; color:#bdd0c6; font-size:14px; }
        .atlas-content { max-width:1180px; margin:0 auto; padding:26px clamp(22px,4vw,58px) 70px; }
        .atlas-command { display:flex; gap:12px; align-items:center; flex-wrap:wrap; margin-bottom:26px; }
        .atlas-search { background:#fffaf3; border:1px solid #dfd6c8; height:48px; border-radius:3px; display:flex; align-items:center; gap:10px; padding:0 15px; color:#82796f; flex:1 1 250px; min-width:180px; }
        .atlas-search input { border:0; background:transparent; outline:0; width:100%; font:inherit; color:#282622; font-size:14px; }
        .atlas-filters { display:flex; gap:7px; overflow:auto; padding-bottom:2px; }
        .atlas-filter { white-space:nowrap; border:1px solid #d8cec0; background:transparent; color:#655e55; border-radius:20px; padding:10px 14px; font-size:12px; cursor:pointer; }
        .atlas-filter.active { background:#c89442; border-color:#c89442; color:#fffaf3; }
        .atlas-meta { display:flex; justify-content:space-between; align-items:end; margin:18px 0 12px; }
        .atlas-meta strong { font-size:17px; font-weight:700; }
        .atlas-meta span { font-size:11px; color:#968d83; }
        .atlas-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:10px; }
        .atlas-card { position:relative; background:#fffaf3; border:1px solid #e2d8ca; padding:18px; min-height:180px; cursor:pointer; transition:transform .2s ease, border-color .2s ease; }
        .atlas-card:hover { transform:translateY(-3px); border-color:#c89442; }
        .atlas-card-top { display:flex; justify-content:space-between; align-items:start; }
        .atlas-avatar { width:54px; height:54px; display:grid; place-items:center; color:#fffaf3; font-weight:700; font-size:13px; border-radius:50%; }
        .atlas-save { border:0; background:transparent; padding:2px; color:#ad9f90; cursor:pointer; font-size:18px; }
        .atlas-save.on { color:#c89442; }
        .atlas-name { font-size:16px; font-weight:700; margin:19px 0 3px; }
        .atlas-role { color:#b66f39; font-size:12px; }
        .atlas-tags { display:flex; gap:6px; margin-top:16px; }
        .atlas-tag { font-size:10px; color:#81786e; background:#f1e9dd; padding:4px 7px; }
        .atlas-aside { margin-top:34px; border-top:1px solid #ded4c5; padding-top:17px; display:flex; justify-content:space-between; gap:20px; }
        .atlas-aside-label { font-size:11px; color:#a09689; letter-spacing:.06em; }
        .atlas-aside-copy { margin-top:6px; font-family:Georgia,serif; font-size:23px; color:#3d3933; }
        .atlas-aside button { align-self:center; border:1px solid #c89442; background:transparent; color:#a26f27; padding:10px 14px; cursor:pointer; }
        .atlas-drawer { position:fixed; inset:0; background:rgba(20,34,31,.35); z-index:5; display:flex; justify-content:flex-end; }
        .atlas-panel { width:min(410px,100%); background:#fffaf3; padding:28px; box-shadow:-15px 0 30px rgba(39,34,27,.12); animation:atlas-in .25s ease both; }
        @keyframes atlas-in { from { transform:translateX(30px); opacity:.4 } to { transform:translateX(0); opacity:1 } }
        .atlas-panel-head { display:flex; justify-content:space-between; align-items:center; }
        .atlas-panel-close { border:0; background:transparent; color:#776e63; cursor:pointer; }
        .atlas-profile { text-align:center; padding:42px 0 30px; border-bottom:1px solid #e2d8ca; }
        .atlas-profile .atlas-avatar { margin:auto; width:82px; height:82px; font-size:18px; }
        .atlas-profile h2 { font-family:Georgia,serif; font-size:31px; font-weight:400; margin:17px 0 5px; }
        .atlas-details { padding-top:22px; display:grid; gap:16px; }
        .atlas-detail { display:flex; justify-content:space-between; font-size:13px; border-bottom:1px solid #eee7dd; padding-bottom:12px; }
        .atlas-detail span:first-child { color:#9b9185; }
        .atlas-detail span:last-child { font-weight:500; }
        .atlas-toast { position:fixed; bottom:24px; left:50%; transform:translateX(-50%); background:#173f3b; color:#fffaf3; padding:11px 16px; font-size:12px; z-index:10; }
        @media (max-width:720px) {
          .atlas-top { padding-top:22px; } .atlas-kicker { margin-top:42px; }
          .atlas-grid { grid-template-columns:repeat(2,1fr); gap:8px; }
          .atlas-card { padding:14px; min-height:164px; } .atlas-avatar { width:46px; height:46px; }
          .atlas-aside { display:block; } .atlas-aside button { margin-top:14px; }
        }
        @media (max-width:430px) { .atlas-grid { grid-template-columns:1fr 1fr; } .atlas-card { min-height:154px; } .atlas-name { margin-top:14px; } }
      `}</style>
      <header className="atlas-top">
        <div className="atlas-nav"><div className="atlas-mark">DG</div><div className="atlas-brand">동국대학교 경영학과 동문회</div><div style={{ fontSize: 11, color: "#b9c9bf" }}>MEMBERS 2024</div></div>
        <div className="atlas-kicker">PEOPLE / EXECUTIVE ATLAS</div>
        <h1 className="atlas-heading">사람을 찾는 가장<br />빠른 방법</h1>
        <p className="atlas-sub">기수와 지역을 기준으로, 지금 연결할 동문을 탐색하세요.</p>
      </header>
      <main className="atlas-content">
        <div className="atlas-command">
          <label className="atlas-search"><SearchIcon /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="이름, 직책, 기수로 검색" /></label>
          <div className="atlas-filters">
            {["전체", "서울", "경기", "부산", "22기"].map((item) => <button key={item} className={`atlas-filter ${filter === item ? "active" : ""}`} onClick={() => setFilter(item)}>{item}</button>)}
          </div>
        </div>
        <div className="atlas-meta"><strong>{filter === "전체" ? "임원 명단" : `${filter} 임원`}</strong><span>{filtered.length}명 표시 중 · 가나다순</span></div>
        <section className="atlas-grid">
          {filtered.map((member) => <article className="atlas-card" key={member.name} onClick={() => setSelected(member)}>
            <div className="atlas-card-top"><div className="atlas-avatar" style={{ background: member.tone }}>{member.initials}</div><button className={`atlas-save ${saved.includes(member.name) ? "on" : ""}`} aria-label="즐겨찾기" onClick={(event) => { event.stopPropagation(); toggleSaved(member.name); }}>{saved.includes(member.name) ? "★" : "☆"}</button></div>
            <div className="atlas-name">{member.name}</div><div className="atlas-role">{member.role}</div>
            <div className="atlas-tags"><span className="atlas-tag">{member.generation}</span><span className="atlas-tag">{member.branch}</span></div>
          </article>)}
        </section>
        {filtered.length === 0 && <div style={{ padding: "56px 0", textAlign: "center", color: "#94897b", fontSize: 14 }}>조건에 맞는 동문이 없습니다.<br /><button style={{ marginTop: 12, border: 0, background: "none", color: "#ae752e", cursor: "pointer" }} onClick={() => { setQuery(""); setFilter("전체"); }}>검색 초기화</button></div>}
        <div className="atlas-aside"><div><div className="atlas-aside-label">LOOKING FOR A CONNECTION?</div><div className="atlas-aside-copy">내 기수 동문을<br />빠르게 찾아보세요.</div></div><button onClick={() => { setFilter("22기"); setQuery(""); }}>22기 보기 →</button></div>
      </main>
      {selected && <div className="atlas-drawer" onClick={() => setSelected(null)}><aside className="atlas-panel" onClick={(event) => event.stopPropagation()}><div className="atlas-panel-head"><span className="atlas-brand" style={{ color: "#173f3b" }}>PROFILE</span><button className="atlas-panel-close" onClick={() => setSelected(null)}><CloseIcon /></button></div><div className="atlas-profile"><div className="atlas-avatar" style={{ background: selected.tone }}>{selected.initials}</div><h2>{selected.name}</h2><div className="atlas-role">{selected.role} · {selected.generation}</div></div><div className="atlas-details"><div className="atlas-detail"><span>소속 지역</span><span>{selected.branch}</span></div><div className="atlas-detail"><span>활동 주소</span><span>{selected.contact}</span></div><div className="atlas-detail"><span>연락처 저장</span><button onClick={() => toggleSaved(selected.name)} style={{ border: 0, background: "none", color: saved.includes(selected.name) ? "#c89442" : "#776e63", cursor: "pointer" }}>{saved.includes(selected.name) ? "저장됨 ★" : "내 연락처에 저장"}</button></div></div></aside></div>}
      {notice && <div className="atlas-toast">{notice}</div>}
    </div>
  );
}