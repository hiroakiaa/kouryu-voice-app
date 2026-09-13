import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

const app=await readFile(new URL('../phone-app.js',import.meta.url),'utf8');
const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
const rules=await readFile(new URL('../firestore.rules',import.meta.url),'utf8');

test('送信端末と受信端末で同じ連絡状態を共有する',()=>{
 const notice={id:'m_demo',senderUid:'a',recipientUids:['b'],status:'open',responses:{},delivery:{b:'sent'}};
 const senderView={...notice};
 const recipientView={...notice,responses:{b:{state:'accepted',name:'先生B',text:'',at:2}}};
 senderView.responses=structuredClone(recipientView.responses);
 assert.equal(senderView.responses.b.state,'accepted');
 senderView.status='completed';
 recipientView.status=senderView.status;
 assert.equal(recipientView.status,'completed');
});

test('期限、失敗通知の再送、管理者の送信設定を備える',()=>{
 for(const id of ['phoneNoticeDeadline','adminNoticeAllowAll','adminNoticeAllowGroup','adminNoticeAllowUrgent','adminPasswordChangeForm','appRecovery']) assert.match(html,new RegExp(`id="${id}"`));
 assert.match(app,/retryNoticeNotifications/);
 assert.match(app,/data-notice-retry/);
 assert.match(app,/wakaru-notice-permissions/);
 assert.match(rules,/deadlineAt/);
});

