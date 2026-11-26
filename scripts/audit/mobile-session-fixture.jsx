import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {CohortSessionsPanel} from '../../src/platform/components/CohortSessionsPanel.jsx';
import {TOKENS} from '../../src/platform/components/PlatformUI.jsx';
function Fixture(){
 const initial=[{id:'existing-session',title:'Meeting with Mentor',starts_at:'2026-11-27T16:00:00Z',join_url:null,description:''}];
 const [rows,setRows]=useState(()=>JSON.parse(localStorage.getItem('mobile-session-fixture')||'null')||initial),[fail,setFail]=useState(false),[count,setCount]=useState(0);
 const save=async(draft,editing=false)=>{if(fail)throw Error('The session could not be saved. Please retry.');const row={id:editing?draft.id:crypto.randomUUID(),cohort_id:draft.cohortId,title:draft.title.trim(),starts_at:draft.startsAt,join_url:draft.joinUrl,description:draft.description};const next=[...rows.filter(item=>item.id!==row.id),row];localStorage.setItem('mobile-session-fixture',JSON.stringify(next));setRows(next);setCount(n=>n+1);return row;};
 return <div className="ta"><style>{TOKENS}</style><main style={{padding:12,maxWidth:950,margin:'auto'}}><h1 style={{fontSize:22}}>Cohort sessions · Example</h1><p>Isolated test environment · Confirmed saves: {count}</p><label><input type="checkbox" checked={fail} onChange={e=>setFail(e.target.checked)}/> Simulate save failure</label><CohortSessionsPanel cohortId="cohort" currentUserId="admin" sessions={rows} createSession={draft=>save(draft)} updateSession={draft=>save(draft,true)}/></main></div>;
}
createRoot(document.getElementById('root')).render(<Fixture/>);
