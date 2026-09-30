import {chromium} from 'file:///C:/Users/hiroa/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';

const appUrl=process.env.APP_URL||'https://hiroakiaa.github.io/kouryu-voice-app/';
const html=await (await fetch(appUrl,{cache:'no-store'})).text();
const endpoint=html.match(/name="turn-credentials-endpoint" content="([^"]+)"/)?.[1];
if(!endpoint)throw new Error('TURN endpoint not found');
const testId=`automated-${Date.now().toString(36)}`;
const turnResponse=await fetch(endpoint,{method:'POST',headers:{Origin:new URL(appUrl).origin,'Content-Type':'application/json'},body:JSON.stringify({callId:testId,clientId:`${testId}-client`})});
if(!turnResponse.ok)throw new Error(`TURN credentials ${turnResponse.status}`);
const turnPayload=await turnResponse.json();
const iceServers=turnPayload.iceServers||turnPayload.ice_servers||[];

const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--autoplay-policy=no-user-gesture-required']});
const page=await browser.newPage();
await page.goto(appUrl,{waitUntil:'domcontentloaded',timeout:60000});

async function runScenario(name,policy,durationMs=5000,restart=false){
  return page.evaluate(async({iceServers,policy,durationMs,restart})=>{
    const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
    const context=new AudioContext();
    const oscillator=context.createOscillator();
    const gain=context.createGain();
    const destination=context.createMediaStreamDestination();
    oscillator.frequency.value=220;
    gain.gain.value=0.18;
    oscillator.connect(gain).connect(destination);
    oscillator.start();
    const config={iceServers,iceTransportPolicy:policy};
    const a=new RTCPeerConnection(config),b=new RTCPeerConnection(config);
    const received=[];
    a.onicecandidate=e=>{if(e.candidate)b.addIceCandidate(e.candidate).catch(()=>{});};
    b.onicecandidate=e=>{if(e.candidate)a.addIceCandidate(e.candidate).catch(()=>{});};
    b.ontrack=e=>received.push(e.track);
    destination.stream.getTracks().forEach(track=>a.addTrack(track,destination.stream));
    const negotiate=async(restartIce=false)=>{
      const offer=await a.createOffer(restartIce?{iceRestart:true}:undefined);
      await a.setLocalDescription(offer);await b.setRemoteDescription(offer);
      const answer=await b.createAnswer();await b.setLocalDescription(answer);await a.setRemoteDescription(answer);
    };
    const started=performance.now();
    await negotiate(false);
    while(!['connected','completed'].includes(a.iceConnectionState)&&performance.now()-started<15000)await wait(100);
    const firstConnectMs=Math.round(performance.now()-started);
    if(restart){a.restartIce?.();await negotiate(true);await wait(1500);}
    await wait(durationMs);
    let inboundPackets=0,outboundPackets=0,relay=false,bytes=0,codec='';
    const report=await b.getStats();const byId=new Map();report.forEach(x=>byId.set(x.id,x));
    report.forEach(x=>{
      if(x.type==='inbound-rtp'&&(x.kind==='audio'||x.mediaType==='audio')){inboundPackets+=Number(x.packetsReceived||0);const c=byId.get(x.codecId);if(c?.mimeType)codec=c.mimeType;}
      if(x.type==='outbound-rtp'&&(x.kind==='audio'||x.mediaType==='audio'))outboundPackets+=Number(x.packetsSent||0);
      if(x.type==='candidate-pair'&&x.state==='succeeded'&&(x.nominated||x.selected)){const l=byId.get(x.localCandidateId),r=byId.get(x.remoteCandidateId);relay=l?.candidateType==='relay'||r?.candidateType==='relay';bytes+=Number(x.bytesReceived||0)+Number(x.bytesSent||0);}
    });
    const result={firstConnectMs,state:a.connectionState,iceState:a.iceConnectionState,receivedTracks:received.length,inboundPackets,outboundPackets,relay,bytes,codec,restarted:restart};
    a.close();b.close();destination.stream.getTracks().forEach(t=>t.stop());oscillator.stop();await context.close();
    return result;
  },{iceServers,policy,durationMs,restart});
}

const results=[];
results.push({scenario:'p2p-baseline',...(await runScenario('p2p-baseline','all',5000,false))});
results.push({scenario:'p2p-ice-restart',...(await runScenario('p2p-ice-restart','all',4000,true))});
results.push({scenario:'turn-forced',...(await runScenario('turn-forced','relay',7000,false))});
await browser.close();
for(const result of results){
  if(result.state!=='connected'||result.receivedTracks<1||result.inboundPackets<1)throw new Error(`Scenario failed: ${JSON.stringify(result)}`);
  if(result.scenario==='turn-forced'&&!result.relay)throw new Error(`TURN was not used: ${JSON.stringify(result)}`);
}
console.log(JSON.stringify({testedAt:new Date().toISOString(),results},null,2));
