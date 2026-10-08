import {firebaseConfig} from './firebase-config.js';
import {label,sortHand,canSelfDraw,availableClaims,actionableClaims,normalizeClaimState,applyAction,startHand,nextHand,WINDS} from './engine.js';

const $=s=>document.querySelector(s), esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const configured=Boolean(firebaseConfig.apiKey&&firebaseConfig.projectId&&firebaseConfig.appId);
const demoKey='paika-demo-v1';let state={uid:'demo-user',name:localStorage.getItem('paika-name')||'訪客玩家',rooms:[],ledger:[],roomId:null,gameView:null,view:'lobby',firebase:null,user:null,unsubscribe:[],selected:null};
const nowMonth=()=>new Date().toLocaleDateString('sv-SE',{timeZone:'Asia/Taipei'}).slice(0,7);
const fmt=n=>new Intl.NumberFormat('zh-TW',{maximumFractionDigits:0}).format(n||0);
const dateLabel=t=>new Date(t).toLocaleString('zh-TW',{timeZone:'Asia/Taipei',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'});
const activeRoom=()=>configured?(state.gameView?.id===state.roomId?state.gameView:state.rooms.find(r=>r.id===state.roomId)):state.rooms.find(r=>r.id===state.roomId);
const mySeat=g=>g?.players.findIndex(p=>p.uid===state.uid)??-1;
const toast=s=>{const n=$('#notice');n.textContent=s;clearTimeout(toast.timer);toast.timer=setTimeout(()=>n.textContent='',6500)};
const saveDemo=()=>localStorage.setItem(demoKey,JSON.stringify({rooms:state.rooms,ledger:state.ledger}));
function loadDemo(){try{const data=JSON.parse(localStorage.getItem(demoKey)||'{}');state.rooms=(data.rooms||[]).map(normalizeClaimState);state.ledger=data.ledger||[];saveDemo()}catch{state.rooms=[];state.ledger=[]}}
function player(uid,name){return {uid,name,hand:[],flowers:[],melds:[],discards:[],balance:0,passed:false}}
function seedDemoRoom(){if(state.rooms.length)return;state.rooms=[{id:'DEMO01',name:'週五牌咖局',host:'demo-host',base:30,perTai:10,rounds:1,players:[player('demo-host','阿明'),player('demo-guest','小美')],phase:'waiting',dealer:0,dealerStreak:0,handNumber:0,handSerial:0,createdAt:Date.now()-3600000,updatedAt:Date.now()-3600000}];saveDemo()}
function normalizeRoom(id,data){return {...data,id}}
async function initFirebase(){
  if(!configured){loadDemo();seedDemoRoom();render();return}
  try{
    const [app,auth,firestore,functions]=await Promise.all([
      import('https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js'),
      import('https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js'),
      import('https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js'),
      import('https://www.gstatic.com/firebasejs/11.10.0/firebase-functions.js')
    ]);
    const fapp=app.initializeApp(firebaseConfig),au=auth.getAuth(fapp),db=firestore.getFirestore(fapp),fn=functions.getFunctions(fapp,'asia-east1');
    state.firebase={auth,firestore,functions,au,db,fn};
    auth.onAuthStateChanged(au,async user=>{
      state.unsubscribe.forEach(u=>u());state.unsubscribe=[];state.user=user;
      if(user){
        state.uid=user.uid;
        const profile=await firestore.getDoc(firestore.doc(db,'profiles',user.uid));
        state.name=profile.exists()?profile.data().name:(user.displayName||user.email?.split('@')[0]||'牌咖');
        if(!profile.exists())await firestore.setDoc(firestore.doc(db,'profiles',user.uid),{name:state.name,email:user.email||'',createdAt:Date.now()});
        state.unsubscribe.push(firestore.onSnapshot(firestore.collection(db,'lobby'),snap=>{
          state.rooms=snap.docs.map(d=>normalizeRoom(d.id,d.data())).sort((a,b)=>b.updatedAt-a.updatedAt);
          const changed=snap.docChanges().some(c=>c.doc.id===state.roomId);
          if(changed)fetchGameView();
          render();
        },e=>toast('房間資料讀取失敗：'+e.message)));
        state.unsubscribe.push(firestore.onSnapshot(firestore.collection(db,'ledger'),snap=>{state.ledger=snap.docs.map(d=>({id:d.id,...d.data()}));render()},e=>toast('記帳讀取失敗：'+e.message)));
      }else{state.uid=null;state.name='訪客玩家';state.rooms=[];state.ledger=[];state.roomId=null;state.gameView=null;showView('lobby');render()}
    });
    render();
  }catch(e){console.error(e);toast('Firebase 連線失敗：'+e.message)}
}
let gameViewRequest=0;
async function fetchGameView(){
  if(!configured||!state.user||!state.roomId)return;
  const id=state.roomId,request=++gameViewRequest;
  try{const {functions:f,fn}=state.firebase;const result=await f.httpsCallable(fn,'getGameView')({id});if(request===gameViewRequest&&state.roomId===id){state.gameView=result.data;render()}}
  catch(e){if(request===gameViewRequest){state.gameView=null;render();if(e.code!=='functions/permission-denied')toast('牌桌讀取失敗：'+e.message)}}
}
async function signIn(){if(!configured){toast('目前為示範模式。請先填入 Firebase 設定以啟用 Google 登入。');return}const {auth,au}=state.firebase;try{await auth.signInWithPopup(au,new auth.GoogleAuthProvider())}catch(e){toast('登入失敗：'+e.message)}}
async function signOut(){if(configured){await state.firebase.auth.signOut(state.firebase.au)}else toast('示範模式無須登出')}
function ensureAuth(){if(configured&&!state.user){signIn();return false}return true}
function showView(view){state.view=view;document.querySelectorAll('.view').forEach(n=>n.classList.toggle('active',n.id===view+'View'));document.querySelectorAll('.nav-item').forEach(n=>n.classList.toggle('active',n.dataset.view===view));const titles={lobby:'今晚，開一桌吧。',table:'牌桌開打',account:'每一筆，都算清楚。',ranking:'高手，都在這裡。',rules:'好規矩，好牌局。'};$('#pageTitle').textContent=titles[view]||titles.lobby;render()}
function render(){const d=new Date();$('#todayLabel').textContent=new Intl.DateTimeFormat('zh-TW',{timeZone:'Asia/Taipei',year:'numeric',month:'long',day:'numeric',weekday:'short'}).format(d);$('#modeTag').textContent=configured?'線上模式':'示範模式';$('#profileName').textContent=state.name;$('#avatar').textContent=state.name.slice(0,1);$('#profileSub').textContent=configured?(state.user?.email||'請先登入'):'本機暱稱';$('#authBtn').textContent=configured?(state.user?'已登入 Google':'Google 登入'):'設定 Google 登入';$('#authBtn').disabled=configured&&Boolean(state.user);$('#roomCount').textContent=state.rooms.length+' 間房';renderRooms();if(state.view==='table')renderGame();if(state.view==='account')renderAccount();if(state.view==='ranking')renderRanking();if(state.view==='rules')renderRules()}
function renderRooms(){const root=$('#rooms');if(!state.rooms.length){root.innerHTML='<div class="empty-card"><strong>目前沒有房間</strong><p>開一桌，邀朋友一起坐下來。</p></div>';return}root.innerHTML=state.rooms.map(r=>`<article class="room-card"><div class="room-card-top"><span class="room-icon">🀄</span><span class="room-status ${r.phase!=='waiting'?'playing':''}">${r.phase==='waiting'?'等待入席':r.phase==='finished'?'已結束':'進行中'}</span></div><h3>${esc(r.name)}</h3><div class="room-meta">${r.base} / ${r.perTai} · ${r.rounds} 將 · ${r.players.length}/4 人</div><div class="room-footer"><strong>${esc(r.players[0]?.name||'')}</strong><button data-room="${esc(r.id)}">${r.players.some(p=>p.uid===state.uid)?'回到牌桌':'查看房間'} →</button></div></article>`).join('')}
function openRoom(id){const r=state.rooms.find(x=>x.id===id);if(!r)return;state.roomId=id;state.gameView=null;showView('table');if(configured&&r.players.some(p=>p.uid===state.uid))fetchGameView()}
async function createRoom(data){if(!ensureAuth())return;const [base,perTai]=data.stakes.split('/').map(Number);let room={name:data.name.trim(),host:state.uid,base,perTai,rounds:Number(data.rounds),players:[player(state.uid,state.name)],phase:'waiting',dealer:0,dealerStreak:0,handNumber:0,handSerial:0,createdAt:Date.now(),updatedAt:Date.now()};if(configured){try{const {functions:f,fn}=state.firebase;const result=await f.httpsCallable(fn,'createRoom')({name:room.name,base,perTai,rounds:room.rounds});state.roomId=result.data.id;state.gameView=null;fetchGameView()}catch(e){toast('開房失敗：'+e.message);return}}else{room.id=Math.random().toString(36).slice(2,8).toUpperCase();room.players.push(player('bot-1','東風阿明'),player('bot-2','南風小美'),player('bot-3','西風老林'));room=startHand(room);state.rooms.unshift(room);state.roomId=room.id;saveDemo()}showView('table');maybeBot()}
async function joinRoom(){const room=activeRoom();if(!room||!ensureAuth())return;if(room.players.some(p=>p.uid===state.uid))return;if(room.phase!=='waiting'||room.players.length>=4){toast('此房間目前無法加入');return}if(configured){try{const {functions:f,fn}=state.firebase;await f.httpsCallable(fn,'joinRoom')({id:room.id});fetchGameView()}catch(e){toast(e.message)}}else{room.players.push(player(state.uid,state.name));while(room.players.length<4)room.players.push(player('bot-'+room.players.length,['阿明','小美','老林'][room.players.length-1]));const g=startHand(room);state.rooms=state.rooms.map(r=>r.id===room.id?g:r);saveDemo();render();maybeBot()}}
function ledgerFor(g,old){if(g.phase!=='result'||old.phase==='result'||!g.winner)return[];const month=nowMonth(),time=Date.now();return g.players.map((p,i)=>{const delta=(p.balance||0)-(old.players[i].balance||0);return{id:`${g.id}_${g.handSerial||0}_${p.uid}`,uid:p.uid,name:p.name,roomId:g.id,roomName:g.name,month,time,delta,tai:g.winner.scoring.tai,kind:g.winner.selfDraw?'自摸':'胡牌'}}).filter(x=>x.delta!==0)}
async function mutate(action,seat=mySeat(activeRoom())){const room=activeRoom();if(!room)return;try{if(configured){const {functions:f,fn}=state.firebase;const cleanAction=Object.fromEntries(Object.entries(action).filter(([,value])=>value!==undefined));await f.httpsCallable(fn,'gameAction')({id:room.id,action:cleanAction});fetchGameView()}else{const old=structuredClone(room),g=action.type==='next'?nextHand(room):applyAction(room,seat,action);if(action.type==='next')g.handSerial=(old.handSerial||0)+1;state.rooms=state.rooms.map(r=>r.id===room.id?g:r);state.ledger.push(...ledgerFor(g,old));saveDemo();render();maybeBot()}}catch(e){toast(e.message)}}
function tileHtml(t,extra=''){return `<span class="tile ${t[0]==='f'?'flower':t==='z5'?'red':t==='z6'?'green':''}" ${extra}>${label(t)}</span>`}
function renderGame(){
  const root=$('#game'),g=activeRoom();
  if(!g){root.innerHTML='<div class="empty-card"><strong>房間載入中</strong></div>';return}
  $('#tableTitle').textContent=g.name;
  if(configured&&g.phase!=='waiting'&&state.gameView?.id!==g.id){
    root.innerHTML=`<div class="wait-panel"><h3>${g.players.some(p=>p.uid===state.uid)?'正在載入牌桌…':'此房間已開局'}</h3></div>`;
    return;
  }
  const seat=mySeat(g),me=g.players[seat],host=g.host===state.uid;
  let body='';
  if(g.phase==='waiting'){
    body=`<div class="wait-panel"><h3>等待牌咖入席</h3><p>房號 ${esc(g.id)} · ${g.players.length}/4 人 · 坐滿自動開局</p><p>${g.players.map(p=>esc(p.name)).join('　·　')}</p>${seat<0?'<button class="button button-accent" data-action="join">加入房間</button>':'<span class="badge">你已入席</span>'}</div>`;
  }else if(g.phase==='finished'){
    body=`<div class="result-panel"><h3>本場結束</h3><p>${g.rounds} 將已完成。輸贏已記錄於每月記帳。</p>${g.players.map(p=>`<p>${esc(p.name)}　${fmt(p.balance)} 元</p>`).join('')}</div>`;
  }else{
    const anchor=seat>=0?seat:0;
    const positions={top:(anchor+2)%4,left:(anchor+3)%4,right:(anchor+1)%4,bottom:anchor};
    const seatCard=(index,position)=>{
      const p=g.players[index],wind=WINDS[(index-g.dealer+4)%4];
      return `<section class="board-seat board-${position} ${g.turn===index?'active':''}" aria-label="${esc(p.name)}的座位與棄牌"><div class="board-player"><span class="seat-avatar">${esc(p.name.slice(0,1))}</span><span><b>${esc(p.name)} ${index===g.dealer?'👑':''}</b><small>${wind}家 · ${p.melds.length} 副露牌 · ${p.flowers.length} 花</small></span></div><div class="seat-discards" aria-label="${esc(p.name)}打出的牌">${p.discards.map(t=>tileHtml(t)).join('')||'<span class="discard-empty">尚未出牌</span>'}</div></section>`;
    };
    let actions='';
    if(seat>=0){
      if(g.phase==='discard'&&g.turn===seat){
        actions+='<span class="badge">請選一張牌打出</span>';
        if(canSelfDraw(g,seat))actions+='<button data-action="win">自摸</button>';
        const counts={};me.hand.forEach(t=>counts[t]=(counts[t]||0)+1);
        Object.keys(counts).filter(t=>counts[t]>=4).forEach(t=>actions+=`<button data-action="kongSelf" data-tile="${t}">暗槓 ${label(t)}</button>`);
      }
      if(g.phase==='claim'&&g.lastDiscard.seat!==seat&&!me.passed){
        const available=availableClaims(g,seat);
        const claims=configured?(g.myClaims||[]):actionableClaims(g,seat);
        for(const c of claims)actions+=`<button data-action="${c.type}" data-tiles="${c.tiles?.join(',')||''}">${{win:'胡',kong:'槓',pong:'碰',chow:'吃'}[c.type]}${c.tiles?' '+c.tiles.map(label).join(''):''}</button>`;
        if(available.length)actions+='<button class="secondary" data-action="pass">過</button>';
        if(available.length&&!claims.length)actions+='<span class="badge">等待前位玩家回應</span>';
      }
    }
    if(g.phase==='result')actions=host?'<button data-action="next">下一局</button>':'<span class="badge">等房主開下一局</span>';
    const flowers=me?.flowers.map(t=>tileHtml(t)).join('')||'';
    const melds=me?.melds.map(m=>`<span class="meld-group">${m.tiles.map(t=>tileHtml(t)).join('')}</span>`).join('')||'';
    const hand=me?.hand.map((t,i)=>`<button class="tile ${t==='z5'?'red':t==='z6'?'green':''}" data-tile-index="${i}" title="打出 ${label(t)}">${label(t)}</button>`).join('')||'';
    const result=g.phase==='result'&&g.winner?`<p>${esc(g.players[g.winner.seat].name)} ${g.winner.selfDraw?'自摸':'胡牌'} · ${g.winner.scoring.tai} 台</p><p>${g.winner.dealerAmount?`閒家 ${fmt(g.winner.amount)} 元、莊家 ${fmt(g.winner.dealerAmount)} 元`:`每家 ${fmt(g.winner.amount)} 元`}</p><p>${g.winner.scoring.items.map(x=>`${x.name} ${x.tai} 台`).join(' · ')}</p>`:'';
    const lastTile=g.lastDiscard?`<div class="last-play">${tileHtml(g.lastDiscard.tile)}</div>`:'';
    body=`<div class="table-surface"><div class="mahjong-board">${seatCard(positions.top,'top')}${seatCard(positions.left,'left')}<div class="board-center"><span class="eyebrow">${WINDS[Math.floor((g.handNumber||0)/4)%4]}風圈 · 第 ${(g.handNumber||0)%4+1} 局 · 牌牆 ${Math.max(0,g.wall?.length-16||0)} 張</span><strong>${esc(g.message||'對局進行中')}</strong>${lastTile}${result}</div>${seatCard(positions.right,'right')}${seatCard(positions.bottom,'bottom')}</div>${seat>=0?`<div class="player-info"><b>${esc(me.name)} ${seat===g.dealer?'👑':''}</b><span>${me.water?'🔄 過水中 · ':''}${WINDS[(seat-g.dealer+4)%4]}家 · ${fmt(me.balance)} 元</span></div><div class="flowers">${flowers}</div><div class="melds">${melds}</div><div class="hand">${hand}</div><div class="table-actions">${actions}</div>`:''}</div>`;
  }
  root.innerHTML=`<div class="compact muted" style="margin-bottom:10px">房號 ${esc(g.id)}　·　${g.base}/${g.perTai}　·　${g.rounds} 將　·　${g.players.length}/4 人</div>${body}`;
}
function renderAccount(){const month=$('#monthPicker').value||nowMonth();const rows=state.ledger.filter(x=>x.uid===state.uid&&x.month===month).sort((a,b)=>b.time-a.time),sum=rows.reduce((s,x)=>s+x.delta,0),wins=rows.filter(x=>x.delta>0).length;$('#account').innerHTML=`<div class="score-grid"><div class="stat-card"><small>本月合計</small><strong class="${sum>=0?'positive':'negative'}">${sum>=0?'+':''}${fmt(sum)}</strong></div><div class="stat-card"><small>贏牌局數</small><strong>${wins}</strong></div><div class="stat-card"><small>記錄筆數</small><strong>${rows.length}</strong></div></div><div class="ledger-list">${rows.length?rows.map(x=>`<div class="ledger-row"><span><b>${esc(x.roomName)}</b><small>${dateLabel(x.time)} · ${x.kind} · ${x.tai} 台</small></span><strong class="${x.delta>=0?'positive':'negative'}">${x.delta>=0?'+':''}${fmt(x.delta)}</strong></div>`).join(''):'<div class="loading">這個月還沒有輸贏記錄。打完一局就會自動出現在這裡。</div>'}</div>`}
function renderRanking(){const period=$('#rankPeriod').value,rows=state.ledger.filter(x=>period==='all'||x.month===nowMonth()),scores=new Map();for(const x of rows){const v=scores.get(x.uid)||{uid:x.uid,name:x.name,total:0,hands:0};v.name=x.name;v.total+=x.delta;v.hands++;scores.set(x.uid,v)}const ranked=[...scores.values()].sort((a,b)=>b.total-a.total);$('#ranking').innerHTML=`<div class="rank-list">${ranked.length?ranked.map((x,i)=>`<div class="rank-row"><span class="rank-position">${String(i+1).padStart(2,'0')}</span><span><b>${esc(x.name)}</b><small>${x.hands} 筆記錄</small></span><strong class="${x.total>=0?'positive':'negative'}">${x.total>=0?'+':''}${fmt(x.total)}</strong></div>`).join(''):'<div class="loading">尚無排行榜資料。完成牌局後就會顯示。</div>'}</div>`}
function renderRules(){$('#rules').innerHTML=`<div class="rules-grid"><div class="rule-card"><h3>🀄 台灣十六張</h3><p>四人各取 16 張，莊家先有 17 張。以五組面子加一對眼胡牌。只能吃上家的棄牌，也可碰、槓；花牌亮出後從牌尾補牌。牌牆保留最後 16 張為底牌。</p></div><div class="rule-card"><h3>💰 底台與結算</h3><p>可選 30/10、50/20、100/20。單家付款為 <b>底 + 台數 × 每台金額</b>。放槍由放槍者付；自摸由三家各付。每筆輸贏進入當月記帳。</p></div><div class="rule-card"><h3>♛ 基本台數</h3><ul><li>自摸 1 台、門清 1 台；門清自摸另加 1 台</li><li>莊家 1 台，連莊每次加 2 台</li><li>正花每張 1 台；八仙過海 8 台</li><li>紅中、發財、白板刻子各 1 台</li><li>碰碰胡 4 台、湊一色 4 台、清一色 8 台、字一色 16 台</li></ul></div><div class="rule-card"><h3>🔄 過水</h3><p>放棄可胡的棄牌後進入過水；解過水前不能胡別人的牌，也不能自摸。輪到自己時打出一張原本不能胡的牌，即解除過水。沒有合法吃、碰、槓、胡時會自動略過，不須按「過」。</p></div><div class="rule-card"><h3>🧭 將與圈</h3><p>每人輪流做莊為一圈，四圈是一將，至少 16 局。莊家胡牌或流局續莊。房主在每局結束後開下一局。</p><p class="muted">台數有地方差異，這裡採用常見桌規；開局前請與牌友確認。</p></div></div>`}
let botTimer=null;function maybeBot(){if(configured||state.view!=='table')return;clearTimeout(botTimer);const g=activeRoom();if(!g||['waiting','result','finished'].includes(g.phase))return;botTimer=setTimeout(async()=>{const game=activeRoom();if(!game)return;if(game.phase==='claim'){const human=mySeat(game);for(let i=0;i<4;i++){if(i===human||i===game.lastDiscard.seat||game.players[i].passed)continue;const win=actionableClaims(game,i).find(x=>x.type==='win');await mutate(win||{type:'pass'},i);return}}else if(game.phase==='discard'&&game.turn!==mySeat(game)){const seat=game.turn,p=game.players[seat];if(canSelfDraw(game,seat))await mutate({type:'win'},seat);else await mutate({type:'discard',tile:p.hand[Math.floor(Math.random()*p.hand.length)]},seat)}},650)}
document.addEventListener('click',async e=>{
  const nav=e.target.closest('[data-view]');if(nav){showView(nav.dataset.view);return}
  const room=e.target.closest('[data-room]');if(room){openRoom(room.dataset.room);maybeBot();return}
  const tile=e.target.closest('[data-tile-index]');
  if(tile){const g=activeRoom();if(g?.phase==='discard'&&g.turn===mySeat(g))await mutate({type:'discard',tile:g.players[mySeat(g)].hand[Number(tile.dataset.tileIndex)]});return}
  const action=e.target.closest('[data-action]');
  if(!action||action.disabled)return;
  const type=action.dataset.action,previous=action.textContent;
  action.disabled=true;action.textContent=type==='win'?'胡牌確認中…':'處理中…';
  try{
    if(type==='join')await joinRoom();
    else if(type==='next')await mutate({type});
    else await mutate({type,tile:action.dataset.tile,tiles:action.dataset.tiles?action.dataset.tiles.split(','):undefined});
  }finally{if(action.isConnected){action.disabled=false;action.textContent=previous}}
});
$('#createBtn').onclick=()=>{if(ensureAuth())$('#createDialog').showModal()};$('#createForm').addEventListener('submit',async e=>{e.preventDefault();const data=Object.fromEntries(new FormData(e.target));$('#createDialog').close();await createRoom(data)});$('#profileBtn').onclick=()=>{if(configured&&!state.user){signIn();return}$('#profileForm').elements.nickname.value=state.name;$('#profileHint').textContent=configured?'暱稱會存入資料庫，下次 Google 登入繼續使用。':'示範模式暱稱僅儲存在此瀏覽器。';$('#signOutBtn').style.display=configured?'block':'none';$('#profileDialog').showModal()};$('#profileForm').addEventListener('submit',async e=>{e.preventDefault();const name=e.target.elements.nickname.value.trim();if(!name)return;state.name=name;if(configured){const {firestore:f,db}=state.firebase;await f.setDoc(f.doc(db,'profiles',state.uid),{name,email:state.user.email||'',updatedAt:Date.now()},{merge:true})}else localStorage.setItem('paika-name',name);$('#profileDialog').close();render();toast('暱稱已儲存')});$('#authBtn').onclick=signIn;$('#signOutBtn').onclick=async()=>{$('#profileDialog').close();await signOut()};$('#backLobby').onclick=()=>showView('lobby');$('#refreshBtn').onclick=()=>render();$('#copyRoom').onclick=async()=>{const id=activeRoom()?.id;if(id){await navigator.clipboard.writeText(id);toast('房號已複製：'+id)}};$('#monthPicker').value=nowMonth();$('#monthPicker').onchange=renderAccount;$('#rankPeriod').onchange=renderRanking;
initFirebase();

