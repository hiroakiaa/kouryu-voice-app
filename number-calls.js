// Number calls keep approval separate from WebRTC signaling.
import {deleteDoc as fsDeleteDoc,doc,getDoc as fsGetDoc,setDoc as fsSetDoc,updateDoc as fsUpdateDoc,onSnapshot as fsOnSnapshot,collection,query,where,runTransaction as fsTransaction,serverTimestamp,Timestamp} from 'https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js';
import {normalizeNumber,formatNumber,canAddCaller} from './number-call-policy.js';
export function createNumberCalls({db,user,state,name,navigate,stop,notice,push,usage:reportUsage=()=>{}}) {
 let usage={reads:0,writes:0};
 const storageKey='number-call-setup:'+state().callId;
 try{const saved=JSON.parse(sessionStorage.getItem(storageKey)||'null');if(saved&&Number.isFinite(saved.reads)&&Number.isFinite(saved.writes))usage=saved;sessionStorage.removeItem(storageKey);}catch(_){}
 function count(reads,writes){if(state().joined)reportUsage(reads,writes);else{usage.reads+=reads;usage.writes+=writes;}}
 async function getDoc(r){const s=await fsGetDoc(r);count(1,0);return s;}
 async function setDoc(r,d){await fsSetDoc(r,d);count(0,1);}
 async function updateDoc(r,d){await fsUpdateDoc(r,d);count(0,1);}
 function onSnapshot(r,next,error){return fsOnSnapshot(r,s=>{if(!s.metadata.fromCache)count(s.docChanges?Math.max(1,s.docChanges().length):1,0);next(s);},error);}
 async function runTransaction(db,callback){let writes=0;const result=await fsTransaction(db,async tx=>{writes=0;return callback({get:async r=>{const s=await tx.get(r);count(1,0);return s;},set:(...a)=>{writes++;tx.set(...a);},update:(...a)=>{writes++;tx.update(...a);}});});count(0,writes);return result;}
 function go(id){try{sessionStorage.setItem('number-call-setup:'+id,JSON.stringify(usage));}catch(_){}navigate(id);}
 const $=id=>document.getElementById(id), uid=user.uid;
 let own='',pending=null,outgoing=null,offOutgoing=null,offRoom=null,busy=false,expiryTimer=null,outgoingTimer=null,room=null;
 const message=text=>{$('numberStatus').textContent=text;};
 const show=()=>{$('numberModal').showModal();};
 const close=()=>{$('numberModal').close();};
 const ref=(path,id)=>doc(db,path,id);
 const roomRef=id=>ref('numberVoiceCalls',id);
 const requestRef=id=>ref('numberInvitations',id);
 function renderIncoming(items) {
  pending=items.filter(x=>x.status==='ringing'&&x.createdAt&&x.expiresAt.toMillis()>Date.now()).sort((a,b)=>a.createdAt.toMillis()-b.createdAt.toMillis())[0]||null;
  clearTimeout(expiryTimer);
  if(!pending){$('numberIncoming').close();return;}
  $('numberCaller').textContent=pending.name+'さんから着信';
  const s=state(),adding=s.joined&&room?.ownerUid===uid;
  $('numberIncomingText').textContent=adding?'承認すると、今の通話に追加されます。':'応答すると、最大4人の通話が始まります。';
  $('numberAccept').textContent=adding?'通話に追加':'応答する';
  $('numberAccept').disabled=busy;
  if(!$('numberIncoming').open)$('numberIncoming').showModal();
  expiryTimer=setTimeout(()=>renderIncoming(items),Math.max(0,pending.expiresAt.toMillis()-Date.now()+100));
 }
 async function create() {
  if(busy)return;busy=true;$('numberCreate').disabled=true;
  try {
   for(let attempt=0;attempt<8;attempt++) {
    const a=crypto.getRandomValues(new Uint32Array(1))[0];if(a>=4200000000){attempt--;continue;}
    const number=String(a%100000000).padStart(8,'0');
    const result=await runTransaction(db,async tx=>{
     const p=await tx.get(ref('numberProfiles',uid));if(p.exists())return p.data().number;
     const n=await tx.get(ref('voiceNumbers',number));if(n.exists())return null;
     tx.set(ref('voiceNumbers',number),{ownerUid:uid,number});tx.set(ref('numberProfiles',uid),{number});return number;
    });
    if(result){own=result;renderOwn();message('番号を作成しました。相手にこの番号を伝えてください。');return;}
   }
   throw Error('番号を作成できませんでした。もう一度お試しください。');
  }catch(e){message('番号を作成できませんでした。通信を確認してお試しください。');}
  finally{busy=false;$('numberCreate').disabled=false;}
 }
 function renderOwn(){ $('myNumber').textContent=own?formatNumber(own):'未設定';$('numberCreate').hidden=!!own;$('numberCopy').hidden=!own; }
 async function dial(){
  if(busy||outgoing)return;
  if(!navigator.onLine){message('インターネットに接続してから発信してください。');return;}
  if(state().joined){message('現在の通話を退室してから発信してください。');return;}
  const number=normalizeNumber($('numberInput').value);if(!number){message('8桁の数字を入力してください。');return;}
  busy=true;$('numberDial').disabled=true;
  try {
   const target=await getDoc(ref('voiceNumbers',number));if(!target.exists())throw Error('番号が見つかりません。');
   if(target.data().ownerUid===uid)throw Error('自分の番号には発信できません。');
   const createdAt=serverTimestamp();
   await setDoc(requestRef(uid),{from:uid,to:target.data().ownerUid,number,name:name().slice(0,20),status:'ringing',createdAt,expiresAt:Timestamp.fromMillis(Date.now()+90000)});
   outgoing=true;$('numberCancel').hidden=false;message('呼び出し中… 相手の応答を待っています。');
   offOutgoing?.();offOutgoing=onSnapshot(requestRef(uid),snapshot=>{
    const r=snapshot.data();if(!outgoing||!r)return;
    if(r.status==='accepted'){finishOutgoing();close();go(r.roomId);}
    else if(r.status!=='ringing'){finishOutgoing();message(r.status==='declined'?'相手が応答を見送りました。':'呼び出しを終了しました。');}
   },()=>{finishOutgoing();message('接続が切れました。もう一度お試しください。');});
   outgoingTimer=setTimeout(()=>{if(outgoing)cancel('応答がありませんでした。');},90000);
   push?.(target.data().ownerUid,uid).catch(()=>{});
  }catch(e){message(e.code==='permission-denied'?'発信できません。連続発信の場合は30秒以上待ってください。':(e.message||'発信できませんでした。'));}
  finally{busy=false;$('numberDial').disabled=!!outgoing;}
 }
 function finishOutgoing(){clearTimeout(outgoingTimer);outgoing=false;offOutgoing?.();offOutgoing=null;$('numberCancel').hidden=true;$('numberDial').disabled=false;}
 async function cancel(text='呼び出しを取り消しました。'){
  if(!outgoing)return;finishOutgoing();
  try{await updateDoc(requestRef(uid),{status:'cancelled'});}catch(_){}
  message(text);
 }
 async function respond(accept){
  if(busy||!pending)return;busy=true;$('numberAccept').disabled=true;
  const incoming=pending;
  try {
   if(!accept){await updateDoc(requestRef(incoming.from),{status:'declined'});return;}
   const s=state();
   if(s.joined&&(!room||room.ownerUid!==uid)){throw Error('別の人の通話に参加中です。退室してから応答してください。');}
   const id=s.joined?s.callId:'n_'+crypto.randomUUID().replaceAll('-','');
   await runTransaction(db,async tx=>{
    const request=await tx.get(requestRef(incoming.from));const r=request.data();
    if(!r||r.status!=='ringing'||r.expiresAt.toMillis()<=Date.now())throw Error('この着信は終了しました。');
    const existing=await tx.get(roomRef(id));let data=existing.exists()?existing.data():null;
    if(data){const members=[data.ownerUid];for(const member of data.members.filter(x=>x!==data.ownerUid)){const p=await tx.get(doc(db,'numberVoiceCalls',id,'participants',member));const v=p.data();const seen=(v?.lastSeenAt||v?.updatedAt)?.toMillis?.()||0;if((v&&v.left!==true&&Date.now()-seen<240000)||(!v&&Date.now()-(data.admittedAt?.[member]||Date.now())<90000))members.push(member);}data={...data,members};}
    if(!canAddCaller(data,uid,incoming.from,Date.now()))throw Error('通話が満員、または終了しています。');
    if(data)tx.update(roomRef(id),{members:[...data.members,incoming.from],admittedAt:{...data.admittedAt,[incoming.from]:Date.now()}});
    else tx.set(roomRef(id),{ownerUid:uid,number:own||incoming.number,members:[uid,incoming.from],admittedAt:{[incoming.from]:Date.now()},active:true,expiresAt:Timestamp.fromMillis(Date.now()+65*60000)});
    tx.update(requestRef(incoming.from),{status:'accepted',roomId:id});
   });
   $('numberIncoming').close();if(!s.joined)go(id);else notice('承認しました。相手が通話に参加します。');
  }catch(e){$('numberIncomingText').textContent=e.message||'応答できませんでした。もう一度お試しください。';}
  finally{busy=false;$('numberAccept').disabled=false;}
 }
 async function block(){if(!pending)return;try{await setDoc(doc(db,'voiceNumbers',pending.number,'blocked',pending.from),{blocked:true});try{localStorage.setItem('number-block-'+uid,JSON.stringify({number:pending.number,id:pending.from}));}catch(_){}await respond(false);}catch(_){$('numberIncomingText').textContent='ブロックできませんでした。';}}
 async function allowed(){
  if(!state().callId.startsWith('n_'))return true;
  try{const s=await getDoc(roomRef(state().callId));room=s.data();return !!room&&room.active&&room.members.includes(uid)&&room.expiresAt.toMillis()>Date.now();}catch(_){return false;}
 }
 async function leave(){
  if(!state().callId.startsWith('n_'))return;
  try{await runTransaction(db,async tx=>{const r=roomRef(state().callId),s=await tx.get(r);if(!s.exists())return;const d=s.data();if(d.ownerUid===uid)tx.update(r,{active:false});else if(d.members.includes(uid))tx.update(r,{members:d.members.filter(x=>x!==uid)});});}catch(_){}
 }
 async function start(){
  $('numberOpen').addEventListener('click',show);$('numberClose').addEventListener('click',close);
  $('numberCreate').addEventListener('click',create);$('numberCopy').addEventListener('click',async()=>{try{await navigator.clipboard.writeText(own);message('番号をコピーしました。');}catch(_){message('表示された番号を相手に伝えてください。');}});
  $('numberUnblock').addEventListener('click',async()=>{try{const b=JSON.parse(localStorage.getItem('number-block-'+uid)||'null');if(!b){message('この端末で最後にブロックした相手はありません。');return;}await fsDeleteDoc(doc(db,'voiceNumbers',b.number,'blocked',b.id));localStorage.removeItem('number-block-'+uid);message('最後にブロックした相手を解除しました。');}catch(_){message('解除できませんでした。');}});
  $('numberForm').addEventListener('submit',e=>{e.preventDefault();dial();});$('numberCancel').addEventListener('click',()=>cancel());
  $('numberAccept').addEventListener('click',()=>respond(true));$('numberDecline').addEventListener('click',()=>respond(false));$('numberBlock').addEventListener('click',block);
  $('numberIncoming').addEventListener('cancel',e=>{e.preventDefault();respond(false);});
  for(const id of ['numberModal'])$(id).addEventListener('click',e=>{if(e.target!==$(id))return;const b=$(id).getBoundingClientRect();if(e.clientX<b.left||e.clientX>b.right||e.clientY<b.top||e.clientY>b.bottom)close();});
  window.addEventListener('pagehide',()=>{if(outgoing)cancel();});
  try {const profile=await getDoc(ref('numberProfiles',uid));own=profile.data()?.number||'';renderOwn();}catch(_){message('番号の読み込みに失敗しました。');}
  onSnapshot(query(collection(db,'numberInvitations'),where('to','==',uid),where('status','==','ringing')),s=>renderIncoming(s.docs.map(x=>x.data())),()=>message('着信を受け取れません。再読み込みしてください。'));
  if(state().callId.startsWith('n_'))offRoom=onSnapshot(roomRef(state().callId),s=>{room=s.data();if(state().joined&&(!room?.active||!room.members.includes(uid))){stop();notice('この番号での通話は終了しました。');}},()=>{if(state().joined){stop();notice('参加権限を確認できないため通話を終了しました。');}});
 }
 return {start,allowed,leave,takeSetupUsage(){const u=usage;usage={reads:0,writes:0};return u;}};
}
