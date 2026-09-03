export function isLeaseLive(data,now){return !!data?.until&&data.until.toMillis()>now;}
export function canJoinGroup(group,uid){return !!group?.active&&(group.members.includes(uid)||group.members.length<4);}
