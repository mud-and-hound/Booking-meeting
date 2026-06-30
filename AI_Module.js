/* ============================================================
 *  API AI — โมดูลผู้ช่วย AI (ถอดออกจาก meeting-room-booking-v3.html ชั่วคราว)
 * ============================================================
 *
 *  ไฟล์นี้เก็บโค้ดส่วน AI ทั้งหมดที่ถอดออกจากไฟล์หลัก
 *  เมื่อต้องการเปิดใช้ AI อีกครั้ง ให้ทำตามขั้นตอนท้ายไฟล์ (ส่วน "วิธีเอากลับมาใส่")
 *
 *  ในไฟล์หลัก จุดที่ถอดออกถูกแทนด้วย comment:  // API AI — ...
 *  ค้นหาคำว่า "API AI" ในไฟล์หลักจะเจอทุกจุดที่ต้องเอาโค้ดกลับไปวาง
 *
 *  ส่วนประกอบในไฟล์นี้ (5 บล็อก):
 *    [1] botAnswer()      — ตอบคำถามพื้นฐานจากข้อมูลจริง (ไม่ต้องใช้ key)
 *    [2] AI_PROVIDERS      — รายการผู้ให้บริการ (Gemini / OpenAI / Groq)
 *    [3] callLLM()         — เรียก LLM API
 *    [4] ChatBot           — React component หน้าแชท
 *    [5] SettingsPage AI   — ส่วนตั้งค่า key ในหน้า Settings
 * ============================================================ */


/* ===== [1] botAnswer — เดิมอยู่หลัง comment "/* ====== AI ASSISTANT ====== *\/" ===== */
function botAnswer(text,bookings){
  const t=text.toLowerCase().trim();
  const room=ROOMS.find(r=>t.includes(r.name.toLowerCase())||t.includes(r.id.toLowerCase()));
  const wantFree  =/ว่าง|ช่วงว่าง|ไม่มีคน|เวลาไหน|กี่โมง|ว่างได้/.test(t);
  const wantWho   =/ใคร|จองอะไร|ตาราง|มีใคร|ใช้งานอยู่|มีการจอง/.test(t)&&!wantFree;
  const wantBook  =/อยากจอง|ขอจอง|จองห้อง|จองเลย|book/.test(t)&&!wantFree&&!wantWho;
  const wantEq    =/อุปกรณ์|projector|hdmi|whiteboard|จอ|ไมค์|ลำโพง|มีอะไรบ้าง/.test(t)&&!wantFree;
  const wantSum   =/สรุป|ภาพรวม|ทั้งหมด/.test(t)&&!wantFree&&!room;
  const wantToday =/วันนี้/.test(t)&&!wantFree&&!room&&!wantWho;

  if(wantBook) return{text:'ไปที่ฟอร์มจองได้เลยค่ะ กรอกห้อง/เวลา ระบบจะเช็คไม่ให้ชนกันให้อัตโนมัติ',action:'form'};

  if(wantEq&&room){
    const eqList=room.eq.length?room.eq.map(e=>eqLabel(e)).join(', '):'ไม่มีข้อมูลอุปกรณ์';
    return{text:`${room.name} มีอุปกรณ์: ${eqList} · ที่นั่ง ${room.cap} คนค่ะ`};
  }
  if(wantEq&&!room){
    const lines=ROOMS.map(r=>`• ${r.name}: ${r.eq.length?r.eq.map(e=>eqLabel(e)).join(', '):'–'}`).join('\n');
    return{text:`อุปกรณ์แต่ละห้องค่ะ:\n${lines}`};
  }

  if(wantFree){
    if(room){
      const gaps=freeGaps(room.id,TODAY,bookings);
      return gaps.length
        ?{text:`ช่วงที่ว่างของ ${room.name} วันนี้ค่ะ — กดเพื่อจองได้เลย`,gaps:gaps.map(g=>({...g,roomId:room.id}))}
        :{text:`${room.name} วันนี้เต็มทั้งวันแล้วค่ะ`};
    }
    const list=ROOMS.map(r=>({r,gaps:freeGaps(r.id,TODAY,bookings)})).filter(x=>x.gaps.length);
    return list.length
      ?{text:'ห้องที่ยังมีช่วงว่างวันนี้ค่ะ (กดช่วงเวลาเพื่อจอง)',roomGaps:list}
      :{text:'วันนี้ทุกห้องเต็มหมดแล้วค่ะ ลองวันพรุ่งนี้ดูนะคะ'};
  }

  if(wantWho&&room){
    const list=bookings.filter(b=>b.room===room.id&&b.date===TODAY&&ACTIVE.includes(b.status)).sort((a,b)=>t2m(a.s)-t2m(b.s));
    return{text:list.length?`ตารางของ ${room.name} วันนี้ค่ะ`:`${room.name} วันนี้ยังว่างทั้งวันค่ะ`,bookings:list};
  }
  if(wantWho&&!room){
    const td=bookings.filter(b=>b.date===TODAY&&ACTIVE.includes(b.status));
    return{text:td.length?`วันนี้มีการจองรวม ${td.length} รายการค่ะ`:'วันนี้ยังไม่มีการจองค่ะ',bookings:td.sort((a,b)=>t2m(a.s)-t2m(b.s))};
  }

  if(wantSum||wantToday){
    const td=bookings.filter(b=>b.date===TODAY&&ACTIVE.includes(b.status));
    const inuse=td.filter(b=>b.status==='in-use').length;
    const freeCount=ROOMS.length-inuse;
    return{text:`วันนี้มีการจอง ${td.length} รายการ · กำลังใช้งาน ${inuse} ห้อง · ว่าง ${freeCount} ห้องค่ะ`};
  }

  return null;
}


/* ===== [2] AI_PROVIDERS ===== */
const AI_PROVIDERS={
  gemini:{label:'Google Gemini',model:'gemini-2.5-flash',keyUrl:'https://aistudio.google.com/apikey',hint:'ฟรี ไม่ต้องใช้บัตร'},
  openai:{label:'OpenAI',model:'gpt-4o-mini',keyUrl:'https://platform.openai.com/api-keys',hint:'gpt-4o-mini ราคาถูก'},
  groq:{label:'Groq',model:'openai/gpt-oss-20b',keyUrl:'https://console.groq.com/keys',hint:'ฟรี เร็วมาก (GPT-OSS)'},
};


/* ===== [3] callLLM ===== */
async function callLLM(cfg,prompt){
  const provider=cfg.provider,key=cfg.key,model=cfg.model||AI_PROVIDERS[provider].model;
  if(!key)throw new Error('no-key');
  if(provider==='gemini'){
    const r=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({contents:[{parts:[{text:prompt}]}]})});
    const d=await r.json();if(d.error)throw new Error(d.error.message||'Gemini error');
    return (d.candidates?.[0]?.content?.parts||[]).map(p=>p.text||'').join('').trim()||'(ไม่มีคำตอบ)';
  }
  const base=provider==='groq'?'https://api.groq.com/openai/v1':'https://api.openai.com/v1';
  const r=await fetch(base+'/chat/completions',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+key},body:JSON.stringify({model,messages:[{role:'user',content:prompt}],max_tokens:1000})});
  const d=await r.json();if(d.error)throw new Error((d.error.message||d.error)||'API error');
  return (d.choices?.[0]?.message?.content||'(ไม่มีคำตอบ)').trim();
}


/* ===== [4] ChatBot component ===== */
function ChatBot({bookings,toast,openForm,go,aiConfig}){
  const [msgs,setMsgs]=useState([{t:'bot',text:'สวัสดีค่ะ ถามเรื่องห้องว่าง เวลา หรือการจองได้เลย เช่น "MUD 1 ว่างช่วงไหนวันนี้" 😊'}]);
  const [input,setInput]=useState('');
  const [busy,setBusy]=useState(false);
  const bodyRef=useRef(null);
  useEffect(()=>{if(bodyRef.current)bodyRef.current.scrollTop=bodyRef.current.scrollHeight;},[msgs,busy]);
  const QUICK=['ห้องไหนว่างบ้างวันนี้','สรุปการจองวันนี้','MUD 1 ว่างช่วงไหน','อยากจองห้อง'];

  const ask=async(text)=>{
    if(!text.trim()||busy)return;
    setMsgs(m=>[...m,{t:'me',text}]);setInput('');
    const local=botAnswer(text,bookings);
    if(local){setTimeout(()=>setMsgs(m=>[...m,{t:'bot',...local}]),300);return;}
    // free-form → ใช้ LLM ตาม key ที่ผู้ใช้ตั้งไว้ในหน้าตั้งค่า
    if(!aiConfig.key){
      setTimeout(()=>setMsgs(m=>[...m,{t:'bot',text:'คำถามนี้ต้องใช้ AI ตอบค่ะ — ไปที่ "ตั้งค่า → ผู้ช่วย AI" ใส่ API key ก่อนนะคะ 🔑 (ระหว่างนี้ถาม "ห้องว่าง", "ช่วงว่างของ MUD 1", "สรุปวันนี้" ตอบจากข้อมูลจริงได้เลย)',action:'settings'}]),300);
      return;
    }
    setBusy(true);
    const roomList=ROOMS.map(r=>({ห้อง:r.name,จุ:r.cap+' คน',อุปกรณ์:(r.eq||[]).map(x=>eqLabel(x)).join(', ')||'-'}));
    const ctx=bookings.filter(b=>ACTIVE.includes(b.status)).map(b=>({ห้อง:ROOM(b.room).name,วันที่:b.date,เวลา:b.s+'-'+b.e,หัวข้อ:b.title,ผู้จอง:b.by}));
    const freeToday=ROOMS.map(r=>({ห้อง:r.name,ช่องว่างวันนี้:freeGaps(r.id,TODAY,bookings).map(g=>g.s+'-'+g.e).join(', ')||'ว่างทั้งวัน'}));
    try{
      const sys=`คุณเป็นผู้ช่วยจองห้องประชุมขององค์กร ตอบสั้น กระชับ สุภาพ เป็นภาษาไทย ลงท้ายด้วย "ค่ะ"
วันนี้คือ ${thFull(TODAY)} · เวลาทำการ 08:00-20:00

[ห้องประชุมทั้งหมด — ชื่อ / ความจุ / อุปกรณ์]
${JSON.stringify(roomList)}

[การจองที่ยังใช้งานอยู่]
${JSON.stringify(ctx)}

[ช่วงเวลาว่างของแต่ละห้องวันนี้]
${JSON.stringify(freeToday)}

กติกา: ตอบโดยอิงข้อมูล 3 ส่วนด้านบนเท่านั้น — เรื่องความจุ/อุปกรณ์/ช่วงว่าง ให้ดูจากข้อมูลจริง ห้ามเดา ถ้าผู้ใช้ถามว่าห้องไหนรองรับกี่คนหรือมีอุปกรณ์อะไร ให้เทียบจากรายการห้อง ถ้าข้อมูลไม่พอให้บอกตรงๆ ว่าไม่มีข้อมูล แล้วแนะนำให้ดูหน้าปฏิทินหรือหน้าห้องประชุม`;
      const ans=await callLLM(aiConfig,`${sys}\n\nคำถามผู้ใช้: ${text}`);
      setMsgs(m=>[...m,{t:'bot',text:ans}]);
    }catch(e){
      const msg=e.message==='no-key'?'ยังไม่ได้ใส่ API key ค่ะ':('เชื่อมต่อ AI ไม่สำเร็จ: '+e.message+' — เช็ค key ให้ถูก หรือ provider บางตัวอาจติด CORS ตอนเรียกจากเบราว์เซอร์ตรงๆ');
      setMsgs(m=>[...m,{t:'bot',text:msg}]);
    }
    setBusy(false);
  };
  return(
    <div className="chat-wrap">
      <div className="chat-head">
        <div className="bot-ava"><Icon name="bot" size={19}/></div>
        <div><div style={{fontWeight:600,fontSize:14}}>ผู้ช่วย AI</div><div style={{fontSize:11.5,color:aiConfig.key?'var(--green-tx)':'var(--text-muted)'}}>● {aiConfig.key?('เชื่อมต่อ '+AI_PROVIDERS[aiConfig.provider].label+' แล้ว'):'โหมดข้อมูลจริง · ยังไม่ใส่ key AI'}</div></div>
      </div>
      <div className="chat-body" ref={bodyRef}>
        {msgs.map((m,i)=>(
          <div key={i} style={{display:'flex',flexDirection:'column',alignItems:m.t==='me'?'flex-end':'flex-start',gap:7}}>
            <div className={"msg "+m.t}>
              {m.t==='bot'&&<div className="bot-ava" style={{width:30,height:30}}><Icon name="bot" size={16}/></div>}
              <div className="bubble">{m.text}</div>
            </div>
            {m.gaps&&<div className="chips" style={{maxWidth:'90%'}}>{m.gaps.map((g,j)=><button key={j} className="gap-chip" onClick={()=>openForm({roomId:g.roomId,s:g.s,e:g.e})}><Icon name="plus" size={12}/>{g.s} - {g.e}</button>)}</div>}
            {m.roomGaps&&<div style={{maxWidth:'90%',display:'flex',flexDirection:'column',gap:9}}>{m.roomGaps.map(({r,gaps})=>(<div key={r.id} style={{fontSize:12}}><div style={{fontWeight:500,marginBottom:5}}>{r.name}</div><div className="chips" style={{marginTop:0}}>{gaps.slice(0,4).map((g,j)=><button key={j} className="gap-chip" onClick={()=>openForm({roomId:r.id,s:g.s,e:g.e})}>{g.s}-{g.e}</button>)}</div></div>))}</div>}
            {m.bookings&&<div className="opt-card card" style={{maxWidth:'90%',padding:'4px 14px',width:'100%'}}>{m.bookings.map(b=>(<div className="li" key={b.id}><div className="li-time" style={{width:90}}>{b.s} - {b.e}</div><div className="li-body"><div className="li-title">{b.title}</div><div className="li-sub">โดย {b.by}</div></div><span className={"badge "+STATUS[b.status].cls}><span className="d"></span>{STATUS[b.status].label}</span></div>))}</div>}
            {m.action==='form'&&<button className="chip" onClick={()=>openForm({})}><Icon name="plus" size={13}/>เปิดฟอร์มจอง</button>}
            {m.action==='settings'&&<button className="chip" onClick={()=>go('settings')}><Icon name="settings" size={13}/>ไปหน้าตั้งค่า ใส่ key</button>}
          </div>
        ))}
        {busy&&<div className="msg bot"><div className="bot-ava" style={{width:30,height:30}}><Icon name="bot" size={16}/></div><div className="bubble" style={{padding:0}}><div className="typing"><i></i><i></i><i></i></div></div></div>}
        <div className="chips" style={{marginTop:2}}>{QUICK.map(q=><button key={q} className="chip soft" onClick={()=>ask(q)}>{q}</button>)}</div>
      </div>
      <div className="chat-input">
        <input placeholder="พิมพ์คำถาม..." value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')ask(input);}}/>
        <button className="send-btn" disabled={busy||!input.trim()} onClick={()=>ask(input)}><Icon name="send" size={16}/></button>
      </div>
    </div>
  );
}


/* ===== [5] SettingsPage — ส่วน AI (วางในตัว SettingsPage component) ===== */
// 5.1 ใน signature ของ SettingsPage ต้องมี aiConfig, setAiConfig:
//     function SettingsPage({dark,setDark,user,setUser,openProfile,aiConfig,setAiConfig,logout}){
//
// 5.2 ใน body ของ SettingsPage (บนสุด ก่อน return) เพิ่ม:
const _settings_ai_logic = `
  const [testing,setTesting]=useState(false),[testResult,setTestResult]=useState(null);
  const prov=AI_PROVIDERS[aiConfig.provider];
  const testKey=async()=>{
    if(!aiConfig.key){setTestResult({ok:false,msg:'กรุณาใส่ API key ก่อน'});return;}
    setTesting(true);setTestResult(null);
    try{const r=await callLLM(aiConfig,'ตอบกลับสั้นๆ ว่า: เชื่อมต่อสำเร็จ');setTestResult({ok:true,msg:'✓ เชื่อมต่อสำเร็จ — '+r.slice(0,60)});}
    catch(e){setTestResult({ok:false,msg:'✕ '+(e.message==='no-key'?'ยังไม่ใส่ key':e.message)});}
    setTesting(false);
  };
`;
// 5.3 JSX block (วางในส่วน return ของ SettingsPage หลัง card โปรไฟล์):
/*
    <div className="card pad" style={{marginBottom:16}}>
      <div className="section-title" style={{margin:'0 0 4px'}}><Icon name="bot" size={17}/>ผู้ช่วย AI (แชทบอท)</div>
      <p style={{fontSize:12,color:'var(--text-muted)',margin:'0 0 16px',lineHeight:1.6}}>ใส่ API key เพื่อให้แชทคุยแบบ AI อิสระได้ (คำถามเรื่องห้องว่าง/สรุป ตอบจากข้อมูลจริงได้อยู่แล้วโดยไม่ต้องใส่ key)</p>
      <div className="form-grid">
        <div className="field">
          <label>ผู้ให้บริการ AI</label>
          <select className="inp" value={aiConfig.provider} onChange={e=>{setAiConfig(c=>({...c,provider:e.target.value,model:''}));setTestResult(null);}}>
            {Object.entries(AI_PROVIDERS).map(([k,p])=><option key={k} value={k}>{p.label} — {p.hint}</option>)}
          </select>
        </div>
        <div className="field">
          <label>API Key<span className="req">*</span></label>
          <input className="inp" type="password" placeholder="วาง API key ที่นี่" value={aiConfig.key} onChange={e=>{setAiConfig(c=>({...c,key:e.target.value}));setTestResult(null);}} autoComplete="off"/>
          <div style={{marginTop:7}}><a href={prov.keyUrl} target="_blank" className="link"><Icon name="link" size={12}/> ขอ key ของ {prov.label} (คลิก)</a></div>
        </div>
        <div className="field">
          <label>โมเดล (ปล่อยว่างใช้ค่าเริ่มต้น)</label>
          <input className="inp" placeholder={prov.model} value={aiConfig.model} onChange={e=>setAiConfig(c=>({...c,model:e.target.value}))}/>
        </div>
        <div className="form-actions">
          <button className="btn btn-primary" disabled={testing} onClick={testKey}><Icon name={testing?'clock':'checkcircle'} size={15}/>{testing?'กำลังทดสอบ...':'ทดสอบการเชื่อมต่อ'}</button>
          {aiConfig.key&&<button className="btn btn-ghost" onClick={()=>{setAiConfig(c=>({...c,key:''}));setTestResult(null);}}><Icon name="x" size={14}/>ล้าง key</button>}
        </div>
        {testResult&&<div className={"conflict-warn"} style={{background:testResult.ok?'var(--green-bg)':'var(--red-bg)',borderColor:testResult.ok?'var(--green)':'var(--red)',color:testResult.ok?'var(--green-tx)':'var(--red-tx)'}}><Icon name={testResult.ok?'checkcircle':'warn'} size={16}/><span>{testResult.msg}</span></div>}
        <div className="perm-note"><Icon name="warn" size={16}/><span>คีย์หลักดึงจากชีต <b>_AIKeys</b> อัตโนมัติ — ช่องด้านบนใช้ override ชั่วคราวในเครื่องนี้เพื่อทดสอบเท่านั้น (refresh แล้วกลับไปใช้ค่าจากชีต) หากต้องการเปลี่ยนถาวรให้แก้ในชีต</span></div>
      </div>
    </div>
*/


/* ============================================================
 *  วิธีเอากลับมาใส่ (เปิดใช้ AI อีกครั้ง)
 * ============================================================
 *  ค้นหา "API AI" ในไฟล์ meeting-room-booking-v3.html จะเจอ marker ทุกจุด แล้วทำตามนี้:
 *
 *  1) [AI ASSISTANT block]  — เอา [1][2][3][4] (botAnswer, AI_PROVIDERS, callLLM, ChatBot)
 *                              กลับไปวางแทน marker "// API AI — AI ASSISTANT ..."
 *
 *  2) [NAV]                  — เพิ่มกลับใน NAV array:
 *                              {id:'book', label:'ผู้ช่วย AI', icon:'bot'},
 *
 *  3) [TITLES]               — เพิ่ม book:'ผู้ช่วย AI' กลับใน object TITLES
 *
 *  4) [App state]            — เพิ่มกลับใน App:
 *                              const [aiConfig,setAiConfig]=useState({provider:'groq',key:'',model:''});
 *
 *  5) [loadData]             — เพิ่มกลับใน loadData (หลัง setCursor):
 *                              if(d.aiKey&&d.aiKey.key){setAiConfig({provider:d.aiKey.provider||'groq',key:d.aiKey.key,model:'',name:d.aiKey.name,projectName:d.aiKey.projectName,projectNumber:d.aiKey.projectNumber});}
 *
 *  6) [render page]          — เพิ่มกลับในส่วน render:
 *                              {page==='book'&&<ChatBot bookings={bookings} toast={toast} openForm={openForm} go={go} aiConfig={aiConfig}/>}
 *
 *  7) [SettingsPage]         — ใส่ [5] กลับ: signature + logic (5.2) + JSX (5.3)
 *                              และแก้ render SettingsPage ให้ส่ง props กลับ:
 *                              ...aiConfig={aiConfig} setAiConfig={setAiConfig}...
 *
 *  หมายเหตุ: ฝั่ง Apps Script (.gs) ไม่ได้ถอดอะไรออก — readActiveAIKey ยังส่ง aiKey มาให้ตามปกติ
 *            แค่ฝั่ง UI ไม่ได้เรียกใช้ชั่วคราวเท่านั้น
 * ============================================================ */
