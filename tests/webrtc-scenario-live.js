const status=document.querySelector('#status'),output=document.querySelector('#output');
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const log=value=>{output.textContent=JSON.stringify(value,null,2)};
async function endpoint(){
  const html=await (await fetch('../',{cache:'no-store'})).text();
  return html.match(/name="turn-credentials-endpoint" content="([^"]+)"/)?.[1];
}
async function credentials(){
  const url=await endpoint();
  if(!url)throw new Error('TURN endpoint not found');
  const id=`diagnostic-${Date.now().toString(36)}`;
  const response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({callId:id,clientId:`${id}-client`})});
  if(!response.ok)throw new Error(`TURN credentials ${response.status}`);
  const payload=await response.json();
  return payload.iceServers||payload.ice_servers||[];
}
async function runScenario(name,iceServers,policy,durationMs,restart=false){
  status.textContent=`${name} を試験しています…`;
  const context=new AudioContext();
  await context.resume();
  const oscillator=context.createOscillator(),gain=context.createGain(),destination=context.createMediaStreamDestination();
  oscillator.frequency.value=220;gain.gain.value=.18;oscillator.connect(gain).connect(destination);oscillator.start();
  const config={iceServers,iceTransportPolicy:policy};
  const a=new RTCPeerConnection(config),b=new RTCPeerConnection(config),received=[];
  a.onicecandidate=e=>e.candidate&&b.addIceCandidate(e.candidate).catch(()=>{});
  b.onicecandidate=e=>e.candidate&&a.addIceCandidate(e.candidate).catch(()=>{});
  b.ontrack=e=>received.push(e.track);
  destination.stream.getTracks().forEach(track=>a.addTrack(track,destination.stream));
  const negotiate=async iceRestart=>{const offer=await a.createOffer(iceRestart?{iceRestart:true}:undefined);await a.setLocalDescription(offer);await b.setRemoteDescription(offer);const answer=await b.createAnswer();await b.setLocalDescription(answer);await a.setRemoteDescription(answer)};
  const started=performance.now();await negotiate(false);
  while(!['connected','completed'].includes(a.iceConnectionState)&&performance.now()-started<20000)await wait(100);
  const firstConnectMs=Math.round(performance.now()-started);
  let restartMs=null;
  if(restart){const at=performance.now();a.restartIce?.();await negotiate(true);while(!['connected','completed'].includes(a.iceConnectionState)&&performance.now()-at<15000)await wait(100);restartMs=Math.round(performance.now()-at)}
  await wait(durationMs);
  let inboundPackets=0,outboundPackets=0,relay=false,bytes=0,codec='';
  const report=await b.getStats(),byId=new Map();report.forEach(x=>byId.set(x.id,x));
  report.forEach(x=>{if(x.type==='inbound-rtp'&&(x.kind==='audio'||x.mediaType==='audio')){inboundPackets+=Number(x.packetsReceived||0);codec=byId.get(x.codecId)?.mimeType||codec}if(x.type==='outbound-rtp'&&(x.kind==='audio'||x.mediaType==='audio'))outboundPackets+=Number(x.packetsSent||0);if(x.type==='candidate-pair'&&x.state==='succeeded'&&(x.nominated||x.selected)){const l=byId.get(x.localCandidateId),r=byId.get(x.remoteCandidateId);relay=l?.candidateType==='relay'||r?.candidateType==='relay';bytes+=Number(x.bytesReceived||0)+Number(x.bytesSent||0)}});
  const result={scenario:name,firstConnectMs,restartMs,state:a.connectionState,iceState:a.iceConnectionState,receivedTracks:received.length,inboundPackets,outboundPackets,relay,bytes,codec,passed:a.connectionState==='connected'&&received.length>0&&inboundPackets>0&&(!(policy==='relay')||relay)};
  a.close();b.close();destination.stream.getTracks().forEach(t=>t.stop());oscillator.stop();await context.close();return result;
}
async function main(){try{
  document.querySelector('#start').disabled=true;
  const iceServers=await credentials(),results=[];
  results.push(await runScenario('P2P/STUN 通常経路',iceServers,'all',4000));log(results);
  results.push(await runScenario('P2P/STUN ICE再接続',iceServers,'all',3000,true));log(results);
  results.push(await runScenario('TURN 強制中継',iceServers,'relay',6000));
  const relayBytes=results.filter(x=>x.relay).reduce((n,x)=>n+x.bytes,0);
  const report={testedAt:new Date().toISOString(),userAgent:navigator.userAgent,results,relayBytes,turnCostUsdBeforeFreeTier:relayBytes/1e9*.05,turnCostJpyBeforeFreeTier:relayBytes/1e9*.05*157.39};
  log(report);status.textContent=results.every(x=>x.passed)?'すべての試験に成功しました。':'失敗した試験があります。';document.title=`${results.every(x=>x.passed)?'成功':'失敗'} | WebRTC 経路診断`;
}catch(error){status.textContent=`試験できませんでした: ${error.message}`;log({error:String(error),stack:error.stack});document.title='失敗 | WebRTC 経路診断'}}
document.querySelector('#start').addEventListener('click',main,{once:true});
