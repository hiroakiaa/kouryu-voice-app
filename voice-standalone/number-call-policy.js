export function normalizeNumber(value){const n=String(value).normalize('NFKC').replace(/[\s-]/g,'');return /^\d{8}$/.test(n)?n:null;}
export function formatNumber(n){return n.slice(0,4)+' '+n.slice(4);}
export function canAddCaller(room,owner,caller,now){return owner!==caller&&(!room||(room.active&&room.ownerUid===owner&&room.members.length<4&&!room.members.includes(caller)&&room.expiresAt.toMillis()>now));}
