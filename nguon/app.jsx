
const {useState,useEffect,useRef,useCallback,useMemo} = React;
// State gắn với localStorage: trả về [giá trị, lưu]. `lưu` nhận giá trị hoặc hàm cập nhật,
// ghi vào store ngay trong updater nên chạm nhanh liên tiếp không mất dữ liệu.
function usePersist(key, def){
  const [val,setVal]=useState(()=>store.get(key,def));
  const save=(v)=>{ setVal(prev=>{ const nv=(typeof v==='function')?v(prev):v; store.set(key,nv); return nv; }); };
  return [val, save];
}

/* ---------- Đồng bộ đám mây (Supabase) ---------- */
const SB_URL='https://ltmlueqkajqmduoqghdf.supabase.co';
const SB_KEY='sb_publishable_74Lm6cc0CkoOOzy3A4IRrQ_BX0jHQcg';
let sbc=null; try{ if(window.supabase&&window.supabase.createClient) sbc=window.supabase.createClient(SB_URL,SB_KEY,{auth:{persistSession:true,autoRefreshToken:true}}); }catch(e){}
const SB_OK=!!sbc;
let cloudUser=null, cloudStatus='off';
const cloudSubs=[];
const onCloud=(f)=>{ cloudSubs.push(f); return ()=>{ const i=cloudSubs.indexOf(f); if(i>=0) cloudSubs.splice(i,1); }; };
const cloudNotify=()=>cloudSubs.forEach(f=>{ try{f();}catch(e){} });
const setStatus=(s)=>{ cloudStatus=s; cloudNotify(); };
const getCloudUser=()=>cloudUser, getCloudStatus=()=>cloudStatus;
const SYNC_KEYS=['nc.theme','nc.fontsize','nc.taborder','nc.segorder','nc.breath','nc.bpm','nc.metroSound','nc.shotTotal','nc.shotPhases','nc.routine',
  'nc.matches','nc.mistakes','nc.positions','nc.music','nc.musicMatch','nc.tips','nc.warvotes','nc.cuevotes','nc.customcues','nc.mindsetquotes',
  'nc.plans','nc.customDrills','nc.customProblems','nc.hiddenDrills','nc.hiddenProblems','nc.weakHidden',
  'nc.ghostTypes','nc.training','nc.ghost','nc.liveTally','nc.customMistakes','nc.knowrev','nc.weekplan','nc.knowarchive','nc.knowpin','nc.knowfav','nc.readtable'];
// Nguồn duy nhất cho danh sách key. PREF = cài đặt/giao diện (giữ khi xoá dữ liệu);
// DATA = dữ liệu người dùng (trận, thế bi, lỗi, tập luyện...) + vài key ngày-cục-bộ không đồng bộ.
const PREF_KEYS=['nc.theme','nc.fontsize','nc.taborder','nc.segorder','nc.breath','nc.bpm','nc.metroSound','nc.shotTotal','nc.shotPhases','nc.routine','nc.music','nc.musicMatch'];
const DATA_KEYS=SYNC_KEYS.filter(k=>!PREF_KEYS.includes(k)).concat(['nc.planAdd','nc.planHidden']);
const cloudSnap=()=>{ const d={}; SYNC_KEYS.forEach(k=>{ const v=localStorage.getItem(k); if(v!=null) d[k]=v; }); return d; };
const cloudApply=(data)=>{ if(!data) return; Object.keys(data).forEach(k=>{ if(k.indexOf('nc.')===0 && k!=='nc._syncAt'){ const v=data[k]; try{ localStorage.setItem(k, typeof v==='string'?v:JSON.stringify(v)); }catch(e){} } }); };
const cloudHasLocal=()=>['nc.matches','nc.training','nc.ghost','nc.positions','nc.mistakes','nc.plans','nc.customDrills','nc.customProblems','nc.tips'].some(k=>{ try{ const v=JSON.parse(localStorage.getItem(k)||'null'); return v && (Array.isArray(v)? v.length : Object.keys(v).length); }catch(e){ return false; } });
let pushT=null;
const schedulePush=()=>{ if(!sbc||!cloudUser) return; setStatus('syncing'); clearTimeout(pushT); pushT=setTimeout(cloudPush,1500); };
async function cloudPush(){ if(!sbc||!cloudUser) return; try{ const at=new Date().toISOString();
  const {error}=await sbc.from('nhipco_state').upsert({user_id:cloudUser.id,data:cloudSnap(),updated_at:at});
  if(error) throw error; localStorage.setItem('nc._syncAt',at); setStatus('synced'); }catch(e){ setStatus('error'); } }
async function cloudRow(){ if(!sbc||!cloudUser) return null; try{ const {data,error}=await sbc.from('nhipco_state').select('data,updated_at').eq('user_id',cloudUser.id).maybeSingle(); if(error) throw error; return data; }catch(e){ return null; } }
async function cloudPullOnMount(){ setStatus('syncing'); const row=await cloudRow();
  if(!row){ if(cloudHasLocal()) await cloudPush(); else setStatus('synced'); return; }
  const remoteHas=row.data && Object.keys(row.data).length;
  if(remoteHas && row.updated_at!==localStorage.getItem('nc._syncAt')){ cloudApply(row.data); localStorage.setItem('nc._syncAt',row.updated_at); location.reload(); return; }
  if(!remoteHas && cloudHasLocal()) await cloudPush(); else setStatus('synced'); }
async function cloudFreshLogin(){ setStatus('syncing'); const row=await cloudRow();
  const remoteHas=row && row.data && Object.keys(row.data).length;
  if(remoteHas && cloudHasLocal() && row.updated_at!==localStorage.getItem('nc._syncAt')){
    if(window.confirm('Tài khoản này đã có dữ liệu trên mây.\n\nOK = TẢI VỀ (ghi đè máy này).\nCancel = ĐẨY dữ liệu máy này lên mây.')){ cloudApply(row.data); localStorage.setItem('nc._syncAt',row.updated_at); location.reload(); }
    else { await cloudPush(); }
  } else if(remoteHas){ cloudApply(row.data); localStorage.setItem('nc._syncAt',row.updated_at); location.reload(); }
  else { await cloudPush(); } }
async function cloudPullManual(){ setStatus('syncing'); const row=await cloudRow();
  if(row && row.data && Object.keys(row.data).length){ cloudApply(row.data); localStorage.setItem('nc._syncAt',row.updated_at); location.reload(); }
  else { setStatus('synced'); window.alert('Trên mây chưa có dữ liệu.'); } }
async function cloudSignIn(email,pass){ const {data,error}=await sbc.auth.signInWithPassword({email,password:pass}); if(error) throw error; return data; }
async function cloudSignUp(email,pass){ const {data,error}=await sbc.auth.signUp({email,password:pass}); if(error) throw error; return data; }
async function cloudChangePassword(newPass){ const {data,error}=await sbc.auth.updateUser({password:newPass}); if(error) throw error; return data; }
async function cloudSignOut(){ try{ await sbc.auth.signOut(); }catch(e){} localStorage.removeItem('nc._syncAt'); }
function cloudInit(){ if(!sbc) return;
  sbc.auth.getSession().then(({data})=>{ cloudUser=data.session?data.session.user:null; cloudNotify(); if(cloudUser){ cloudPullOnMount(); } });
  sbc.auth.onAuthStateChange((ev,session)=>{ cloudUser=session?session.user:null; if(!cloudUser) setStatus('off'); cloudNotify(); }); }

/* ---------- store ---------- */
const mem={};
const store={
  get(k,d){ try{const v=localStorage.getItem(k);return v==null?d:JSON.parse(v);}catch(e){return k in mem?mem[k]:d;} },
  set(k,v){ try{localStorage.setItem(k,JSON.stringify(v));}catch(e){mem[k]=v;} if(k.indexOf('nc.')===0 && k!=='nc._syncAt') schedulePush(); }
};

const THEMES=[
  {key:'felt',     name:'Dạ xanh',  c:'#0d2b22', g:'#f4c95d'},
  {key:'midnight', name:'Đêm xanh', c:'#0e1530', g:'#9db4ff'},
  {key:'coffee',   name:'Cà phê',   c:'#231811', g:'#e6a44e'},
  {key:'court',    name:'Sáng',     c:'#e3ede8', g:'#0f9d6b'},
  {key:'racing',     name:'Đỏ đua',        c:'#161311', g:'#ff8a5b'},
  {key:'neon',       name:'Lục dạ quang',  c:'#0c1408', g:'#b6ff5a'},
  {key:'peach',      name:'Đào',           c:'#fff1ea', g:'#e2733e'},
  {key:'sage',       name:'Cỏ xanh',       c:'#eef6ee', g:'#4f9d52'},
  {key:'periwinkle', name:'Tử đinh hương', c:'#eef0fc', g:'#4f5fd6'},
];
function applyTheme(k){ document.body.className = k==='felt' ? '' : 'theme-'+k; store.set('nc.theme',k); }

// Cỡ chữ: mọi cỡ chữ trong CSS và style inline đều viết bằng rem, nên chỉ cần đổi
// font-size của <html> là cả app to/nhỏ theo. Ghi vào style của <html> chứ không đặt
// class trên body — applyTheme() ghi đè nguyên body.className nên class ở đó sẽ mất.
const FONT_SIZES=[
  {key:'s',  name:'Nhỏ',     px:14, vd:'A'},
  {key:'m',  name:'Vừa',     px:16, vd:'A'},
  {key:'l',  name:'Lớn',     px:18, vd:'A'},
  {key:'xl', name:'Rất lớn', px:20, vd:'A'},
];
const FS_MAC_DINH='m';
function fsPx(k){ const f=FONT_SIZES.find(x=>x.key===k); return (f||FONT_SIZES[1]).px; }
function applyFontSize(k){ document.documentElement.style.fontSize=fsPx(k)+'px'; store.set('nc.fontsize',k); }
// Áp ngay lúc nạp mã, trước khi React vẽ — tránh nháy một nhịp cỡ chữ mặc định.
try{ document.documentElement.style.fontSize=fsPx(store.get('nc.fontsize',FS_MAC_DINH))+'px'; }catch(e){}

const DEFAULT_ROUTINE=[
  {t:'Đọc bàn',        s:'Bi nào dễ? Có chùm bi cần phá không?'},
  {t:'Chọn lỗ & bi kế',s:'Đánh bi này để mở đường cho bi sau'},
  {t:'Ngắm đường cơ',  s:'Tâm bi → điểm chạm → lỗ, một đường thẳng'},
  {t:'Tì tay & nhắm',  s:'Vào thế vững, mắt ở điểm chạm'},
  {t:'Đưa cơ thử',     s:'2–3 nhịp nhẹ, thả lỏng cổ tay'},
  {t:'Bắn dứt khoát',  s:'Nhìn bi mục tiêu, đẩy thẳng, giữ cơ'},
];

const CUES=[
  {tag:'Tập trung', t:'Chỉ nghĩ về cú đánh này. Tỉ số để sau.'},
  {tag:'Bình tĩnh', t:'Thua 1 cú không thua cả ván. Thở ra, làm lại.'},
  {tag:'Nhịp độ',   t:'Đừng vội theo nhịp đối thủ. Đánh theo nhịp của bạn.'},
  {tag:'Kỹ thuật',  t:'Đẩy cơ thẳng và giữ cơ sau khi bắn — đừng giật tay.'},
  {tag:'Chiến thuật',t:'Không có cú dễ? Đánh phòng thủ, giấu bi cái.'},
  {tag:'Tự tin',    t:'Bạn đã đánh cú này hàng trăm lần. Tin vào tay mình.'},
  {tag:'Quan sát',  t:'Đối thủ hay để bi ở đâu? Học đường ra bi của họ.'},
  {tag:'Vị trí',    t:'Bi cái đi đâu sau cú này? Đánh để bi cái nằm đẹp.'},
  {tag:'Kiểm soát', t:'Mạnh tay thường hỏng vị trí. Đủ lực là được.'},
  {tag:'Hiện tại',  t:'Bỏ qua cú trước. Bàn lúc này mới quan trọng.'},
  {tag:'Thói quen', t:'Lặp đúng routine mỗi cú — ổn định hơn là xuất thần.'},
  {tag:'Mắt',       t:'Cú cuối: mắt dán vào bi mục tiêu, không nhìn theo cơ.'},
  {tag:'Hơi thở',   t:'Trước cú khó, hít sâu một hơi rồi mới cúi xuống bàn.'},
  {tag:'Buông bỏ',  t:'Đánh hỏng thì quên ngay. Tiếc nuối làm hỏng cú tiếp theo.'},
  {tag:'Kế hoạch',  t:'Nghĩ trước 2–3 bi, đừng chỉ nhìn bi trước mặt.'},
  {tag:'An toàn',   t:'Khi đang dẫn điểm, chắc chắn quan trọng hơn liều lĩnh.'},
  {tag:'Tốc độ',    t:'Đi chậm lại. Người giỏi không bao giờ vội cúi xuống bàn.'},
  {tag:'Hình dung', t:'Thấy rõ bi cái dừng ở đâu trước khi bạn bắn.'},
  {tag:'Tư thế',    t:'Chân vững, thân yên. Chỉ có tay sau chuyển động.'},
  {tag:'Bản lĩnh',  t:'Ai bình tĩnh hơn người đó thắng. Hãy là người đó.'},
  {tag:'Khởi động', t:'Vài cú đầu cứ đánh chắc để lấy cảm giác cơ.'},
  {tag:'Đọc bàn',   t:'Xử lý bi khó khi nó còn dễ, đừng để dồn về cuối ván.'},
  {tag:'Dứt khoát', t:'Chọn cú rồi thì cam kết. Lưỡng lự là trượt.'},
  {tag:'Kiên nhẫn', t:'Không phải cú nào cũng phải ăn. Chờ cơ hội của mình.'},
  {tag:'Thả lỏng',  t:'Tay run? Thở ra dài, hạ vai xuống, rồi mới đánh.'},
  {tag:'Tĩnh lặng', t:'Tắt tiếng ồn xung quanh. Chỉ còn bạn và đường cơ.'},
  {tag:'Phòng thủ', t:'Một cú safety hay đáng giá bằng một cú ăn đẹp.'},
  {tag:'Tôn trọng', t:'Coi nhẹ cú dễ là lúc dễ trượt nhất. Cú nào cũng nghiêm túc.'},
  {tag:'Nhịp tay',  t:'Đưa cơ đều như con lắc — không nhanh dần, không giật.'},
  {tag:'Cam kết',   t:'Đã cúi xuống là bắn. Còn nghi ngờ thì đứng dậy, tính lại.'},
  {tag:'Đơn giản',  t:'Trong các cú cùng ăn được, chọn cú đơn giản nhất.'},
  {tag:'Lực nhẹ',   t:'Phân vân về lực? Chọn nhẹ hơn — dễ kiểm soát vị trí hơn.'},
  {tag:'Trung tâm', t:'Không cần xoáy thì đánh tâm bi. Xoáy thừa là rủi ro thừa.'},
  {tag:'Chấp nhận', t:'Bàn xấu là một phần cuộc chơi. Chơi tốt ván bài mình được chia.'},
  {tag:'Một cú',    t:'Cả trận chỉ là chuỗi từng-cú-một. Thắng cú này trước đã.'},
  {tag:'Không sợ',  t:'Sợ trượt làm tay cứng. Đánh để ăn, không phải để khỏi hỏng.'},
  {tag:'Khôn ngoan',t:'Thấy cú liều hấp dẫn? Hỏi: an toàn có khôn hơn không?'},
  {tag:'Làm lại',   t:'Sau lỗi: hai hơi thở, đứng thẳng, coi như cú đầu tiên.'},
  {tag:'Kết thúc',  t:'Có cơ hội dọn bàn thì đừng nương tay. Kết liễu gọn.'},
  {tag:'Xác suất',  t:'Chọn cú thắng nhiều ván nhất, không phải cú trông oách nhất.'},
  {tag:'Điểm chạm', t:'Cú cuối khoá mắt vào điểm chạm, đừng liếc về phía lỗ.'},
  {tag:'Ra bi',     t:'Ra bi cho góc dễ của cú SAU, đừng chỉ lo cú trước mặt.'},
  {tag:'Đủ dùng',   t:'Vị trí "tạm đẹp" chắc ăn hơn vị trí "hoàn hảo" mà liều.'},
  {tag:'Trước khi cúi',t:'Quyết định xong hết rồi mới cúi — cúi xuống là chỉ việc bắn.'},
  {tag:'Không gồng',t:'Nắm cơ nhẹ như cầm quả trứng. Gồng tay là chệch hướng.'},
  {tag:'Theo hết cú',t:'Giữ đầu cơ đi theo bi thêm một nhịp sau khi chạm.'},
  {tag:'Chân đế',   t:'Trọng tâm vững trước, tay sau mới ổn định được.'},
  {tag:'Một mục tiêu',t:'Mỗi cú chỉ một việc: đưa cơ thẳng qua điểm ngắm.'},
  {tag:'Chậm mà chắc',t:'Rút cơ chậm, dừng một nhịp ở sau, rồi mới đẩy đi.'},
  {tag:'Đừng tham', t:'Không phải bi nào cũng ăn được. Bỏ đúng lúc là khôn.'},
  {tag:'Giải sớm',  t:'Nhìn cả cụm: đâu là bi khó nhất? Xử lý nó khi còn dễ.'},
  {tag:'Không đổi ý',t:'Đổi phương án giữa lúc cúi là nguồn gốc của cú trượt.'},
  {tag:'Hít–thở–bắn',t:'Hít vào khi ngắm, thở nhẹ ra, rồi mới đưa cơ cú cuối.'},
  {tag:'Kệ xung quanh',t:'Không ai đánh thay bạn. Chỉ còn bạn và bi cái.'},
  {tag:'Đường ngắn',t:'Bi cái đi càng ít càng ít sai. Ưu tiên ra bi ngắn.'},
  {tag:'Đầu ván',   t:'Phá kiểm soát được hơn phá thật mạnh cầu may.'},
  {tag:'Giữ lực',   t:'Đủ lực tới vị trí là được — thừa lực là mất bi cái.'},
  {tag:'Lạnh lùng', t:'Dẫn điểm thì càng phải chắc tay, đừng lơi ra vì tự mãn.'},
  {tag:'Nghỉ mắt',  t:'Giữa các cú, rời mắt khỏi bàn vài giây cho đỡ mỏi.'},
  {tag:'Công lực',  t:'100% công lực = không cú nào hời hợt, không phải gồng 100% sức.'},
  {tag:'5 thứ',     t:'Lỗ – vùng bi cái – lực – đầu cơ – nhịp. Ngoài 5 thứ đó: bỏ.'},
  {tag:'Chuẩn tự đặt',t:'Đừng chờ sắp thua mới nghiêm túc. Cú dễ cũng xây bản lĩnh.'},
  {tag:'Vùng, không điểm',t:'Điều bi về VÙNG đánh được là đủ — đừng ép về một chấm nhỏ.'},
  {tag:'Đường rẻ',  t:'Đứng bi → cu lê nhẹ → trô ngắn. Xoáy mạnh, nhiều băng là lựa chọn cuối.'},
  {tag:'Quyết nhanh',t:'Cái làm bạn mệt không phải cú khó — là đứng phân vân quá lâu.'},
  {tag:'Lạnh & lì', t:'Ít nói. Ít phản ứng. Quyết rõ. Ra ngọn dứt khoát. Đánh xong buông.'},
  {tag:'Bản đồ',    t:'Chưa thấy đường chạy tới bi cuối thì CHƯA cúi xuống.'},
  {tag:'Đọc trước', t:'Lập xong thứ tự cả bàn + đường bi cái, rồi mới chạm bi.'},
  {tag:'Nghĩ ngược',t:'Bắt đầu từ bi cuối: cần đứng đâu để ăn nó? Lần ngược về hiện tại.'},
  {tag:'Ra zone',   t:'Điều bi cái về VÙNG đánh được bi kế — không cần đúng một điểm.'},
];

const GAMES=['9-bi','10-bi'];
// Lỗi gom sẵn theo nhóm; MISTAKES suy ra từ đây (một nguồn duy nhất)
const MISTAKE_CATS=[
  {t:'Kỹ thuật & tư thế', items:['Đẩy cơ lệch','Đưa cơ không thẳng','Giật tay khi bắn','Nhổm người sớm','Cầm cơ quá chặt','Thế đứng chưa vững','Mắt rời điểm chạm']},
  {t:'Ngắm & nhắm',       items:['Ngắm sai điểm chạm','Sai góc cắt','Bù văng sai']},
  {t:'Cú bắn còn kém',    items:['Cú thẳng dài hỏng','Cắt mỏng hỏng','Căn băng kém','Cú phá kém','Cú rút (draw) kém','Cú lê kém','Bắn lỗ xa kém','Cú combo/chùm kém']},
  {t:'Lực & vị trí bi cái',items:['Lực quá mạnh','Lực quá nhẹ','Mất vị trí bi cái','Chết cái','Bi cái đi quá đường','Không tính đường ra bi']},
  {t:'Tư duy & chọn cú',  items:['Bỏ lỡ cú dễ','Tính sai đường bi','Đọc bàn sai','Phá cụm sai thời điểm']},
  {t:'Chiến thuật',       items:['Thiếu phòng thủ','Safety hớ','Phá bi kém','Không khoá bi']},
  {t:'Tâm lý',            items:['Nóng vội','Mất tập trung','Thiếu kiên nhẫn','Run tay khi căng','Mất bình tĩnh sau lỗi']},
];
const MISTAKES=MISTAKE_CATS.reduce((a,c)=>a.concat(c.items),[]);
const mistakeCat=(m)=>{ const c=MISTAKE_CATS.find(c=>c.items.includes(m)); return c? c.t : classifyMistake(m); };
// Bỏ dấu tiếng Việt + thường hoá, để dò từ khoá trong ghi chú dù viết có/không dấu
const normVN=(s)=> (s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/đ/g,'d');
// Từ khoá (không dấu) → lỗi; quét ghi chú để tự tổng hợp lỗi từ văn bản
const MISTAKE_KW={
  'Đẩy cơ lệch':['day co lech','lech co','co lech','danh lech','dam bi'],
  'Đưa cơ không thẳng':['dua co khong thang','co khong thang','co bi run','dua co run'],
  'Giật tay khi bắn':['giat tay','giat co','bi giat','giut tay'],
  'Nhổm người sớm':['nhom nguoi','nhom dau','nhac dau','ngang dau','dung len som','ngoc dau'],
  'Cầm cơ quá chặt':['cam co chat','siet co','ghi co chat','bop co'],
  'Thế đứng chưa vững':['the dung','tu the','dung khong vung','chan khong vung','dung chua chuan'],
  'Mắt rời điểm chạm':['mat roi','nhin theo co','khong nhin diem cham','roi mat'],
  'Ngắm sai điểm chạm':['ngam sai','sai diem cham','ngam le','nham sai'],
  'Sai góc cắt':['sai goc cat','goc cat sai','cat sai goc'],
  'Bù văng sai':['bu vang','throw','bu xoay','xoay sai','tinh xoay sai','vang bi'],
  'Cú thẳng dài hỏng':['cu thang dai','thang dai','thang xa hong'],
  'Cắt mỏng hỏng':['cat mong','cu cat mong','mong hong','cat le'],
  'Căn băng kém':['can bang','cu bang','bank','danh bang','bi bang'],
  'Cú phá kém':['cu de','cu phe','phe bi','dat bi','cu pha kem'],
  'Cú rút (draw) kém':['rut bi','cu rut','draw','keo bi ve','danh thap'],
  'Cú lê kém':['le bi','cu le','theo bi','follow','cu theo','danh cao'],
  'Bắn lỗ xa kém':['lo xa','cu xa','bi xa lo','vao lo xa','ban lo xa'],
  'Cú combo/chùm kém':['combo','chum bi','cu chum','an doi'],
  'Lực quá mạnh':['qua manh','manh tay','luc manh','danh manh','manh qua'],
  'Lực quá nhẹ':['qua nhe','nhe tay','luc nhe','danh nhe','thieu luc','nhe qua'],
  'Mất vị trí bi cái':['mat vi tri','sai vi tri','vi tri bi cai','position','ra bi xau','khong ra duoc bi','dieu bi loi','dieu bi sai'],
  'Chết cái':['chet cai','bi cai lui','lui lo','scratch','bi cai vao lo','loi bi cai'],
  'Bi cái đi quá đường':['di qua duong','bi cai qua','qua da','di qua tay','luot qua'],
  'Không tính đường ra bi':['khong tinh duong','duong ra bi','khong nghi ra bi','khong tinh ra bi'],
  'Bỏ lỡ cú dễ':['bo lo','cu de','truot cu de','miss de','hong cu de'],
  'Tính sai đường bi':['tinh sai duong','sai duong bi','tinh duong sai'],
  'Đọc bàn sai':['doc ban sai','khong doc ban','ke hoach ban sai','khong co ke hoach'],
  'Phá cụm sai thời điểm':['pha cum','cum bi','tach cum','xu ly cum'],
  'Thiếu phòng thủ':['phong thu','safety','thieu safety','khong phong thu','khong danh safe'],
  'Safety hớ':['safety ho','phong thu ho','de mo','safe ho'],
  'Phá bi kém':['pha bi','pha phom','break','pha khong tot'],
  'Không khoá bi':['khoa bi','khong khoa','che bi doi thu'],
  'Nóng vội':['nong voi','voi vang','hap tap','danh nhanh','voi'],
  'Mất tập trung':['mat tap trung','lo dang','khong tap trung','xao nhang','phan tam'],
  'Thiếu kiên nhẫn':['thieu kien nhan','khong kien nhan','sot ruot','khong cho'],
  'Run tay khi căng':['run tay','tay run','cang qua run'],
  'Mất bình tĩnh sau lỗi':['mat binh tinh','noi nong','tilt','cau','buc minh'],
};
const scanNote=(note)=>{ const n=normVN(note); if(!n) return []; const out=[]; Object.keys(MISTAKE_KW).forEach(m=>{ if(MISTAKE_KW[m].some(kw=>n.includes(kw))) out.push(m); });
  (store.get('nc.customMistakes',[])||[]).forEach(m=>{ const nm=normVN(m); if(nm && n.includes(nm)) out.push(m); });
  return out; };
const entryMistakes=(arr,key)=>{ const s=new Set(arr[key]||[]); scanNote(arr.note).forEach(x=>s.add(x)); return [...s]; };
// Tự phân loại lỗi TỰ THÊM vào đúng nhóm bằng từ khoá (không dấu) — điểm nhóm nào cao nhất thì chọn.
const MIS_CAT_KW={
  'Kỹ thuật & tư thế':['day co','dua co','giat tay','giat co','nhom nguoi','nhom dau','nhac dau','cam co','siet co','ghi co','bop co','the dung','tu the','dung khong vung','dung chua vung','dung sai','sai chan','the chan','chan','lung','cui','gong','cau tay','vung co','ti tay','tay tru','khuyu','giu co','dua co run','co lech','lech co','mat roi','nhin theo co','vao bo','bo au','tam bi','danh tam','ap phe','vay ap phe','vay phe','nhip','boi lo','danh phan','dung cu'],
  'Ngắm & nhắm':['ngam','nham','diem cham','goc cat','sai goc','bu vang','bu xoay','throw','phan so','ghost','duong ngam','diem chet','nhin diem','tinh diem','can diem'],
  'Cú bắn còn kém':['cat mong','chem mong','mong','cu cat','can bang','danh bang','cu bang','tren bang','bank','cu de','cu phe','de phe','rut bi','cu rut','draw','le bi','cu le','cu theo','follow','lo xa','ban lo','duong xa','combo','chum bi','thang dai','cu xoay','english'],
  'Lực & vị trí bi cái':['qua manh','qua nhe','manh tay','nhe tay','thieu luc','du luc','vi tri bi','bi cai','chet cai','scratch','ra bi','duong ra','di qua duong','qua da','dieu bi','mat vi tri','lui lo','cai lui','di dau','le di dau'],
  'Tư duy & chọn cú':['chon sai','chon lo','sai lo','duong bi','doc ban','ke hoach','thu tu bi','sai thu tu','cum bi','pha cum','tach cum','tinh sai','tinh duong','bo lo','cu de','khong nghi','khong tinh','doc sai','phuong an','du phong','tiep theo','bi tiep','nhin 2 bi','2 bi','gan nhau','bi gan','sao cho vao','khong biet ban','ke tiep','nhin truoc'],
  'Chiến thuật':['safety','safe','phong thu','khoa bi','khong khoa','che bi','snooker','giau bi','pha bi','pha phom','break','de mo'],
  'Tâm lý':['nong voi','voi vang','hap tap','danh nhanh','danh au','choi au','met','mat tap trung','tap trung','lo dang','xao nhang','phan tam','kien nhan','sot ruot','run tay','tay run','run','cang thang','binh tinh','tilt','noi nong','buc minh','so thang','so thua','tu tin','hoi hop','lo lang','hoang','ap luc','chu quan','tieu cuc','nao nung','ap dao','trinh dien','cau toan'],
};
const classifyMistake=(name)=>{
  const n=normVN(name); if(!n) return 'Khác';
  let best='Khác', bestScore=0;
  MISTAKE_CATS.forEach(c=>{ const kws=MIS_CAT_KW[c.t]||[]; let s=0; kws.forEach(kw=>{ if(n.includes(kw)) s++; }); if(s>bestScore){ bestScore=s; best=c.t; } });
  return best;
};
// Gộp lỗi thành các nhóm: preset + lỗi tự thêm đã tự phân loại (còn lại 'Khác').
function groupMistakes(customList){
  const groups=MISTAKE_CATS.map(c=>({t:c.t, items:c.items.slice()}));
  const other=[];
  (customList||[]).forEach(m=>{ const g=groups.find(x=>x.t===classifyMistake(m)); if(g){ if(!g.items.includes(m)) g.items.push(m); } else other.push(m); });
  return {groups, other};
}
// Lỗi tự thêm (ngoài danh mục có sẵn) — lưu để tái dùng & tự dò trong ghi chú các trận sau.
function saveCustomMistake(name){ name=(name||'').trim(); if(!name) return false; const cur=store.get('nc.customMistakes',[])||[]; if(MISTAKES.includes(name)||cur.includes(name)) return false; store.set('nc.customMistakes',[...cur,name]); return true; }
function getCustomMistakes(){ return (store.get('nc.customMistakes',[])||[]).filter(x=>!MISTAKES.includes(x)); }
// Số lần mắc lỗi x trong 1 trận: dùng bảng đánh dấu (mistakeCounts) nếu có, mặc định 1.
const misCount=(m,x)=> (m&&m.mistakeCounts&&m.mistakeCounts[x])||1;
// Gom lỗi thành { tên: số lần } từ danh sách trận (+ danh sách lỗi tự ghi tuỳ chọn).
function aggMistakes(matches, extra){
  const agg={};
  (matches||[]).forEach(m=>entryMistakes(m,'mistakes').forEach(x=>agg[x]=(agg[x]||0)+misCount(m,x)));
  (extra||[]).forEach(e=>entryMistakes(e,'tags').forEach(x=>agg[x]=(agg[x]||0)+1));
  return agg;
}
// Gợi ý cách sửa ngắn gọn cho từng lỗi — dùng để dựng "Kỹ thuật cần tập" trong Tổng hợp.
const FIX_TIPS={
  'Đẩy cơ lệch':'Đưa cơ thẳng trục, khuỷu tay thả dọc; quay video kiểm tra đường cơ.',
  'Đưa cơ không thẳng':'Tập đưa cơ men theo đường kẻ/mép chai, không chạm mép; cổ tay lỏng.',
  'Giật tay khi bắn':'Đưa cơ theo nhịp máy (~55 BPM), thả trọn cú, không tăng tốc phút cuối.',
  'Nhổm người sớm':'Giữ đầu & thân bất động tới khi bi cái chạm băng — "ở yên trong cú".',
  'Cầm cơ quá chặt':'Nắm cán lỏng; chỉ siết nhẹ đúng lúc cơ chạm bi.',
  'Thế đứng chưa vững':'Chân vững, trọng tâm thấp, cằm trên cơ, tì tay cái chắc.',
  'Mắt rời điểm chạm':'Cú cuối mắt nhìn BI MỤC TIÊU, không nhìn theo bi cái.',
  'Ngắm sai điểm chạm':'Xác định điểm chạm "ma" rồi ngắm tâm bi cái vào đó; đứng sau đường ngắm.',
  'Sai góc cắt':'Ôn hệ ngắm (ghost ball / phân số); tập thang cú cắt tăng dần độ mỏng.',
  'Bù văng sai':'Cắt mỏng + lực mạnh thì bù điểm chạm dày hơn chút để trừ throw.',
  'Cú thẳng dài hỏng':'Tập cú thẳng dài: nền tảng đưa cơ; giữ yên người sau cú.',
  'Cắt mỏng hỏng':'Ngắm mép ngoài bi mục tiêu, lực vừa đủ; tập thang cú cắt.',
  'Căn băng kém':'Học hệ băng theo mốc kim cương; nhớ lực làm đổi góc phản.',
  'Cú phá kém':'Ôn đề/phé: điểm đánh & lực tạo xoáy; bắt đầu lực vừa cho ổn định.',
  'Cú rút (draw) kém':'Đánh thấp dưới tâm, cơ ngang, đưa cơ trọn — "xuyên qua" bi cái.',
  'Cú lê kém':'Đánh cao trên tâm, đưa cơ nhẹ theo; đừng thúc mạnh.',
  'Bắn lỗ xa kém':'Cú xa cần đường cơ chậm-mượt, giữ yên; tin vào ngắm.',
  'Cú combo/chùm kém':'Ngắm bi trung gian trước; combo cần chuẩn gấp đôi — chọn lỗ dễ.',
  'Lực quá mạnh':'Tập cảm giác lực (lag); hình dung điểm dừng trước khi bắn.',
  'Lực quá nhẹ':'Đủ lực đưa bi cái tới đúng vị trí, không rón rén; tập lag.',
  'Mất vị trí bi cái':'Tập cú dừng + theo/rút; luôn nghĩ trước 1 bi.',
  'Chết cái':'Kiểm soát bằng cú dừng/rút; tránh đường bi cái đâm về lỗ.',
  'Bi cái đi quá đường':'Giảm lực, chọn đường ngắn; dùng băng để hãm bi cái.',
  'Không tính đường ra bi':'Trước mỗi cú, chỉ ra điểm bi cái sẽ dừng cho viên kế.',
  'Bỏ lỡ cú dễ':'Đừng vội cú dễ — vẫn làm đủ routine; tập bánh xe nhiều góc.',
  'Tính sai đường bi':'Đi bàn bằng mắt trước; xác nhận đường ra bi rồi mới cúi xuống.',
  'Đọc bàn sai':'Lập kế hoạch 2–3 bi kế; chọn thứ tự mở cụm & giữ đường.',
  'Phá cụm sai thời điểm':'Phá cụm khi có bi cái thuận & bi bảo hiểm; đừng phá lúc bí.',
  'Thiếu phòng thủ':'Không ăn được thì safety — giấu bi cái sau bi khác.',
  'Safety hớ':'Safety phải để đối thủ khó; tính cả đường bi cái sau khi khoá.',
  'Phá bi kém':'Chạm dày bi đầu, lực có kiểm soát, giữ bi cái giữa bàn.',
  'Không khoá bi':'Khi dẫn, cân nhắc khoá bi số của đối thủ để ép lỗi.',
  'Nóng vội':'Chậm lại, làm đủ routine; hít 1 nhịp trước khi cúi xuống.',
  'Mất tập trung':'Về "điểm mỏ neo": nhìn cơ, 1 hơi thở, rồi mới vào cú.',
  'Thiếu kiên nhẫn':'Chờ cú chắc; không có thì safety, đừng ép cú mạo hiểm.',
  'Run tay khi căng':'Thở 4-7-8 một nhịp; siết nhẹ rồi thả vai trước khi bắn.',
  'Mất bình tĩnh sau lỗi':'Lỗi rồi thì bỏ qua; reset 2 hơi thở, cú kế là cú mới.',
};
const FEELS=[{v:1,e:'😞'},{v:2,e:'😐'},{v:3,e:'🙂'},{v:4,e:'😄'},{v:5,e:'🔥'}];

const BREATH=[
  {key:'box', name:'Hộp 4-4-4-4', note:'Cân bằng, ổn định nhịp tim — hợp trước cú quan trọng.',
    phases:[['Hít vào',4,1.35],['Giữ',4,1.35],['Thở ra',4,1],['Giữ',4,1]]},
  {key:'478', name:'Thư giãn 4-7-8', note:'Hạ nhịp tim sâu, thư giãn — hợp lúc ngồi chờ đối thủ.',
    phases:[['Hít vào',4,1.35],['Giữ',7,1.35],['Thở ra',8,1]]},
  {key:'coherent', name:'Cân bằng 5-5', note:'Thở đều 5-5, đưa tim và não về cân bằng — hợp giữa các ván.',
    phases:[['Hít vào',5,1.35],['Thở ra',5,1]]},
  {key:'triangle', name:'Tam giác 4-4-6', note:'Thở ra dài hơn hít vào — làm dịu nhanh khi căng thẳng.',
    phases:[['Hít vào',4,1.35],['Giữ',4,1.35],['Thở ra',6,1]]},
  {key:'calm', name:'Xoa dịu 4-6', note:'Không nín thở, thở ra dài — dễ làm ngay tại bàn.',
    phases:[['Hít vào',4,1.35],['Thở ra',6,1]]},
];

/* Thư viện bài tập — dựa trên phương pháp luyện bi-a có hệ thống (deliberate practice):
   mỗi bài có cách đặt bàn, thang điểm đo được, mục tiêu chuẩn, lý do, và lỗi nó sửa. */
const DRILL_CATS={
  fund:{t:'Nền tảng',  c:'#22b07f'},
  pot :{t:'Bi đơn',    c:'#d3a23e'},
  pos :{t:'Vị trí',    c:'#3fb0e0'},
  saf :{t:'Phòng thủ', c:'#9b7bf0'},
  brk :{t:'Phá bi',    c:'#e2724a'},
  men :{t:'Tâm lý',    c:'#1fb6cc'},
};
const W='#f3f1e8', R='#e0556b', Y='#f4c95d', G='#7f8a99'; // màu bi: cái / mục tiêu / phụ / chắn
const DRILLS=[
  {key:'stop',cat:'fund',name:'Cú dừng (stun)',max:10,target:'≥8/10',
    setup:'Bi cái cách bi mục tiêu ~1 viên gạch, đánh đúng tâm bi với lực vừa. Bi cái phải DỪNG ngay tại điểm chạm, không lăn theo hay rút về.',
    scoring:'Đếm số lần bi cái dừng trong phạm vi 1 thân bi, trên 10 cú',
    why:'Cú dừng chuẩn là gốc của mọi kiểm soát bi cái. Sai ở đây thì mọi cú ra bi đều lệch theo.',
    fixes:['Đẩy cơ lệch','Giật tay khi bắn','Mất vị trí bi cái','Chết cái'],
    dia:{balls:[{x:22,y:26,c:W},{x:60,y:26,c:R}],line:[24,26,58,26]}},
  {key:'follow_draw',cat:'fund',name:'Theo & rút (follow/draw)',max:10,target:'≥7/10',
    setup:'Cùng một cú thẳng ~1.5 viên gạch: luân phiên đánh CAO (bi cái đi theo) và đánh THẤP (bi cái rút về), đặt trước điểm dừng mong muốn cho bi cái.',
    scoring:'Số cú bi cái dừng đúng vùng đã định, trên 10 cú',
    why:'Theo và rút là hai công cụ ra bi chính. Làm chủ điểm đánh trên/dưới tâm + lực là làm chủ vị trí.',
    fixes:['Mất vị trí bi cái','Lực quá mạnh','Lực quá nhẹ','Chết cái'],
    dia:{balls:[{x:40,y:26,c:W},{x:66,y:26,c:R}],line:[43,26,63,26],arrows:[[69,26,86,26],[37,26,18,26]]}},
  {key:'speed',cat:'fund',name:'Cảm giác lực (lag)',max:10,target:'≥6/10',
    setup:'Đẩy bi cái từ vạch đầu chạm băng cuối rồi quay về, cố cho bi dừng càng gần vạch xuất phát càng tốt. 10 lần.',
    scoring:'Số lần bi cái về dừng trong 1 viên gạch quanh vạch, trên 10',
    why:'Lực là nguyên nhân hỏng vị trí số một. Bài này hiệu chỉnh "đồng hồ lực" trong đầu bạn.',
    fixes:['Lực quá mạnh','Lực quá nhẹ'],
    dia:{balls:[{x:16,y:26,c:W}],zone:[16,26,8],arrows:[[21,24,90,24]]}},
  {key:'tempo',cat:'men',name:'Nhịp đưa cơ (máy nhịp)',max:20,target:'≥16/20',
    setup:'Mở tab Thi đấu → Nhịp ~55 BPM. Mỗi cú: kéo cơ về vào một nhịp, đẩy ra ở nhịp kế. 20 cú thẳng, cổ tay thả lỏng.',
    scoring:'Số cú đưa cơ mượt đúng nhịp, không giật/tăng tốc, trên 20',
    why:'Phần lớn cú trượt do giật hoặc tăng tốc ở cú cuối. Nhịp đều giúp đường cơ ổn định và lặp lại được.',
    fixes:['Giật tay khi bắn','Nóng vội'],
    dia:{balls:[{x:64,y:26,c:W}],stick:[14,26,55,26],arrows:[[34,40,60,40],[60,44,34,44]]}},
  {key:'longpot',cat:'pot',name:'Cú thẳng dài',max:10,target:'≥6/10',
    setup:'Bi mục tiêu sát lỗ góc, bi cái ở đầu bàn đối diện — cú thẳng gần hết chiều dài bàn. 10 lần.',
    scoring:'Số bi vào lỗ, trên 10 cú',
    why:'Cú thẳng dài phơi bày mọi lỗi ngắm và đưa cơ. Vào đều là bằng chứng nền tảng đã vững.',
    fixes:['Đẩy cơ lệch','Bỏ lỡ cú dễ','Thế đứng chưa vững'],
    dia:{balls:[{x:13,y:39,c:W},{x:78,y:13,c:R}],line:[15,38,95,5]}},
  {key:'wagon',cat:'pot',name:'Bánh xe (wagon wheel)',max:6,target:'≥5/6',
    setup:'Đặt 1 bi mục tiêu ở chấm giữa bàn. Lần lượt đặt bi cái ở 6 hướng quanh nó và pot vào lỗ phù hợp với từng góc.',
    scoring:'Số bi vào, trên 6 vị trí (đi 2 vòng thì trên 12)',
    why:'Luyện vào lỗ từ MỌI góc cắt. Điểm yếu phổ biến là chỉ quen vài góc thuận tay.',
    fixes:['Bỏ lỡ cú dễ','Đẩy cơ lệch'],
    dia:{balls:[{x:50,y:26,c:R},{x:30,y:13,c:W,r:2},{x:50,y:11,c:W,r:2},{x:70,y:13,c:W,r:2},{x:30,y:39,c:W,r:2},{x:50,y:41,c:W,r:2},{x:70,y:39,c:W,r:2}]}},
  {key:'cutladder',cat:'pot',name:'Thang cú cắt',max:5,target:'≥3/5',
    setup:'Cùng bi mục tiêu, tăng dần độ mỏng cú cắt: 15°→30°→45°→60°→75°. Mỗi mức 3 cú, vào ≥2/3 thì lên mức.',
    scoring:'Mức cắt cao nhất bạn vượt qua (1–5)',
    why:'Cú cắt mỏng là điểm yếu kinh điển. Tập theo bậc giúp mở rộng dần vùng góc tự tin.',
    fixes:['Bỏ lỡ cú dễ'],
    dia:{balls:[{x:24,y:38,c:W},{x:58,y:26,c:R}],line:[27,37,56,27],arrows:[[60,25,92,9]]}},
  {key:'lineup',cat:'pos',name:'Dàn hàng (line-up)',max:15,target:'≥7 liên tiếp',
    setup:'Xếp 10–15 bi dọc theo một đường, chạy lần lượt và ưu tiên ra bi cho viên kế tiếp. Miss thì dừng đếm.',
    scoring:'Số bi pot liên tiếp trước khi miss',
    why:'Mô phỏng run-out thật: vừa vào lỗ vừa quản vị trí và thứ tự bi — kỹ năng quyết định ván cờ.',
    fixes:['Mất vị trí bi cái'],
    dia:{balls:[{x:16,y:40,c:W},{x:30,y:34,c:R},{x:42,y:30,c:R},{x:54,y:26,c:R},{x:66,y:22,c:R},{x:78,y:18,c:R}],line:[30,34,78,18],arrows:[[19,39,29,35]]}},
  {key:'position3',cat:'pos',name:'Vị trí 3 bi',max:5,target:'≥3/5',
    setup:'Đặt 3 bi. Pot lần lượt, mỗi cú bi cái phải dừng trong vùng đánh được bi kế. Lặp 5 vòng.',
    scoring:'Số vòng đạt vị trí cả 3 cú, trên 5',
    why:'Tách kỹ năng ra bi ra khỏi áp lực run-out dài, sửa trực tiếp lỗi "mất vị trí".',
    fixes:['Mất vị trí bi cái'],
    dia:{balls:[{x:18,y:26,c:W},{x:44,y:15,c:R},{x:63,y:35,c:R},{x:82,y:19,c:R}]}},
  {key:'cuecircle',cat:'pos',name:'Khoanh vùng bi cái',max:10,target:'≥6/10',
    setup:'Hình dung một vòng tròn ~2 viên gạch trên bàn. Pot bi mục tiêu VÀ dừng bi cái trong vòng đó. 10 cú.',
    scoring:'Số cú vừa vào lỗ vừa dừng bi cái trong vùng, trên 10',
    why:'Buộc bạn nghĩ "bi cái dừng ở đâu" thay vì chỉ "vào hay không" — bước nhảy về tư duy vị trí.',
    fixes:['Mất vị trí bi cái','Lực quá mạnh'],
    dia:{balls:[{x:30,y:26,c:W},{x:72,y:26,c:R}],zone:[42,30,9]}},
  {key:'safety',cat:'saf',name:'Giấu bi cái (safety)',max:5,target:'≥3/5',
    setup:'Tạo thế không có cú ăn. Đánh safety để đối thủ bị che (snooker) hoặc không còn cú dễ. 5 tình huống khác nhau.',
    scoring:'Số safety khiến đối thủ bị che hoặc rất khó, trên 5',
    why:'Phòng thủ tốt thắng nhiều ván hơn cú ăn đẹp, mà hầu hết người chơi nghiệp dư bỏ quên.',
    fixes:['Thiếu phòng thủ','Nóng vội'],
    dia:{balls:[{x:26,y:26,c:W},{x:50,y:26,c:G},{x:74,y:26,c:R}]}},
  {key:'bank',cat:'pot',name:'Cú băng (bank)',max:10,target:'≥4/10',
    setup:'Bi mục tiêu giữa bàn, bank một băng vào lỗ. Đổi vị trí 10 lần, dùng một hệ điểm ngắm cố định để học cảm giác.',
    scoring:'Số bi vào, trên 10 cú',
    why:'Bank cho bạn lựa chọn khi không có cú trực tiếp và cứu được nhiều thế bí.',
    fixes:['Căn băng kém'],
    dia:{balls:[{x:28,y:40,c:W},{x:46,y:32,c:R}],line:[31,39,45,33],arrows:[[47,30,64,8],[64,8,89,45]]}},
  {key:'breakdrill',cat:'brk',name:'Phá bi có kiểm soát',max:10,target:'≥6/10',
    setup:'Phá phom đầy đủ. Mục tiêu mỗi cú: bi cái dừng quanh giữa bàn (không lủi lỗ) và phom tản đều/có bi vào. 10 lần.',
    scoring:'Số cú phá đạt (bi cái về giữa, không lủi), trên 10',
    why:'Phá quyết định cả ván trước khi đánh cú nào. Kiểm soát bi cái khi phá quan trọng hơn phá thật mạnh.',
    fixes:['Phá bi kém'],
    dia:{balls:[{x:16,y:26,c:W},{x:60,y:26,c:R},{x:66,y:22,c:Y},{x:66,y:30,c:Y},{x:72,y:18,c:Y},{x:72,y:26,c:Y},{x:72,y:34,c:Y}],arrows:[[19,26,57,26]]}},
  {key:'routine20',cat:'men',name:'20 cú kỷ luật',max:20,target:'≥17/20',
    setup:'20 cú bất kỳ. Mỗi cú PHẢI đủ routine + một hơi thở trước khi cúi. Tự trừ điểm nếu bắn khi chưa thật sẵn sàng.',
    scoring:'Số cú giữ trọn kỷ luật routine, trên 20',
    why:'Kỹ thuật chỉ ổn định khi routine ổn định. Đây là bài "tâm" nền tảng nhất, nối thẳng với tab Routine.',
    fixes:['Nóng vội','Giật tay khi bắn','Thế đứng chưa vững'],
    dia:{balls:[{x:38,y:26,c:W},{x:68,y:26,c:R}],line:[41,26,66,26],zone:[68,26,7]}},
  {key:'center',cat:'fund',name:'Trúng tâm bi',max:10,target:'≥8/10',
    setup:'Bi cái sát băng đầu, đánh thẳng chạm băng cuối rồi bật về đúng đường cũ, chạm lại đầu cơ. Bi phải về thẳng, không lệch trái/phải. 10 lần.',
    scoring:'Số lần bi cái về đúng trục thẳng, trên 10',
    why:'Trúng tâm bi và đưa cơ thẳng là gốc của mọi cú. Lệch tâm sinh xoáy ngoài ý muốn, hỏng cả ngắm lẫn ra bi.',
    fixes:['Đưa cơ không thẳng','Đẩy cơ lệch','Mắt rời điểm chạm'],
    dia:{balls:[{x:14,y:26,c:W}],line:[16,26,92,26],arrows:[[92,23,18,23]]}},
  {key:'draw_ladder',cat:'fund',name:'Thang rút bi',max:5,target:'≥3/5',
    setup:'Cú thẳng ngắn, đánh thấp để rút bi cái về. Tăng dần khoảng rút: 1→2→3→4→5 viên gạch. Mỗi mức 3 cú, đạt thì lên mức.',
    scoring:'Mức rút xa nhất kiểm soát được (1–5)',
    why:'Rút bi là kỹ năng ra bi khó nhất. Tập theo bậc giúp lực rút và cổ tay ổn định, mở rộng dần.',
    fixes:['Cú rút (draw) kém','Mất vị trí bi cái'],
    dia:{balls:[{x:52,y:26,c:W},{x:74,y:26,c:R}],line:[55,26,71,26],arrows:[[49,26,20,26]]}},
  {key:'follow_lane',cat:'pos',name:'Lê bi giữ làn',max:10,target:'≥6/10',
    setup:'Pot bi rồi để bi cái LÊ tới một vùng đã định ở nửa bàn kia, giữ đường bi cái trong một "làn" hẹp. 10 cú.',
    scoring:'Số cú bi cái dừng đúng làn, trên 10',
    why:'Cú lê (follow) là công cụ ra bi tiến. Kiểm soát làn giúp không bị quá đường bi cái.',
    fixes:['Cú lê kém','Bi cái đi quá đường'],
    dia:{balls:[{x:22,y:30,c:W},{x:46,y:26,c:R}],line:[25,30,45,27],arrows:[[48,25,84,16]],zone:[82,16,8]}},
  {key:'thincut',cat:'pot',name:'Cắt cực mỏng',max:10,target:'≥5/10',
    setup:'Bi mục tiêu gần lỗ, đặt bi cái sao cho góc cắt ~70–80°. Ngắm mép ngoài bi, lực vừa đủ. 10 cú.',
    scoring:'Số bi vào, trên 10 cú',
    why:'Cú cắt mỏng cứu nhiều thế khó. Yếu cắt mỏng khiến bạn bỏ lỡ cơ hội và phải phòng thủ.',
    fixes:['Cắt mỏng hỏng','Sai góc cắt'],
    dia:{balls:[{x:24,y:36,c:W},{x:70,y:22,c:R}],line:[27,35,68,23],arrows:[[72,21,92,10]]}},
  {key:'longrail',cat:'pot',name:'Bắn lỗ xa dọc băng',max:10,target:'≥5/10',
    setup:'Bi mục tiêu sát băng dài, bi cái ở đầu kia bàn — cú xa men băng. 10 cú, đường cơ chậm và mượt.',
    scoring:'Số bi vào, trên 10 cú',
    why:'Cú xa men băng phơi bày lỗi ngắm và tăng tốc cú cuối. Vào đều là bằng chứng nền tảng vững.',
    fixes:['Bắn lỗ xa kém','Cú thẳng dài hỏng'],
    dia:{balls:[{x:14,y:12,c:W},{x:86,y:10,c:R}],line:[16,12,92,9]}},
  {key:'combo',cat:'pot',name:'Combo 2 bi',max:8,target:'≥4/8',
    setup:'2 bi gần thẳng hàng về lỗ; đánh bi 1 để bi 1 đẩy bi 2 vào. Thử 8 thế khác nhau.',
    scoring:'Số combo vào, trên 8',
    why:'Combo cần chính xác gấp đôi. Đọc được combo giúp giải thế bí và ăn nhanh.',
    fixes:['Cú combo/chùm kém','Sai góc cắt'],
    dia:{balls:[{x:22,y:26,c:W},{x:50,y:26,c:R},{x:64,y:26,c:R}],line:[24,26,48,26],arrows:[[66,26,92,26]]}},
  {key:'banksys',cat:'pot',name:'Hệ băng kim cương',max:10,target:'≥4/10',
    setup:'Dùng hệ mốc kim cương để bank 1 băng. Ghi lại điểm ngắm cho từng vị trí rồi lặp cho nhớ. 10 cú.',
    scoring:'Số bi vào, trên 10 cú',
    why:'Có hệ thống bank ổn định hơn đánh theo cảm giác, cứu nhiều thế không có cú trực tiếp.',
    fixes:['Căn băng kém'],
    dia:{balls:[{x:30,y:38,c:W},{x:50,y:30,c:R}],line:[33,37,49,31],arrows:[[51,29,70,8],[70,8,90,40]]}},
  {key:'break9',cat:'brk',name:'Phá 9-bi chuẩn',max:10,target:'≥6/10',
    setup:'Phá phom 9-bi từ vị trí quen. Mục tiêu: bi 1 chạm dày, có bi vào HOẶC bi cái về giữa bàn còn cú kế. 10 lần.',
    scoring:'Số cú phá đạt (vào bi hoặc giữ được thế), trên 10',
    why:'Phá tốt cho bạn lượt và thế. Chạm dày bi 1 + kiểm soát bi cái quan trọng hơn phá thật mạnh.',
    fixes:['Phá bi kém','Cú phá kém'],
    dia:{balls:[{x:14,y:26,c:W},{x:58,y:26,c:R},{x:64,y:22,c:Y},{x:64,y:30,c:Y},{x:70,y:18,c:Y},{x:70,y:26,c:Y},{x:70,y:34,c:Y}],arrows:[[17,26,55,26]]}},
  {key:'snooker_esc',cat:'saf',name:'Thoát snooker',max:8,target:'≥5/8',
    setup:'Đặt bi cái bị che sau một bi chắn. Dùng 1 băng để chạm được bi mục tiêu hợp lệ. 8 thế khác nhau.',
    scoring:'Số lần chạm hợp lệ (không phạm lỗi), trên 8',
    why:'Bị snooker mà thoát sạch giúp tránh mất lượt và không tặng bi cầm tay cho đối thủ.',
    fixes:['Safety hớ','Căn băng kém'],
    dia:{balls:[{x:26,y:30,c:W},{x:40,y:30,c:G},{x:78,y:20,c:R}],arrows:[[26,33,50,46],[50,46,80,22]]}},
  {key:'pressure',cat:'men',name:'Cú áp lực (1 cú ăn cả)',max:10,target:'≥7/10',
    setup:'Mỗi cú tự đặt "trượt là thua". Làm đủ routine, thở 1 nhịp, bắn dứt khoát. 10 cú vừa khó vừa quan trọng.',
    scoring:'Số cú vào dưới áp lực tự tạo, trên 10',
    why:'Tập bắn khi tim đập nhanh — mô phỏng cú quyết định. Bình tĩnh dưới áp lực luyện được.',
    fixes:['Run tay khi căng','Mất bình tĩnh sau lỗi','Nóng vội'],
    dia:{balls:[{x:24,y:34,c:W},{x:66,y:20,c:R}],line:[27,33,64,21],zone:[66,20,7]}},
  {key:'discipline3',cat:'men',name:'Điểm kỷ luật (3 luật)',max:10,target:'≥8/10',
    setup:'Đánh 10 cú (tập hoặc kèo nhẹ) theo 3 luật: (1) đứng sau bi cái quan sát đủ rồi mới vào bộ; (2) vào bộ mà còn đổi ý/chỉnh vặt → đứng dậy làm lại; (3) trượt xong không than, không tiếc, không giải thích.',
    scoring:'Số cú giữ trọn cả 3 luật, trên 10 (bi vào mà hời hợt = không tính)',
    why:'Vào lỗ bằng sự cẩu thả vẫn là lỗi kỷ luật — nó nuôi thói quen hời hợt. Bài này chấm THÁI ĐỘ, không chấm kết quả.',
    fixes:['Nóng vội','Mất tập trung','Mất bình tĩnh sau lỗi'],
    dia:{balls:[{x:32,y:26,c:W},{x:64,y:26,c:R}],line:[35,26,62,26],zone:[64,26,7]}},
  {key:'cheappath',cat:'pos',name:'Đường rẻ năng lượng',max:5,target:'≥3/5',
    setup:'Xếp 3 bi. Dọn hết mà CHỈ dùng đứng bi, cu lê nhẹ hoặc trô ngắn — cấm áp phê, cấm đi nhiều băng, lực ≤70%. 5 vòng.',
    scoring:'Số vòng dọn hết 3 bi chỉ bằng "đường rẻ", trên 5',
    why:'Đường ít biến số (ít xoáy, ít băng, lực nhỏ) là đường ít sai số và ít tốn não. Tập cho ưu tiên này thành phản xạ.',
    fixes:['Mất vị trí bi cái','Không tính đường ra bi','Lực quá mạnh'],
    dia:{balls:[{x:20,y:32,c:W},{x:40,y:24,c:R},{x:58,y:34,c:R},{x:76,y:20,c:R}],arrows:[[23,31,37,25]]}},
  {key:'streak10',cat:'men',name:'Chuỗi 10 cú không trượt',max:10,target:'10 liên tiếp',
    setup:'Một cú thẳng vừa tầm (~2 viên gạch), dựng lại y hệt mỗi lần. Vào 10 cú LIÊN TIẾP. Trượt một cú là xoá đếm, quay về 1. Không đổi cú cho dễ hơn giữa chừng.',
    scoring:'Chuỗi dài nhất đạt được trong buổi (0–10)',
    why:'Cú thứ 8, thứ 9 mới là bài kiểm tra thật: cú vẫn dễ y như cú đầu, nhưng tay bắt đầu rén vì sợ mất chuỗi. Đây là cách rẻ nhất để tự tạo áp lực thật mà không cần đối thủ — và để thấy rõ mình hỏng vì kỹ thuật hay vì cái đầu.',
    fixes:['Run tay khi căng','Bỏ lỡ cú dễ','Nóng vội','Giật tay khi bắn'],
    dia:{balls:[{x:34,y:26,c:W},{x:64,y:26,c:R}],line:[37,26,62,26],zone:[64,26,7]}},
  {key:'mapfirst',cat:'pos',name:'Lập bản đồ trước khi bắn',max:10,target:'≥8/10',
    setup:'Xếp 6–8 bi ngẫu nhiên. Trước khi chạm bi nào, PHẢI đọc xong thứ tự chạy cả bàn + hình dung đường bi cái tới từng viên — nói to bản đồ rồi mới bắn. 10 ván. (Hoặc dùng tab 🗺️ Run-out → Luyện để tự chấm thời gian lập map.)',
    scoring:'Số ván bạn lập ĐỦ bản đồ trước khi chạm bi (dù có chạy hết hay không), trên 10',
    why:'Điểm yếu phổ biến: bắn khi bản đồ chưa đủ trong đầu. Bài này ép "map trước — bắn sau" thành phản xạ, và rèn tốc độ đọc bàn.',
    fixes:['Không tính đường ra bi','Mất vị trí bi cái','Nóng vội','Đọc bàn sai'],
    dia:{balls:[{x:24,y:22,c:W},{x:38,y:34,c:R},{x:52,y:20,c:R},{x:64,y:38,c:R},{x:74,y:26,c:R},{x:46,y:44,c:R}]}},
];
const drillByKey=(k)=>DRILLS.find(d=>d.key===k);

/* ===== Kế hoạch tuần tự sinh theo điểm yếu ===== */
const WEEK_DOW=['T2','T3','T4','T5','T6','T7','CN'];
const isoMonday=(d)=>{ const x=new Date(d); const off=(x.getDay()+6)%7; x.setDate(x.getDate()-off); x.setHours(0,0,0,0); return x; };
// Trả về "ngày sửa điểm yếu" thứ idx (theo lỗi mắc nhiều nhất còn map được sang bài tập), hoặc null.
function weaknessDay(weak, idx, usedMis){
  let seen=0;
  for(const [mis] of (weak||[])){
    if(usedMis.has(mis)) continue;
    const ds=DRILLS.filter(d=>d.fixes.includes(mis)&&d.key!=='stop');
    if(!ds.length) continue;
    if(seen===idx){ usedMis.add(mis); return {theme:'Sửa: '+mis, icon:'🔧', keys:ds.slice(0,2).map(d=>d.key), sub:'Điểm yếu hay mắc — luyện tập trung'}; }
    seen++;
  }
  return null;
}
// 7 ngày: nền tảng → (yếu#1) → cắt → (yếu#2) → ra bi → (yếu#3/phòng thủ) → tổng duyệt+ghost.
function buildWeekPlan(weak){
  const used=new Set();
  const w0=weaknessDay(weak,0,used), w1=weaknessDay(weak,1,used), w2=weaknessDay(weak,2,used);
  const days=[
    {theme:'Nền tảng',            icon:'🎯', keys:['stop','center'],        sub:'Chuẩn tâm bi & đưa cơ thẳng'},
    w0 || {theme:'Bi đơn (vào lỗ)',icon:'🎱', keys:['longpot','wagon'],      sub:'Vào lỗ từ mọi góc'},
    {theme:'Cú cắt',              icon:'✂️', keys:['cutladder','thincut'],   sub:'Mở rộng vùng góc cắt tự tin'},
    w1 || {theme:'Vị trí & ra bi', icon:'📍', keys:['position3','cuecircle'], sub:'Bi cái dừng đúng vùng'},
    {theme:'Ra bi nâng cao',      icon:'📌', keys:['lineup','follow_lane'],  sub:'Run-out & giữ làn bi cái'},
    w2 || {theme:'Phòng thủ & phá',icon:'🛡️', keys:['safety','break9'],       sub:'Safety + phá kiểm soát'},
    {theme:'Tổng duyệt & Ghost',  icon:'🏁', keys:['routine20','pressure'],  sub:'Kỷ luật routine + cú áp lực', ghost:true},
  ];
  return {days};
}

/* Thư viện thế khó — tình huống thực tế hay gặp + cách xử lý */
const PROBLEMS=[
  {key:'cluster',name:'Bi cụm (chùm bi dính)',tag:'Phá cụm',
    sit:'Vài bi của bạn dính thành cụm, không bi nào ăn được trực tiếp.',
    fix:'Phá cụm SỚM khi còn bi "bảo hiểm" dễ ăn ở chỗ khác. Đừng phá bằng cú mạnh mất kiểm soát — dùng một cú đang ăn để bi cái đi NGANG chạm nhẹ rìa cụm, tách 1–2 bi ra mà vẫn giữ được cú kế. Nếu chưa có lợi, đánh safety và chờ.',
    dia:{balls:[{x:20,y:30,c:W},{x:60,y:24,c:R},{x:64,y:27,c:R},{x:62,y:30,c:R},{x:66,y:31,c:R},{x:40,y:38,c:R}],arrows:[[23,30,55,26]]}},
  {key:'frozen',name:'Bi mục tiêu sát băng',tag:'Sát băng',
    sit:'Bi mục tiêu dính/sát mặt băng, dễ trượt vì băng "nuốt" bi.',
    fix:'Ngắm sao cho bi cái chạm BI và BĂNG gần như cùng lúc. Thêm một chút xoáy ngoài (outside english) để bù throw. Lực vừa phải — quá mạnh bi sẽ nhảy khỏi băng. Nếu góc xấu, cân nhắc safety đẩy bi dọc băng.',
    dia:{balls:[{x:24,y:30,c:W},{x:70,y:8,c:R}],line:[27,29,68,9]}},
  {key:'snooker',name:'Bị che (snooker)',tag:'Kick/giải',
    sit:'Một bi chắn mất đường thẳng tới bi mục tiêu — không đánh thẳng được.',
    fix:'Tính cú KICK: dùng hệ gương (góc tới = góc phản) đánh bi cái chạm 1 băng rồi ra bi mục tiêu — dùng tab Góc phản xạ để ướm đường. Nếu khó ăn, ưu tiên cú giải an toàn: chạm đúng bi mục tiêu (tránh phạm lỗi) và để lại thế khó cho đối thủ.',
    dia:{balls:[{x:22,y:34,c:W},{x:50,y:30,c:G},{x:78,y:22,c:R}],arrows:[[24,33,52,10],[52,10,76,22]]}},
  {key:'thincut',name:'Cú cắt quá mỏng',tag:'Cắt mỏng',
    sit:'Góc cắt rất mỏng (gần 75–80°), xác suất vào thấp và dễ mất bi cái.',
    fix:'Hỏi: có đường BANK hay COMBO chắc hơn không? Nếu vẫn cắt: ngắm điểm chạm thật rõ, lực vừa, KHÔNG cố ra bi xa (mỏng + mạnh = mất kiểm soát). Thường cú safety hoặc bank lại là lựa chọn khôn hơn cú cắt mỏng liều.',
    dia:{balls:[{x:30,y:40,c:W},{x:64,y:26,c:R}],line:[33,39,62,27],arrows:[[66,25,92,18]]}},
  {key:'eightblocked',name:'Bi 8 bị che',tag:'Cuối ván',
    sit:'Còn mỗi bi 8 nhưng đường vào lỗ bị một bi đối thủ chặn.',
    fix:'Ba lựa chọn theo thứ tự an toàn: (1) đổi lỗ khác đang trống; (2) combo/bank nếu đường rõ; (3) nếu cả hai đều rủi ro, đánh safety giấu bi cái — thua lượt còn hơn để hớ cho đối thủ ăn nốt. Đừng liều cú 50/50 khi đang dẫn.',
    dia:{balls:[{x:26,y:26,c:W},{x:58,y:26,c:G},{x:72,y:26,c:R}],line:[29,26,55,26]}},
  {key:'noposition',name:'Đường ra bi bị chặn',tag:'Ra bi 2 băng',
    sit:'Ăn được bi trước mặt nhưng bi cái sẽ kẹt, không có cú kế.',
    fix:'Đừng chỉ nghĩ "vào lỗ". Tìm đường ra bi 2 băng: cho bi cái chạm băng rồi quay về vùng trống có cú kế. Chọn lực và xoáy để điều bi cái — nếu không có đường ra tốt, cân nhắc đổi thứ tự bi hoặc đánh chắc + để bi cái an toàn.',
    dia:{balls:[{x:40,y:30,c:W},{x:62,y:20,c:R},{x:24,y:40,c:Y}],arrows:[[42,30,88,44],[88,44,40,46]]}},
  {key:'doublekiss',name:'Nguy cơ "hôn" bi (double kiss)',tag:'Tránh chạm lại',
    sit:'Cắt mỏng bi sát băng — bi cái dễ chạm LẠI bi mục tiêu lần hai, làm hỏng cú.',
    fix:'Đưa bi cái RỜI khỏi đường bi mục tiêu ngay sau chạm: thêm chút xoáy phù hợp hoặc đổi góc để bi cái né ra. Nếu không tránh được, chọn cú khác — double kiss vừa trượt vừa để lại thế xấu.',
    dia:{balls:[{x:26,y:12,c:W},{x:60,y:9,c:R}],line:[29,12,58,10],arrows:[[60,9,84,20]]}},
  {key:'scratchrisk',name:'Dễ chết cái vào lỗ',tag:'Tránh chết cái',
    sit:'Cú thẳng vào lỗ góc, bi cái có xu hướng lăn theo vào luôn lỗ đó.',
    fix:'Dùng cú DỪNG hoặc RÚT nhẹ để bi cái không theo. Hoặc lệch một chút cho bi cái đi ngang. Đừng đánh tâm bi lực mạnh — bi cái sẽ theo chân bi mục tiêu xuống lỗ.',
    dia:{balls:[{x:24,y:26,c:W},{x:70,y:16,c:R}],line:[27,25,69,17]}},
  {key:'twoway',name:'Cú hai đường (ăn hoặc an toàn)',tag:'Cú 2 mục đích',
    sit:'Cú khó ~50/50, nếu trượt sẽ tặng thế đẹp cho đối thủ.',
    fix:'Chọn đường sao cho: nếu vào thì tốt, nếu trượt thì bi cái vẫn về chỗ an toàn. Điều chỉnh lực để "trượt cũng an toàn" — đây là cú khôn nhất khi thế 50/50.',
    dia:{balls:[{x:22,y:34,c:W},{x:58,y:22,c:R}],line:[25,33,56,23],arrows:[[60,21,88,10],[60,23,86,40]]}},
  {key:'railcue',name:'Bi cái dính băng',tag:'Cái sát băng',
    sit:'Bi cái sát/dính mặt băng — không đánh thấp hay xoáy mạnh được.',
    fix:'Chỉ đánh được nửa trên hoặc tâm bi. Đưa cơ SONG SONG mặt băng, tránh chọc xuống làm nhảy bi. Giảm kỳ vọng ra bi, ưu tiên cú chắc và giữ thế.',
    dia:{balls:[{x:20,y:9,c:W},{x:60,y:24,c:R}],line:[23,10,58,23]}},
  {key:'lastpos',name:'Ra bi cho bi kết (8/9)',tag:'Ra bi kết',
    sit:'Còn bi áp chót; ăn xong phải để bi cái vào đúng chỗ đánh bi 8/9.',
    fix:'Lên kế hoạch NGƯỢC: bi kết cần bi cái ở đâu → chọn đường ra bi cho cú áp chót theo đó. Ưu tiên vùng ra bi RỘNG thay vì điểm hẹp. Ăn chắc + ra bi khá hơn là cố hoàn hảo rồi hỏng.',
    dia:{balls:[{x:30,y:36,c:W},{x:52,y:26,c:R},{x:80,y:16,c:Y}],line:[33,35,51,27],arrows:[[53,25,78,17]]}},
  {key:'clustersafe',name:'Phá cụm mà vẫn an toàn',tag:'Phá + safe',
    sit:'Cần tách cụm bi nhưng nếu tách hớ, đối thủ ăn hết.',
    fix:'Đánh một cú đang ăn sao cho bi cái chạm NHẸ rìa cụm (tách 1 bi) rồi về chỗ khó cho đối thủ. Không có cú ăn đi kèm thì safety đẩy nhẹ vào cụm và giấu bi cái, chờ thế tốt hơn.',
    dia:{balls:[{x:22,y:30,c:W},{x:58,y:24,c:R},{x:61,y:27,c:R},{x:59,y:30,c:R},{x:40,y:40,c:Y}],arrows:[[25,30,55,26]]}},
  {key:'longsafe',name:'Safety đường dài',tag:'Safety dài',
    sit:'Không có cú ăn; cần khóa bi cái xa để đối thủ khó.',
    fix:'Đẩy bi mục tiêu về một đầu bàn và bi cái về đầu KIA — càng xa nhau càng khó. Kiểm soát lực để cả hai bi dừng đúng ý. Ẩn được bi cái sau bi khác (snooker) là điểm cộng lớn.',
    dia:{balls:[{x:18,y:26,c:W},{x:80,y:26,c:R}],arrows:[[21,26,40,26],[80,26,90,30]]}},
  {key:'combovsbank',name:'Chọn combo hay bank?',tag:'Ra quyết định',
    sit:'Bi khó ăn trực tiếp; vừa có đường combo vừa có đường bank.',
    fix:'Chọn đường ÍT biến số hơn: combo cần 2 điểm chạm chuẩn, bank cần đọc góc + lực. Combo gần & thẳng hàng thì ưu tiên combo; khoảng bank quen thì bank. Không rõ đường nào chắc thì safety.',
    dia:{balls:[{x:24,y:34,c:W},{x:48,y:30,c:R},{x:60,y:30,c:R}],arrows:[[50,29,80,12]]}},
];
// Sơ đồ bài tập/thế khó vẽ cho bàn cũ (tâm y≈27); bàn mới 2:1 có tâm y=30 → dịch xuống 3 để căn giữa.
function shiftDiaY(dia, dy){
  if(!dia) return dia;
  if(dia.balls) dia.balls.forEach(b=>{ b.y+=dy; });
  if(dia.line){ dia.line[1]+=dy; dia.line[3]+=dy; }
  if(dia.stick){ dia.stick[1]+=dy; dia.stick[3]+=dy; }
  if(dia.zone) dia.zone[1]+=dy;
  if(dia.arrows) dia.arrows.forEach(a=>{ a[1]+=dy; a[3]+=dy; });
  return dia;
}
DRILLS.forEach(d=>shiftDiaY(d.dia,3));
PROBLEMS.forEach(p=>shiftDiaY(p.dia,3));

/* Ngày HÔM NAY theo giờ MÁY, không phải giờ UTC.
   toISOString() trả giờ UTC, mà Việt Nam là UTC+7 — nên từ 00:00 tới 06:59 giờ Việt Nam
   nó khai ngày HÔM TRƯỚC (đo 12/08/2026: lúc 00:30 ngày 12/8 nó trả "2026-08-11").
   Buổi tập đêm sẽ bị ghi sang hôm trước, và không lỗi nào phát ra. */
const _p2=n=>String(n).padStart(2,'0');
const todayStr=()=>{ const d=new Date(); return d.getFullYear()+'-'+_p2(d.getMonth()+1)+'-'+_p2(d.getDate()); };
const nowHM=()=> new Date().toTimeString().slice(0,5);
const fmtDate=(s)=>{ if(!s) return ''; const p=s.split('-'); return p.length===3? p[2]+'/'+p[1] : s; };
const uid=(p)=> p+Date.now().toString(36)+Math.floor(Math.random()*1e4).toString(36);

/* ---- Tab (gộp gọn còn 5; cho phép đổi vị trí) ---- */
const TAB_DEFS=[
  {id:'pre',   ico:'🧘', lab:'Tâm & Thân'},
  {id:'table', ico:'🎱', lab:'Thi đấu'},
  {id:'log',   ico:'📓', lab:'Nhật ký'},
  {id:'train', ico:'📈', lab:'Rèn luyện'},
  {id:'know',  ico:'📚', lab:'Kiến thức'},
];
const TAB_IDS=TAB_DEFS.map(t=>t.id);
function mergeOrder(saved){
  const base=Array.isArray(saved)? saved.filter(id=>TAB_IDS.includes(id)) : [];
  TAB_IDS.forEach(id=>{ if(!base.includes(id)) base.push(id); });
  return base;
}
// Điều hướng chéo tab: NAV.go(tab, seg). App gán go; tab đích đọc _pendingSeg khi remount (key=tab).
let _pendingSeg=null;   // {tab, seg}
let _pendingLive=null;  // {keys, counts} — từ bảng Đang đấu → mở Ghi trận bên Nhật ký
const NAV={ go:()=>{} };
function takePendingSeg(tab, def){ if(_pendingSeg && _pendingSeg.tab===tab){ const s=_pendingSeg.seg; _pendingSeg=null; return s; } return def; }
// Link trỏ chéo giữa các bài Kiến thức (khuôn (Xem "tên bài".) trong nội dung): bấm vào tên bài
// là mở thẳng bài đó. KnowledgeView đang mở sẵn thì nhận trực tiếp qua _knowNavListeners (không remount);
// đang ở tab Ôn luyện thì ép seg='read' qua _setKnowSeg để KnowledgeView mount mới đọc _knowNavKey.
let _setKnowSeg=null, _knowNavKey=null, _knowNavListeners=[];
function navToKnowArticle(key){
  const hadListener=_knowNavListeners.length>0;
  _knowNavListeners.slice().forEach(fn=>fn(key));
  if(hadListener){ _knowNavKey=null; }
  else { _knowNavKey=key; if(_setKnowSeg) _setKnowSeg('read'); }
}
function takePendingKnowArt(){ const k=_knowNavKey; _knowNavKey=null; return k; }
function subscribeKnowNav(fn){ _knowNavListeners.push(fn); return ()=>{ _knowNavListeners=_knowNavListeners.filter(f=>f!==fn); }; }
function tabView(id){
  switch(id){
    case 'pre': return <PreMatch/>;
    case 'table': return <AtTable/>;
    case 'log': return <MatchLog/>;
    case 'train': return <Training/>;
    case 'know': return <KnowTab/>;
    default: return null;
  }
}
function Seg({val,set,opts}){
  return (
    <div className="modeseg" style={{alignSelf:'center',margin:'4px 0 10px',maxWidth:'100%'}}>
      {opts.map(([k,t])=><button key={k} className={val===k?'on':''} onClick={()=>set(k)}>{t}</button>)}
    </div>
  );
}
/* Các nhóm mục con (segment) cho phép đổi thứ tự */
const SEG_DEFS={
  table:{lab:'Thi đấu',   items:[['breathe','🫁 Nhịp thở'],['anchor','🎯 Neo mắt'],['cue','🔔 Nhắc nhở'],['live','🔴 Đang đấu'],['positions','🎱 Điều bi'],['routine','✓ Routine']]},
  train:{lab:'Rèn luyện', items:[['summary','📊 Tổng hợp'],['drills','🎯 Bài tập'],['runout','🗺️ Run-out'],['clock','⏱ Đồng hồ'],['metro','🎵 Nhịp']]},
  log:  {lab:'Nhật ký',   items:[['log','Lịch sử'],['opps','Đối thủ']]},
  know: {lab:'Kiến thức', items:[['read','📖 Đọc'],['review','🎴 Ôn luyện']]},
};
function segKeys(group){
  const def=SEG_DEFS[group].items.map(i=>i[0]);
  const saved=(store.get('nc.segorder',{})||{})[group];
  const base=Array.isArray(saved)? saved.filter(k=>def.includes(k)) : [];
  def.forEach(k=>{ if(!base.includes(k)) base.push(k); });
  return base;
}
function orderedOpts(group){
  const map={}; SEG_DEFS[group].items.forEach(i=>{ map[i[0]]=i; });
  return segKeys(group).map(k=>map[k]);
}
/* MindTab đã gộp: Nhịp thở + Nhắc nhở chuyển sang tab Thi đấu (AtTable), Nhạc về Tâm & Thân (PreMatch). */

/* ---- Tâm & Thân: mindset + khởi động + nhạc ---- */
const STRETCHES=[
  {n:'Xoay cổ tay',        h:'Đan hai tay, xoay cổ tay theo cả hai chiều.', s:25},
  {n:'Duỗi–gập cổ tay',    h:'Duỗi thẳng tay, kéo nhẹ bàn tay lên rồi xuống.', s:25},
  {n:'Xoay vai',           h:'Xoay hai vai ra sau, rồi ra trước, biên độ rộng.', s:25},
  {n:'Kéo giãn vai sau',   h:'Đưa một tay ngang ngực, tay kia ép nhẹ; đổi bên.', s:25},
  {n:'Nghiêng & xoay cổ',  h:'Nghiêng đầu sang hai bên rồi xoay nhẹ, không giật.', s:20},
  {n:'Vặn nhẹ thân/hông',  h:'Hai tay chống hông, xoay eo mở khớp hông.', s:20},
  {n:'Bung & nắm ngón tay',h:'Nắm chặt rồi xòe mạnh các ngón 10 lần, làm nóng bàn tay.', s:20},
  {n:'Xoay cánh tay',      h:'Vẽ vòng tròn lớn bằng cả cánh tay, đổi hai chiều.', s:20},
  {n:'Ép ngón & cổ tay',   h:'Duỗi thẳng tay, dùng tay kia kéo nhẹ các ngón về sau.', s:20},
  {n:'Nghiêng thân',       h:'Một tay giơ cao, nghiêng người sang bên; đổi bên.', s:20},
  {n:'Hít thở sâu',        h:'Ba hơi thở sâu, thả lỏng vai và hàm trước khi vào trận.', s:15},
];
const WAR_QUOTES=[
  'Vào bàn là để THẮNG — không phải để hy vọng.',
  'Áp lực là đặc quyền: chỉ kẻ mạnh mới được đứng đây.',
  'Đối thủ cũng đang run. Việc của mày là bình tĩnh hơn.',
  'Mỗi cú là một trận nhỏ. Thắng từng cú là thắng cả ván.',
  'Không có cú may rủi — chỉ có chuẩn bị gặp cơ hội.',
  'Đánh như thể mày đã thắng. Tự tin dẫn đường cơ.',
  'Kẻ thắng không phải ít sai, mà là bình tĩnh sau cái sai.',
  'Tập trung vào cú trước mặt. Cúp vô địch tính sau.',
  'Bàn này là của mày. Cứ đòi lấy nó.',
  'Càng căng càng chậm lại. Bản lĩnh nằm ở hơi thở.',
  'Đầu lạnh, tim nóng — đó là cách thắng.',
  'Đã cầm cơ thì chơi tới cùng. Sợ thua thì đừng đánh.',
  'Người giỏi không đợi cảm hứng — họ dựa vào thói quen.',
  'Lì đòn, giữ vững, kết liễu khi có cơ hội.',
  'Thắng bắt đầu từ cú phá. Vào bàn với khí thế.',
  'Không ai thắng bằng cách sợ thua. Đánh để thắng.',
  'Mỗi cú dễ là một điểm. Đừng coi thường cú nào.',
  'Bình tĩnh khi dẫn, lì đòn khi bị rượt.',
  'Tự tin không phải là không run — là run mà vẫn bắn chuẩn.',
  'Đối thủ mạnh giúp mày giỏi lên. Cảm ơn rồi đánh bại họ.',
  'Tập trung vào quy trình, điểm số tự tới.',
  'Cú quan trọng nhất là cú tiếp theo.',
  'Thắng cái đầu trước, thắng cái bàn sau.',
  'Áp lực là khi mày quan tâm. Biến nó thành tập trung.',
  'Đừng đánh nhanh hơn — hãy đánh chắc hơn.',
  'Mỗi buổi tập là một viên gạch xây tường thành.',
  'Khi mệt mỏi, kỷ luật thay cho cảm hứng.',
  'Người vô địch là người đứng dậy thêm một lần.',
  'Làm chủ bi cái là làm chủ ván cờ.',
  'Không kiểm soát được đối thủ. Kiểm soát được cú của mày.',
  'Bàn không nói dối. Cứ đánh đúng, nó sẽ trả công.',
  'Thắng nhờ trăm cú nhàm chán, không nhờ một cú xuất thần.',
  'Bình tĩnh không phải bẩm sinh — là chọn lựa từng cú.',
  'Đừng chứng minh cho ai. Chỉ đánh cú của mình.',
  'Cú khó cũng chỉ là cú dễ mà mày chưa tập đủ.',
  'Giữ nhịp của mày, đối thủ sẽ phải chơi theo.',
  'Thua một ván, học một bài. Không ván nào phí.',
  'Tay lạnh, đầu tỉnh, mắt trên bi mục tiêu.',
  'Đừng sợ cơ hội. Mày sinh ra để đứng ở đây.',
  'Khó khăn là bộ lọc — nó loại người vội vàng.',
  'Một safety đúng lúc đáng giá bằng ba cú ăn.',
  'Đánh chắc khi dẫn, đánh gan khi bị dồn.',
  'Cơ trong tay, thế trong đầu, thắng trong tim.',
  'Mỗi lần cúi xuống bàn là một lời hứa với chính mình.',
];
// Các câu "Mindset chiến đấu" cũ giờ được đưa vào danh sách Nhắc nhở (tag "Chiến đấu").
const WAR_CUES=WAR_QUOTES.map(t=>({tag:'Chiến đấu',t}));
const RESET_LINES=[
  'Một cú là một cú. Thở ra, làm lại.',
  'Quá khứ đã xong. Chỉ còn cú tiếp theo.',
  'Mày kiểm soát hơi thở, là kiểm soát được tay.',
  'Buông cú vừa rồi. Về với bàn lúc này.',
  'Chậm lại. Một hơi thở, một cú đánh.',
  'Bình tĩnh là vũ khí. Hít vào… thở ra…',
];
const RESET_PHASES=[['Hít vào',4,1.35],['Giữ',2,1.35],['Thở ra',6,1]];

/* ---- Nhắc nhở (chuông) — đọc kế hoạch tuần từ localStorage, không phụ thuộc state của Training ---- */
function useWeekReminders(){
  const [tick,setTick]=useState(0);
  useEffect(()=>{ const id=setInterval(()=>setTick(t=>t+1),4000); return ()=>clearInterval(id); },[]);
  return useMemo(()=>{
    const wp=store.get('nc.weekplan',null);
    if(!wp||!Array.isArray(wp.days)||wp.days.length!==7) return [];
    const curWeek=isoMonday(new Date());
    const dk=(d)=>d.toISOString().slice(0,10);
    const curWeekId=dk(curWeek);
    if(wp.week!==curWeekId) return [];
    const recs=store.get('nc.training',[])||[];
    const ghost=store.get('nc.ghost',[])||[];
    const dayDateStr=(i)=>{ const m=new Date(curWeek); m.setDate(m.getDate()+i); return dk(m); };
    const dayDone=(i)=>{ const day=wp.days[i]||{}; const dt=dayDateStr(i); const keys=day.keys||[];
      return recs.some(r=>r.date===dt&&keys.includes(r.drill)) || (day.ghost&&ghost.some(g=>g.date===dt)); };
    const todayIdx=(new Date().getDay()+6)%7;
    const items=[];
    for(let i=0;i<todayIdx;i++){ if(!dayDone(i)) items.push({key:'m'+i, text:'⚪ Bỏ lỡ buổi tập '+(WEEK_DOW[i]||'')+' tuần này'}); }
    if(!dayDone(todayIdx)) items.push({key:'t', text:'🟠 Hôm nay chưa hoàn thành buổi tập'});
    return items;
  },[tick]);
}
function NotifBell(){
  const [open,setOpen]=useState(false);
  const items=useWeekReminders();
  const count=items.length;
  const goTrain=()=>{ setOpen(false); NAV.go('train'); };
  return (
    <div className="notifwrap">
      <button className="iconbtn" onClick={()=>setOpen(o=>!o)} aria-label="Nhắc nhở">
        🔔
        {count>0 && <span className="notifbadge">{count>9?'9+':count}</span>}
      </button>
      {open && <>
        <div className="notifbackdrop" onClick={()=>setOpen(false)}/>
        <div className="notifpanel">
          <div className="notifhead">Nhắc nhở tuần này</div>
          {count===0
            ? <div className="notifempty">✅ Đang đúng kế hoạch tuần này — cứ giữ nhịp vậy nhé!</div>
            : items.map(it=><button key={it.key} className="notifitem" onClick={goTrain}>{it.text}</button>)}
        </div>
      </>}
    </div>
  );
}

/* ================= App ================= */
function App(){
  const [order,setOrder]=useState(()=>mergeOrder(store.get('nc.taborder',null)));
  const [tab,setTab]=useState(()=>mergeOrder(store.get('nc.taborder',null))[0]);
  const [theme,setTheme]=useState(store.get('nc.theme','felt'));
  const [fsize,setFsize]=useState(store.get('nc.fontsize',FS_MAC_DINH));
  const [settings,setSettings]=useState(false);
  const [reset,setReset]=useState(false);
  const [cuser,setCuser]=useState(getCloudUser());
  const [cstatus,setCstatus]=useState(getCloudStatus());
  const tabRef=useRef(null);
  useEffect(()=>{applyTheme(theme);},[theme]);
  useEffect(()=>{applyFontSize(fsize);},[fsize]);
  useEffect(()=>{ const el=tabRef.current&&tabRef.current.querySelector('.tab.on'); if(el&&el.scrollIntoView) el.scrollIntoView({inline:'center',block:'nearest'}); },[tab,order]);
  useEffect(()=>{ const off=onCloud(()=>{ setCuser(getCloudUser()); setCstatus(getCloudStatus()); }); cloudInit(); return off; },[]);
  const saveOrder=(o)=>{ setOrder(o); store.set('nc.taborder',o); };
  NAV.go=(t,s)=>{ if(s) _pendingSeg={tab:t,seg:s}; setTab(t); };

  return (
    <div className="app">
      <div className="top">
        <div className="brand">
          <div className="logo">◉</div>
          <div><b>CueZen</b><small>Giữ tập trung khi đứng bàn</small></div>
        </div>
        <div style={{display:'flex',gap:8,alignItems:'center'}}>
          <button className="resetBtn" onClick={()=>setReset(true)}>⟳ Reset</button>
          <NotifBell/>
          <button className="iconbtn" onClick={()=>setSettings(true)} aria-label="Cài đặt">⚙️</button>
        </div>
      </div>

      <div className="body"><div key={tab} className="tabfade">{tabView(tab)}</div></div>

      <div className="tabs" ref={tabRef}>
        {order.map(id=>{ const d=TAB_DEFS.find(t=>t.id===id); return d&&<TabBtn key={id} id={id} cur={tab} set={setTab} ico={d.ico} lab={d.lab}/>; })}
      </div>

      {settings && <Settings theme={theme} setTheme={setTheme} fsize={fsize} setFsize={setFsize} order={order} setOrder={saveOrder} cuser={cuser} cstatus={cstatus} close={()=>setSettings(false)}/>}
      {reset && <ResetOverlay close={()=>setReset(false)}/>}
    </div>
  );
}
function TabBtn({id,cur,set,ico,lab}){
  return <button className={'tab'+(cur===id?' on':'')} onClick={()=>set(id)}>
    <span className="ico">{ico}</span>{lab}
  </button>;
}

/* ---------- buzz ---------- */
function buzz(ms){ try{ if(navigator.vibrate) navigator.vibrate(ms); }catch(e){} }
let _ac=null;
function beep(freq,dur,vol){
  freq=freq||880; dur=dur||0.09; vol=vol||0.4;
  try{
    if(!_ac) _ac=new (window.AudioContext||window.webkitAudioContext)();
    const c=_ac; if(c.state==='suspended') c.resume();
    const o=c.createOscillator(), g=c.createGain(), t=c.currentTime;
    o.frequency.value=freq; o.type='sine'; o.connect(g); g.connect(c.destination);
    g.gain.setValueAtTime(0.0001,t);
    g.gain.exponentialRampToValueAtTime(vol,t+0.005);
    g.gain.exponentialRampToValueAtTime(0.0001,t+dur);
    o.start(t); o.stop(t+dur+0.02);
  }catch(e){}
}

/* ================= Đếm nhịp (metronome) ================= */
function Metronome(){
  const [bpm,setBpm]=useState(()=>store.get('nc.bpm',55));
  const [on,setOn]=useState(false);
  const [beat,setBeat]=useState(0);
  const [sound,setSound]=useState(()=>store.get('nc.metroSound',true));
  const acRef=useRef(null), soundRef=useRef(sound), tapRef=useRef([]), timer=useRef(null);
  useEffect(()=>{ soundRef.current=sound; store.set('nc.metroSound',sound); },[sound]);
  useEffect(()=>{ store.set('nc.bpm',bpm); },[bpm]);

  const click=()=>{
    if(!soundRef.current) return;
    try{
      if(!acRef.current) acRef.current=new (window.AudioContext||window.webkitAudioContext)();
      const c=acRef.current; if(c.state==='suspended') c.resume();
      const o=c.createOscillator(), g=c.createGain(), t=c.currentTime;
      o.frequency.value=1000; o.connect(g); g.connect(c.destination);
      g.gain.setValueAtTime(0.0001,t);
      g.gain.exponentialRampToValueAtTime(0.5,t+0.004);
      g.gain.exponentialRampToValueAtTime(0.0001,t+0.05);
      o.start(t); o.stop(t+0.06);
    }catch(e){}
  };
  useEffect(()=>{
    if(!on){ clearInterval(timer.current); return; }
    const tick=()=>{ setBeat(b=>b+1); click(); buzz(25); };
    tick();
    timer.current=setInterval(tick,60000/bpm);
    return ()=>clearInterval(timer.current);
  },[on,bpm]);

  const tap=()=>{
    const t=Date.now(), a=tapRef.current;
    if(a.length && t-a[a.length-1]>2000) a.length=0;
    a.push(t); if(a.length>5) a.shift();
    if(a.length>=2){
      let s=0; for(let i=1;i<a.length;i++) s+=a[i]-a[i-1];
      const b=Math.round(60000/(s/(a.length-1)));
      setBpm(Math.max(30,Math.min(120,b)));
    }
  };
  const ang = on ? (beat%2===0? 15 : -15) : 0;
  return (
    <div className="metro">
      <div className="pendwrap">
        <div className="pend" style={{transform:`rotate(${ang}deg)`,
          transitionDuration:on?(60/bpm)+'s':'.3s',transitionTimingFunction:'ease-in-out'}}>
          <div className="bob"/><div className="arm"/>
        </div>
        <div className="pivot"/>
      </div>
      <div className="bpmbox">
        <button onClick={()=>setBpm(b=>Math.max(30,b-1))}>－</button>
        <div className="bpmnum"><b>{bpm}</b><small>BPM</small></div>
        <button onClick={()=>setBpm(b=>Math.min(120,b+1))}>＋</button>
      </div>
      <input type="range" min="30" max="120" value={bpm} onChange={e=>setBpm(+e.target.value)}/>
      <div className="presets" style={{justifyContent:'center'}}>
        {[50,55,60,72].map(p=><button key={p} className={'chip'+(bpm===p?' on':'')} onClick={()=>setBpm(p)}>{p}</button>)}
        <button className="chip" onClick={tap}>👆 Gõ nhịp</button>
      </div>
      <div className="clockbtns" style={{maxWidth:330}}>
        <button className="btn acc" onClick={()=>setOn(o=>!o)}>{on?'⏸ Dừng':'▶ Bắt đầu'}</button>
        <button className="btn ghost" onClick={()=>setSound(s=>!s)}>{sound?'🔊 Tiếng':'🔇 Tắt tiếng'}</button>
      </div>
      <div className="muted" style={{fontSize:'0.8125rem',textAlign:'center',maxWidth:320,lineHeight:1.5}}>
        Đưa cơ theo tiếng tách để nhịp tay đều và mượt. Chậm (50–60) cho cú chuẩn xác.
      </div>
    </div>
  );
}

/* ================= Nhịp thở (Box / 4-7-8) ================= */
function Breathe(){
  const [pk,setPk]=useState(()=>store.get('nc.breath','box'));
  const pat=BREATH.find(p=>p.key===pk)||BREATH[0];
  const phases=pat.phases;
  const [on,setOn]=useState(false);
  const [pi,setPi]=useState(0);
  const [left,setLeft]=useState(phases[0][1]);
  const [cycles,setCycles]=useState(0);
  const ref=useRef(null);

  useEffect(()=>{ store.set('nc.breath',pk); setOn(false); setPi(0); setLeft(pat.phases[0][1]); setCycles(0); },[pk]);

  useEffect(()=>{
    if(!on){ clearInterval(ref.current); return; }
    ref.current=setInterval(()=>{
      setLeft(l=>{
        if(l>1) return l-1;
        setPi(p=>{ const np=(p+1)%phases.length; if(np===0) setCycles(c=>c+1); buzz(60); return np; });
        return phases[(pi+1)%phases.length][1];
      });
    },1000);
    return ()=>clearInterval(ref.current);
  },[on,pi,pk]);

  const start=()=>{ setPi(0); setLeft(phases[0][1]); setCycles(0); setOn(true); buzz(60); };
  const stop=()=>{ setOn(false); };

  const ph=phases[pi];
  return (
    <div className="breathe">
      <div className="presets" style={{justifyContent:'center'}}>
        {BREATH.map(p=><button key={p.key} className={'chip'+(pk===p.key?' on':'')} onClick={()=>setPk(p.key)}>{p.name}</button>)}
      </div>
      <div className="orb" style={{transform:`scale(${on?ph[2]:1.1})`,transitionDuration: on?ph[1]+'s':'.6s'}}>
        <div>
          <div className="ph">{on?ph[0]:'Sẵn sàng'}</div>
          <div className="ct">{on?left:pat.phases.map(p=>p[1]).join('·')}</div>
        </div>
      </div>
      <div className="sub">
        {pat.note}<br/>
        {on? <b style={{color:'var(--gold)'}}>{cycles} vòng hoàn thành</b> : 'Làm 3–4 vòng để tay vững trước cú khó.'}
      </div>
      {on
        ? <button className="btn ghost wide" onClick={stop}>⏹ Dừng</button>
        : <button className="btn acc wide" onClick={start}>▶ Bắt đầu thở</button>}
    </div>
  );
}

/* ================= Routine ================= */
function Routine(){
  const [steps,setSteps]=useState(()=>store.get('nc.routine',DEFAULT_ROUTINE));
  const [done,setDone]=useState(()=>steps.map(()=>false));
  const [edit,setEdit]=useState(false);

  useEffect(()=>{ setDone(d=> steps.map((_,i)=> d[i]||false)); },[steps]);

  const cur = done.findIndex(x=>!x);
  const toggle=(i)=> setDone(d=> d.map((x,j)=> j===i?!x:x));
  const reset=()=> setDone(steps.map(()=>false));
  const allDone = done.length>0 && done.every(Boolean);

  return (
    <div style={{display:'flex',flexDirection:'column',flex:1}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
        <div className="h">Quy trình trước cú đánh</div>
        <button className="chip" onClick={()=>setEdit(true)}>✎ Sửa</button>
      </div>
      <div className="steps">
        {steps.map((s,i)=>
          <div key={i} className={'step'+(done[i]?' done':'')+(!done[i]&&i===cur?' cur':'')} onClick={()=>toggle(i)}>
            <div className="n">{done[i]?'✓':i+1}</div>
            <div className="tx">{s.t}{s.s&&<small>{s.s}</small>}</div>
          </div>)}
      </div>
      <div className="rowbtns">
        <button className="btn acc" onClick={reset}>{allDone?'🎯 Xong! Làm lại':'↺ Lượt mới'}</button>
      </div>
      {edit && <RoutineEdit steps={steps} save={(s)=>{setSteps(s);store.set('nc.routine',s);setEdit(false);}}
                close={()=>setEdit(false)}/>}
    </div>
  );
}
function RoutineEdit({steps,save,close}){
  const [list,setList]=useState(steps.map(s=>({...s})));
  const upd=(i,k,v)=>setList(l=>l.map((s,j)=>j===i?{...s,[k]:v}:s));
  const add=()=>setList(l=>[...l,{t:'Bước mới',s:''}]);
  const del=(i)=>setList(l=>l.filter((_,j)=>j!==i));
  return (
    <div className="scrim" onClick={close}>
      <div className="sheet" onClick={e=>e.stopPropagation()}>
        <h3>Sửa quy trình</h3>
        {list.map((s,i)=>
          <div key={i} style={{marginBottom:12,paddingBottom:12,borderBottom:'1px solid var(--line)'}}>
            <div className="editrow">
              <input value={s.t} onChange={e=>upd(i,'t',e.target.value)} placeholder="Tên bước"/>
              <button className="x" onClick={()=>del(i)}>✕</button>
            </div>
            <div className="editrow"><input value={s.s||''} onChange={e=>upd(i,'s',e.target.value)} placeholder="Ghi chú (tuỳ chọn)"/></div>
          </div>)}
        <button className="btn ghost wide" onClick={add} style={{marginBottom:10}}>＋ Thêm bước</button>
        <div className="rowbtns">
          <button className="btn ghost" onClick={()=>{save(DEFAULT_ROUTINE);}}>↺ Mặc định</button>
          <button className="btn" onClick={()=>save(list.filter(s=>s.t.trim()))}>Lưu</button>
        </div>
      </div>
    </div>
  );
}

/* ================= Cue ================= */
function Cue(){
  const [votes,setVotes]=useState(()=>store.get('nc.cuevotes',{}));      // {text:'up'|'down'} — 'down' = tự bỏ khỏi danh sách
  const [custom,setCustom]=useState(()=>store.get('nc.customcues',[]));  // [{tag,t}] do người dùng tạo
  const [newT,setNewT]=useState(''); const [addOpen,setAddOpen]=useState(false);
  const all=[...custom,...CUES,...WAR_CUES];
  const pool=all.filter(c=>votes[c.t]!=='down');
  const pick=(arr,not)=>{ const a=arr.filter(c=>!not||c.t!==not.t); if(!a.length) return arr[0]||null; return a[Math.floor(Math.random()*a.length)]; };
  const [cur,setCur]=useState(()=>{ const p=[...store.get('nc.customcues',[]),...CUES,...WAR_CUES].filter(c=>(store.get('nc.cuevotes',{})[c.t])!=='down'); return p.length?p[Math.floor((Date.now()/1000)%p.length)]:null; });
  const saveV=(v)=>{ setVotes(v); store.set('nc.cuevotes',v); };
  const saveC=(l)=>{ setCustom(l); store.set('nc.customcues',l); };
  const next=()=>setCur(pick(pool,cur));
  const like=()=>{ if(!cur) return; const v={...votes}; if(v[cur.t]==='up') delete v[cur.t]; else v[cur.t]='up'; saveV(v); };
  const dislike=()=>{ if(!cur) return; const v={...votes}; v[cur.t]='down'; saveV(v); const np=all.filter(c=>v[c.t]!=='down'); setCur(np.length?pick(np,cur):null); };
  const addCue=()=>{ const t=newT.trim(); if(t && !all.some(c=>c.t===t)){ const nc={tag:'Của tôi',t}; const l=[nc,...custom]; saveC(l); if(votes[t]==='down'){ const v={...votes}; delete v[t]; saveV(v); } setCur(nc); } setNewT(''); setAddOpen(false); };
  const delCustom=(t)=>{ const l=custom.filter(c=>c.t!==t); saveC(l); const np=[...l,...CUES].filter(c=>votes[c.t]!=='down'); setCur(np.length?pick(np,cur):null); };
  const restore=()=>{ const v={}; Object.keys(votes).forEach(k=>{ if(votes[k]==='up') v[k]='up'; }); saveV(v); const np=all.filter(c=>v[c.t]!=='down'); setCur(np.length?np[Math.floor((Date.now()/1000)%np.length)]:null); };
  const hidden=Object.values(votes).filter(x=>x==='down').length;
  const liked=cur&&votes[cur.t]==='up';
  const isCustom=cur&&custom.some(c=>c.t===cur.t);
  return (
    <div className="cue">
      {(pool.length>0 && cur) ? <>
        <div className="card cuecard" onClick={next}>
          <div className="tag">{cur.tag}</div>
          <div className="t">{cur.t}</div>
          {/* src: tên bài Kiến thức mà câu này được bôi đen lưu ra — để lần theo lại nguồn. */}
          {cur.src && <div className="csrc">📚 {cur.src}</div>}
        </div>
        <div style={{display:'flex',gap:8,marginTop:10}}>
          <button className="btn ghost" style={{flex:'0 0 auto',color:liked?'var(--gold)':'var(--text)'}} onClick={like}>{liked?'❤️':'🤍'} Thích</button>
          <button className="btn ghost" style={{flex:'0 0 auto'}} onClick={dislike}>👎 Bỏ câu</button>
          <button className="btn acc" style={{flex:1}} onClick={next}>🔀 Câu khác</button>
        </div>
        {isCustom && <button className="chip" style={{marginTop:8}} onClick={()=>delCustom(cur.t)}>🗑 Xoá câu của tôi</button>}
      </> : (
        <div className="card" style={{padding:18,textAlign:'center'}}>
          <div className="muted" style={{fontSize:'0.875rem',marginBottom:10}}>Bạn đã bỏ hết câu nhắc.</div>
          {hidden>0 && <button className="btn ghost wide" onClick={restore}>↺ Khôi phục {hidden} câu đã bỏ</button>}
        </div>
      )}
      {addOpen ? (
        <div className="editrow" style={{marginTop:10}}>
          <input value={newT} autoFocus onChange={e=>setNewT(e.target.value)} onKeyDown={e=>{ if(e.key==='Enter') addCue(); }} placeholder="Nhập câu nhắc của bạn…"/>
          <button className="btn acc" style={{flex:'0 0 auto'}} onClick={addCue}>Thêm</button>
        </div>
      ) : (
        <button className="btn ghost wide" style={{marginTop:10}} onClick={()=>setAddOpen(true)}>＋ Tạo câu nhắc nhở</button>
      )}
      {hidden>0 && pool.length>0 && <button className="chip" style={{marginTop:8}} onClick={restore}>↺ Bỏ ẩn {hidden} câu</button>}
      <div className="muted" style={{fontSize:'0.8125rem',marginTop:8}}>Chạm thẻ để đổi câu · 👎 Bỏ câu là tự ẩn khỏi danh sách.</div>
    </div>
  );
}

/* ================= Settings ================= */
function Settings({theme,setTheme,fsize,setFsize,order,setOrder,cuser,cstatus,close}){
  const fileRef=useRef(null);
  const [email,setEmail]=useState(''); const [pass,setPass]=useState(''); const [amsg,setAmsg]=useState(''); const [busy,setBusy]=useState(false);
  const [showPass,setShowPass]=useState(false);
  const [chOpen,setChOpen]=useState(false); const [npass,setNpass]=useState(''); const [npass2,setNpass2]=useState(''); const [npMsg,setNpMsg]=useState(''); const [npBusy,setNpBusy]=useState(false);
  const changePass=async()=>{ if(npass.length<6){ setNpMsg('Mật khẩu tối thiểu 6 ký tự.'); return; } if(npass!==npass2){ setNpMsg('Hai ô mật khẩu chưa khớp.'); return; }
    setNpBusy(true); setNpMsg('');
    try{ await cloudChangePassword(npass); setNpMsg('✓ Đã đổi mật khẩu. Dùng mật khẩu mới này để đăng nhập trên điện thoại.'); setNpass(''); setNpass2(''); }
    catch(err){ setNpMsg('Lỗi: '+(err.message||'không đổi được mật khẩu')); }
    setNpBusy(false); };
  const KEYS=SYNC_KEYS;   // sao lưu dùng chung danh sách với đồng bộ đám mây (một nguồn duy nhất)
  const [sego,setSego]=useState(()=>store.get('nc.segorder',{})||{});
  const segOrderOf=(g)=>{ const def=SEG_DEFS[g].items.map(i=>i[0]); const saved=Array.isArray(sego[g])?sego[g].filter(k=>def.includes(k)):[]; def.forEach(k=>{ if(!saved.includes(k)) saved.push(k); }); return saved; };
  const moveSeg=(g,i,dir)=>{ const arr=segOrderOf(g).slice(); const j=i+dir; if(j<0||j>=arr.length) return; const x=arr[i]; arr[i]=arr[j]; arr[j]=x; const next={...sego,[g]:arr}; setSego(next); store.set('nc.segorder',next); };
  const doAuth=async()=>{ const e=email.trim(); if(!e||!pass){ setAmsg('Nhập email và mật khẩu.'); return; } if(pass.length<6){ setAmsg('Mật khẩu tối thiểu 6 ký tự.'); return; }
    setBusy(true); setAmsg('');
    try{ await cloudSignIn(e,pass); setAmsg(''); cloudFreshLogin(); }
    catch(err){
      if(/invalid login credentials/i.test(err.message||'')){
        try{
          const d=await cloudSignUp(e,pass);
          if(d.session){ setAmsg('Đã tạo tài khoản.'); cloudFreshLogin(); }
          else {
            // Không có session (nếu project bật xác nhận email) → backend đã tự xác nhận, thử đăng nhập lại luôn.
            try{ await cloudSignIn(e,pass); setAmsg('Đã tạo tài khoản.'); cloudFreshLogin(); }
            catch(e3){ setAmsg('Email này đã có tài khoản. Kiểm tra lại mật khẩu rồi thử lại.'); }
          }
        }
        catch(e2){
          if(/already|registered|exists/i.test(e2.message||'')) setAmsg('Email đã có tài khoản — nhập đúng mật khẩu để đăng nhập.');
          else setAmsg('Lỗi: '+(e2.message||'không đăng ký được'));
        }
      } else setAmsg('Lỗi: '+(err.message||'không đăng nhập được'));
    }
    setBusy(false); };
  const statusTxt={off:'', syncing:'⟳ đang đồng bộ…', synced:'✓ đã đồng bộ', error:'⚠️ lỗi đồng bộ'}[cstatus]||'';
  const moveTab=(i,dir)=>{ const j=i+dir; if(j<0||j>=order.length) return; const o=order.slice(); const x=o[i]; o[i]=o[j]; o[j]=x; setOrder(o); };
  const exportData=()=>{
    const data={}; KEYS.forEach(k=>{ const v=localStorage.getItem(k); if(v!=null) data[k]=v; });
    const blob=new Blob([JSON.stringify({app:'nhipco',version:1,exportedAt:todayStr(),data},null,2)],{type:'application/json'});
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a'); a.href=url; a.download='nhipco-backup-'+todayStr()+'.json';
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(url),1500);
  };
  const importData=(e)=>{
    const f=e.target.files&&e.target.files[0]; e.target.value='';
    if(!f) return;
    const r=new FileReader();
    r.onload=()=>{
      try{
        const obj=JSON.parse(r.result); const data=(obj&&obj.data)?obj.data:obj;
        if(!data||typeof data!=='object') throw 0;
        const keys=Object.keys(data).filter(k=>k.indexOf('nc.')===0);
        if(!keys.length) throw 0;
        if(!window.confirm('Nhập sẽ GHI ĐÈ dữ liệu hiện tại trên máy này. Tiếp tục?')) return;
        keys.forEach(k=>localStorage.setItem(k, typeof data[k]==='string'?data[k]:JSON.stringify(data[k])));
        if(cuser){ localStorage.removeItem('nc._syncAt'); cloudPush().finally(()=>location.reload()); }
        else location.reload();
      }catch(err){ window.alert('File sao lưu không hợp lệ.'); }
    };
    r.readAsText(f);
  };
  const loadDemo=()=>{
    const d=(n)=>{ const t=new Date(); t.setDate(t.getDate()-n); return t.toISOString().slice(0,10); };
    const M=[
      {id:'demoW1',date:d(1),opp:'Tuấn',result:'W',score:'7-5',game:'9-bi',feel:4,mistakes:['Cắt mỏng hỏng','Nóng vội'],mistakeCounts:{'Cắt mỏng hỏng':3},note:'Phá tốt nhưng cắt mỏng còn run. Giữ đầu yên hơn ở cú quyết định.'},
      {id:'demoL1',date:d(3),opp:'Hùng',result:'L',score:'4-7',game:'10-bi',feel:2,mistakes:['Mất vị trí bi cái','Căn băng kém'],note:'Ra bi kém, hay bị kẹt; đọc bàn sai vài ván.'},
      {id:'demoW2',date:d(6),opp:'Tuấn',result:'W',score:'7-6',game:'9-bi',feel:5,mistakes:['Lực quá mạnh'],note:'Trận hay, bình tĩnh lúc bị rượt.'},
      {id:'demoL2',date:d(9),opp:'Minh',result:'L',score:'5-7',game:'10-bi',feel:3,mistakes:['Bỏ lỡ cú dễ','Run tay khi căng'],mistakeCounts:{'Bỏ lỡ cú dễ':2},note:'Trượt 2 cú dễ ở cuối vì căng tay.'},
      {id:'demoW3',date:d(12),opp:'Hùng',result:'W',score:'7-4',game:'10-bi',feel:4,mistakes:['Nhổm người sớm'],note:'Khá ổn, giữ được nhịp đưa cơ.'},
    ];
    const P=[
      {id:'demoP1',date:d(3),cue:{x:24,y:36},obj:{x:54,y:22},nxt:{x:80,y:38},tip:{x:-0.4,y:0.5},power:0.6,note:'Bi cụm sát băng, điều bi ra bị kẹt.',done:false},
      {id:'demoP2',date:d(6),cue:{x:30,y:20},obj:{x:60,y:34},nxt:{x:40,y:44},tip:{x:0.3,y:-0.5},power:0.5,note:'Rút bi về nhưng quá đà, mất vị trí.',done:false},
    ];
    const T=[
      {id:'demoT1',date:d(2),drill:'stop',score:7,max:10},
      {id:'demoT2',date:d(2),drill:'cutladder',score:3,max:5},
      {id:'demoT3',date:d(4),drill:'lineup',score:9,max:15},
      {id:'demoT4',date:d(7),drill:'follow_draw',score:6,max:10},
    ];
    const merge=(key,demo)=>{ const cur=store.get(key,[])||[]; const ids=new Set(cur.map(x=>x.id)); const add=demo.filter(x=>!ids.has(x.id)); store.set(key,[...add,...cur]); };
    if(!window.confirm('Nạp dữ liệu mẫu (5 trận, 2 thế bi, vài buổi tập) để xem thử? Sẽ THÊM vào dữ liệu hiện có; xoá lại được sau.')) return;
    merge('nc.matches',M); merge('nc.positions',P); merge('nc.training',T);
    if(cuser){ localStorage.removeItem('nc._syncAt'); cloudPush().finally(()=>location.reload()); } else location.reload();
  };
  const clearAll=()=>{
    if(!window.confirm('Xoá TOÀN BỘ dữ liệu (trận, thế bi, lỗi, tập luyện...) trên máy này? Cài đặt & giao diện được giữ lại. Không hoàn tác được.')) return;
    DATA_KEYS.forEach(k=>localStorage.removeItem(k));
    if(cuser){ localStorage.removeItem('nc._syncAt'); cloudPush().finally(()=>location.reload()); } else location.reload();
  };
  return (
    <div className="scrim" onClick={close}>
      <div className="sheet" onClick={e=>e.stopPropagation()}>
        <h3>Cài đặt</h3>
        <div className="field">
          <label>☁️ Đồng bộ đám mây</label>
          {!SB_OK
            ? <div className="muted small">Không kết nối được máy chủ đồng bộ (cần Internet).</div>
            : cuser
              ? <>
                  <div className="muted small">Đã đăng nhập: <b style={{color:'var(--soft)'}}>{cuser.email}</b> {statusTxt&&<span> · {statusTxt}</span>}</div>
                  <div style={{display:'flex',gap:8,marginTop:8}}>
                    <button className="btn ghost" style={{flex:1}} onClick={cloudPullManual}>⟳ Tải dữ liệu mây về</button>
                    <button className="btn ghost" onClick={cloudSignOut}>Đăng xuất</button>
                  </div>
                  <div className="muted" style={{fontSize:'0.71875rem',marginTop:6,lineHeight:1.5}}>Dữ liệu tự lưu lên mây khi bạn thay đổi. Đăng nhập cùng email trên máy khác để dùng chung.</div>
                  {!chOpen
                    ? <button className="btn ghost" style={{marginTop:8,fontSize:'0.8125rem'}} onClick={()=>{setChOpen(true);setNpMsg('');}}>🔑 Đổi mật khẩu</button>
                    : <div style={{marginTop:8,padding:10,border:'1px solid var(--line)',borderRadius:11,background:'var(--card2)'}}>
                        <div className="muted small" style={{marginBottom:8}}>Đặt mật khẩu mới cho <b style={{color:'var(--soft)'}}>{cuser.email}</b> (không cần mật khẩu cũ). Dùng mật khẩu mới này để đăng nhập trên điện thoại.</div>
                        <div style={{display:'flex',gap:6,alignItems:'stretch',marginBottom:6}}>
                          <input type={showPass?'text':'password'} value={npass} onChange={e=>setNpass(e.target.value)} placeholder="Mật khẩu mới (≥6 ký tự)" style={{flex:1,minWidth:0}}/>
                          <button type="button" className="btn ghost" onClick={()=>setShowPass(s=>!s)} style={{padding:'0 12px',fontSize:'1rem'}} aria-label={showPass?'Ẩn mật khẩu':'Hiện mật khẩu'}>{showPass?'🙈':'👁'}</button>
                        </div>
                        <input type={showPass?'text':'password'} value={npass2} onChange={e=>setNpass2(e.target.value)} placeholder="Nhập lại mật khẩu mới" style={{width:'100%'}}/>
                        <div style={{display:'flex',gap:8,marginTop:8}}>
                          <button className="btn acc" style={{flex:1}} disabled={npBusy} onClick={changePass}>{npBusy?'…':'Lưu mật khẩu mới'}</button>
                          <button className="btn ghost" onClick={()=>{setChOpen(false);setNpass('');setNpass2('');setNpMsg('');}}>Huỷ</button>
                        </div>
                        {npMsg && <div className="muted small" style={{marginTop:6,lineHeight:1.5}}>{npMsg}</div>}
                      </div>}
                </>
              : <>
                  <div className="muted small" style={{marginBottom:8}}>Đăng nhập để đồng bộ nhật ký & dữ liệu giữa máy tính và điện thoại.</div>
                  <input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="Email" style={{marginBottom:6}}/>
                  <div style={{display:'flex',gap:6,alignItems:'stretch'}}>
                    <input type={showPass?'text':'password'} value={pass} onChange={e=>setPass(e.target.value)} placeholder="Mật khẩu (≥6 ký tự)" style={{flex:1,minWidth:0}}/>
                    <button type="button" className="btn ghost" onClick={()=>setShowPass(s=>!s)} style={{padding:'0 12px',fontSize:'1rem'}} aria-label={showPass?'Ẩn mật khẩu':'Hiện mật khẩu'}>{showPass?'🙈':'👁'}</button>
                  </div>
                  <button className="btn acc wide" style={{marginTop:8}} disabled={busy} onClick={doAuth}>{busy?'…':'Đăng nhập / Tạo tài khoản'}</button>
                  {amsg && <div className="muted small" style={{marginTop:6}}>{amsg}</div>}
                </>}
        </div>
        <div className="field">
          <label>🎨 Giao diện</label>
          <div className="swatches">
            {THEMES.map(t=>
              <div key={t.key} className={'sw'+(theme===t.key?' on':'')}
                style={{background:`linear-gradient(145deg,${t.c},${t.g})`}}
                title={t.name} onClick={()=>setTheme(t.key)}/>)}
          </div>
          <div className="muted" style={{fontSize:'0.75rem',marginTop:6}}>{THEMES.find(t=>t.key===theme)?.name}</div>
        </div>
        <div className="field">
          <label>🔠 Cỡ chữ</label>
          <div className="fsrow">
            {FONT_SIZES.map(f=>
              <button key={f.key} type="button" className={'fsbtn'+(fsize===f.key?' on':'')}
                onClick={()=>setFsize(f.key)} aria-pressed={fsize===f.key} aria-label={'Cỡ chữ '+f.name}>
                {/* Chữ mẫu để px, không phải rem — 4 nút phải bày ra 4 cỡ khác nhau cùng lúc.
                    Nhân 1.6 để giữ đúng tỷ lệ giữa 4 cỡ mà mắt vẫn phân biệt được ngay. */}
                <span className="fsa" style={{fontSize:(f.px*1.6)+'px'}}>{f.vd}</span>
                <small>{f.name}</small>
              </button>)}
          </div>
          <div className="muted" style={{fontSize:'0.75rem',marginTop:8,lineHeight:1.5}}>
            Đổi cỡ chữ cho toàn app. Cỡ đang dùng: <b style={{color:'var(--soft)'}}>{FONT_SIZES.find(f=>f.key===fsize)?.name} ({fsPx(fsize)}px)</b> — đoạn này to nhỏ theo ngay để bạn thấy trước khi đóng.
          </div>
        </div>
        <div className="field">
          <label>🔀 Thứ tự tab (thanh dưới)</label>
          <div className="muted" style={{fontSize:'0.75rem',marginBottom:8}}>Dùng ↑ ↓ để đổi vị trí. Tab đầu danh sách sẽ mở khi vào app.</div>
          <div className="reorder">
            {order.map((id,i)=>{ const d=TAB_DEFS.find(t=>t.id===id); if(!d) return null; return (
              <div key={id} className="rrow">
                <span className="rico">{d.ico}</span>
                <span className="rlab">{d.lab}</span>
                <button className="rbtn" disabled={i===0} onClick={()=>moveTab(i,-1)} aria-label="Lên">↑</button>
                <button className="rbtn" disabled={i===order.length-1} onClick={()=>moveTab(i,1)} aria-label="Xuống">↓</button>
              </div>); })}
          </div>
        </div>
        <div className="field">
          <label>🔀 Thứ tự mục con (trong từng tab)</label>
          <div className="muted" style={{fontSize:'0.75rem',marginBottom:8}}>Đổi vị trí các mục bên trong mỗi tab. Mục đầu danh sách sẽ mở trước.</div>
          {Object.keys(SEG_DEFS).map(g=>{ const list=segOrderOf(g); const map={}; SEG_DEFS[g].items.forEach(it=>{ map[it[0]]=it[1]; }); return (
            <div key={g} style={{marginBottom:12}}>
              <div style={{fontSize:'0.75rem',fontWeight:800,color:'var(--soft)',margin:'0 0 6px'}}>{SEG_DEFS[g].lab}</div>
              <div className="reorder">
                {list.map((k,i)=>(
                  <div key={k} className="rrow">
                    <span className="rlab">{map[k]}</span>
                    <button className="rbtn" disabled={i===0} onClick={()=>moveSeg(g,i,-1)} aria-label="Lên">↑</button>
                    <button className="rbtn" disabled={i===list.length-1} onClick={()=>moveSeg(g,i,1)} aria-label="Xuống">↓</button>
                  </div>))}
              </div>
            </div>); })}
        </div>
        <div className="field">
          <label>💾 Sao lưu dữ liệu</label>
          <div className="muted" style={{fontSize:'0.75rem',marginBottom:8,lineHeight:1.5}}>Dữ liệu lưu trên máy này. Xuất file để giữ an toàn hoặc chuyển sang máy/điện thoại khác.</div>
          <div style={{display:'flex',gap:10}}>
            <button className="btn ghost" style={{flex:1}} onClick={exportData}>⬇️ Xuất file</button>
            <button className="btn ghost" style={{flex:1}} onClick={()=>fileRef.current&&fileRef.current.click()}>⬆️ Nhập file</button>
          </div>
          <input ref={fileRef} type="file" accept="application/json,.json" style={{display:'none'}} onChange={importData}/>
        </div>
        <div className="field">
          <label>🎲 Dữ liệu mẫu</label>
          <div className="muted" style={{fontSize:'0.75rem',marginBottom:8,lineHeight:1.5}}>Nạp vài trận & thế bi mẫu để xem app hoạt động thế nào. Hoặc xoá sạch để bắt đầu lại.</div>
          <div style={{display:'flex',gap:10}}>
            <button className="btn ghost" style={{flex:1}} onClick={loadDemo}>🎲 Nạp mẫu</button>
            <button className="btn ghost" style={{flex:1,color:'var(--danger)'}} onClick={clearAll}>🗑 Xoá toàn bộ</button>
          </div>
        </div>
        <div className="muted" style={{fontSize:'0.75rem',lineHeight:1.6,marginTop:8}}>
          <b style={{color:'var(--soft)'}}>Mẹo dùng:</b><br/>
          • <b>Nhịp thở</b>: chọn Hộp hoặc 4-7-8, làm 3–4 vòng khi hồi hộp.<br/>
          • <b>Đếm nhịp</b>: bật tiếng tách, đưa cơ theo nhịp cho đều tay (Gõ nhịp để tự dò BPM).<br/>
          • <b>Routine</b>: chạm tích từng bước, sửa theo thói quen riêng.<br/>
          • <b>Nhật ký → Rèn luyện</b>: ghi lỗi sau mỗi trận, app gợi ý bài tập đúng điểm yếu.
        </div>
        <button className="btn wide" onClick={close} style={{marginTop:14}}>Đóng</button>
      </div>
    </div>
  );
}

/* ================= shared bits ================= */
function Empty({ico,t,s,cta,onCta}){
  return (
    <div className="empty">
      <div className="empty-ic">{ico}</div>
      <div className="empty-t">{t}</div>
      <div className="empty-s">{s}</div>
      {cta && onCta && <button className="btn acc" style={{marginTop:16,padding:'11px 20px'}} onClick={onCta}>{cta}</button>}
    </div>
  );
}
// Một dòng thanh tiến độ có nhãn trái + số phải (dùng chung cho các bảng lỗi/đầu cơ).
function Bar({label, right, val, max}){
  return (
    <div style={{margin:'7px 0'}}>
      <div style={{display:'flex',justifyContent:'space-between',fontSize:'0.8125rem',fontWeight:700,marginBottom:3}}><span>{label}</span><span className="muted">{right}</span></div>
      <div className="mbar"><div style={{width:Math.round(val/(max||1)*100)+'%'}}/></div>
    </div>
  );
}
// Dữ liệu sơ đồ một thế điều bi: bi cái + bi 9 + bi 10 + đường bi cái dự đoán.
function posDia(p){
  return {balls:[{x:p.cue.x,y:p.cue.y,cue:true},{x:p.obj.x,y:p.obj.y,num:9,stripe:'#e8c020'},{x:p.nxt.x,y:p.nxt.y,num:10,stripe:'#2f6fd6'}],
    path:cuePath(p.cue,p.obj,p.tip||{x:0,y:0},p.power!=null?p.power:0.5).pts};
}

/* ================= Nhật ký trận đấu ================= */
// Bảng đánh dấu lỗi khi thi đấu: chạm để +1 mỗi lần mắc lỗi; cuối trận "Hết trận" → Ghi trận.
function LiveTally({onEnd}){
  const [tally,saveT]=usePersist('nc.liveTally',{});
  const [customMis,setCustomMis]=useState(getCustomMistakes);
  // saveT (usePersist) ghi ngay trong updater nên chạm nhanh liên tiếp không mất lượt.
  const bump=(x,d)=>{ saveT(prev=>{ const t={...prev}; const v=(t[x]||0)+d; if(v<=0) delete t[x]; else t[x]=v; return t; }); };
  const onAddCustom=(name)=>{ setCustomMis(getCustomMistakes()); bump(name,1); };
  const clearAll=()=>{ if(Object.keys(tally).length===0) return; if(confirm('Xoá hết đánh dấu lỗi của trận này?')) saveT({}); };
  const total=Object.values(tally).reduce((s,n)=>s+n,0);
  const ticked=Object.entries(tally).sort((a,b)=>b[1]-a[1]);
  return (
    <div style={{display:'flex',flexDirection:'column',flex:1}}>
      <div className="h">🔴 Bảng lỗi trận đang đấu</div>
      <div className="tsub">Mỗi lần mắc lỗi, chạm để +1. Cuối trận bấm “Hết trận” để sang Ghi trận (đã điền sẵn lỗi).</div>
      <div className="statstrip" style={{marginTop:8}}>
        <div className="stat"><b style={{color:'var(--warn)'}}>{total}</b><small>lượt lỗi</small></div>
        <div className="stat"><b style={{color:'var(--gold)'}}>{ticked.length}</b><small>loại lỗi</small></div>
        <div className="stat" style={{justifyContent:'center',display:'flex',alignItems:'center'}}><button className="chip" onClick={clearAll}>🗑 Xoá bảng</button></div>
      </div>
      <button className="btn acc wide" style={{margin:'10px 0 4px'}} onClick={()=>onEnd(Object.keys(tally),{...tally})}>🏁 Hết trận → Ghi trận</button>
      {ticked.length>0 &&
        <div className="card" style={{padding:'12px 14px',marginTop:8}}>
          <div className="drow" style={{marginBottom:6}}><b style={{fontSize:'0.875rem'}}>Đã đánh dấu trận này</b><span className="muted small">chạm − / ＋ để chỉnh</span></div>
          {ticked.map(([x,n])=>(
            <div key={x} className="drow" style={{padding:'6px 0',borderTop:'1px solid var(--line)'}}>
              <span style={{fontSize:'0.8125rem',fontWeight:700,flex:1,minWidth:0}}>{x}</span>
              <div style={{display:'flex',gap:6,alignItems:'center',flex:'none'}}>
                <button className="chip" style={{minWidth:34,fontSize:'1rem',padding:'5px 0'}} onClick={()=>bump(x,-1)} aria-label={'Bớt '+x}>−</button>
                <b style={{minWidth:22,textAlign:'center',color:'var(--gold)'}}>{n}</b>
                <button className="chip" style={{minWidth:34,fontSize:'1rem',padding:'5px 0'}} onClick={()=>bump(x,1)} aria-label={'Thêm '+x}>＋</button>
              </div>
            </div>))}
        </div>}
      <div className="h2">Chạm để đánh dấu lỗi</div>
      {(()=>{ const {groups,other}=groupMistakes(customMis); return <>
        {groups.map(c=>(
          <div key={c.t} style={{marginTop:8}}>
            <div className="muted small" style={{fontWeight:800,margin:'2px 0 5px'}}>{c.t}</div>
            <div className="presets" style={{justifyContent:'flex-start'}}>
              {c.items.map(x=>{ const n=tally[x]||0; return (
                <button key={x} className={'chip'+(n>0?' on':'')} onClick={()=>bump(x,1)}>{x}{n>0?' · '+n:''}</button>); })}
            </div>
          </div>))}
        {other.length>0 &&
          <div style={{marginTop:8}}>
            <div className="muted small" style={{fontWeight:800,margin:'2px 0 5px'}}>🆕 Khác (tự thêm)</div>
            <div className="presets" style={{justifyContent:'flex-start'}}>
              {other.map(x=>{ const n=tally[x]||0; return (
                <button key={x} className={'chip'+(n>0?' on':'')} onClick={()=>bump(x,1)}>{x}{n>0?' · '+n:''}</button>); })}
            </div>
          </div>}
      </>; })()}
      <div style={{marginTop:10}}><CustomMisAdd onAdd={onAddCustom}/></div>
      <div style={{height:8}}/>
    </div>
  );
}
function MatchLog(){
  const [list,save]=usePersist('nc.matches',[]);
  const [form,setForm]=useState(null);
  const [analysis,setAnalysis]=useState(null);
  const [view2,setView2]=useState(orderedOpts('log')[0][0]);
  const [fRes,setFRes]=useState('all'); const [fOpp,setFOpp]=useState('all');
  const [oppSort,setOppSort]=useState('n');   // n=nhiều trận · wr=tỉ lệ thắng · recent=gần đây
  const upsert=(recs)=>{   // recs: mảng 1–2 bản ghi
    const fromLive=form&&form._live;
    const isNew=recs.some(m=>!m.id);
    let next=list.slice();
    recs.forEach(m=>{ if(m.id){ next=next.map(x=>x.id===m.id?m:x); } else { next=[{...m,id:uid('m')},...next]; } });
    save(next); setForm(null);
    if(fromLive) store.set('nc.liveTally',{});   // đã ghi trận từ bảng đánh dấu → xoá bảng
    if(isNew){ const a=analyze(recs); if(a.fresh.length||a.heavy.length||a.detected.length){ setAnalysis(a); setView2('log'); } }
  };
  // Kết thúc trận từ bảng đánh dấu lỗi (tab Thi đấu) → mở Ghi trận với lỗi đã tick sẵn.
  const startFromLive=(keys,counts)=>{ setForm({date:todayStr(),result:'W',game:'10-bi',feel:3,mistakes:keys,mistakeCounts:counts,_live:true}); };
  useEffect(()=>{ if(_pendingLive){ const {keys,counts}=_pendingLive; _pendingLive=null; startFromLive(keys,counts); } },[]);
  // Tự phân tích trận vừa ghi: lỗi mới + lỗi lặp nhiều + lỗi tự dò từ ghi chú
  const analyze=(recs)=>{
    const extra=store.get('nc.mistakes',[]);
    const prior=aggMistakes(list, extra);
    const added={}, detSet=new Set();
    recs.forEach(m=>{ const chips=new Set(m.mistakes||[]); scanNote(m.note).forEach(d=>{ if(!chips.has(d)) detSet.add(d); }); entryMistakes(m,'mistakes').forEach(x=>added[x]=(added[x]||0)+misCount(m,x)); });
    const fresh=[], heavy=[];
    Object.keys(added).forEach(x=>{ if(!prior[x]) fresh.push(x); const total=(prior[x]||0)+added[x]; if(total>=3) heavy.push(x+' ('+total+'×)'); });
    return {fresh,heavy,detected:[...detSet]};
  };
  const del=(id)=>{ save(list.filter(x=>x.id!==id)); setForm(null); };
  const w=list.filter(m=>m.result==='W').length, l=list.filter(m=>m.result==='L').length;
  const rate=(w+l)? Math.round(w/(w+l)*100):0;
  const mc=aggMistakes(list);
  const top=Object.entries(mc).sort((a,b)=>b[1]-a[1]).slice(0,3);
  const view=[...list].sort((a,b)=>(b.date||'').localeCompare(a.date||'')||(b.id>a.id?1:-1));
  // Danh sách đối thủ đã từng ghi — gần nhất lên trước, để lần sau chọn lại
  const oppNames=[]; view.forEach(m=>{ const n=(m.opp||'').trim(); if(n&&!oppNames.includes(n)) oppNames.push(n); });
  // Lọc lịch sử theo kết quả + đối thủ
  const shown=view.filter(m=>(fRes==='all'||m.result===fRes)&&(fOpp==='all'||(m.opp||'').trim()===fOpp));
  // Đối đầu theo từng đối thủ (view đã sắp mới→cũ nên kèo gặp đầu tiên là kèo gần nhất)
  const omap={}, lastHc={};
  view.forEach(m=>{ const n=(m.opp||'').trim(); if(!n) return;
    const hc=(m.handicap||'').trim();
    if(hc&&!lastHc[n]) lastHc[n]=hc;
    const o=omap[n]||(omap[n]={name:n,n:0,w:0,l:0,d:0,games:{},mis:{},last:'',hc:''});
    o.n++; if(m.result==='W')o.w++; else if(m.result==='L')o.l++; else o.d++;
    if(m.game)o.games[m.game]=(o.games[m.game]||0)+1;
    if(hc&&!o.hc)o.hc=hc;
    (m.mistakes||[]).forEach(x=>o.mis[x]=(o.mis[x]||0)+misCount(m,x));
    if((m.date||'')>o.last)o.last=m.date;
  });
  const opps=Object.values(omap).sort((a,b)=>b.n-a.n||(b.last>a.last?1:-1));
  // Tỉ lệ thắng theo đối thủ: xếp hạng + cờ khắc tinh / áp đảo
  const oppWr=(o)=>(o.w+o.l)? Math.round(o.w/(o.w+o.l)*100):0;
  const oppsSorted=[...opps].sort((a,b)=> oppSort==='wr' ? (oppWr(b)-oppWr(a))||(b.n-a.n)
    : oppSort==='recent' ? ((b.last>a.last?1:b.last<a.last?-1:0)||(b.n-a.n))
    : (b.n-a.n||(b.last>a.last?1:-1)));
  const rankTop=opps.filter(o=>o.w+o.l>0).sort((a,b)=>oppWr(b)-oppWr(a)||b.n-a.n).slice(0,8);
  const decisive=opps.filter(o=>o.w+o.l>=2);
  const domin=decisive.length? decisive.reduce((m,o)=>oppWr(o)>oppWr(m)?o:m):null;
  const nemesis=decisive.length? decisive.reduce((m,o)=>oppWr(o)<oppWr(m)?o:m):null;

  return (
    <div style={{display:'flex',flexDirection:'column',flex:1}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
        <div className="h">Nhật ký trận đấu</div>
        <button className="chip on" onClick={()=>setForm({date:todayStr(),result:'W',game:'10-bi',mistakes:[],feel:3})}>＋ Ghi trận</button>
      </div>

      <Seg val={view2} set={setView2} opts={orderedOpts('log')}/>

      {view2==='log' && analysis && (analysis.fresh.length>0||analysis.heavy.length>0||(analysis.detected&&analysis.detected.length>0)) &&
        <div className="card" style={{padding:'12px 14px',marginTop:8,borderColor:'var(--gold)'}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
            <b style={{fontSize:'0.875rem'}}>🔎 Phân tích trận vừa ghi</b>
            <button onClick={()=>setAnalysis(null)} className="xbtn">✕</button>
          </div>
          {analysis.fresh.length>0 && <div className="small" style={{marginTop:6}}>🆕 <b>Lỗi mới:</b> {analysis.fresh.join(', ')}</div>}
          {analysis.heavy.length>0 && <div className="small" style={{marginTop:6}}>⚠️ <b>Lặp nhiều — nên tập:</b> {analysis.heavy.join(', ')}</div>}
          {analysis.detected&&analysis.detected.length>0 && <div className="small" style={{marginTop:6}}>🔎 <b>Tự nhận ra từ ghi chú:</b> {analysis.detected.join(', ')}</div>}
          <div className="muted small" style={{marginTop:6}}>Mở tab <b>Rèn luyện → Tổng hợp</b> để xem lỗi và bài tập gợi ý; dựng thế bi khó ở <b>Thi đấu → Điều bi</b>.</div>
        </div>}

      {view2==='log' && list.length===0 &&
        <Empty ico="📓" t="Chưa ghi trận nào"
          s="Ghi lại kết quả, đối thủ và lỗi mắc phải sau mỗi trận — app tự tổng kết tỉ lệ thắng và lỗi bạn hay lặp."/>}

      {view2==='log' && list.length>0 && <>
        <div className="statstrip">
          <div className="stat"><b>{list.length}</b><small>trận</small></div>
          <div className="stat"><b style={{color:'var(--ok)'}}>{w}</b><small>thắng</small></div>
          <div className="stat"><b style={{color:'var(--danger)'}}>{l}</b><small>thua</small></div>
          <div className="stat"><b style={{color:'var(--gold)'}}>{rate}%</b><small>tỉ lệ</small></div>
        </div>
        {top.length>0 &&
          <div className="card" style={{padding:'12px 14px',marginTop:8}}>
            <div className="h" style={{marginBottom:8}}>⚠️ Lỗi hay mắc nhất</div>
            <div className="tags">
              {top.map(([m,c])=><span key={m} className="tag2" style={{color:'var(--warn)',borderColor:'var(--warn)'}}>{m} · {c}×</span>)}
            </div>
          </div>}
        {list.length>=4 && <>
          <div className="catbar" style={{marginTop:10}}>
            {[['all','Tất cả'],['W','Thắng'],['L','Thua'],['D','Hòa']].map(([k,t])=>
              <button key={k} className={'chip'+(fRes===k?' on':'')} onClick={()=>setFRes(k)}>{t}</button>)}
          </div>
          {oppNames.length>1 &&
            <div className="catbar" style={{marginTop:2}}>
              <button className={'chip'+(fOpp==='all'?' on':'')} onClick={()=>setFOpp('all')}>Mọi đối thủ</button>
              {oppNames.map(n=><button key={n} className={'chip'+(fOpp===n?' on':'')} onClick={()=>setFOpp(n)}>{n}</button>)}
            </div>}
        </>}
        {shown.length===0
          ? <div className="muted small" style={{textAlign:'center',padding:'22px 0'}}>Không có trận nào khớp bộ lọc.</div>
          : <div className="list">
          {shown.map(m=>{
            const feel=FEELS.find(f=>f.v===m.feel);
            return (
            <div key={m.id} className="card mcard" onClick={()=>setForm(m)}>
              <div className="mtop">
                <div className={'rbadge '+m.result}>{m.result==='W'?'T':m.result==='L'?'B':'H'}</div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontWeight:800}}>{m.opp||'Không rõ đối thủ'}{m.score&&<span className="muted" style={{fontWeight:700}}> · {m.score}</span>}</div>
                  <div className="muted" style={{fontSize:'0.75rem',fontWeight:600}}>{fmtDate(m.date)} · {m.game}{m.handicap? ' · '+m.handicap:''}</div>
                </div>
                {feel&&<div style={{fontSize:'1.375rem'}}>{feel.e}</div>}
              </div>
              {(m.mistakes||[]).length>0 &&
                <div className="tags">{m.mistakes.map(x=><span key={x} className="tag2">{x}</span>)}</div>}
              {m.note&&<div className="muted preline" style={{fontSize:'0.8125rem'}}>“{m.note}”</div>}
            </div>);
          })}
        </div>}
      </>}

      {view2==='opps' && <>
        {opps.length===0
          ? <Empty ico="🧑‍🤝‍🧑" t="Chưa có đối thủ nào" s="Ghi tên đối thủ trong mỗi trận để xem thành tích đối đầu với từng người."/>
          : <>
              {opps.length>=2 &&
                <div className="card" style={{padding:'12px 14px',marginTop:8}}>
                  <div className="h" style={{marginBottom:8}}>🏆 Tỉ lệ thắng theo đối thủ</div>
                  {rankTop.map(o=><Bar key={o.name} label={o.name} right={o.w+'–'+o.l+(o.d?(' ('+o.d+'h)'):'')+' · '+oppWr(o)+'%'} val={o.w} max={o.w+o.l}/>)}
                  {(domin||nemesis) &&
                    <div className="small" style={{marginTop:8,display:'flex',flexWrap:'wrap',gap:'4px 14px'}}>
                      {domin && <span>😤 Áp đảo: <b style={{color:'var(--ok)'}}>{domin.name}</b> ({oppWr(domin)}%)</span>}
                      {nemesis && nemesis!==domin && <span>☠️ Khắc tinh: <b style={{color:'var(--danger)'}}>{nemesis.name}</b> ({oppWr(nemesis)}%)</span>}
                    </div>}
                  <div className="muted small" style={{marginTop:6}}>Thanh = phần thắng trong các trận có phân định (bỏ hòa).</div>
                </div>}
              {opps.length>=2 &&
                <div className="catbar" style={{marginTop:10}}>
                  <span className="muted small" style={{alignSelf:'center',marginRight:2}}>Sắp xếp:</span>
                  {[['n','Nhiều trận'],['wr','Tỉ lệ thắng'],['recent','Gần đây']].map(([k,t])=>
                    <button key={k} className={'chip'+(oppSort===k?' on':'')} onClick={()=>setOppSort(k)}>{t}</button>)}
                </div>}
              <div className="list">
              {oppsSorted.map(o=>{
                const r=(o.w+o.l)? Math.round(o.w/(o.w+o.l)*100):0;
                const gms=Object.entries(o.games).sort((a,b)=>b[1]-a[1]).map(g=>g[0]);
                const tm=Object.entries(o.mis).sort((a,b)=>b[1]-a[1]).slice(0,3);
                return (
                <div key={o.name} className="card mcard" style={{cursor:'default'}}>
                  <div className="mtop">
                    <div className="oav">{o.name.slice(0,1)}</div>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontWeight:800}}>{o.name}</div>
                      <div className="muted" style={{fontSize:'0.75rem',fontWeight:600}}>{o.n} trận · gần nhất {fmtDate(o.last)}{gms.length? ' · '+gms.slice(0,2).join('/'):''}</div>
                    </div>
                    <div style={{textAlign:'right'}}>
                      <b style={{fontSize:'1.25rem',color:'var(--gold)',display:'block',lineHeight:1}}>{r}%</b>
                      <small className="muted" style={{fontSize:'0.625rem',fontWeight:700}}>bạn thắng</small>
                    </div>
                  </div>
                  <div className="hh">
                    <span className="w">{o.w} thắng</span><span className="l">{o.l} thua</span>{o.d>0&&<span className="d">{o.d} hòa</span>}
                  </div>
                  {o.hc &&
                    <div className="muted" style={{fontSize:'0.78125rem',fontWeight:600}}>🎯 Kèo gần nhất: <b style={{color:'var(--gold)'}}>{o.hc}</b></div>}
                  {tm.length>0 &&
                    <div className="tags">{tm.map(([x,c])=><span key={x} className="tag2">{x} · {c}×</span>)}</div>}
                </div>);
              })}
              </div>
            </>}
      </>}

      {/* Điều bi giờ nằm trong tab Thi đấu (PositionsView). Lỗi được rút thẳng từ Nhật ký vào Rèn luyện → Tổng hợp (SummaryView). */}

      {form && <MatchForm init={form} names={oppNames} lastHc={lastHc} onSave={upsert} onDel={del} close={()=>setForm(null)}/>}
    </div>
  );
}
/* ===== Điều bi: CỐ VẤN VẬT LÝ (engine SI chạy trong Web Worker) ===== */
const DB_COL=['#e0a92e','#3f7fd6','#8e5bc7'];              // màu 3 phương án (chip ↔ đường khớp nhau)
const DB_SIP=[[0,0],[2.54,0],[0,1.27],[2.54,1.27],[1.27,0],[1.27,1.27]]; // lỗ (SI): 4 góc + 2 giữa
const DB_FELT_SI=[0,2.54,0,1.27];
function useSolver(){ // tạo 1 Worker từ Blob (engine ở <script id="dieubi-engine">), latest-wins theo gen
  const wref=useRef(null), fnRef=useRef(null), gen=useRef(0), cb=useRef(null), last=useRef(null), busyRef=useRef(false);
  const [busy,setB]=useState(false); const setBusy=(v)=>{ busyRef.current=v; setB(v); };
  const fallback=useCallback((payload,g)=>{ setTimeout(()=>{ if(g!==gen.current) return; let res; // chạy engine trên main-thread (đơ ~1s, có spinner)
    try{ if(!fnRef.current) res=payload.type==='runout'?[]:{potFail:true};
      else if(payload.type==='runout') res=fnRef.current.runoutRoute(payload.layout,payload.felt);
      else if(payload.type==='altshot') res=fnRef.current.rnAltShot(payload.cue,payload.ball,payload.pocket,payload.leave,payload.others,payload.felt);
      else res=fnRef.current.solveFast(payload.cue,payload.nine,payload.pocket,payload.target,{felt:payload.felt,others:payload.others,ten:payload.ten}); }
    catch(e){ res=payload.type==='runout'?[]:{potFail:true}; }
    setBusy(false); if(cb.current) cb.current(res); },20); },[]);
  useEffect(()=>{ let w=null; const src=document.getElementById('dieubi-engine').textContent;
    try{ fnRef.current=new Function(src+'\n;return (typeof solveFast!=="undefined")?{solveFast:solveFast,runoutRoute:runoutRoute,rnAltShot:rnAltShot}:null;')(); }catch(e){ fnRef.current=null; } // engine cho main-thread (dự phòng)
    try{ w=new Worker(URL.createObjectURL(new Blob([src],{type:'application/javascript'})));
      w.onmessage=(e)=>{ if(e.data.gen!==gen.current) return; setBusy(false); if(cb.current) cb.current(e.data.res); };
      w.onerror=()=>{ wref.current=null; if(busyRef.current&&last.current) fallback(last.current,gen.current); }; // Worker bị chặn (vd mở bằng file://) → tự chuyển sang main-thread
      wref.current=w;
    }catch(e){ wref.current=null; }
    return ()=>{ if(w) w.terminate(); };
  },[fallback]);
  const solve=useCallback((payload,onDone)=>{ gen.current++; const g=gen.current; cb.current=onDone; last.current=payload; setBusy(true);
    if(wref.current){ try{ wref.current.postMessage({...payload,gen:g}); }catch(e){ wref.current=null; fallback(payload,g); } }
    else fallback(payload,g); },[fallback]);
  return {solve,busy};
}
function DieuBiAdvisor(){
  const K=80/2.54;                                          // app-units / mét (bàn app FELT=[10,90,10,50])
  const s2a=(p)=>({x:10+p[0]*K, y:10+p[1]*K});              // SI → toạ độ bàn app
  const a2s=(p)=>[(p.x-10)/K, (p.y-10)/K];                  // bàn app → SI
  const [cue,setCue]=useState({x:35,y:23});   // thế mẫu sạch: bắn 9 vào lỗ góc phải-dưới, điều bi cái lên góc phải-trên
  const [nine,setNine]=useState({x:60,y:31});
  const [ten,setTen]=useState({x:82,y:42});
  const [tgt,setTgt]=useState({x:82,y:17});
  const [pk,setPk]=useState(3);
  const [res,setRes]=useState(null);
  const [sel,setSel]=useState(0);
  const {solve,busy}=useSolver();
  const svgRef=useRef(null), drag=useRef(null);
  const P={cue,nine,ten,tgt}, S={cue:setCue,nine:setNine,ten:setTen,tgt:setTgt};
  const toSvg=(e)=>{ const r=svgRef.current.getBoundingClientRect(); if(!r.width||!r.height) return null;
    const cx=e.touches?e.touches[0].clientX:e.clientX, cy=e.touches?e.touches[0].clientY:e.clientY;
    const x=(cx-r.left)/r.width*100, y=(cy-r.top)/r.height*60; if(!isFinite(x)||!isFinite(y)) return null; // guard: tránh NaN làm hỏng state
    return {x:Math.max(FELT[0],Math.min(FELT[1],x)), y:Math.max(FELT[2],Math.min(FELT[3],y))}; };
  const run=()=>solve({cue:a2s(cue),nine:a2s(nine),ten:a2s(ten),pocket:DB_SIP[pk],target:a2s(tgt),felt:DB_FELT_SI},(r)=>{ setRes(r); setSel(0); });
  useEffect(()=>{ const id=setTimeout(run,150); return ()=>clearTimeout(id); },[cue,nine,ten,tgt,pk]); // warm-start: giải lại (debounce) khi đổi bi/đích/lỗ
  const down=(e)=>{ const p=toSvg(e); if(!p) return; let best='cue',bd=1e9; ['cue','nine','ten','tgt'].forEach(k=>{const d=Math.hypot(p.x-P[k].x,p.y-P[k].y); if(d<bd){bd=d;best=k;}}); drag.current=best; S[best](p); };
  const move=(e)=>{ if(!drag.current) return; e.preventDefault(); const p=toSvg(e); if(!p) return; if(res) setRes(null); S[drag.current](p); }; // xoá đường cũ khi bắt đầu kéo
  const up=()=>{ drag.current=null; };
  const opts=(res&&res.options)?res.options:[]; const o=opts[sel];
  const ptsOf=(path)=>path.map(p=>{const a=s2a(p);return a.x.toFixed(1)+','+a.y.toFixed(1);}).join(' ');
  const appTip=o?{x:Math.max(-1,Math.min(1,o.bx)),y:Math.max(-1,Math.min(1,-o.by))}:{x:0,y:0}; // engine by>0=lê ⇒ app tip.y<0 (cao)
  return (
    <div style={{display:'flex',flexDirection:'column',flex:1}}>
      <div className="h">Cố vấn điều bi</div>
      <div className="tsub">Đặt bi cái / 9 / 10, chạm <b>lỗ</b> để chọn lỗ bắn con 9, rồi <b>kéo điểm đích ◌</b> tới chỗ muốn bi cái dừng. App tính đầu cơ · lực · đường bi.</div>
      <div style={{position:'relative'}}>
        <svg ref={svgRef} className="mtable" viewBox="0 0 100 60" preserveAspectRatio="xMidYMid meet"
          style={{width:'100%',maxWidth:'none',touchAction:'none'}}
          onMouseDown={down} onMouseMove={move} onMouseUp={up} onMouseLeave={up}
          onTouchStart={down} onTouchMove={move} onTouchEnd={up}>
          <TableFrame/>
          {DB_SIP.map((sp,i)=>{const a=s2a(sp);return <circle key={'pk'+i} cx={a.x} cy={a.y} r="3.6" fill="none"
            stroke={i===pk?'var(--gold)':'transparent'} strokeWidth="1.7" style={{cursor:'pointer'}}
            onMouseDown={(e)=>{e.stopPropagation();setPk(i);}} onTouchStart={(e)=>{e.stopPropagation();setPk(i);}}/>;})}
          {opts.map((op,i)=> i===sel?null:<polyline key={'p'+i} points={ptsOf(op.path)} fill="none" stroke={DB_COL[i%3]} strokeWidth=".6" strokeDasharray="2 1.6" opacity="0.5" strokeLinejoin="round" pointerEvents="none"/>)}
          {o && <polyline points={ptsOf(o.path)} fill="none" stroke={DB_COL[sel%3]} strokeWidth="1.05" strokeLinejoin="round" strokeLinecap="round" pointerEvents="none"/>}
          {o && o.cloud ? o.cloud.map((c,i)=>{const a=s2a(c);return <circle key={'cl'+i} cx={a.x} cy={a.y} r=".7" fill={DB_COL[sel%3]} opacity=".26" pointerEvents="none"/>;}) : null}
          <circle cx={tgt.x} cy={tgt.y} r="1.8" fill="none" stroke="#efe9d8" strokeWidth=".8" strokeDasharray="1.4 1.2"/>
          <Ball x={ten.x} y={ten.y} r={1.1} b={{num:10,stripe:'#2f6fd6'}}/>
          <Ball x={nine.x} y={nine.y} r={1.1} b={{num:9,stripe:'#e8c020'}}/>
          <Ball x={cue.x} y={cue.y} r={1.1} b={{cue:true}}/>
        </svg>
        {busy && <div className="dbspin-wrap"><div className="ncspin"/></div>}
      </div>
      <div className="poslegend">
        <span><i className="posdot" style={{background:'#f4f1e6'}}/>Bi cái</span>
        <span><i className="posdot" style={{background:'#e8c020'}}/>Bi 9</span>
        <span><i className="posdot" style={{background:'#2f6fd6'}}/>Bi 10</span>
        <span><i className="posdot" style={{background:'#efe9d8',boxShadow:'0 0 0 1px #999 inset'}}/>Đích</span>
      </div>
      {!res ? <div className="tsub" style={{marginTop:10}}>Đang tính…</div>
       : res.potFail ? <div className="card" style={{padding:12,marginTop:10}}><b style={{color:'var(--danger)'}}>Không bắn con 9 vào lỗ này được</b><div className="muted small" style={{marginTop:4}}>Bi cái sai phía / góc cắt &gt; 90°. Chọn lỗ khác hoặc dời bi.</div></div>
       : <div className="card" style={{padding:12,marginTop:10}}>
          <div className="modeseg" style={{margin:'0 0 10px',flexWrap:'wrap',justifyContent:'flex-start'}}>
            {opts.map((op,i)=><button key={i} className={i===sel?'on':''} onClick={()=>setSel(i)} style={i===sel?{borderColor:DB_COL[i%3]}:null}>
              <span style={{display:'inline-block',width:8,height:8,borderRadius:'50%',background:DB_COL[i%3],marginRight:6,verticalAlign:'middle'}}/>
              {op.label} · {Math.round(op.missBy*100)}cm</button>)}
          </div>
          <div style={{display:'flex',gap:12,alignItems:'center',flexWrap:'wrap'}}>
            <svg viewBox="0 0 100 100" style={{width:66,height:66,flex:'none'}}>
              <circle cx="50" cy="50" r="46" fill="#f4f1e6" stroke="var(--line)" strokeWidth="2"/>
              <line x1="50" y1="8" x2="50" y2="92" stroke="#000" strokeOpacity=".12"/>
              <line x1="8" y1="50" x2="92" y2="50" stroke="#000" strokeOpacity=".12"/>
              <circle cx={50+appTip.x*46} cy={50+appTip.y*46} r="9" fill="var(--accent)" stroke="#04231a" strokeWidth="1.5"/>
            </svg>
            <div style={{flex:1,minWidth:150}}>
              <div><b>{tipLabel(appTip)}</b> <span className="muted small">— đầu cơ</span></div>
              <div className="muted small" style={{marginTop:2}}>Lực <b>{o.speed<1.3?'nhẹ':o.speed<2.3?'vừa':'chắc'}</b> · {o.speed.toFixed(1)} m/s</div>
              <div style={{marginTop:6}}>
                {o.onTarget?<span className="chip on">✓ tới đích ({(o.missBy*100).toFixed(1)}cm)</span>:<span className="chip">gần nhất {Math.round(o.missBy*100)}cm</span>}
                {res.potFrag!=null?<span className={'chip'+(res.potFrag<0.9?' on':'')}>pha ăn bi {res.potFrag<0.9?'dễ':res.potFrag<1.9?'vừa':'khó'}</span>:null}
                {o.potRate!=null?<span className={'chip'+(o.potRate>=0.6?' on':'')}>ăn chắc {Math.round(o.potRate*100)}%</span>:null}
                {o.rails>0?<span className="chip">{o.rails} băng</span>:null}
                {o.posSpread!=null&&o.posSpread*100>15?<span className="chip">vùng ra bi ~{Math.round(o.posSpread*100)}cm</span>:null}
                {o.scr>0.5?<span className="chip">⚠ rủi ro lỗ/bi10</span>:null}
              </div>
            </div>
          </div>
        </div>}
    </div>
  );
}
function DieuBiSeg(){
  const [m,setM]=useState('advisor');
  return (
    <div style={{display:'flex',flexDirection:'column',flex:1}}>
      <div className="modeseg" style={{alignSelf:'center',margin:'6px 0 2px'}}>
        <button className={m==='advisor'?'on':''} onClick={()=>setM('advisor')}>🎯 Cố vấn</button>
        <button className={m==='journal'?'on':''} onClick={()=>setM('journal')}>📓 Nhật ký</button>
      </div>
      {m==='advisor'?<DieuBiAdvisor/>:<PositionsView/>}
    </div>
  );
}
function PositionsView(){
  const [positions,savePos]=usePersist('nc.positions',[]);
  const [pform,setPform]=useState(null);
  const upsertPos=(p)=>{ savePos(p.id? positions.map(x=>x.id===p.id?p:x) : [{...p,id:uid('p'),date:todayStr()},...positions]); setPform(null); };
  const delPos=(id)=>savePos(positions.filter(x=>x.id!==id));
  const togglePosDone=(id)=>savePos(positions.map(x=>x.id===id?{...x,done:!x.done}:x));
  const posCard=(p)=>{
    const sug=suggestTip(p.cue,p.obj,p.nxt);
    return (
      <div key={p.id} className="card" style={{padding:12,opacity:p.done?0.72:1}}>
        <MiniTable dia={posDia(p)}/>
        {p.note&&<div className="muted preline" style={{fontSize:'0.8125rem',marginTop:8}}>“{p.note}”</div>}
        <div className="muted small" style={{marginTop:6}}>Bạn đánh: <b style={{color:'var(--accent)'}}>{p.tip?tipLabel(p.tip):'—'}</b> · <span style={{color:'var(--gold)'}}>gợi ý: {tipLabel(sug)}</span></div>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginTop:8}}>
          <span className="muted small">{fmtDate(p.date)}</span>
          <div style={{display:'flex',gap:8}}>
            <button className={'chip'+(p.done?' on':'')} onClick={()=>togglePosDone(p.id)}>{p.done?'↩ Tập lại':'✓ Đã tập'}</button>
            <button className="chip" onClick={()=>setPform(p)}>✎</button>
            <button className="xbtn" onClick={()=>delPos(p.id)}>✕</button>
          </div>
        </div>
      </div>);
  };
  const todo=positions.filter(p=>!p.done);
  const tipAgg={}; todo.forEach(p=>{ const l=tipLabel(p.tip); tipAgg[l]=(tipAgg[l]||0)+1; });
  const tipRows=Object.entries(tipAgg).sort((a,b)=>b[1]-a[1]);
  const tMax=Math.max(1,...tipRows.map(r=>r[1]));
  return (
    <div style={{display:'flex',flexDirection:'column',flex:1}}>
      <div className="h">Điều bi</div>
      <button className="btn acc wide" style={{margin:'8px 0 4px'}} onClick={()=>setPform({})}>＋ Thêm tình huống điều bi</button>
      <div className="tsub">Dựng lại thế bi bạn điều lỗi. Tập lại được rồi thì tick "Đã tập".</div>
      <div className="poslegend">
        <span><i className="posdot" style={{background:'#f4f1e6'}}/>Bi cái</span>
        <span><i className="posdot" style={{background:'#e8c020'}}/>Bi 9</span>
        <span><i className="posdot" style={{background:'#2f6fd6'}}/>Bi 10</span>
      </div>
      {todo.length>0 &&
        <div className="card" style={{padding:'12px 14px',marginTop:8}}>
          <div className="drow" style={{marginBottom:8}}><b style={{fontSize:'0.875rem'}}>📊 Đầu cơ &amp; thế bi còn kém</b><span className="muted small">{todo.length} thế cần tập</span></div>
          {tipRows.map(([l,n])=>(
            <Bar key={l} label={'Đầu cơ: '+l} right={n+' thế'} val={n} max={tMax}/>))}
        </div>}
      {positions.length===0 &&
        <Empty ico="🎱" t="Chưa có tình huống nào" s="Bấm nút trên để dựng lại thế bi bạn điều lỗi và rút kinh nghiệm."/>}
      {todo.length>0 && <div className="list">{todo.map(posCard)}</div>}
      {positions.filter(p=>p.done).length>0 && <>
        <div className="h2">✅ Đã tập ({positions.filter(p=>p.done).length})</div>
        <div className="list">{positions.filter(p=>p.done).map(posCard)}</div>
      </>}
      {pform && <PositionEditor init={pform.id?pform:null} onSave={upsertPos} onDel={pform.id?()=>{delPos(pform.id);setPform(null);}:null} close={()=>setPform(null)}/>}
    </div>
  );
}
function SummaryView(){
  const [nonce,setNonce]=useState(0);
  const [stamp,setStamp]=useState(()=>nowHM());
  const reAnalyze=()=>{ setNonce(n=>n+1); setStamp(nowHM()); };
  const matches=store.get('nc.matches',[]);
  const extra=store.get('nc.mistakes',[]);
  const positions=store.get('nc.positions',[]);
  const customDrills=store.get('nc.customDrills',[]);
  const hiddenD=store.get('nc.hiddenDrills',[]);
  const allDrills=[...customDrills,...DRILLS].filter(d=>!hiddenD.includes(d.key));
  const drillsFor=(m)=>allDrills.filter(d=>(d.fixes||[]).includes(m)).map(d=>d.name);
  const allMis=aggMistakes(matches, extra);
  const tech=[], psy=[];
  Object.entries(allMis).forEach(([m,c])=>{ (mistakeCat(m)==='Tâm lý'?psy:tech).push([m,c]); });
  tech.sort((a,b)=>b[1]-a[1]); psy.sort((a,b)=>b[1]-a[1]);
  const techMax=Math.max(1,...tech.map(r=>r[1])), psyMax=Math.max(1,...psy.map(r=>r[1]));
  const todo=positions.filter(p=>!p.done);
  const tipAgg={}; todo.forEach(p=>{ const l=tipLabel(p.tip); tipAgg[l]=(tipAgg[l]||0)+1; });
  const tipRows=Object.entries(tipAgg).sort((a,b)=>b[1]-a[1]); const tMax=Math.max(1,...tipRows.map(r=>r[1]));
  const drillRow=([m,n],mx)=>{ const dr=drillsFor(m); return (
    <div key={m} className="card" style={{padding:'11px 13px'}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'baseline',gap:8,marginBottom:4}}><b style={{fontSize:'0.875rem'}}>{m}</b><span className="muted small">{n}×</span></div>
      <div className="mbar" style={{marginBottom:6}}><div style={{width:Math.round(n/mx*100)+'%'}}/></div>
      {FIX_TIPS[m] && <div className="muted" style={{fontSize:'0.78125rem',lineHeight:1.5}}>💡 {FIX_TIPS[m]}</div>}
      {dr.length>0 && <div style={{marginTop:7,display:'flex',flexWrap:'wrap',gap:6,alignItems:'center'}}>
        <span className="muted small">🎯 Nên tập:</span>
        {dr.map(name=><span key={name} className="tag2">{name}</span>)}
      </div>}
    </div>); };
  const empty=!tech.length && !psy.length && !todo.length;
  return (
    <div style={{display:'flex',flexDirection:'column',flex:1}}>
      <div className="h">Tổng hợp từ Nhật ký</div>
      <div className="tsub">Toàn cảnh cần luyện: kỹ thuật, tâm lý và thế bi — rút từ nhật ký của bạn.</div>
      <div className="drow" style={{margin:'8px 0 2px'}}>
        <span className="muted small">🧾 Phân tích {matches.length} trận · lúc {stamp}</span>
        <button className="chip" onClick={reAnalyze}>🔄 Phân tích lại</button>
      </div>
      {empty
        ? <Empty ico="📊" t="Chưa có dữ liệu" s="Ghi vài trận (kèm lỗi & ghi chú) và dựng thế bi ở mục Điều bi — mọi thứ tự tổng hợp về đây."/>
        : <>
          <div className="statstrip">
            <div className="stat"><b>{tech.reduce((s,r)=>s+r[1],0)}</b><small>lỗi kỹ thuật</small></div>
            <div className="stat"><b>{psy.reduce((s,r)=>s+r[1],0)}</b><small>lỗi tâm lý</small></div>
            <div className="stat"><b style={{color:'var(--gold)'}}>{todo.length}</b><small>thế bi cần tập</small></div>
          </div>
          {tech.length>0 && <>
            <div className="h2">🔧 Kỹ thuật cần tập</div>
            <div className="tsub" style={{marginBottom:2}}>Lỗi kỹ thuật hay mắc — kèm cách sửa &amp; bài nên tập.</div>
            <div className="list">{tech.slice(0,8).map(r=>drillRow(r,techMax))}</div>
          </>}
          {psy.length>0 && <>
            <div className="h2">🧠 Tâm lý cần ổn định</div>
            <div className="list">{psy.map(r=>drillRow(r,psyMax))}</div>
          </>}
          {todo.length>0 && <>
            <div className="h2">🎱 Thế bi cần tập ({todo.length})</div>
            {tipRows.length>0 &&
              <div className="card" style={{padding:'12px 14px',marginTop:8}}>
                <div className="drow" style={{marginBottom:8}}><b style={{fontSize:'0.875rem'}}>📊 Đầu cơ còn kém</b><span className="muted small">{todo.length} thế</span></div>
                {tipRows.map(([l,n])=>(
                  <Bar key={l} label={'Đầu cơ: '+l} right={n+' thế'} val={n} max={tMax}/>))}
              </div>}
            <div className="list">
              {todo.slice(0,20).map(p=>{ const sug=suggestTip(p.cue,p.obj,p.nxt); return (
                <div key={p.id} className="card mcard" onClick={()=>NAV.go('table','positions')} title="Mở mục Điều bi"
                  style={{padding:10,display:'flex',gap:10,alignItems:'center',cursor:'pointer'}}>
                  <div style={{width:96,flex:'none'}}><MiniTable dia={posDia(p)}/></div>
                  <div style={{flex:1,minWidth:0}}>
                    {p.note && <div className="preline" style={{fontSize:'0.8125rem',lineHeight:1.4}}>{p.note}</div>}
                    <div className="muted small" style={{marginTop:3}}>bạn đánh: {p.tip?tipLabel(p.tip):'—'} · <span style={{color:'var(--gold)'}}>gợi ý: {tipLabel(sug)}</span></div>
                    <div className="muted small" style={{marginTop:2}}>{fmtDate(p.date)} · <span style={{color:'var(--accent)'}}>🎱 Điều bi ›</span></div>
                  </div>
                </div>); })}
            </div>
          </>}
        </>}
    </div>
  );
}
// Ô nhập nhanh 1 lỗi ngoài danh mục: lưu vào nc.customMistakes rồi chọn luôn.
function CustomMisAdd({onAdd}){
  const [v,setV]=useState('');
  const add=()=>{ const name=v.trim(); if(!name) return; saveCustomMistake(name); onAdd(name); setV(''); };
  return (
    <div style={{display:'flex',gap:6,marginTop:6}}>
      <input value={v} onChange={e=>setV(e.target.value)} placeholder="Lỗi khác (tự ghi)…" style={{flex:1,minWidth:0}}
        onKeyDown={e=>{ if(e.key==='Enter'){ e.preventDefault(); add(); } }}/>
      <button type="button" className="btn ghost" style={{padding:'0 14px',flex:'none'}} onClick={add}>＋ Thêm</button>
    </div>
  );
}
function PositionEditor({init,onSave,onDel,close}){
  const [cue,setCue]=useState(init?init.cue:{x:24,y:36});
  const [obj,setObj]=useState(init?init.obj:{x:54,y:22});
  const [nxt,setNxt]=useState(init?init.nxt:{x:80,y:38});
  const [tip,setTip]=useState(init&&init.tip?init.tip:{x:0,y:0});
  const [power,setPower]=useState(init&&init.power!=null?init.power:0.5);
  const [mode,setMode]=useState('tip');   // 'tip': đầu cơ+lực → đường bi ; 'path': kéo đường bi → đầu cơ
  const [dest,setDest]=useState(init&&init.dest?init.dest:{x:40,y:44});
  const [note,setNote]=useState(init?(init.note||''):'');
  const drag=useRef(null), svgRef=useRef(null), tipRef=useRef(null), tdrag=useRef(false);
  const toSvg=(e)=>{ const r=svgRef.current.getBoundingClientRect();
    const cx=e.touches?e.touches[0].clientX:e.clientX, cy=e.touches?e.touches[0].clientY:e.clientY;
    return {x:Math.round(Math.max(FELT[0],Math.min(FELT[1],(cx-r.left)/r.width*100))),
            y:Math.round(Math.max(FELT[2],Math.min(FELT[3],(cy-r.top)/r.height*60)))}; };
  const setter={cue:setCue,obj:setObj,nxt:setNxt,dest:setDest};
  const pos={cue,obj,nxt,dest};
  const keys=mode==='path'?['cue','obj','nxt','dest']:['cue','obj','nxt'];
  const place=(k,p)=>setter[k](p);
  const down=(e)=>{ const p=toSvg(e); let best=keys[0],bd=1e9; keys.forEach(k=>{const d=Math.hypot(p.x-pos[k].x,p.y-pos[k].y); if(d<bd){bd=d;best=k;}}); drag.current=best; place(best,p); };
  const move=(e)=>{ if(!drag.current) return; e.preventDefault(); place(drag.current,toSvg(e)); };
  const up=()=>{ drag.current=null; };
  const tipAt=(e)=>{ const r=tipRef.current.getBoundingClientRect();
    const cx=e.touches?e.touches[0].clientX:e.clientX, cy=e.touches?e.touches[0].clientY:e.clientY;
    let x=(cx-r.left)/r.width*2-1, y=(cy-r.top)/r.height*2-1; const m=Math.hypot(x,y); if(m>1){x/=m;y/=m;}
    setTip({x:Math.round(x*100)/100,y:Math.round(y*100)/100}); };
  const tdown=(e)=>{ if(mode!=='tip') return; tdrag.current=true; e.preventDefault(); tipAt(e); };
  const tmove=(e)=>{ if(!tdrag.current) return; e.preventDefault(); tipAt(e); };
  const tup=()=>{ tdrag.current=false; };
  const sug=suggestTip(cue,obj,nxt);
  const ux=obj.x-cue.x, uy=obj.y-cue.y, ul=Math.hypot(ux,uy)||1, U={x:ux/ul,y:uy/ul}, T={x:-U.y,y:U.x};
  const contact={x:obj.x-U.x*2*3.05, y:obj.y-U.y*2*3.05};
  let effTip=tip, effPower=power, cpPts=[];
  if(mode==='path'){
    const dx=dest.x-contact.x, dy=dest.y-contact.y, dl=Math.hypot(dx,dy)||1;
    const fol=(dx/dl)*U.x+(dy/dl)*U.y, lat=(dx/dl)*T.x+(dy/dl)*T.y;
    effTip={x:Math.max(-1,Math.min(1,Math.round(lat*100)/100)), y:Math.max(-1,Math.min(1,Math.round(-fol*100)/100))};
    effPower=Math.max(0.05,Math.min(1,Math.round(dl/80*100)/100));
    cpPts=[contact,dest];
  } else { cpPts=cuePath(cue,obj,tip,power).pts; }
  return (
    <div className="scrim" onClick={close}>
      <div className="sheet" onClick={e=>e.stopPropagation()}>
        <h3>{init?'Sửa tình huống':'Dựng thế bi'}</h3>
        <div className="muted small" style={{margin:'-8px 0 8px'}}>Kéo bi cái / bi 9 / bi 10 vào vị trí{mode==='path'?'; kéo điểm xanh = đích bi cái':''}.</div>
        <svg ref={svgRef} className="mtable" viewBox="0 0 100 60" preserveAspectRatio="xMidYMid meet"
          style={{width:'100%',maxWidth:'none',touchAction:'none'}}
          onMouseDown={down} onMouseMove={move} onMouseUp={up} onMouseLeave={up}
          onTouchStart={down} onTouchMove={move} onTouchEnd={up}>
          <defs><marker id="cpAh" markerUnits="userSpaceOnUse" markerWidth="7" markerHeight="7" refX="4.6" refY="2.6" orient="auto"><path d="M0,0 L5.2,2.6 L0,5.2 Z" fill="#5fb6ff"/></marker></defs>
          <TableFrame/>
          {cpPts.length>1 && <polyline points={cpPts.map(p=>p.x+','+p.y).join(' ')} fill="none" stroke="#5fb6ff" strokeWidth="1.3" strokeLinejoin="round" strokeDasharray="3 2" markerEnd="url(#cpAh)"/>}
          <Ball x={cue.x} y={cue.y} b={{cue:true}}/>
          <Ball x={obj.x} y={obj.y} b={{num:9,stripe:'#e8c020'}}/>
          <Ball x={nxt.x} y={nxt.y} b={{num:10,stripe:'#2f6fd6'}}/>
          {mode==='path' && <circle cx={dest.x} cy={dest.y} r="3.6" fill="none" stroke="#5fb6ff" strokeWidth="1.6" strokeDasharray="2 1.4"/>}
        </svg>
        <div className="poslegend">
          <span><i className="posdot" style={{background:'#f4f1e6'}}/>Bi cái</span>
          <span><i className="posdot" style={{background:'#e8c020'}}/>Bi 9</span>
          <span><i className="posdot" style={{background:'#2f6fd6'}}/>Bi 10</span>
          <span><i className="posdot" style={{background:'#5fb6ff'}}/>Đường bi cái</span>
        </div>

        <div className="modeseg" style={{alignSelf:'center',margin:'10px 0 2px',maxWidth:'100%'}}>
          <button className={mode==='tip'?'on':''} onClick={()=>setMode('tip')}>🎯 Đầu cơ→Đường bi</button>
          <button className={mode==='path'?'on':''} onClick={()=>setMode('path')}>➡️ Đường bi→Đầu cơ</button>
        </div>

        <div className="field" style={{alignItems:'center',marginTop:6}}>
          <label style={{alignSelf:'flex-start'}}>{mode==='tip'?'Đầu cơ bạn đánh (chạm điểm trên bi cái)':'Đầu cơ tương ứng (app tự tính)'}</label>
          <svg ref={tipRef} className="cueball" viewBox="0 0 100 100"
            onMouseDown={tdown} onMouseMove={tmove} onMouseUp={tup} onMouseLeave={tup}
            onTouchStart={tdown} onTouchMove={tmove} onTouchEnd={tup}
            style={{cursor:mode==='tip'?'pointer':'default'}}>
            <circle cx="50" cy="50" r="46" fill="#f4f1e6" stroke="var(--line)" strokeWidth="2"/>
            <line x1="50" y1="8" x2="50" y2="92" stroke="#000" strokeOpacity=".12" strokeWidth="1"/>
            <line x1="8" y1="50" x2="92" y2="50" stroke="#000" strokeOpacity=".12" strokeWidth="1"/>
            <circle cx={50+sug.x*40} cy={50+sug.y*40} r="10" fill="none" stroke="var(--gold)" strokeWidth="2.5" strokeDasharray="4 3"/>
            <circle cx={50+effTip.x*40} cy={50+effTip.y*40} r="9" fill="var(--accent)" stroke="#04231a" strokeWidth="1.5"/>
          </svg>
          <div className="muted small" style={{marginTop:4,textAlign:'center'}}>Bạn đánh: <b style={{color:'var(--accent)'}}>{tipLabel(effTip)}</b> · lực <b>{Math.round(effPower*100)}%</b><br/><span style={{color:'var(--gold)'}}>Gợi ý đầu cơ tới bi 10: {tipLabel(sug)}</span></div>
        </div>

        {mode==='tip' &&
          <div className="field"><label>Lực đánh: {Math.round(power*100)}%</label>
            <input type="range" min="0" max="100" value={Math.round(power*100)} onChange={e=>setPower(+e.target.value/100)} style={{width:'100%',accentColor:'var(--gold)'}}/></div>}

        <div className="field"><label>Ghi chú (điều bi sai chỗ nào, nên đánh thế nào)</label>
          <textarea rows="3" value={note} onChange={e=>setNote(e.target.value)} placeholder="VD: định ra giữa bàn nhưng bi cái đi quá, kẹt sau bi 10..."/></div>
        <div className="rowbtns">
          {onDel && <button className="btn ghost" onClick={onDel} style={{color:'var(--danger)',flex:'0 0 auto'}}>🗑 Xoá</button>}
          <button className="btn" onClick={()=>onSave({...(init||{}),cue,obj,nxt,tip:effTip,power:effPower,note:note.trim()})}>Lưu</button>
        </div>
      </div>
    </div>
  );
}
function MatchForm({init,names,lastHc,onSave,onDel,close}){
  const [m,setM]=useState({opp:'',score:'',note:'',handicap:'',score2:'',...init});
  const [two,setTwo]=useState(false);
  const [customMis,setCustomMis]=useState(getCustomMistakes);
  const set=(k,v)=>setM(p=>({...p,[k]:v}));
  const pickOpp=(n)=>setM(p=>({...p,opp:n,handicap:(p.handicap&&p.handicap.trim())?p.handicap:((lastHc&&lastHc[n])||'')}));
  const toggle=(x)=>setM(p=>({...p,mistakes:(p.mistakes||[]).includes(x)?p.mistakes.filter(y=>y!==x):[...(p.mistakes||[]),x]}));
  const onAddCustom=(name)=>{ setCustomMis(getCustomMistakes()); setM(p=>({...p,mistakes:(p.mistakes||[]).includes(name)?p.mistakes:[...(p.mistakes||[]),name]})); };
  const enableTwo=()=>{ setTwo(true); setM(p=>({...p,result2:p.result2||'W'})); };
  const RES=[['W','Thắng'],['D','Hòa'],['L','Thua']];
  const submit=()=>{
    const opp=(m.opp||'').trim(), handicap=(m.handicap||'').trim(), note=(m.note||'').trim();
    if(init.id){ onSave([{...m,opp,handicap,note,score:(m.score||'').trim()}]); return; }
    const mc={}; (m.mistakes||[]).forEach(x=>{ const c=m.mistakeCounts&&m.mistakeCounts[x]; if(c&&c>1) mc[x]=c; });
    const base={date:m.date,opp,handicap,game:m.game,feel:m.feel,mistakes:m.mistakes||[],note,...(Object.keys(mc).length?{mistakeCounts:mc}:{})};
    const out=[{...base,result:m.result,score:(m.score||'').trim()}];
    if(two && m.result2) out.push({...base,result:m.result2,score:(m.score2||'').trim()});
    onSave(out);
  };
  const lhc=lastHc&&lastHc[(m.opp||'').trim()];
  return (
    <div className="scrim" onClick={close}>
      <div className="sheet" onClick={e=>e.stopPropagation()}>
        <h3>{init.id?'Sửa trận':'Ghi trận đấu'}</h3>
        <div className="field"><label>Ngày</label>
          <input type="date" value={m.date} onChange={e=>set('date',e.target.value)}/></div>
        <div className="field"><label>Đối thủ</label>
          <input list="nc-opps" value={m.opp} onChange={e=>set('opp',e.target.value)} placeholder="Tên đối thủ (gõ mới hoặc chọn lại)"/>
          <datalist id="nc-opps">{(names||[]).map(n=><option key={n} value={n}/>)}</datalist>
          {(names||[]).length>0 &&
            <div className="presets" style={{justifyContent:'flex-start',marginTop:4}}>
              {names.slice(0,10).map(n=>
                <button key={n} type="button" className={'chip'+(m.opp===n?' on':'')} onClick={()=>pickOpp(n)}>{n}</button>)}
            </div>}</div>
        <div className="field"><label>Chấp / kèo</label>
          <input value={m.handicap} onChange={e=>set('handicap',e.target.value)} placeholder="Tự ghi, VD: tôi chấp 2 bi"/>
          {lhc && lhc!==m.handicap &&
            <div style={{marginTop:4}}>
              <button type="button" className="chip" onClick={()=>set('handicap',lhc)}>↩ Lần trước: {lhc}</button>
            </div>}</div>
        <div className="field"><label>Thể loại</label>
          <div className="presets" style={{justifyContent:'flex-start'}}>
            {GAMES.map(g=><button key={g} className={'chip'+(m.game===g?' on':'')} onClick={()=>set('game',g)}>{g}</button>)}
          </div></div>
        <div className="field"><label>{!init.id&&two?'Trận 1 — kết quả':'Kết quả'}</label>
          <div className="modeseg" style={{alignSelf:'flex-start'}}>
            {RES.map(([k,t])=><button key={k} className={m.result===k?'on':''} onClick={()=>set('result',k)}>{t}</button>)}
          </div></div>
        <div className="field"><label>{!init.id&&two?'Tỉ số trận 1 (tuỳ ý)':'Tỉ số (tuỳ ý)'}</label>
          <input value={m.score} onChange={e=>set('score',e.target.value)} placeholder="VD: 5-3"/></div>
        {!init.id && (two
          ? <>
              <div className="field"><label>Trận 2 — kết quả (cùng đối thủ)</label>
                <div className="modeseg" style={{alignSelf:'flex-start'}}>
                  {RES.map(([k,t])=><button key={k} className={m.result2===k?'on':''} onClick={()=>set('result2',k)}>{t}</button>)}
                </div></div>
              <div className="field"><label>Tỉ số trận 2 (tuỳ ý)</label>
                <input value={m.score2} onChange={e=>set('score2',e.target.value)} placeholder="VD: 5-4"/></div>
              <button type="button" className="chip" style={{alignSelf:'flex-start',marginBottom:8}} onClick={()=>setTwo(false)}>✕ Bỏ trận 2</button>
            </>
          : <button type="button" className="chip" style={{alignSelf:'flex-start',marginBottom:8}} onClick={enableTwo}>＋ Ghi thêm trận 2 (cùng đối thủ)</button>)}
        <div className="field"><label>Phong độ của bạn</label>
          <div className="presets" style={{justifyContent:'flex-start'}}>
            {FEELS.map(f=><button key={f.v} className={'chip'+(m.feel===f.v?' on':'')} style={{fontSize:'1.1875rem'}} onClick={()=>set('feel',f.v)}>{f.e}</button>)}
          </div></div>
        <div className="field"><label>Lỗi mắc phải (chọn nhiều){!init.id&&two?' — chung cả 2 trận':''}</label>
          <div className="presets" style={{justifyContent:'flex-start'}}>
            {[...MISTAKES,...customMis].map(x=>{ const on=(m.mistakes||[]).includes(x); const c=m.mistakeCounts&&m.mistakeCounts[x]; return <button key={x} className={'chip'+(on?' on':'')} onClick={()=>toggle(x)}>{x}{on&&c>1?' · '+c:''}</button>; })}
          </div>
          <CustomMisAdd onAdd={onAddCustom}/></div>
        <div className="field"><label>Ghi chú / bài học</label>
          <textarea rows="4" value={m.note} onChange={e=>set('note',e.target.value)}
            placeholder="Rút ra điều gì cho lần sau? Có thể xuống dòng, ghi nhiều ý."/></div>
        <div className="rowbtns">
          {init.id && <button className="btn ghost" onClick={()=>onDel(init.id)} style={{color:'var(--danger)',flex:'0 0 auto'}}>🗑 Xoá</button>}
          <button className="btn" onClick={submit}>{!init.id&&two?'Lưu 2 trận':'Lưu'}</button>
        </div>
      </div>
    </div>
  );
}

/* ================= Tập luyện ================= */
// Lỗ: 4 góc + 2 lỗ giữa băng dài (trên/dưới). Tọa độ dùng cho cả hình vẽ lẫn tính "vào lỗ".
// Bàn tỉ lệ 2:1: vùng chơi 80×40 trong khung 100×60 (viền đều 10).
const POCKETS=[[9,9],[50,8],[91,9],[9,51],[50,52],[91,51]];
const FELT=[10,90,10,50]; // mũi băng = giới hạn di chuyển & phản bi: x0,x1,y0,y1 (2:1)
// Mốc kim cương: băng dài (trên/dưới) 6 mốc chia đều (bỏ vị trí lỗ giữa), băng ngắn (trái/phải) 3 mốc.
const DIAMONDS=(()=>{ const d=[]; [20,30,40,60,70,80].forEach(x=>{d.push([x,4]);d.push([x,56]);}); [20,30,40].forEach(y=>{d.push([4,y]);d.push([96,y]);}); return d; })();
function TableFrame(){
  // Băng cắt HÀM vào lỗ: mỗi băng là polygon, đầu vát 45° chỉ về phía lỗ; mũi băng nằm ở FELT.
  const cushions=[
    "14.5,10 46.5,10 44.5,8 16.5,8", "53.5,10 85.5,10 83.5,8 55.5,8",
    "14.5,50 46.5,50 44.5,52 16.5,52", "53.5,50 85.5,50 83.5,52 55.5,52",
    "10,14.5 10,45.5 8,43.5 8,16.5", "90,14.5 90,45.5 92,43.5 92,16.5",
  ];
  const noses=[[14.5,10,46.5,10],[53.5,10,85.5,10],[14.5,50,46.5,50],[53.5,50,85.5,50],[10,14.5,10,45.5],[90,14.5,90,45.5]];
  return (
    <g>
      <rect x="0" y="0" width="100" height="60" rx="6" fill="#171a1d"/>
      <rect x="1.4" y="1.4" width="97.2" height="57.2" rx="4.6" fill="none" stroke="#34383c" strokeWidth=".5" opacity=".8"/>
      <rect x="6" y="6" width="88" height="48" rx="2.2" fill="#bcc2c6"/>
      {cushions.map((pts,i)=><polygon key={'c'+i} points={pts} fill="#8c9298"/>)}
      {noses.map((n,i)=><line key={'n'+i} x1={n[0]} y1={n[1]} x2={n[2]} y2={n[3]} stroke="#4f565c" strokeWidth=".7" strokeLinecap="round" opacity=".9"/>)}
      {DIAMONDS.map((p,i)=><path key={'d'+i} d={`M ${p[0]} ${p[1]-1} L ${p[0]+1} ${p[1]} L ${p[0]} ${p[1]+1} L ${p[0]-1} ${p[1]} Z`} fill="#e9e3d2"/>)}
      {/* Lỗ: hố ~1.15× bi; miệng (khe hàm băng) rộng hơn — theo chuẩn WPA. */}
      {POCKETS.map((p,i)=>(<g key={'p'+i}><circle cx={p[0]} cy={p[1]} r="2.9" fill="#0c0d0f" stroke="#3d4146" strokeWidth=".35"/><circle cx={p[0]} cy={p[1]} r="2.4" fill="#000"/></g>))}
    </g>
  );
}
function bandPath(cx,cy,r,b){
  const w=Math.sqrt(Math.max(0,r*r-b*b));
  return `M ${cx-w} ${cy-b} L ${cx+w} ${cy-b} A ${r} ${r} 0 0 1 ${cx+w} ${cy+b} L ${cx-w} ${cy+b} A ${r} ${r} 0 0 1 ${cx-w} ${cy-b} Z`;
}
// Màu bi pool 1–15 (1–8 đặc, 9–15 sọc)
const POOL=[null,'#e8c020','#2456c8','#d8412f','#6b3fa0','#e07b1a','#1f8a4c','#7a2230','#1a1a1a',
  '#e8c020','#2456c8','#d8412f','#6b3fa0','#e07b1a','#1f8a4c','#7a2230'];
function Ball({x,y,r,b}){
  r=r||2.1;
  if(b.cue) return <circle cx={x} cy={y} r={r} fill="#f4f1e6" stroke="rgba(0,0,0,.4)" strokeWidth=".5"/>;
  if(b.num!=null) return (
    <g>
      {b.solid
        ? <circle cx={x} cy={y} r={r} fill={b.solid} stroke="rgba(0,0,0,.4)" strokeWidth=".5"/>
        : <><circle cx={x} cy={y} r={r} fill="#f7f4ea" stroke="rgba(0,0,0,.4)" strokeWidth=".5"/>
            <path d={bandPath(x,y,r,r*0.66)} fill={b.stripe}/></>}
      <circle cx={x} cy={y} r={r*0.5} fill="#fff"/>
      <text x={x} y={y} textAnchor="middle" dominantBaseline="central" fontSize={r*0.72} fontWeight="800" fill="#222">{b.num}</text>
    </g>
  );
  return <circle cx={x} cy={y} r={r} fill={b.c} stroke="rgba(0,0,0,.35)" strokeWidth=".5"/>;
}
// Tạo dia.balls cho bài tập tự vẽ: bi cái + các bi số
function customDia(cue,balls){
  return {balls:[{x:cue.x,y:cue.y,cue:true},...balls.map((p,i)=>{ const n=i+1; return n<=8?{x:p.x,y:p.y,num:n,solid:POOL[n]}:{x:p.x,y:p.y,num:n,stripe:POOL[n]}; })]};
}
function tipLabel(t){
  if(!t) return 'tâm bi';
  const ax=Math.abs(t.x);
  // DỌC (trục giữa) — 9 mức đầu cơ, cách đều theo |offset| của R (tip = fraction of R, ±0.5 = sát mép trước khi trượt cơ):
  //  y<0 = ĐÁNH CAO (trên tâm → cu lê/follow) ; y>0 = ĐÁNH THẤP (dưới tâm → trô/rút/draw) ; |y|<0.0625 = tâm bi.
  //  4 mức mỗi phía (xa tâm dần): stun · stun-rút/lê · rút/cu lê · rút/lê tối đa.  Ngưỡng 0.0625/0.1875/0.3125/0.4375.
  const ay=Math.abs(t.y); let v='';
  if(ay>=0.0625){
    const lvl = ay>=0.4375?4:ay>=0.3125?3:ay>=0.1875?2:1; // 1=sát tâm … 4=sát mép
    v = (t.y>0
      ? ['','dưới tâm nhẹ (gần stun)','dưới tâm · stun-rút','trên đáy bi · rút (draw)','sát ĐÁY bi · rút tối đa (max draw)']
      : ['','trên tâm nhẹ (gần stun)','trên tâm · stun-lê','cu lê · theo (follow)','sát ĐỈNH bi · lê tối đa (max follow)'])[lvl];
  }
  // NGANG: áp phê trái/phải + độ mạnh
  let h='';
  if(ax>=0.14){ const sx=ax>=0.34?' nhiều':(ax>=0.23?'':' nhẹ'); h=(t.x<0?'áp phê trái':'áp phê phải')+sx; }
  if(!v && !h) return 'tâm bi';
  return [v,h].filter(Boolean).join(' · ');
}
// Gợi ý đầu cơ: đánh giá vị trí bi kế so với hướng ngắm để chọn theo/rút + xoáy
function suggestTip(cue,obj,nxt){
  const ax=obj.x-cue.x, ay=obj.y-cue.y, al=Math.hypot(ax,ay)||1, ux=ax/al, uy=ay/al;
  const bx=nxt.x-obj.x, by=nxt.y-obj.y, bl=Math.hypot(bx,by)||1, vx=bx/bl, vy=by/bl;
  const dot=ux*vx+uy*vy;        // bi kế ở phía trước (theo) hay phía sau (rút)
  const cross=ux*vy-uy*vx;      // bi kế lệch trái/phải hướng ngắm
  const y=dot>0.3?-0.55:(dot<-0.3?0.55:0);
  const x=cross>0.3?0.5:(cross<-0.3?-0.5:0);
  return {x,y};
}
// Đường bi cái sau khi chạm bi mục tiêu (mô hình gần đúng: theo/rút + xoáy, nảy băng)
function reflectPath2(p0,d,len,RX){
  const x0=RX[0],x1=RX[1],y0=RX[2],y1=RX[3];
  let p={x:p0.x,y:p0.y}, dx=d.x, dy=d.y; const pts=[{x:p.x,y:p.y}]; let budget=len;
  for(let it=0; it<8 && budget>0.5; it++){
    let tx=Infinity,ty=Infinity;
    if(dx>1e-6) tx=(x1-p.x)/dx; else if(dx<-1e-6) tx=(x0-p.x)/dx;
    if(dy>1e-6) ty=(y1-p.y)/dy; else if(dy<-1e-6) ty=(y0-p.y)/dy;
    const twall=Math.min(tx,ty); const t=Math.min(twall,budget);
    const np={x:p.x+dx*t,y:p.y+dy*t}; pts.push(np); budget-=t; p=np;
    if(t>=twall-1e-9){ if(t===tx)dx=-dx; if(t===ty)dy=-dy; } else break;
  }
  return pts;
}
function cuePath(cue,obj,tip,power){
  const ux=obj.x-cue.x, uy=obj.y-cue.y, ul=Math.hypot(ux,uy)||1; const u={x:ux/ul,y:uy/ul};
  const t={x:-u.y,y:u.x}; const r=3.05;
  const contact={x:obj.x-u.x*2*r, y:obj.y-u.y*2*r};
  const follow=-tip.y, lateral=tip.x;
  let dx=follow*u.x+lateral*t.x, dy=follow*u.y+lateral*t.y;
  const dl=Math.hypot(dx,dy);
  if(dl<0.12) return {contact, pts:[], stop:true};
  dx/=dl; dy/=dl;
  return {contact, pts:reflectPath2(contact,{x:dx,y:dy}, 8+power*80, FELT), stop:false};
}
function MiniTable({dia}){
  if(!dia) return null;
  return (
    <svg className="mtable" viewBox="0 0 100 60" role="img" aria-label="Sơ đồ bàn bi-a">
      <defs>
        <marker id="ncAh" markerUnits="userSpaceOnUse" markerWidth="7" markerHeight="7" refX="4.6" refY="2.6" orient="auto">
          <path d="M0,0 L5.2,2.6 L0,5.2 Z" fill="#ffd166"/>
        </marker>
      </defs>
      <TableFrame/>
      {dia.stick && <line x1={dia.stick[0]} y1={dia.stick[1]} x2={dia.stick[2]} y2={dia.stick[3]}
        stroke="#caa05a" strokeWidth="2.6" strokeLinecap="round"/>}
      {dia.line && <line x1={dia.line[0]} y1={dia.line[1]} x2={dia.line[2]} y2={dia.line[3]}
        stroke="#ffffff" strokeOpacity=".5" strokeWidth=".7" strokeDasharray="2 2"/>}
      {(dia.arrows||[]).map((a,i)=><line key={'a'+i} x1={a[0]} y1={a[1]} x2={a[2]} y2={a[3]}
        stroke="#ffd166" strokeWidth="1.1" strokeOpacity=".95" markerEnd="url(#ncAh)"/>)}
      {dia.zone && <circle cx={dia.zone[0]} cy={dia.zone[1]} r={dia.zone[2]} fill="none"
        stroke="#ffd166" strokeWidth=".8" strokeDasharray="2.2 1.6"/>}
      {dia.path && dia.path.length>1 &&
        <polyline points={dia.path.map(p=>p.x+','+p.y).join(' ')} fill="none" stroke="#5fb6ff"
          strokeWidth="1.2" strokeLinejoin="round" strokeDasharray="3 2"/>}
      {dia.balls.map((b,i)=><Ball key={'b'+i} x={b.x} y={b.y} r={b.r} b={b}/>)}
    </svg>
  );
}
function Spark({vals}){
  if(!vals||vals.length<2) return null;
  const w=72,h=22;
  const pts=vals.map((v,i)=>`${(i/(vals.length-1))*w},${(h-2)-(v/100)*(h-4)}`).join(' ');
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{display:'block'}}>
      <polyline points={pts} fill="none" stroke="var(--accent)" strokeWidth="1.8"
        strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}
function LineChart({vals,color='var(--accent)'}){
  if(!vals||vals.length<2) return <div className="muted small" style={{padding:'6px 0'}}>Cần ≥2 mốc dữ liệu để vẽ.</div>;
  const W=300,H=104,pad=8;
  const x=(i)=> pad + i/(vals.length-1)*(W-2*pad);
  const y=(v)=> (H-pad) - (v/100)*(H-2*pad);
  const pts=vals.map((v,i)=>`${x(i)},${y(v)}`).join(' ');
  const lastI=vals.length-1;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{width:'100%',display:'block'}} preserveAspectRatio="none">
      {[0,50,100].map(g=><line key={g} x1={pad} y1={y(g)} x2={W-pad} y2={y(g)}
        stroke="var(--line)" strokeWidth="1" strokeDasharray="3 4"/>)}
      <polyline points={pts} fill="none" stroke={color} strokeWidth="2.6"
        strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke"/>
      <circle cx={x(lastI)} cy={y(vals[lastI])} r="3.5" fill={color}/>
    </svg>
  );
}
function DrillCard({d,recs,onScore,onDelete,onEdit}){
  const [open,setOpen]=useState(false);
  const last=recs[0];
  const best=recs.length? Math.max(...recs.map(r=>r.score)) : null;
  const vals=recs.slice(0,8).reverse().map(r=>Math.round(r.score/r.max*100));
  const cat=DRILL_CATS[d.cat];
  return (
    <div className="card drillC">
      <div className="drillH" onClick={()=>setOpen(o=>!o)}>
        <span className="catpill" style={{border:'1px solid '+cat.c,color:cat.c}}>{cat.t}{d.custom?' ✎':''}</span>
        <div className="dn"><b>{d.name}</b><small>Mục tiêu {d.target} · đã tập {recs.length} lần</small></div>
        <div className="sc">{last
          ? <><b>{last.score}/{d.max}</b><small>gần nhất</small></>
          : <span className="muted small">chưa tập</span>}</div>
        {onEdit && <button className="chip" onClick={(e)=>{e.stopPropagation();onEdit();}} style={{marginLeft:6,flex:'none'}}>✎</button>}
        {onDelete && <button className="xbtn" onClick={(e)=>{e.stopPropagation();onDelete();}} style={{marginLeft:4}}>✕</button>}
      </div>
      {open &&
        <div className="drillB">
          {d.dia && <MiniTable dia={d.dia}/>}
          <div className="kv"><b>Cách đặt:</b> {d.setup}</div>
          <div className="kv"><b>Chấm điểm:</b> {d.scoring}.</div>
          <div className="kv"><b>Vì sao tập:</b> {d.why}</div>
          {d.fixes&&d.fixes.length>0 &&
            <div className="tags">{d.fixes.map(f=><span key={f} className="tag2">sửa: {f}</span>)}</div>}
          {recs.length>0 &&
            <div className="statline">
              {best!=null && <span>Tốt nhất <b>{best}/{d.max}</b></span>}
              {vals.length>=2 && <span style={{display:'flex',alignItems:'center',gap:6}}>Tiến bộ <Spark vals={vals}/></span>}
            </div>}
          <button className="btn acc sm" style={{alignSelf:'flex-start'}} onClick={()=>onScore(d)}>＋ Ghi điểm buổi tập</button>
        </div>}
    </div>
  );
}
function ScoreModal({d,onSave,close}){
  const [score,setScore]=useState(()=>Math.round(d.max*0.6));
  const [note,setNote]=useState('');
  return (
    <div className="scrim" onClick={close}>
      <div className="sheet" onClick={e=>e.stopPropagation()}>
        <h3>{d.name}</h3>
        <div className="muted small" style={{margin:'-8px 0 6px'}}>{d.scoring} · mục tiêu {d.target}</div>
        <div className="stepper">
          <button onClick={()=>setScore(s=>Math.max(0,s-1))} aria-label="Giảm">－</button>
          <div className="sv">{score}<small>trên {d.max}</small></div>
          <button onClick={()=>setScore(s=>Math.min(d.max,s+1))} aria-label="Tăng">＋</button>
        </div>
        <input type="range" min="0" max={d.max} value={score} onChange={e=>setScore(+e.target.value)}
          style={{width:'100%',accentColor:'var(--gold)',margin:'6px 0 14px'}}/>
        <div className="field"><label>Ghi chú (tuỳ chọn)</label>
          <input value={note} onChange={e=>setNote(e.target.value)} placeholder="Cảm giác, điều cần nhớ cho lần sau..."/></div>
        <button className="btn wide" onClick={()=>onSave({drill:d.key,max:d.max,score,note:note.trim()})}>Lưu kết quả</button>
      </div>
    </div>
  );
}
function SessionBuilder({init,drills,weakKeys,onSave,onDel,close}){
  const [name,setName]=useState(init?init.name:'');
  const [date,setDate]=useState(init?(init.date||todayStr()):todayStr());
  const [keys,setKeys]=useState(init?(init.drills||[]):[]);
  const toggle=(k)=>setKeys(a=>a.includes(k)?a.filter(x=>x!==k):[...a,k]);
  const addWeak=()=>setKeys(a=>[...new Set([...a,...(weakKeys||[])])]);
  return (
    <div className="scrim" onClick={close}>
      <div className="sheet" onClick={e=>e.stopPropagation()}>
        <h3>{init?'Sửa buổi tập':'Thiết kế buổi tập'}</h3>
        <div className="field"><label>Tên buổi tập</label>
          <input value={name} onChange={e=>setName(e.target.value)} placeholder="VD: Sửa vị trí bi cái / Buổi sáng"/></div>
        <div className="field"><label>Ngày tập</label>
          <input type="date" value={date} onChange={e=>setDate(e.target.value)}/></div>
        {(weakKeys&&weakKeys.length>0) &&
          <button className="btn ghost wide" style={{marginBottom:10}} onClick={addWeak}>🎯 Thêm bài theo điểm yếu của tôi</button>}
        <div className="field"><label>Chọn bài tập ({keys.length})</label>
          {Object.entries(DRILL_CATS).map(([ck,cv])=>{ const ds=drills.filter(d=>d.cat===ck); if(!ds.length) return null; return (
            <div key={ck} style={{marginBottom:6}}>
              <div className="small" style={{margin:'4px 0',color:cv.c,fontWeight:800}}>{cv.t}</div>
              <div className="presets" style={{justifyContent:'flex-start'}}>
                {ds.map(d=><button key={d.key} type="button" className={'chip'+(keys.includes(d.key)?' on':'')} onClick={()=>toggle(d.key)}>{d.name}</button>)}
              </div>
            </div>); })}
        </div>
        <div className="rowbtns">
          {onDel && <button className="btn ghost" onClick={onDel} style={{color:'var(--danger)',flex:'0 0 auto'}}>🗑 Xoá</button>}
          <button className="btn" onClick={()=>{ if(!keys.length) return; onSave({...(init||{}),name:name.trim()||'Buổi tập',date,drills:keys}); }}>Lưu buổi tập</button>
        </div>
      </div>
    </div>
  );
}
function DrillBuilder({init,onSave,close}){
  const iBalls=init&&init.dia? init.dia.balls.filter(b=>b.num!=null).sort((a,b)=>a.num-b.num).map(b=>({x:b.x,y:b.y})) : [{x:54,y:22},{x:70,y:32}];
  const iCue=init&&init.dia? (init.dia.balls.find(b=>b.cue)||{x:20,y:27}) : {x:20,y:27};
  const [name,setName]=useState(init?init.name:''); const [cat,setCat]=useState(init?init.cat:'pot');
  const [max,setMax]=useState(init?init.max:10); const [target,setTarget]=useState(init?(init.target||''):'');
  const [scoring,setScoring]=useState(init?(init.scoring||''):''); const [setup,setSetup]=useState(init?(init.setup||''):'');
  const [cue,setCue]=useState({x:iCue.x,y:iCue.y});
  const [balls,setBalls]=useState(iBalls);
  const drag=useRef(null), svgRef=useRef(null);
  const toSvg=(e)=>{ const r=svgRef.current.getBoundingClientRect();
    const cx=e.touches?e.touches[0].clientX:e.clientX, cy=e.touches?e.touches[0].clientY:e.clientY;
    return {x:Math.round(Math.max(FELT[0],Math.min(FELT[1],(cx-r.left)/r.width*100))),
            y:Math.round(Math.max(FELT[2],Math.min(FELT[3],(cy-r.top)/r.height*60)))}; };
  const place=(k,p)=>{ if(k==='cue') setCue(p); else setBalls(a=>a.map((b,i)=>i===k?p:b)); };
  const down=(e)=>{ const p=toSvg(e); let best='cue',bd=Math.hypot(p.x-cue.x,p.y-cue.y);
    balls.forEach((b,i)=>{const d=Math.hypot(p.x-b.x,p.y-b.y); if(d<bd){bd=d;best=i;}});
    drag.current=best; place(best,p); };
  const move=(e)=>{ if(drag.current==null) return; e.preventDefault(); place(drag.current,toSvg(e)); };
  const up=()=>{ drag.current=null; };
  const addBall=()=>setBalls(a=>a.length>=15?a:[...a,{x:46+(a.length%5)*8, y:24+Math.floor(a.length/5)*7}]);
  const rmBall=()=>setBalls(a=>a.slice(0,-1));
  const dia=customDia(cue,balls);
  return (
    <div className="scrim" onClick={close}>
      <div className="sheet" onClick={e=>e.stopPropagation()}>
        <h3>{init?'Sửa bài tập':'Tạo bài tập'}</h3>
        <div className="muted small" style={{margin:'-8px 0 6px'}}>Kéo bi để đặt vị trí; thêm tối đa 15 bi + bi cái.</div>
        <svg ref={svgRef} className="mtable" viewBox="0 0 100 60" preserveAspectRatio="xMidYMid meet"
          style={{width:'100%',maxWidth:'none',touchAction:'none'}}
          onMouseDown={down} onMouseMove={move} onMouseUp={up} onMouseLeave={up}
          onTouchStart={down} onTouchMove={move} onTouchEnd={up}>
          <TableFrame/>
          {dia.balls.map((b,i)=><Ball key={i} x={b.x} y={b.y} b={b}/>)}
        </svg>
        <div className="ghostform" style={{justifyContent:'center',marginTop:8}}>
          <button className="chip" onClick={rmBall} disabled={!balls.length}>－ Bớt bi</button>
          <span className="muted small">{balls.length} bi + bi cái</span>
          <button className="chip" onClick={addBall} disabled={balls.length>=15}>＋ Thêm bi</button>
        </div>
        <div className="field" style={{marginTop:8}}><label>Tên bài tập</label>
          <input value={name} onChange={e=>setName(e.target.value)} placeholder="VD: Chạy 6 bi vị trí"/></div>
        <div className="field"><label>Nhóm</label>
          <div className="presets" style={{justifyContent:'flex-start'}}>
            {Object.entries(DRILL_CATS).map(([k,v])=><button key={k} type="button" className={'chip'+(cat===k?' on':'')} onClick={()=>setCat(k)}>{v.t}</button>)}
          </div></div>
        <div className="field"><label>Cách đặt / mô tả</label>
          <textarea rows="2" value={setup} onChange={e=>setSetup(e.target.value)} placeholder="Mô tả cách tập..."/></div>
        <div className="field"><label>Cách chấm điểm</label>
          <input value={scoring} onChange={e=>setScoring(e.target.value)} placeholder="VD: Số bi pot liên tiếp"/></div>
        <div style={{display:'flex',gap:10}}>
          <div className="field" style={{flex:1}}><label>Thang điểm tối đa</label>
            <input type="number" value={max} onChange={e=>setMax(Math.max(1,Math.min(50,+e.target.value||1)))}/></div>
          <div className="field" style={{flex:1}}><label>Mục tiêu</label>
            <input value={target} onChange={e=>setTarget(e.target.value)} placeholder="VD: ≥7/10"/></div>
        </div>
        <button className="btn wide" onClick={()=>{ if(!name.trim()) return;
          onSave({...(init||{}),key:init?init.key:uid('cd'),custom:true,cat,name:name.trim(),max:+max,target:target.trim()||('≥'+Math.round(max*0.7)+'/'+max),
            scoring:scoring.trim()||'Tự chấm theo mục tiêu',setup:setup.trim()||'Bài tập tự tạo.',why:init?(init.why||'Bài tập do bạn thiết kế.'):'Bài tập do bạn thiết kế.',fixes:init?(init.fixes||[]):[],dia}); }}>{init?'Lưu sửa':'Lưu bài tập'}</button>
      </div>
    </div>
  );
}
function ProblemBuilder({init,onSave,close}){
  const iBalls=init&&init.dia? init.dia.balls.filter(b=>b.num!=null).sort((a,b)=>a.num-b.num).map(b=>({x:b.x,y:b.y})) : [{x:52,y:26},{x:72,y:32}];
  const iCue=init&&init.dia? (init.dia.balls.find(b=>b.cue)||{x:22,y:30}) : {x:22,y:30};
  const [name,setName]=useState(init?init.name:''); const [tag,setTag]=useState(init?(init.tag||''):'');
  const [sit,setSit]=useState(init?(init.sit||''):''); const [fix,setFix]=useState(init?(init.fix||''):'');
  const [cue,setCue]=useState({x:iCue.x,y:iCue.y});
  const [balls,setBalls]=useState(iBalls);
  const drag=useRef(null), svgRef=useRef(null);
  const toSvg=(e)=>{ const r=svgRef.current.getBoundingClientRect();
    const cx=e.touches?e.touches[0].clientX:e.clientX, cy=e.touches?e.touches[0].clientY:e.clientY;
    return {x:Math.round(Math.max(FELT[0],Math.min(FELT[1],(cx-r.left)/r.width*100))),
            y:Math.round(Math.max(FELT[2],Math.min(FELT[3],(cy-r.top)/r.height*60)))}; };
  const place=(k,p)=>{ if(k==='cue') setCue(p); else setBalls(a=>a.map((b,i)=>i===k?p:b)); };
  const down=(e)=>{ const p=toSvg(e); let best='cue',bd=Math.hypot(p.x-cue.x,p.y-cue.y);
    balls.forEach((b,i)=>{const d=Math.hypot(p.x-b.x,p.y-b.y); if(d<bd){bd=d;best=i;}}); drag.current=best; place(best,p); };
  const move=(e)=>{ if(drag.current==null) return; e.preventDefault(); place(drag.current,toSvg(e)); };
  const up=()=>{ drag.current=null; };
  const addBall=()=>setBalls(a=>a.length>=15?a:[...a,{x:46+(a.length%5)*8, y:24+Math.floor(a.length/5)*7}]);
  const rmBall=()=>setBalls(a=>a.slice(0,-1));
  const dia=customDia(cue,balls);
  return (
    <div className="scrim" onClick={close}>
      <div className="sheet" onClick={e=>e.stopPropagation()}>
        <h3>{init?'Sửa thế khó':'Thêm thế khó'}</h3>
        <div className="muted small" style={{margin:'-8px 0 6px'}}>Dựng thế bi minh hoạ, rồi ghi cách xử lý.</div>
        <svg ref={svgRef} className="mtable" viewBox="0 0 100 60" preserveAspectRatio="xMidYMid meet"
          style={{width:'100%',maxWidth:'none',touchAction:'none'}}
          onMouseDown={down} onMouseMove={move} onMouseUp={up} onMouseLeave={up}
          onTouchStart={down} onTouchMove={move} onTouchEnd={up}>
          <TableFrame/>
          {dia.balls.map((b,i)=><Ball key={i} x={b.x} y={b.y} b={b}/>)}
        </svg>
        <div className="ghostform" style={{justifyContent:'center',marginTop:8}}>
          <button className="chip" onClick={rmBall} disabled={!balls.length}>－ Bớt bi</button>
          <span className="muted small">{balls.length} bi + bi cái</span>
          <button className="chip" onClick={addBall} disabled={balls.length>=15}>＋ Thêm bi</button>
        </div>
        <div className="field" style={{marginTop:8}}><label>Tên tình huống</label>
          <input value={name} onChange={e=>setName(e.target.value)} placeholder="VD: Bi kẹt góc"/></div>
        <div className="field"><label>Nhãn ngắn</label>
          <input value={tag} onChange={e=>setTag(e.target.value)} placeholder="VD: Góc bí"/></div>
        <div className="field"><label>Tình huống</label>
          <textarea rows="2" value={sit} onChange={e=>setSit(e.target.value)} placeholder="Mô tả thế bi khó..."/></div>
        <div className="field"><label>Cách xử lý</label>
          <textarea rows="3" value={fix} onChange={e=>setFix(e.target.value)} placeholder="Nên đánh thế nào..."/></div>
        <button className="btn wide" onClick={()=>{ if(!name.trim()) return;
          onSave({...(init||{}),custom:true,name:name.trim(),tag:tag.trim()||'Tự ghi',sit:sit.trim(),fix:fix.trim()||'(chưa ghi)',dia}); }}>{init?'Lưu sửa':'Lưu thế khó'}</button>
      </div>
    </div>
  );
}
/* ===== Hướng dẫn run-out (tự tạo/ tự đặt/ ảnh + gợi ý đầu cơ từng viên) ===== */
const RN_MINX=15, RN_MAXX=85, RN_MINY=15, RN_MAXY=45, RN_SPOT={x:70,y:30};
const rnClamp=(v,a,b)=>Math.max(a,Math.min(b,v));
function rnInFelt(p){ if(p.x<RN_MINX||p.x>RN_MAXX||p.y<RN_MINY||p.y>RN_MAXY) return false; return POCKETS.every(q=>Math.hypot(p.x-q[0],p.y-q[1])>6); }
function rnSegDist(p,a,b){ const abx=b.x-a.x, aby=b.y-a.y, d2=abx*abx+aby*aby||1e-9; let t=((p.x-a.x)*abx+(p.y-a.y)*aby)/d2; t=Math.max(0,Math.min(1,t)); return Math.hypot(p.x-(a.x+abx*t), p.y-(a.y+aby*t)); }
function genRackOnce(n){
  const all=[{x:RN_SPOT.x,y:RN_SPOT.y}], others=[]; let g=0;
  while(others.length<n-1 && g<4000){ g++; const p={x:RN_MINX+(RN_MAXX-RN_MINX)*Math.random(), y:RN_MINY+(RN_MAXY-RN_MINY)*Math.random()};
    if(!rnInFelt(p)) continue; if(all.some(q=>Math.hypot(p.x-q.x,p.y-q.y)<6.2)) continue; others.push(p); all.push(p); }
  let cue=null; g=0;
  while(!cue && g<4000){ g++; const p={x:RN_MINX+(RN_MAXX-RN_MINX)*Math.random(), y:RN_MINY+(RN_MAXY-RN_MINY)*Math.random()};
    if(rnInFelt(p) && all.every(q=>Math.hypot(p.x-q.x,p.y-q.y)>7)) cue=p; }
  if(!cue) cue={x:24,y:30};
  return {cue, balls:[...others, {x:RN_SPOT.x,y:RN_SPOT.y}], game:n, bih:true}; // BI CẦM TAY: engine đặt bi cái tối ưu cho hình bi mới (cue chỉ là dự phòng)
}
function genRack(n){ // sinh lại tới khi cue có ĐƯỜNG THOÁNG tới bi 1 (khớp ngưỡng traffic ~2.2 đv của engine) → thế mặc định không kẹt ngay cú 1
  let best=null;
  for(let a=0;a<14;a++){ const rk=genRackOnce(n), b0=rk.balls[0];
    const blocked=rk.balls.slice(1).some(q=>rnSegDist(q,rk.cue,b0)<2.2);
    if(!blocked) return rk; best=rk; }
  return best;
}
function rnForce(d){ return d<16?'nhẹ':(d<36?'vừa':'chắc'); }
function rnFollow(tip){ if(!tip) return ''; return tip.y<-0.28?'lê tới (đánh cao)':(tip.y>0.28?'rút về (đánh thấp)':'dừng bi (stun)'); }
function runoutGuide(layout){
  const seq=layout.balls, steps=[], cue0={x:layout.cue.x,y:layout.cue.y};
  for(let i=0;i<seq.length;i++){
    const obj=seq[i], nxt=seq[i+1]; let cuePos;
    if(i===0) cuePos=cue0;
    else { const pv=seq[i-1], dx=obj.x-pv.x, dy=obj.y-pv.y, dl=Math.hypot(dx,dy)||1; cuePos={x:rnClamp(obj.x-dx/dl*9,RN_MINX,RN_MAXX), y:rnClamp(obj.y-dy/dl*9,RN_MINY,RN_MAXY)}; }
    const dObj=Math.hypot(obj.x-cuePos.x,obj.y-cuePos.y);
    let tip=null,path=null,zone=null,force;
    if(nxt){ tip=suggestTip(cuePos,obj,nxt); const cp=cuePath(cuePos,obj,tip,0.42); path=cp.pts;
      const zx=nxt.x-obj.x, zy=nxt.y-obj.y, zl=Math.hypot(zx,zy)||1; zone={x:rnClamp(nxt.x-zx/zl*11,RN_MINX-3,RN_MAXX+3), y:rnClamp(nxt.y-zy/zl*11,RN_MINY-3,RN_MAXY+3), r:8}; force=rnForce(dObj+zl*0.4); }
    else force=rnForce(dObj);
    steps.push({n:i+1,obj,cuePos,tip,path,zone,force,last:!nxt});
  }
  return steps;
}
const RN_K=80/2.54;                               // app-units / mét (bàn app FELT=[10,90,10,50])
const rnA2S=(p)=>[(p.x-10)/RN_K,(p.y-10)/RN_K];   // bàn app {x,y} → SI [x,y]
const rnS2A=(p)=>({x:10+p[0]*RN_K,y:10+p[1]*RN_K});// SI [x,y] → bàn app {x,y}
const RN_PK=['trên-trái','trên-phải','dưới-trái','dưới-phải','giữa-trên','giữa-dưới']; // theo thứ tự POCK engine
// steps[] do engine runoutRoute trả (toạ độ SI). Dựng dia theo toạ độ bàn app.
function rnDia(layout, steps, ov, altOpt){
  const overview=(ov===-1), noRoute=(ov==null || !steps || !steps.length || (ov>=0 && !steps[ov]));
  if(overview || noRoute){ // Tổng quan = cả bàn + mũi tên thứ tự; đang lập map / chưa tính = chỉ bi (giấu thứ tự)
    const cueP=(layout.bih && steps && steps[0] && steps[0].cue)?rnS2A(steps[0].cue):layout.cue; // BIH: bi cái ở chỗ engine đặt (steps[0].cue)
    const balls=[{x:cueP.x,y:cueP.y,cue:true}];
    layout.balls.forEach((b,i)=>{ const n=i+1; balls.push(n<=8?{x:b.x,y:b.y,num:n,solid:POOL[n]}:{x:b.x,y:b.y,num:n,stripe:POOL[n]}); });
    const dia={balls};
    if(overview){ const ar=[]; for(let i=0;i<layout.balls.length-1;i++){ const a=layout.balls[i],b=layout.balls[i+1]; ar.push([a.x,a.y,b.x,b.y]); } dia.arrows=ar; }
    return dia;
  }
  const s0=steps[ov], s=altOpt?{...s0,path:altOpt.path,bx:altOpt.bx,by:altOpt.by,landing:altOpt.landing,rails:altOpt.rails}:s0; // phương án điều bi đang chọn ghi đè path/english/leave
  const cueA=rnS2A(s.cue), tb=rnS2A(s.ballPos);                     // bi mục tiêu Ở VỊ TRÍ CỦA CÚ NÀY (có thể đã dời do combo)
  const balls=[{x:cueA.x,y:cueA.y,cue:true}];                       // bi cái ở VỊ TRÍ CHUỖI của cú này (req: cue theo từng cú)
  (s.remain||[]).forEach(b=>{ const n=b.n, pa=rnS2A(b.p); balls.push(n<=8?{x:pa.x,y:pa.y,num:n,solid:POOL[n]}:{x:pa.x,y:pa.y,num:n,stripe:POOL[n]}); }); // bi CÒN trên bàn của cú này (engine tự mang, đúng cả khi combo đảo thứ tự)
  const dia={balls, targetHi:[tb.x,tb.y]};
  if(!s.potFail){
    dia.line=[cueA.x,cueA.y,tb.x,tb.y];                             // ngắm cue→bi mục tiêu
    if(s.path&&s.path.length>1) dia.path=s.path.map(rnS2A);         // đường bi cái thật (engine)
    if(s.isCombo){ const pkA=rnS2A(s.pocket);
      if(s.comboMode==='combo' && s.comboB){ const Bp=rnS2A(s.comboB); dia.comboLine=[tb.x,tb.y,Bp.x,Bp.y]; dia.potLine=[Bp.x,Bp.y,pkA.x,pkA.y]; dia.pocketHi=[pkA.x,pkA.y]; dia.comboHi=[Bp.x,Bp.y]; } // COMBO dọn chắn: bi mục tiêu → bi B → lỗ (ăn B)
      else if(s.caromX){ const Xp=rnS2A(s.caromX), Bp=rnS2A(s.comboB); dia.comboLine=[tb.x,tb.y,Xp.x,Xp.y]; dia.potLine=[Xp.x,Xp.y,pkA.x,pkA.y]; dia.pocketHi=[pkA.x,pkA.y]; dia.comboHi=[Bp.x,Bp.y]; } // GÃI (carom): bi mục tiêu → điểm gãi (chạm B) → lỗ
    }
    else if(s.pocket){ const pkA=rnS2A(s.pocket); dia.potLine=[tb.x,tb.y,pkA.x,pkA.y]; dia.pocketHi=[pkA.x,pkA.y]; } // bi mục tiêu → lỗ nào
    if(!s.last && s.landing){ const L=rnS2A(s.landing); dia.zone=[L.x,L.y,2.0]; } // điểm bi cái dừng = cue cú kế (phương án chính)
    if(!s.last && s.leaveAlts && s.leaveAlts.length) dia.leaveZones=s.leaveAlts.map(rnS2A); // 2-3 PHƯƠNG ÁN: các VÙNG ĐỂ BI khác cho bi kế (tuỳ chọn)
  }
  return dia;
}
function TipFace({tip,size}){
  const S=size||34, Rr=13,cx=16,cy=16,k=Rr, bx=tip?tip.x:0, by=tip?tip.y:0; // k=Rr: đầu cơ vẽ ĐÚNG vị trí thật trên mặt bi (offset = tip×bán kính); ±0.5 = nửa bán kính (max trước khi trượt cơ). Trước dùng 0.7·Rr → hiện quá gần tâm.
  return (<svg viewBox="0 0 32 32" width={S} height={S} style={{flex:'none'}}>
    <circle cx={cx} cy={cy} r={Rr} fill="#f4f1e6" stroke="#b9b3a2" strokeWidth="1"/>
    <line x1={cx} y1={cy-Rr} x2={cx} y2={cy+Rr} stroke="#d9d3c4" strokeWidth=".7"/>
    <line x1={cx-Rr} y1={cy} x2={cx+Rr} y2={cy} stroke="#d9d3c4" strokeWidth=".7"/>
    <circle cx={cx+bx*k} cy={cy+by*k} r="3.4" fill="#e0556b" stroke="#fff" strokeWidth="1.1"/>
  </svg>);
}
function CoachTable({dia,photo,onClick,cls}){
  return (<svg className={cls||'mtable'} viewBox="0 0 100 60" role="img" aria-label="Bàn bi-a" onClick={onClick} style={{cursor:onClick?'crosshair':'default'}}>
    <defs><marker id="rnAh" markerUnits="userSpaceOnUse" markerWidth="7" markerHeight="7" refX="4.6" refY="2.6" orient="auto"><path d="M0,0 L5.2,2.6 L0,5.2 Z" fill="#ffd166"/></marker></defs>
    <TableFrame/>
    {photo && <image href={photo} x="10" y="10" width="80" height="40" preserveAspectRatio="xMidYMid slice" opacity="0.72"/>}
    {dia.line && <line x1={dia.line[0]} y1={dia.line[1]} x2={dia.line[2]} y2={dia.line[3]} stroke="#fff" strokeOpacity=".55" strokeWidth=".45" strokeDasharray="1.4 1.4"/>}
    {(dia.arrows||[]).map((a,i)=><line key={'a'+i} x1={a[0]} y1={a[1]} x2={a[2]} y2={a[3]} stroke="#ffd166" strokeWidth=".7" strokeOpacity=".85" markerEnd="url(#rnAh)"/>)}
    {dia.comboLine && <line x1={dia.comboLine[0]} y1={dia.comboLine[1]} x2={dia.comboLine[2]} y2={dia.comboLine[3]} stroke="#ff9a3c" strokeWidth=".8" strokeOpacity=".95" strokeDasharray="1.6 1.1"/>}
    {dia.comboHi && <circle cx={dia.comboHi[0]} cy={dia.comboHi[1]} r="1.7" fill="none" stroke="#ff9a3c" strokeWidth=".9"/>}
    {dia.potLine && <line x1={dia.potLine[0]} y1={dia.potLine[1]} x2={dia.potLine[2]} y2={dia.potLine[3]} stroke="#ffd166" strokeWidth=".7" strokeOpacity=".9" strokeDasharray="1.4 1.2" markerEnd="url(#rnAh)"/>}
    {dia.pocketHi && <circle cx={dia.pocketHi[0]} cy={dia.pocketHi[1]} r="3.4" fill="none" stroke="#ffd166" strokeWidth="1.1"/>}
    {dia.path&&dia.path.length>1 && <polyline points={dia.path.map(p=>p.x+','+p.y).join(' ')} fill="none" stroke="#5fb6ff" strokeWidth=".95" strokeLinejoin="round" strokeLinecap="round"/>}
    {dia.zone && <circle cx={dia.zone[0]} cy={dia.zone[1]} r={dia.zone[2]} fill="rgba(95,182,255,.16)" stroke="#5fb6ff" strokeWidth=".7" strokeDasharray="1.6 1.2"/>}
    {(dia.leaveZones||[]).map((z,i)=><g key={'lz'+i}><circle cx={z.x} cy={z.y} r="1.9" fill="rgba(120,200,120,.12)" stroke="#7ec97e" strokeOpacity=".85" strokeWidth=".6" strokeDasharray="1.3 1.1"/><text x={z.x} y={z.y+0.85} textAnchor="middle" fontSize="2.3" fill="#7ec97e" fontWeight="700">{i+2}</text></g>)}
    {dia.targetHi && <circle cx={dia.targetHi[0]} cy={dia.targetHi[1]} r="1.7" fill="none" stroke="#fff" strokeOpacity=".9" strokeWidth=".7"/>}
    {dia.balls.map((b,i)=><Ball key={'b'+i} x={b.x} y={b.y} r={b.r||1.1} b={b}/>)}
  </svg>);
}
function RunoutCoach(){
  const [layout,setLayout]=useState(()=>genRack(9));
  const [mode,setMode]=useState('guide');
  const [shot,setShot]=useState(0);
  const [altSel,setAltSel]=useState(0);   // phương án điều bi đang xem (0=chính)
  const [altShot,setAltShot]=useState(null); // BẤM-MỚI-TÍNH: cú đầy đủ tới vùng để bi phụ {forShot,zi,bx,by,speed,path,landing}
  const [edit,setEdit]=useState(false);
  const [pcue,setPcue]=useState(null);
  const [pballs,setPballs]=useState([]);
  const [photo,setPhoto]=useState(null);
  const [phase,setPhase]=useState('plan');
  const [t0,setT0]=useState(0);
  const [planMs,setPlanMs]=useState(0);
  const [stat,setStat]=usePersist('nc.readtable',{log:[]});
  const [steps,setSteps]=useState([]);   // do engine runoutRoute (Web Worker) tính — toạ độ SI
  const [full,setFull]=useState(false);  // bàn fullscreen
  const {solve,busy}=useSolver();
  const [altBusy,setAltBusy]=useState(false);   // bấm-mới-tính dùng CHUNG worker chính (route đã xong khi bấm)
  const fileRef=useRef(null);
  useEffect(()=>{ setAltSel(0); setAltShot(null); },[shot,steps]);   // đổi cú → về phương án chính
  useEffect(()=>{ const layoutSI={cue:rnA2S(layout.cue), balls:layout.balls.map(rnA2S), bih:!!layout.bih}; // đổi thế bi → giải lại lộ trình (né mọi bi, nối chuỗi cue); bih → engine tự đặt bi cái tối ưu
    solve({type:'runout', layout:layoutSI, felt:[0,2.54,0,1.27]}, (res)=>setSteps(Array.isArray(res)?res.map(s=>{ let o=(typeof s.bx==='number')?{...s,bx:-s.bx}:s; if(o.alts)o={...o,alts:o.alts.map(a=>(typeof a.bx==='number'?{...a,bx:-a.bx}:a))}; return o; }):[])); },[layout]); // ĐỔI english trái↔phải khi hiển thị (theo yêu cầu chủ); path vẫn là physics gốc
  const newRack=(n)=>{ setEdit(false); setPhoto(null); setLayout(genRack(n)); setShot(0); if(mode==='quiz'){ setPhase('plan'); setT0(Date.now()); } };
  const startEdit=()=>{ setPhoto(null); setPcue(null); setPballs([]); setEdit(true); };
  const onFile=(e)=>{ const f=e.target.files&&e.target.files[0]; if(!f) return; const rd=new FileReader(); rd.onload=()=>{ setPhoto(rd.result); setPcue(null); setPballs([]); setEdit(true); }; rd.readAsDataURL(f); e.target.value=''; };
  const svgXY=(e)=>{ const s=e.currentTarget, r=s.getBoundingClientRect(); return {x:(e.clientX-r.left)/r.width*100, y:(e.clientY-r.top)/r.height*60}; };
  const onPlace=(e)=>{ const p=svgXY(e);
    if(pcue && Math.hypot(pcue.x-p.x,pcue.y-p.y)<3.2){ setPcue(null); return; }
    const bi=pballs.findIndex(b=>Math.hypot(b.x-p.x,b.y-p.y)<3.2);
    if(bi>=0){ setPballs(pballs.filter((_,i)=>i!==bi)); return; }
    if(!rnInFelt(p)) return;
    if(!pcue){ setPcue(p); return; }
    if(pballs.length>=10) return;
    setPballs([...pballs,p]);
  };
  const finishEdit=()=>{ if(!(pcue&&pballs.length>=2)) return; setLayout({cue:pcue,balls:pballs,game:pballs.length}); setEdit(false); setShot(0); if(mode==='quiz'){ setPhase('plan'); setT0(Date.now()); } };
  const startQuiz=()=>{ setMode('quiz'); setPhase('plan'); setT0(Date.now()); setShot(0); };
  const reveal=()=>{ setPlanMs(Date.now()-t0); setPhase('reveal'); };
  const score=(ok)=>{ const log=[{ms:planMs,ok},...(stat.log||[])].slice(0,40); setStat({log}); newRack(layout.game); };
  const editDia={balls:[]};
  if(pcue) editDia.balls.push({x:pcue.x,y:pcue.y,cue:true});
  pballs.forEach((b,i)=>{ const n=i+1; editDia.balls.push(n<=8?{x:b.x,y:b.y,num:n,solid:POOL[n]}:{x:b.x,y:b.y,num:n,stripe:POOL[n]}); });
  const planning=(mode==='quiz'&&phase==='plan');
  const curStep=(shot>=0&&steps[shot])?steps[shot]:null;                    // BẤM-MỚI-TÍNH: phương án phụ (vùng ②③) → tính đường bi đầy đủ khi chạm
  const nZones=(curStep&&curStep.leaveAlts&&!curStep.last&&!curStep.isCombo)?curStep.leaveAlts.length:0;
  const curAlt=(altShot&&altShot.forShot===shot&&!altShot.potFail)?altShot:null; // cú phụ ĐÃ tính
  const dispStep=curAlt?{...curStep,bx:curAlt.bx,by:curAlt.by,speed:curAlt.speed,rails:curAlt.rails}:curStep;
  const computeAlt=(zi)=>{ if(!curStep||!curStep.leaveAlts||!curStep.leaveAlts[zi]||altBusy)return; // BẤM-MỚI-TÍNH: worker TẠO MỚI mỗi lần (đáng tin, tự huỷ)
    const others=(curStep.remain||[]).filter(b=>b.n!==curStep.n).map(b=>b.p), sh=shot; setAltBusy(true);
    let w; try{ w=new Worker(URL.createObjectURL(new Blob([document.getElementById('dieubi-engine').textContent],{type:'application/javascript'}))); }catch(e){ setAltBusy(false); return; }
    const done=(res)=>{ setAltBusy(false); setAltShot((res&&!res.potFail)?{forShot:sh,zi,bx:-res.bx,by:res.by,speed:res.speed,path:res.path,landing:res.landing,rails:res.rails}:{forShot:sh,zi,potFail:true}); try{w.terminate();}catch(e){} };
    w.onmessage=(e)=>done(e.data.res); w.onerror=()=>done({potFail:true});
    w.postMessage({type:'altshot',cue:curStep.cue,ball:curStep.ballPos,pocket:curStep.pocket,leave:curStep.leaveAlts[zi],others,felt:[0,2.54,0,1.27],gen:1});
    setTimeout(()=>{ setAltBusy(b=>{ if(b){try{w.terminate();}catch(e){}} return false; }); },12000); }; // an toàn: quá 12s thì thôi
  const mainDia=rnDia(layout, steps, planning?null:shot, curAlt);
  const dbgPos=()=>{ const cueSI=(layout.bih&&steps[0]&&steps[0].cue)?steps[0].cue:rnA2S(layout.cue); const ballsSI=layout.balls.map(rnA2S); const cs=steps[shot<0?0:shot]; return 'cue='+JSON.stringify(cueSI.map(x=>+x.toFixed(3)))+' balls='+JSON.stringify(ballsSI.map(b=>b.map(x=>+x.toFixed(3))))+(cs&&!cs.potFail?(' | cú'+cs.n+' lỗ'+cs.pk+' bx='+(cs.bx||0).toFixed(2)+' by='+(cs.by||0).toFixed(2)+' sp='+(cs.speed||0).toFixed(2)):''); }; // DEBUG: copy toạ độ SI để báo lỗi chính xác
  const log=stat.log||[];
  const avgMs=log.length? log.reduce((s,x)=>s+x.ms,0)/log.length : 0;
  const okRate=log.length? Math.round(log.filter(x=>x.ok).length/log.length*100) : 0;
  const StepList=()=> (
    <div>
      {steps.map((s,i)=>(
        <div key={i} className={'card rnstep'+(i===shot?' on':'')} onClick={()=>!s.potFail&&setShot(i)}>
          <div className="rnnum">{s.n}</div>
          {s.potFail
            ? <div style={{flex:1,minWidth:0,fontSize:'0.8125rem',lineHeight:1.4,color:'var(--danger)'}}><b>Kẹt ở bi {s.n}</b> — {s.reason}. Cần đánh safety / phá thế trước.</div>
            : <>
                {s.isCombo ? <TipFace tip={{x:s.bx,y:-s.by}}/> : <TipFace tip={s.last?null:{x:s.bx,y:-s.by}}/>}
                <div style={{flex:1,minWidth:0,fontSize:'0.8125rem',lineHeight:1.4}}>
                  {s.isCombo
                    ? <><b>🎯 Bi {s.n} {s.comboMode==='combo'?'combo bi '+s.comboBn:'gãi bi '+s.comboBn} → lỗ {RN_PK[s.pk]}</b> · đầu cơ {tipLabel({x:s.bx,y:-s.by})}<br/><span className="muted">{s.comboMode==='combo'?'kẹt → đẩy bi '+s.comboBn+' vào lỗ (dọn chắn), bi '+s.n+' bắn tiếp':'kẹt → gãi (carom) ăn bi '+s.n} · lực {s.speed<2.3?'vừa':'chắc'}</span></>
                    : s.last
                    ? <b>Bi {s.n} (cuối) → lỗ {RN_PK[s.pk]}. Bắn vào là xong ván.</b>
                    : <><b>Bi {s.n} → lỗ {RN_PK[s.pk]}</b> · đầu cơ {tipLabel({x:s.bx,y:-s.by})}<br/><span className="muted">lực {s.speed<1.3?'nhẹ':s.speed<2.3?'vừa':'chắc'}{s.rails>0?' · '+s.rails+' băng':''} · ra bi cho bi {s.n+1}</span></>}
                </div>
              </>}
        </div>))}
    </div>
  );
  const boardEl=(dia)=>(<div className="rnboardwrap"><CoachTable dia={dia} photo={photo} cls="rnboard"/>{busy&&<div className="dbspin-wrap"><div className="ncspin"/></div>}<button className="rnfull" onClick={()=>setFull(true)} title="Toàn màn hình">⛶</button></div>);
  const clr=steps.filter(s=>!s.potFail).length, stuck=steps.some(s=>s.potFail);
  return (
    <div style={{display:'flex',flexDirection:'column',flex:1}}>
      <div className="h">Hướng dẫn run-out</div>
      <div className="tsub">Tự tạo thế 9/10-bi hoặc tự đặt bi → app tính <b>thứ tự dọn bàn</b>, mỗi viên vào <b>lỗ nào</b>, <b>đầu cơ · lực</b> và <b>đường bi cái</b> (né mọi bi, nối vị trí sang cú sau) — như mục Điều bi.</div>
      <div className="presets" style={{justifyContent:'flex-start'}}>
        <button className="chip" onClick={()=>newRack(9)}>🎲 9-bi</button>
        <button className="chip" onClick={()=>newRack(10)}>🎲 10-bi</button>
        <button className="chip" onClick={startEdit}>✍️ Tự đặt</button>
        <button className="chip" onClick={()=>fileRef.current&&fileRef.current.click()}>📷 Từ ảnh</button>
        <input ref={fileRef} type="file" accept="image/*" style={{display:'none'}} onChange={onFile}/>
      </div>
      {edit
        ? <div className="card" style={{padding:12,marginTop:8}}>
            <div className="tsub" style={{marginTop:0}}>Chạm bàn để đặt <b>bi cái</b> trước, rồi lần lượt <b>bi 1 → N</b>. Chạm vào bi để xoá.{photo?' (đang có ảnh nền)':''}</div>
            <CoachTable dia={editDia} photo={photo} onClick={onPlace}/>
            <div className="presets" style={{justifyContent:'flex-start',marginTop:8}}>
              <button className="btn acc sm" onClick={finishEdit}>✅ Dùng thế này</button>
              <button className="chip" onClick={()=>{setPcue(null);setPballs([]);}}>Xoá hết</button>
              <button className="chip" onClick={()=>{setEdit(false);setPhoto(null);}}>Huỷ</button>
            </div>
            <div className="muted small" style={{marginTop:4}}>Đã đặt: {pcue?'bi cái':'chưa có bi cái'} · {pballs.length} bi {pballs.length<2?'(cần ≥2)':''}</div>
          </div>
        : <>
            <div className="presets" style={{justifyContent:'flex-start',marginTop:2}}>
              <button className={'chip'+(mode==='guide'?' on':'')} onClick={()=>setMode('guide')}>📖 Hướng dẫn</button>
              <button className={'chip'+(mode==='quiz'?' on':'')} onClick={startQuiz}>🎯 Luyện</button>
            </div>
            {planning
              ? <>
                  {boardEl(mainDia)}
                  <div className="tsub">Nhìn thế bi, lập bản đồ dọn cả bàn trong đầu (thứ tự + đầu cơ từng viên). Xong thì bấm.</div>
                  <button className="btn acc wide" style={{marginTop:6}} onClick={reveal}>✅ Đã có bản đồ</button>
                </>
              : <>
                  {mode==='quiz' &&
                    <div className="statstrip" style={{marginTop:6}}>
                      <div className="stat"><b style={{color:'var(--gold)'}}>{(planMs/1000).toFixed(1)}s</b><small>lập map lần này</small></div>
                      {log.length>0 && <div className="stat"><b>{(avgMs/1000).toFixed(1)}s</b><small>TB {log.length} lần</small></div>}
                      {log.length>0 && <div className="stat"><b>{okRate}%</b><small>khớp</small></div>}
                    </div>}
                  {boardEl(mainDia)}
                  <div className="presets" style={{justifyContent:'flex-start',marginTop:6}}>
                    <button className={'chip'+(shot===-1?' on':'')} onClick={()=>setShot(-1)}>🗺️ Tổng quan</button>
                    <button className="chip" onClick={()=>setShot(Math.max(0,shot-1))}>‹ Cú trước</button>
                    <button className="chip" onClick={()=>setShot(Math.min(steps.length-1,(shot<0?0:shot)+1))}>Cú sau ›</button>
                    <button className="chip" title="Copy toạ độ để báo lỗi" onClick={(e)=>{const t=e.currentTarget,o=t.textContent;try{navigator.clipboard.writeText(dbgPos());t.textContent='✓ Đã copy';}catch(err){t.textContent='(lỗi copy)';}setTimeout(()=>{t.textContent=o;},1500);}}>📋 Copy vị trí</button>
                  </div>
                  {false && nZones>0 && computeAlt && <span/>}{/* bấm-mới-tính tạm ẩn (đang chỉnh độ tin cậy worker); vùng để bi ②③ vẫn hiện trên bàn */}
                  {shot>=0 && steps[shot] && !steps[shot].potFail && dispStep &&
                    <div className="card rncur">
                      {!dispStep.last && <TipFace tip={{x:dispStep.bx,y:-dispStep.by}} size={78}/>}
                      {dispStep.last && dispStep.isCombo && <TipFace tip={{x:dispStep.bx,y:-dispStep.by}} size={78}/>}
                      <div className="rncurinfo">
                        <div className="rncurhead"><span className="rnnum">{dispStep.n}</span><b>{dispStep.isCombo?('🎯 Bi '+dispStep.n+(dispStep.comboMode==='combo'?' combo bi ':' gãi bi ')+dispStep.comboBn+' → lỗ '+RN_PK[dispStep.pk]):('Bi '+dispStep.n+' → lỗ '+RN_PK[dispStep.pk])}</b></div>
                        {dispStep.isCombo
                          ? (dispStep.comboMode==='combo'
                            ? <div style={{marginTop:3}}><b>Combo dọn chắn</b>: bi {dispStep.comboBn} đang cản — đánh bi {dispStep.n} đẩy bi {dispStep.comboBn} vào lỗ {RN_PK[dispStep.pk]} · đầu cơ <b>{tipLabel({x:dispStep.bx,y:-dispStep.by})}</b> · lực {dispStep.speed<2.3?'vừa':'chắc'}<br/><span className="muted">hợp lệ (chạm bi {dispStep.n} trước) · dọn xong bi {dispStep.n} thông → bắn tiếp</span></div>
                            : <div style={{marginTop:3}}><b>Gãi bi (carom)</b>: bi {dispStep.n} gãi vào bi {dispStep.comboBn} rồi lăn vào lỗ {RN_PK[dispStep.pk]} · đầu cơ <b>{tipLabel({x:dispStep.bx,y:-dispStep.by})}</b> · lực {dispStep.speed<2.3?'vừa':'chắc'}<br/><span className="muted">bi {dispStep.n} kẹt (không lỗ trực tiếp) → gãi để ăn{dispStep.last?'':' + ra bi cho bi kế'}</span></div>)
                          : dispStep.last
                          ? <div className="muted" style={{marginTop:3}}>Bi cuối — bắn vào là xong ván.</div>
                          : <div style={{marginTop:3}}>đầu cơ <b>{tipLabel({x:dispStep.bx,y:-dispStep.by})}</b> · lực {dispStep.speed<1.3?'nhẹ':dispStep.speed<2.3?'vừa':'chắc'}{dispStep.rails>0?' · '+dispStep.rails+' băng':''}<br/><span className="muted">ra bi cho bi {dispStep.n+1}{dispStep.leaveAlts&&dispStep.leaveAlts.length?(' · '+(dispStep.leaveAlts.length+1)+' cách điều — vùng xanh ②'+(dispStep.leaveAlts.length>1?'③':'')+' là chỗ để bi khác'):''}</span></div>}
                      </div>
                    </div>}
                  <div className="muted small" style={{marginTop:6}}>{busy?'⏳ Đang tính lộ trình (né mọi bi)…':(stuck?('⚠ Lộ trình dừng ở cú '+(clr+1)+' — kẹt, cần safety'):('✓ Lộ trình sạch '+clr+' bi'))}</div>
                  <div className="tsub" style={{marginTop:4}}>{mode==='quiz'?'Đối chiếu với bản đồ của bạn — chạm từng cú để xem trên bàn:':'Chạm từng cú để xem đường bi trên bàn:'}</div>
                  <StepList/>
                  {mode==='quiz' &&
                    <div className="presets" style={{justifyContent:'flex-start',marginTop:8}}>
                      <button className="btn acc sm" onClick={()=>score(true)}>👍 Khớp</button>
                      <button className="chip" onClick={()=>score(false)}>👎 Chưa khớp</button>
                      <button className="chip" onClick={()=>newRack(layout.game)}>Thế khác →</button>
                    </div>}
                </>}
          </>}
      {full && <div className="rnfullov" onClick={()=>setFull(false)}>
        {shot>=0 && steps[shot] && !steps[shot].potFail && !steps[shot].last && !steps[shot].isCombo &&
          <div className="rntipfs" onClick={e=>e.stopPropagation()}>
            <TipFace tip={{x:steps[shot].bx,y:-steps[shot].by}} size={186}/>
            <div className="rntiplbl">Bi {steps[shot].n} → lỗ {RN_PK[steps[shot].pk]}<br/>đầu cơ {tipLabel({x:steps[shot].bx,y:-steps[shot].by})}<br/><small>lực {steps[shot].speed<1.3?'nhẹ':steps[shot].speed<2.3?'vừa':'chắc'}{steps[shot].rails>0?' · '+steps[shot].rails+' băng':''}</small></div>
          </div>}
        {shot>=0 && steps[shot] && steps[shot].isCombo &&
          <div className="rntipfs" onClick={e=>e.stopPropagation()}>
            <TipFace tip={{x:steps[shot].bx,y:-steps[shot].by}} size={186}/>
            <div className="rntiplbl">🎯 {steps[shot].comboMode==='combo'?'Combo dọn chắn':'Gãi bi'}<br/>Bi {steps[shot].n} {steps[shot].comboMode==='combo'?'combo bi '+steps[shot].comboBn:'gãi bi '+steps[shot].comboBn} → lỗ {RN_PK[steps[shot].pk]}<br/>đầu cơ {tipLabel({x:steps[shot].bx,y:-steps[shot].by})}<br/><small>lực {steps[shot].speed<2.3?'vừa':'chắc'} · {steps[shot].comboMode==='combo'?'dọn chắn, bắn tiếp':'ăn bi kẹt'}</small></div>
          </div>}
        <div className="rnfullinner" onClick={e=>e.stopPropagation()}>
          <CoachTable dia={mainDia} photo={photo} cls="rnfulltable"/>
          <div className="presets" style={{justifyContent:'center',marginTop:8}}>
            <button className={'chip'+(shot===-1?' on':'')} onClick={()=>setShot(-1)}>🗺️ Tổng quan</button>
            <button className="chip" onClick={()=>setShot(Math.max(0,shot-1))}>‹ Trước</button>
            <button className="chip" onClick={()=>setShot(Math.min(steps.length-1,(shot<0?0:shot)+1))}>Sau ›</button>
            <button className="btn acc sm" onClick={()=>setFull(false)}>✕ Đóng</button>
          </div>
          {shot>=0 && steps[shot] && !steps[shot].potFail && <div className="tsub" style={{textAlign:'center',marginTop:6}}>Cú {steps[shot].n}: {steps[shot].last?('bi cuối → lỗ '+RN_PK[steps[shot].pk]):('lỗ '+RN_PK[steps[shot].pk]+' · đầu cơ '+tipLabel({x:steps[shot].bx,y:-steps[shot].by})+' · lực '+(steps[shot].speed<1.3?'nhẹ':steps[shot].speed<2.3?'vừa':'chắc'))}</div>}
        </div>
      </div>}
    </div>
  );
}
function Training(){
  const matches=store.get('nc.matches',[]);
  const [recs,setRecs]=useState(()=>store.get('nc.training',[]));     // {id,date,drill,score,max,note}
  const [ghost,setGhost]=useState(()=>store.get('nc.ghost',[]));      // {id,date,game,won}
  const [scoring,setScoring]=useState(null);
  const [cat,setCat]=useState('all');
  const [tseg,setTseg]=useState(orderedOpts('train')[0][0]);
  const [plans,setPlans]=useState(()=>store.get('nc.plans',[]));   // buổi tập tự thiết kế
  const [builder,setBuilder]=useState(null);                       // null | {} | bản ghi
  const [customDrills,setCustomDrills]=useState(()=>store.get('nc.customDrills',[]));
  const [hiddenD,setHiddenD]=useState(()=>store.get('nc.hiddenDrills',[]));
  const [hiddenP,setHiddenP]=useState(()=>store.get('nc.hiddenProblems',[]));
  const [weakHide,setWeakHide]=useState(()=>store.get('nc.weakHidden',[]));
  const [planHide,setPlanHide]=useState(()=>{ const ph=store.get('nc.planHidden',null); return (ph&&ph.date===todayStr())?ph.keys:[]; });
  const [planAdd,setPlanAdd]=useState(()=>{ const pa=store.get('nc.planAdd',null); return (pa&&pa.date===todayStr())?pa.keys:[]; });
  const [addPlanOpen,setAddPlanOpen]=useState(false);
  const togglePlanAdd=(k)=>{ const l=planAdd.includes(k)?planAdd.filter(x=>x!==k):[...planAdd,k]; setPlanAdd(l); store.set('nc.planAdd',{date:todayStr(),keys:l}); };
  const [customProblems,setCustomProblems]=useState(()=>store.get('nc.customProblems',[]));
  const [drillBuilder,setDrillBuilder]=useState(null);  // null | {} (mới) | bài (sửa)
  const [pbuilder,setPbuilder]=useState(null);
  const [lessonV,setLessonV]=useState(0);   // ép render khi sửa bài học (nc.matches)
  const addCustomProblem=(p)=>{ const exists=p.key&&customProblems.some(x=>x.key===p.key); const l=exists?customProblems.map(x=>x.key===p.key?p:x):[{...p,key:p.key||uid('cp')},...customProblems]; setCustomProblems(l); store.set('nc.customProblems',l); setPbuilder(null); };
  const clearGhost=()=>{ if(window.confirm('Xoá toàn bộ lịch sử đấu Ghost?')){ setGhost([]); store.set('nc.ghost',[]); } };
  const clearLesson=(id)=>{ const ms=store.get('nc.matches',[]).map(m=>m.id===id?{...m,note:''}:m); store.set('nc.matches',ms); setLessonV(v=>v+1); };
  const savePlans=(l)=>{ setPlans(l); store.set('nc.plans',l); };
  const upsertPlan=(p)=>{ savePlans(p.id? plans.map(x=>x.id===p.id?p:x) : [{...p,id:uid('pl')},...plans]); setBuilder(null); };
  const delPlan=(id)=>{ savePlans(plans.filter(x=>x.id!==id)); setBuilder(null); };
  const addCustomDrill=(d)=>{ const exists=customDrills.some(x=>x.key===d.key); const l=exists?customDrills.map(x=>x.key===d.key?d:x):[d,...customDrills]; setCustomDrills(l); store.set('nc.customDrills',l); setDrillBuilder(null); };
  const hideDrill=(k)=>{ if(customDrills.some(x=>x.key===k)){ const l=customDrills.filter(x=>x.key!==k); setCustomDrills(l); store.set('nc.customDrills',l); } else { const l=[...new Set([...hiddenD,k])]; setHiddenD(l); store.set('nc.hiddenDrills',l); } };
  const restoreDrills=()=>{ setHiddenD([]); store.set('nc.hiddenDrills',[]); };
  const hideProblem=(k)=>{ if(customProblems.some(x=>x.key===k)){ const l=customProblems.filter(x=>x.key!==k); setCustomProblems(l); store.set('nc.customProblems',l); } else { const l=[...new Set([...hiddenP,k])]; setHiddenP(l); store.set('nc.hiddenProblems',l); } };
  const restoreProblems=()=>{ setHiddenP([]); store.set('nc.hiddenProblems',[]); };
  const allProblems=[...customProblems,...PROBLEMS].filter(p=>!hiddenP.includes(p.key));
  const hideWeak=(m)=>{ const l=[...new Set([...weakHide,m])]; setWeakHide(l); store.set('nc.weakHidden',l); };
  const hidePlanItem=(k)=>{ const l=[...new Set([...planHide,k])]; setPlanHide(l); store.set('nc.planHidden',{date:todayStr(),keys:l}); };
  const allDrills=[...customDrills,...DRILLS].filter(d=>!hiddenD.includes(d.key));
  const drillOf=(k)=>allDrills.find(d=>d.key===k)||drillByKey(k);

  const addScore=(r)=>{ const l=[{...r,id:uid('t'),date:todayStr()},...recs]; setRecs(l); store.set('nc.training',l); setScoring(null); };
  const addGhost=(won)=>{ const l=[{id:uid('g'),date:todayStr(),won},...ghost]; setGhost(l); store.set('nc.ghost',l); };
  const recsFor=(k)=>recs.filter(r=>r.drill===k&&typeof r.score==='number');
  const doneToday=(k)=>recs.some(r=>r.drill===k&&r.date===todayStr());

  const scored=recs.filter(r=>typeof r.score==='number');
  const mc={}; matches.forEach(m=>entryMistakes(m,'mistakes').forEach(x=>mc[x]=(mc[x]||0)+1));
  store.get('nc.mistakes',[]).forEach(e=>entryMistakes(e,'tags').forEach(x=>mc[x]=(mc[x]||0)+1));
  const weak=Object.entries(mc).sort((a,b)=>b[1]-a[1]);
  const lessons=matches.filter(m=>m.note&&m.note.trim());

  // Điểm phong độ = trung bình % của 12 lượt chấm gần nhất
  const recent=scored.slice(0,12);
  const skill=recent.length? Math.round(recent.reduce((s,r)=>s+r.score/r.max,0)/recent.length*100):null;

  // Chuỗi ngày luyện liên tiếp (tính cả ghi điểm lẫn đấu ghost)
  const days=new Set([...recs.map(r=>r.date),...ghost.map(g=>g.date)]);
  const dk=(dt)=>dt.toISOString().slice(0,10);
  let streak=0, probe=new Date(dk(new Date()));
  if(!days.has(dk(probe))) probe.setDate(probe.getDate()-1);
  while(days.has(dk(probe))){ streak++; probe.setDate(probe.getDate()-1); }

  // ---- Kế hoạch TUẦN tự sinh theo điểm yếu (xoay vòng 7 ngày) ----
  const curWeek=isoMonday(new Date());
  const curWeekId=dk(curWeek);
  const [weekplan,setWeekplan]=useState(()=>{ const wp=store.get('nc.weekplan',null);
    if(wp&&wp.week===curWeekId&&Array.isArray(wp.days)&&wp.days.length===7) return wp;
    const np={week:curWeekId,...buildWeekPlan(weak)}; store.set('nc.weekplan',np); return np; });
  const [expDay,setExpDay]=useState(null);
  useEffect(()=>{ if(!weekplan||weekplan.week!==curWeekId){ const np={week:curWeekId,...buildWeekPlan(weak)}; setWeekplan(np); store.set('nc.weekplan',np); } },[curWeekId]);
  const regenWeek=()=>{ const np={week:curWeekId,...buildWeekPlan(weak)}; setWeekplan(np); store.set('nc.weekplan',np); setExpDay(null); };
  const todayIdx=(new Date().getDay()+6)%7;
  const dayDateStr=(i)=>{ const m=new Date(curWeek); m.setDate(m.getDate()+i); return dk(m); };
  const dayDone=(i)=>{ const day=weekplan.days[i]||{}; const dt=dayDateStr(i); const keys=day.keys||[];
    return recs.some(r=>r.date===dt&&keys.includes(r.drill)) || (day.ghost&&ghost.some(g=>g.date===dt)); };
  const weekDoneCount=weekplan.days.filter((_,i)=>dayDone(i)).length;
  const todayDay=weekplan.days[todayIdx]||weekplan.days[0];
  // Buổi hôm nay = đúng ngày tương ứng trong kế hoạch tuần
  const plan=(todayDay.keys||[]).map(k=>({d:drillOf(k),role:todayDay.sub})).filter(x=>x.d);

  const lib=cat==='all'? allDrills : allDrills.filter(d=>d.cat===cat);
  const g20=ghost.slice(0,20), gw=g20.filter(x=>x.won).length;
  const grate=g20.length? Math.round(gw/g20.length*100):null;

  // Biểu đồ tiến bộ: điểm từng lượt chấm + tỉ lệ thắng tích lũy theo trận
  const perfVals=[...scored].reverse().map(r=>Math.round(r.score/r.max*100));
  const mSorted=[...matches].sort((a,b)=>(a.date||'').localeCompare(b.date||'')||(a.id>b.id?1:-1));
  let cw=0,cl=0; const winVals=[];
  mSorted.forEach(m=>{ if(m.result==='W')cw++; else if(m.result==='L')cl++; if(cw+cl>0) winVals.push(Math.round(cw/(cw+cl)*100)); });

  return (
    <div style={{display:'flex',flexDirection:'column',flex:1}}>
      <Seg val={tseg} set={setTseg} opts={orderedOpts('train')}/>
      {tseg==='summary' && <SummaryView/>}
      {tseg==='runout' && <RunoutCoach/>}
      {tseg==='clock' && <ShotClock/>}
      {tseg==='metro' && <Metronome/>}
      {tseg==='drills' && <>
      <div className="h">Bài tập</div>
      <div className="tsub">Luyện có mục tiêu, chấm điểm và theo dõi tiến bộ — không chỉ "đánh cho vui".</div>

      {scored.length>0 &&
        <div className="statstrip">
          <div className="stat"><b style={{color:'var(--gold)'}}>{skill}</b><small>điểm phong độ /100</small></div>
          <div className="stat"><b>{streak}</b><small>ngày liên tiếp</small></div>
          <div className="stat"><b>{scored.length}</b><small>lượt đã chấm</small></div>
        </div>}

      {(perfVals.length>=2 || winVals.length>=2) && <>
        <div className="h2">📈 Tiến bộ</div>
        {perfVals.length>=2 &&
          <div className="card" style={{padding:'12px 14px',marginTop:8}}>
            <div className="chartcap"><span><b>Điểm phong độ</b> theo lượt chấm</span><span>hiện <b>{perfVals[perfVals.length-1]}</b>/100</span></div>
            <LineChart vals={perfVals}/>
          </div>}
        {winVals.length>=2 &&
          <div className="card" style={{padding:'12px 14px',marginTop:8}}>
            <div className="chartcap"><span><b>Tỉ lệ thắng</b> tích lũy</span><span>hiện <b>{winVals[winVals.length-1]}%</b></span></div>
            <LineChart vals={winVals} color="var(--gold)"/>
          </div>}
      </>}

      <div className="h2">📌 Ghi nhớ cách chơi đúng</div>
      <MyTips/>

      <div className="h2" style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
        <span>🗓️ Kế hoạch tuần</span>
        <button className="chip" onClick={regenWeek} title="Tạo lại theo điểm yếu mới nhất">🔁 Tạo lại</button>
      </div>
      <div className="tsub" style={{marginTop:2}}>Tự sinh theo điểm yếu (từ Nhật ký) · xoay vòng 7 ngày. Chạm một ngày để xem bài.</div>
      <div className="card" style={{padding:'12px 14px',marginTop:8}}>
        <div className="chartcap"><span><b>Tiến độ tuần</b></span><span>hoàn thành <b>{weekDoneCount}</b>/7 ngày</span></div>
        <div className="mbar" style={{marginTop:4}}><div style={{width:Math.round(weekDoneCount/7*100)+'%'}}/></div>
        <div style={{display:'flex',gap:4,marginTop:10}}>
          {weekplan.days.map((d,i)=>{ const done=dayDone(i); const isToday=i===todayIdx; const sel=expDay===i;
            return (
            <button key={i} onClick={()=>setExpDay(sel?null:i)} title={d.theme}
              style={{flex:1,minWidth:0,display:'flex',flexDirection:'column',alignItems:'center',gap:3,padding:'7px 2px',borderRadius:10,cursor:'pointer',
                border:'1.5px solid '+(isToday?'var(--gold)':sel?'var(--accent)':'var(--line)'),
                background:isToday?'var(--card2)':'transparent',color:'var(--text)'}}>
              <small style={{fontSize:'0.625rem',fontWeight:800,color:isToday?'var(--gold)':'var(--muted)'}}>{WEEK_DOW[i]}</small>
              <span style={{fontSize:'1rem',lineHeight:1}}>{done?'✅':d.icon}</span>
            </button>); })}
        </div>
      </div>
      {expDay!=null && expDay!==todayIdx && (()=>{ const d=weekplan.days[expDay]; if(!d) return null; return (
        <div className="card plan" style={{marginTop:8}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'baseline',gap:8,marginBottom:6}}>
            <b>{d.icon} {WEEK_DOW[expDay]} · {d.theme}</b>
            <small className="muted">{dayDone(expDay)?'đã tập ✅':d.sub}</small>
          </div>
          {(d.keys||[]).map(k=>{ const dr=drillOf(k); if(!dr) return null; return (
            <div key={k} className="planrow">
              <div className="pi">{dayDone(expDay)?'✅':'•'}</div>
              <div className="pt"><b>{dr.name}</b><small>mục tiêu {dr.target}</small></div>
              <button className="btn acc sm" onClick={()=>setScoring(dr)}>Ghi điểm</button>
            </div>); })}
          {d.ghost &&
            <div className="planrow">
              <div className="pi">👻</div>
              <div className="pt"><b>Đấu với Ghost</b><small>ván benchmark cuối tuần</small></div>
              <div style={{display:'flex',gap:6}}>
                <button className="btn acc sm" onClick={()=>addGhost(true)}>Thắng</button>
                <button className="btn ghost sm" onClick={()=>addGhost(false)}>Thua</button>
              </div>
            </div>}
        </div>); })()}

      <div className="h2">{todayDay.icon} Hôm nay · {todayDay.theme}</div>
      <div className="card plan">
        {plan.filter(({d})=>!planHide.includes(d.key)).map(({d,role},i)=>(
          <div key={d.key} className="planrow">
            <div className="pi">{doneToday(d.key)?'✅':i+1}</div>
            <div className="pt"><b>{d.name}</b><small>{role} · mục tiêu {d.target}</small></div>
            <button className="btn acc sm" onClick={()=>setScoring(d)}>{doneToday(d.key)?'Ghi lại':'Ghi điểm'}</button>
            <button className="xbtn" onClick={()=>hidePlanItem(d.key)} style={{marginLeft:2}}>✕</button>
          </div>
        ))}
        {planAdd.filter(k=>!plan.some(p=>p.d.key===k)).map(k=>{ const d=drillOf(k); if(!d) return null; return (
          <div key={k} className="planrow">
            <div className="pi">{doneToday(k)?'✅':'＋'}</div>
            <div className="pt"><b>{d.name}</b><small>bạn thêm · mục tiêu {d.target}</small></div>
            <button className="btn acc sm" onClick={()=>setScoring(d)}>{doneToday(k)?'Ghi lại':'Ghi điểm'}</button>
            <button className="xbtn" onClick={()=>togglePlanAdd(k)} style={{marginLeft:2}}>✕</button>
          </div>); })}
        <div className="planrow">
          <div className="pi">👻</div>
          <div className="pt"><b>Đấu với Ghost</b><small>Kết thúc bằng 1 ván benchmark với chính mình</small></div>
          <div style={{display:'flex',gap:6}}>
            <button className="btn acc sm" onClick={()=>addGhost(true)}>Thắng</button>
            <button className="btn ghost sm" onClick={()=>addGhost(false)}>Thua</button>
          </div>
        </div>
      </div>
      <button className="btn ghost wide" style={{marginTop:8}} onClick={()=>setAddPlanOpen(true)}>＋ Thêm bài vào hôm nay</button>

      <div className="h2">📋 Buổi tập của tôi</div>
      <div className="tsub" style={{marginTop:2}}>Tự lên lịch & thiết kế buổi tập riêng (cho hôm nay hoặc cho từng điểm yếu).</div>
      <button className="btn acc wide" style={{marginTop:8}} onClick={()=>setBuilder({})}>＋ Thiết kế buổi tập</button>
      {plans.length>0 &&
        <div className="list">
          {[...plans].sort((a,b)=>(b.date||'').localeCompare(a.date||'')).map(pl=>(
            <div key={pl.id} className="card" style={{padding:'12px 14px'}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:8}}>
                <div style={{minWidth:0}}><b>{pl.name}</b> <span className="muted small">{pl.date===todayStr()?'· hôm nay':(pl.date?'· '+fmtDate(pl.date):'')}</span></div>
                <div style={{display:'flex',gap:8,flex:'none'}}>
                  <button className="chip" onClick={()=>setBuilder(pl)}>✎</button>
                  <button className="xbtn" onClick={()=>delPlan(pl.id)}>✕</button>
                </div>
              </div>
              <div style={{marginTop:8,display:'flex',flexDirection:'column',gap:6}}>
                {(pl.drills||[]).map(k=>{ const d=drillOf(k); if(!d) return null; const rs=recsFor(k);
                  return (
                  <div key={k} className="planrow">
                    <div className="pi">{doneToday(k)?'✅':'•'}</div>
                    <div className="pt"><b>{d.name}</b><small>mục tiêu {d.target}{rs[0]?' · gần nhất '+rs[0].score+'/'+d.max:''}</small></div>
                    <button className="btn acc sm" onClick={()=>setScoring(d)}>{doneToday(k)?'Ghi lại':'Ghi điểm'}</button>
                  </div>); })}
              </div>
            </div>))}
        </div>}

      {weak.filter(([m])=>!weakHide.includes(m)).length>0 && <>
        <div className="h2">🎯 Điểm yếu cần sửa (từ Nhật ký)</div>
        <div className="list">
          {weak.filter(([m])=>!weakHide.includes(m)).map(([mis,c])=>{
            const d=DRILLS.find(x=>x.fixes.includes(mis));
            const rs=d? recsFor(d.key):[];
            const vals=rs.slice(0,8).reverse().map(r=>Math.round(r.score/r.max*100));
            return (
            <div key={mis} className="card drill">
              <div className="drow"><b className="warn">{mis}</b><span style={{display:'flex',alignItems:'center',gap:8}}><span className="muted small">mắc {c} lần</span><button className="xbtn" onClick={()=>hideWeak(mis)}>✕</button></span></div>
              {d && <>
                <div className="dt">{d.name}</div>
                <div className="drow2">
                  {rs[0] && <span className="okbadge">gần nhất {rs[0].score}/{d.max}</span>}
                  {vals.length>=2 && <Spark vals={vals}/>}
                  <button className="btn acc sm" style={{marginLeft:'auto'}} onClick={()=>setScoring(d)}>Tập &amp; ghi điểm</button>
                </div>
              </>}
            </div>);
          })}
        </div>
      </>}

      <div className="h2">📚 Thư viện bài tập</div>
      <div className="catbar">
        <button className={'chip'+(cat==='all'?' on':'')} onClick={()=>setCat('all')}>Tất cả</button>
        {Object.entries(DRILL_CATS).map(([k,v])=>
          <button key={k} className={'chip'+(cat===k?' on':'')} onClick={()=>setCat(k)}>{v.t}</button>)}
      </div>
      <div style={{display:'flex',gap:8,marginTop:8,flexWrap:'wrap'}}>
        <button className="btn acc sm" onClick={()=>setDrillBuilder({})}>＋ Tạo bài tập (tự vẽ bàn)</button>
      </div>
      <div className="list">
        {lib.map(d=><DrillCard key={d.key} d={d} recs={recsFor(d.key)} onScore={setScoring} onDelete={()=>hideDrill(d.key)} onEdit={d.custom?()=>setDrillBuilder(d):undefined}/>)}
      </div>

      <div className="h2">🧩 Thế khó thường gặp</div>
      <div className="tsub" style={{marginTop:2}}>Tình huống thực tế + cách xử lý. Chạm để mở.</div>
      <div style={{display:'flex',gap:8,marginTop:6,flexWrap:'wrap'}}>
        <button className="btn acc sm" onClick={()=>setPbuilder({})}>＋ Thêm thế khó (tự vẽ bàn)</button>
      </div>
      <div className="list">
        {allProblems.map(p=><ProblemCard key={p.key} p={p} onDelete={()=>hideProblem(p.key)} onEdit={p.custom?()=>setPbuilder(p):undefined}/>)}
      </div>

      <div className="h2">👻 Đấu với Ghost</div>
      <GhostSection ghost={ghost} setGhost={setGhost}/>

      <div style={{height:8}}/>
      </>}
      {scoring && <ScoreModal d={scoring} onSave={addScore} close={()=>setScoring(null)}/>}
      {builder && <SessionBuilder init={builder.id?builder:null} drills={allDrills}
        weakKeys={[...new Set(weak.flatMap(([m])=>DRILLS.filter(d=>d.fixes.includes(m)).map(d=>d.key)))]}
        onSave={upsertPlan} onDel={builder.id?()=>delPlan(builder.id):null} close={()=>setBuilder(null)}/>}
      {drillBuilder && <DrillBuilder init={drillBuilder.key?drillBuilder:null} onSave={addCustomDrill} close={()=>setDrillBuilder(null)}/>}
      {pbuilder && <ProblemBuilder init={pbuilder.key?pbuilder:null} onSave={addCustomProblem} close={()=>setPbuilder(null)}/>}
      {addPlanOpen && <div className="scrim" onClick={()=>setAddPlanOpen(false)}>
        <div className="sheet" onClick={e=>e.stopPropagation()}>
          <h3>Thêm bài vào hôm nay</h3>
          <div className="muted small" style={{margin:'-8px 0 8px'}}>Chạm bài để thêm/bỏ khỏi buổi tập hôm nay.</div>
          {Object.entries(DRILL_CATS).map(([ck,cv])=>{ const ds=allDrills.filter(d=>d.cat===ck); if(!ds.length) return null; return (
            <div key={ck} style={{marginBottom:6}}>
              <div className="small" style={{margin:'4px 0',color:cv.c,fontWeight:800}}>{cv.t}</div>
              <div className="presets" style={{justifyContent:'flex-start'}}>
                {ds.map(d=><button key={d.key} type="button" className={'chip'+(planAdd.includes(d.key)?' on':'')} onClick={()=>togglePlanAdd(d.key)}>{d.name}</button>)}
              </div>
            </div>); })}
          <button className="btn wide" style={{marginTop:8}} onClick={()=>setAddPlanOpen(false)}>Xong</button>
        </div>
      </div>}
    </div>
  );
}

/* ================= Tại bàn: shot clock + góc phản xạ ================= */
function AtTable(){
  const [seg,setSeg]=useState(()=>takePendingSeg('table', orderedOpts('table')[0][0]));
  const endLive=(keys,counts)=>{ _pendingLive={keys,counts}; NAV.go('log'); };
  return (
    <div style={{display:'flex',flexDirection:'column',flex:1}}>
      <Seg val={seg} set={setSeg} opts={orderedOpts('table')}/>
      {seg==='breathe' && <Breathe/>}
      {seg==='anchor' && <FocusAnchor/>}
      {seg==='cue' && <Cue/>}
      {seg==='live' && <LiveTally onEnd={endLive}/>}
      {seg==='positions' && <DieuBiSeg/>}
      {seg==='routine' && <Routine/>}
    </div>
  );
}
const PHASE_META=[
  {name:'Suy nghĩ', sub:'đọc bàn · chọn đầu cơ & lực', c:'var(--accent)'},
  {name:'Nhìn điểm chạm & vào bộ', sub:'ngắm đường cơ · tì tay vững', c:'var(--gold)'},
  {name:'Nhấp & bắn', sub:'đưa cơ thử · bắn dứt khoát', c:'var(--danger)'},
];
// Mặc định 30s; đọc số giây từng công đoạn từ nc.shotPhases (di sản: suy ra từ nc.shotTotal).
function loadShotDurs(){
  const d=store.get('nc.shotPhases',null);
  if(Array.isArray(d)&&d.length===3) return d.map(x=>Math.max(2,Math.round(x)));
  const t=store.get('nc.shotTotal',30);
  return [Math.max(8,t-10),5,5];
}
function shotPhases(durs){
  return PHASE_META.map((m,i)=>({...m, dur:Math.max(1,Math.round(durs[i]||0))}));
}
function ShotClock(){
  const [durs,setDurs]=useState(loadShotDurs);
  const [run,setRun]=useState(false);
  const ph=shotPhases(durs);
  const total=durs.reduce((s,x)=>s+x,0);
  const saveDurs=(d)=>{ setDurs(d); store.set('nc.shotPhases',d); store.set('nc.shotTotal',d.reduce((s,x)=>s+x,0)); };
  const step=(i,delta)=>{ const d=durs.slice(); d[i]=Math.max(2,Math.min(120,d[i]+delta)); saveDurs(d); };
  const preset=(t)=>saveDurs([Math.max(8,t-10),5,5]);
  return (
    <div style={{display:'flex',flexDirection:'column',gap:14,padding:'2px 0'}}>
      <div className="tsub" style={{textAlign:'center'}}>Luyện nhịp thi đấu: đếm ngược toàn màn hình, chia quy trình theo giây, rung + bíp khi chuyển bước.</div>
      <div className="presets" style={{justifyContent:'center'}}>
        {[30,45,60].map(t=><button key={t} className={'chip'+(total===t?' on':'')} onClick={()=>preset(t)}>{t}s</button>)}
      </div>
      <div className="card" style={{padding:'10px 14px 12px'}}>
        <div className="drow" style={{margin:'4px 0 8px'}}><b className="h" style={{margin:0}}>Phân bổ {total}s</b><span className="muted small">chỉnh từng bước bằng −/＋</span></div>
        {ph.map((p,i)=>(
          <div key={i} className="planrow" style={{alignItems:'center'}}>
            <div className="pi" style={{background:p.c,color:'#04231a',borderColor:p.c,width:'auto',minWidth:40,padding:'0 7px',fontSize:'0.8125rem'}}>{p.dur}s</div>
            <div className="pt" style={{flex:1}}><b>{p.name}</b><small>{p.sub}</small></div>
            <div style={{display:'flex',gap:6,flex:'none'}}>
              <button className="chip" style={{minWidth:34,fontSize:'1rem',padding:'6px 0'}} onClick={()=>step(i,-1)} aria-label={'Giảm '+p.name}>−</button>
              <button className="chip" style={{minWidth:34,fontSize:'1rem',padding:'6px 0'}} onClick={()=>step(i,1)} aria-label={'Tăng '+p.name}>＋</button>
            </div>
          </div>
        ))}
      </div>
      <button className="btn acc wide" onClick={()=>setRun(true)}>▶ Vào chế độ thi đấu (toàn màn hình)</button>
      {run && <ShotClockRun durs={durs} close={()=>setRun(false)}/>}
    </div>
  );
}
function ShotClockRun({durs,close}){
  const ph=shotPhases(durs);
  const total=ph.reduce((s,p)=>s+p.dur,0);
  const bounds=[]; let acc=0; ph.forEach(p=>{ bounds.push(acc+p.dur); acc+=p.dur; });
  const [elapsed,setElapsed]=useState(0);
  const [paused,setPaused]=useState(false);
  const ref=useRef(null), lastPhase=useRef(-1), fired=useRef(false);

  useEffect(()=>{ try{ const el=document.documentElement; if(el.requestFullscreen) el.requestFullscreen().catch(()=>{}); }catch(e){}
    beep(600,0.08,0.4);
    return ()=>{ try{ if(document.fullscreenElement&&document.exitFullscreen) document.exitFullscreen().catch(()=>{}); }catch(e){} };
  },[]);
  useEffect(()=>{
    if(paused){ clearInterval(ref.current); return; }
    ref.current=setInterval(()=>setElapsed(e=>Math.round((e+0.1)*10)/10),100);
    return ()=>clearInterval(ref.current);
  },[paused]);

  const done=elapsed>=total;
  const remaining=Math.max(0,total-elapsed);
  let curIdx=bounds.findIndex(b=>elapsed<b-1e-9); if(curIdx<0) curIdx=ph.length-1;
  useEffect(()=>{
    if(done){ if(!fired.current){ fired.current=true; buzz([300,80,300,80,500]); beep(440,0.2,0.5); setPaused(true);} return; }
    if(curIdx!==lastPhase.current){
      if(lastPhase.current>=0){ buzz(150); beep(curIdx===ph.length-1?780:560,0.11,0.45); }
      lastPhase.current=curIdx;
    }
  });
  const cur=ph[Math.min(curIdx,ph.length-1)];
  const danger=remaining<=5 && !done;
  const reset=()=>{ setElapsed(0); setPaused(false); fired.current=false; lastPhase.current=-1; beep(600,0.08,0.4); };

  return (
    <div className="scOverlay" style={{background:done?'#7a1414':'var(--bg)'}} onClick={()=>!done&&setPaused(p=>!p)}>
      <button className="scClose" onClick={(e)=>{e.stopPropagation();close();}} aria-label="Thoát">✕</button>
      {!done ? <>
        <div className="scStep">Bước {curIdx+1}/{ph.length}</div>
        <div className="scPhase" style={{color:cur.c}}>{cur.name}</div>
        <div className="scSub">{cur.sub}</div>
        <div className={'scNum'+(danger?' pulse':'')} style={{color:danger?'var(--danger)':'var(--text)'}}>{Math.ceil(remaining)}</div>
        <div className="scBar"><div style={{height:'100%',borderRadius:99,width:(remaining/total*100)+'%',background:cur.c,transition:'width .1s linear'}}/></div>
        <div className="scHint">{paused?'⏸ Tạm dừng — chạm để tiếp tục':'chạm bất kỳ đâu để tạm dừng'}</div>
      </> : <>
        <div className="scPhase" style={{color:'#fff'}}>HẾT GIỜ — BẮN!</div>
        <div className="scNum" style={{color:'#fff'}}>0</div>
        <button className="btn wide" style={{maxWidth:240,marginTop:10}} onClick={(e)=>{e.stopPropagation();reset();}}>↻ Lặp lại</button>
      </>}
    </div>
  );
}
function reflect(A,B,RX,POCK){
  const x0=RX[0],x1=RX[1],y0=RX[2],y1=RX[3];
  let p={x:A.x,y:A.y}; let dx=B.x-A.x, dy=B.y-A.y; const L=Math.hypot(dx,dy)||1; dx/=L; dy/=L;
  const pts=[{x:p.x,y:p.y}]; let bounces=0, made=false, budget=520;
  for(let it=0; it<14 && budget>0.1; it++){
    let tx=Infinity, ty=Infinity;
    if(dx>1e-6) tx=(x1-p.x)/dx; else if(dx<-1e-6) tx=(x0-p.x)/dx;
    if(dy>1e-6) ty=(y1-p.y)/dy; else if(dy<-1e-6) ty=(y0-p.y)/dy;
    let t=Math.min(tx,ty); if(!isFinite(t)||t<=1e-6) break; t=Math.min(t,budget);
    const np={x:p.x+dx*t,y:p.y+dy*t};
    let hit=null, hitU=Infinity;
    POCK.forEach(q=>{
      const sx=np.x-p.x, sy=np.y-p.y, s2=sx*sx+sy*sy||1;
      let u=((q[0]-p.x)*sx+(q[1]-p.y)*sy)/s2; u=Math.max(0,Math.min(1,u));
      const cxp=p.x+sx*u, cyp=p.y+sy*u; const dist=Math.hypot(q[0]-cxp,q[1]-cyp);
      if(dist<4 && u<hitU){ hit={x:cxp,y:cyp}; hitU=u; }
    });
    if(hit){ pts.push(hit); made=true; break; }
    pts.push(np); budget-=t; p=np;
    if(t===tx) { dx=-dx; bounces++; }
    if(t===ty) { dy=-dy; bounces++; }
  }
  return {pts,made,bounces};
}
function AngleCalc(){
  const [A,setA]=useState({x:24,y:38});
  const [B,setB]=useState({x:62,y:18});
  const drag=useRef(null), svgRef=useRef(null);
  const toSvg=(e)=>{
    const r=svgRef.current.getBoundingClientRect();
    const cx=e.touches?e.touches[0].clientX:e.clientX, cy=e.touches?e.touches[0].clientY:e.clientY;
    return {x:Math.max(FELT[0],Math.min(FELT[1],(cx-r.left)/r.width*100)),
            y:Math.max(FELT[2],Math.min(FELT[3],(cy-r.top)/r.height*60))};
  };
  const down=(e)=>{ const p=toSvg(e);
    drag.current = Math.hypot(p.x-A.x,p.y-A.y)<Math.hypot(p.x-B.x,p.y-B.y)?'A':'B';
    if(drag.current==='A') setA(p); else setB(p); };
  const move=(e)=>{ if(!drag.current) return; e.preventDefault(); const p=toSvg(e); if(drag.current==='A') setA(p); else setB(p); };
  const up=()=>{ drag.current=null; };
  const path=reflect(A,B,FELT,POCKETS);
  return (
    <div style={{display:'flex',flexDirection:'column',gap:12,padding:'2px 0'}}>
      <div className="tsub" style={{textAlign:'center'}}>Kéo <b style={{color:'var(--text)'}}>bi cái</b> (trắng) hoặc <b style={{color:'var(--gold)'}}>mốc hướng</b> — app vẽ đường bi nảy qua các băng (góc tới = góc phản).</div>
      <svg ref={svgRef} className="mtable" viewBox="0 0 100 60" preserveAspectRatio="xMidYMid meet"
        style={{width:'100%',maxWidth:'none',touchAction:'none'}}
        onMouseDown={down} onMouseMove={move} onMouseUp={up} onMouseLeave={up}
        onTouchStart={down} onTouchMove={move} onTouchEnd={up}>
        <defs><marker id="acAh" markerUnits="userSpaceOnUse" markerWidth="7" markerHeight="7" refX="4.6" refY="2.6" orient="auto"><path d="M0,0 L5.2,2.6 L0,5.2 Z" fill="#ffd166"/></marker></defs>
        <TableFrame/>
        <line x1={A.x} y1={A.y} x2={B.x} y2={B.y} stroke="#ffffff" strokeOpacity=".3" strokeWidth=".6" strokeDasharray="2 2"/>
        <polyline points={path.pts.map(p=>p.x+','+p.y).join(' ')} fill="none" stroke="#ffd166" strokeWidth="1.3" strokeLinejoin="round" markerEnd="url(#acAh)"/>
        {path.pts.slice(1,path.made?path.pts.length:-1).map((p,i)=><circle key={'k'+i} cx={p.x} cy={p.y} r="1.5" fill="#fff" opacity=".85"/>)}
        <circle cx={B.x} cy={B.y} r="3" fill="none" stroke="#f4c95d" strokeWidth="1.1" strokeDasharray="2 1.4"/>
        <circle cx={A.x} cy={A.y} r="3.6" fill="#f3f1e8" stroke="rgba(0,0,0,.4)" strokeWidth=".6"/>
      </svg>
      <div className="statline" style={{justifyContent:'center'}}>
        <span>Số băng: <b>{path.bounces}</b></span>
        {path.made && <span style={{color:'var(--ok)'}}>● Vào lỗ!</span>}
        <button className="chip" onClick={()=>{setA({x:24,y:38});setB({x:62,y:18});}}>↺ Đặt lại</button>
      </div>
    </div>
  );
}
function ProblemCard({p,onDelete,onEdit}){
  const [open,setOpen]=useState(false);
  return (
    <div className="card drillC">
      <div className="drillH" onClick={()=>setOpen(o=>!o)}>
        <span className="catpill" style={{border:'1px solid var(--warn)',color:'var(--warn)'}}>{p.tag}</span>
        <div className="dn"><b>{p.name}</b><small>{open?'thu gọn':'xem cách xử lý'}</small></div>
        <span className="muted" style={{fontSize:'1rem'}}>{open?'▾':'▸'}</span>
        {onEdit && <button className="chip" onClick={(e)=>{e.stopPropagation();onEdit();}} style={{marginLeft:6,flex:'none'}}>✎</button>}
        {onDelete && <button className="xbtn" onClick={(e)=>{e.stopPropagation();onDelete();}} style={{marginLeft:4}}>✕</button>}
      </div>
      {open &&
        <div className="drillB">
          {p.dia && <MiniTable dia={p.dia}/>}
          <div className="kv"><b>Tình huống:</b> {p.sit}</div>
          <div className="kv"><b>Cách xử lý:</b> {p.fix}</div>
        </div>}
    </div>
  );
}

/* ================= Kiến thức bi-a ================= */
const KNOWLEDGE=[
  {key:'tac_makeeasy', tag:'Chiến thuật', title:'Chơi cho bi-a tự dễ đi (bài dẫn nhập)',
    intro:'Bi-a "dễ" KHÔNG phải nhờ đánh cú khó giỏi hơn, mà nhờ TỰ TẠO cho mình toàn cú dễ. Người giỏi trông nhàn vì họ liên tục dọn đường cho "bản thân ở cú tiếp theo". Đây là triết lý gói cả mục Tư duy & chiến thuật: đừng cố đánh hay hơn — hãy để lại cho mình cú dễ hơn. Mỗi mục dưới đây là một bài riêng, đọc sâu ở đó.',
    body:[
      {h:'Triết lý gốc: để lại cú dễ, đừng cố cú khó', p:'Trận đấu là chuỗi từng-cú-một. Thắng đều đặn là người biến ván khó thành chuỗi cú đơn giản, không phải người xử được nhiều cú xuất thần. Trước mỗi cú, ngoài "vào bi", hãy hỏi: "cú này để lại cho mình cú sau DỄ hay KHÓ?" Câu hỏi đó đổi cả lối chơi.'},
      {h:'Để lại GÓC, đừng để bi thẳng', p:'Bi thẳng-lỗ nhìn dễ nhưng rất khó điều bi cái đi tiếp. Có một góc nhỏ thì bi cái tự chạy sang cú sau. Đây là cách "dễ hoá" số một: chủ động chừa góc. (Xem "Đọc bàn & chạy hình cả ván".)'},
      {h:'Đường bi cái NGẮN, ÍT băng', p:'Bi cái đi càng xa, càng nhiều băng thì sai số càng lớn. Ưu tiên đứng bi → theo nhẹ → rút ngắn; xoáy mạnh, nhiều băng là lựa chọn cuối. Đường ngắn = ít cơ hội sai. (Xem "Điều bi tối giản — ưu tiên đường ngắn, ít băng".)'},
      {h:'Nghĩ theo VÙNG, không theo điểm', p:'Đừng ép bi cái về đúng một chấm; chỉ cần về VÙNG còn đánh được cú sau. Vùng cho bạn biên độ sai an toàn — mỗi cú bớt căng ngay lập tức, và bạn ít khi rơi vào thế bí.'},
      {h:'Đọc bàn & dọn theo THỨ TỰ', p:'Sắp thứ tự dọn sao cho mỗi cú mở ra cú kế, cả chuỗi thông tới bi cuối — thay vì dọn 4 bi đầu rồi tự bí ở bi thứ 5. Lập "bản đồ" ván trước khi cúi xuống cú một. (Xem "Đọc bàn & chạy hình cả ván".)'},
      {h:'Xử lý bi khó & cụm SỚM', p:'Bi sát băng, bi kê, cụm bi — giải quyết lúc còn có bi cái thuận, đừng dồn về cuối ván khi hết lựa chọn. Xử bi vấn đề khi nó còn "dễ" là cách giữ cho phần còn lại của ván luôn dễ. (Xem "Bi khó: bi sát băng, bi kê, bi dính".)'},
      {h:'Lực NHỎ, kiểm soát cao', p:'50–70% lực là đủ cho hầu hết cú. Lực mạnh làm mất kiểm soát bi cái và siết tay. Bi-a lên trình là môn của lực nhỏ chính xác, không phải lực lớn — và lực nhỏ khiến cú nào cũng dễ điều hơn.'},
      {h:'Cú xác suất cao + an toàn nếu trượt', p:'Cú 70% mà trượt vẫn an toàn thường tốt hơn cú 90% mà trượt là tặng bàn. Luôn tính cả HẬU QUẢ khi hỏng, không chỉ khả năng vào. (Xem "Chơi theo xác suất" và "Khi nào tấn công, khi nào bỏ".)'},
      {h:'Không có cú dễ thì đánh safety', p:'Đừng ép cú khó khi bàn bí. Nhường lượt đúng cách ép đối thủ tự hỏng — và để phần khó cho họ. Safety là cách giữ cho MÌNH luôn được đánh cú dễ. (Xem "Safety / phòng thủ — khi nào & đánh thế nào".)'},
      {h:'Đơn giản hoá quyết định', p:'Ít lựa chọn cầu kỳ = ít mệt não = ít sai. Quyết xong 4 thứ khi còn ĐỨNG (lỗ · vùng bi cái · lực · đầu cơ), cúi xuống chỉ việc bắn. Câu gói lại: đừng cố đánh hay hơn — hãy để lại cho mình cú dễ hơn. (Xem "Đánh tiết kiệm năng lượng".)'},
    ]},
  {key:'percent', tag:'Chiến thuật', title:'Chơi theo xác suất (percentage play)',
    intro:'Người chơi giỏi không chọn cú "đẹp nhất" mà chọn cú cho mình cơ hội THẮNG VÁN cao nhất. Chơi theo xác suất = mỗi quyết định đều nghiêng phần thắng về phía mình qua nhiều ván, không phải ăn may một cú.',
    body:[
      {h:'Xác suất là gì trong bi-a', p:'Mỗi cú có hai con số: % vào lỗ và % giữ được thế tốt sau đó. "Chơi theo xác suất" là chọn phương án có TÍCH hai thứ đó cao nhất, xét trên NHIỀU ván — chứ không phải cú trông oách nhất hay liều một phát ăn ngay.'},
      {h:'3 câu hỏi trước khi cúi xuống', p:'Trước mỗi cú, tự hỏi nhanh:\n• Cú này mình vào khoảng bao nhiêu %?\n• Vào rồi có ra bi cho cú SAU không?\n• Nếu trượt, mình để lại gì cho đối thủ?\nChọn phương án cân bằng nhất giữa "dễ vào" và "an toàn nếu hỏng".'},
      {h:'Cú 70% chắc hơn cú 90% mạo hiểm', p:'Một cú vào 70% mà trượt vẫn an toàn thường TỐT HƠN cú 90% mà trượt là tặng nguyên bàn. Luôn tính cả HẬU QUẢ khi hỏng, đừng chỉ nhìn khả năng vào.'},
      {h:'Bỏ cái tôi — chọn cú xấu mà thắng', p:'Cú phòng thủ hay cú đi vòng "nhìn không ngầu" nhưng thắng ván nhiều hơn thì vẫn là cú ĐÚNG. Đánh để thắng, không phải để biểu diễn cho người xem.'},
      {h:'Đường ra bi ngắn = ít sai số', p:'Bi cái đi càng xa, sai số càng lớn. Ưu tiên phương án ra bi NGẮN, lực vừa, tận dụng góc tự nhiên (theo/rút/tâm bi) thay vì xoáy cầu kỳ hay lực mạnh.'},
      {h:'Xác suất đổi theo tỉ số', p:'Đang dẫn đậm → chọn chắc, giảm rủi ro, ép đối thủ tự hỏng. Đang bị dẫn sắp thua → chấp nhận cú % thấp hơn để tạo đột biến. Cùng một thế bàn, quyết định đúng phụ thuộc tình thế ván.'},
      {h:'Biết khi nào KHÔNG ăn', p:'Không có cú nào vừa dễ vào vừa ra bi tốt? Đánh safety. Nhường lượt đúng lúc để ép đối thủ mắc lỗi cũng là chơi theo xác suất — thắng nhờ đối thủ hỏng cũng là thắng.'},
      {h:'Phá & mở ván cũng là xác suất', p:'Chọn cú phá KIỂM SOÁT được (giữ bi cái, có bi vào hoặc để lại thế) thay vì phá thật mạnh cầu may. Đầu ván đặt mình vào thế % cao thì cả ván nhẹ nhàng hơn.'},
      {h:'Luyện tư duy này thế nào', p:'Sau mỗi ván, xem lại: cú nào mình chọn theo cảm hứng thay vì theo %? Ghi vào Nhật ký. Dần dần "máy tính xác suất" trong đầu sẽ tự bật lên trước mỗi cú, và bạn ngừng tặng ván cho đối thủ.'},
    ]},
  {key:'tac_break', tag:'Chiến thuật', title:'Phá bi — chính xác ở tốc độ cao, không phải sức mạnh',
    intro:'Ván được định đoạt trước khi bạn đánh cú "thật" đầu tiên. Phá bi là cú duy nhất bạn hoàn toàn chủ động, vậy mà lại là cú nhiều người tập ít nhất — họ chỉ nện thật mạnh rồi hy vọng. Người phá giỏi không phá mạnh hơn: họ phá CHÍNH XÁC ở tốc độ cao. Sai điểm chạm một chút thôi là phom không mở đúng và bạn mất quyền kiểm soát ngay lập tức.',
    body:[
      {h:'Mạnh không phải là mục tiêu', p:'Lực chỉ có ích khi nó được truyền ĐÚNG. Đánh 100% mà chạm lệch bi đầu thì năng lượng tán đi khắp nơi: phom mở lệch, bi cái văng loạn, và bạn thường mất lượt dù có bi rơi. Ngược lại một cú 80% chạm dày cho phom tản đều và bi cái nằm ngoan. Phá bi là môn của độ chính xác dưới tốc độ, không phải môn thi sức.'},
      {h:'Chạm DÀY bi đầu là tất cả', p:'Chạm dày (full hit) đúng tâm bi đầu = truyền tối đa năng lượng vào phom và giữ bi cái không văng lung tung. Chạm mỏng dù chỉ vài milimet là bi cái đổi hướng mạnh và phom mở nửa vời. Trước khi nghĩ tới bất cứ thứ gì khác, hãy chắc bạn chạm dày được đều đặn.'},
      {h:'Thước đo của cú phá là BI CÁI, không phải số bi rơi', p:'Bi rơi khi phá phần lớn là may. Thứ lặp lại được và quyết định ván là: bi cái dừng ở đâu. Bi cái đứng quanh giữa bàn = bạn nhìn được cả bàn và gần như luôn có cú kế. Bi cái lủi lỗ hoặc dính băng = ván coi như tặng đối thủ, dù vừa rơi hai bi.'},
      {h:'Nhìn bi cái, đừng nhìn phom tản', p:'Phản xạ tự nhiên là dõi theo đám bi bung ra vì nó vui mắt. Người giỏi theo dõi BI CÁI, vì đó là thứ duy nhất họ điều khiển được và là dữ liệu để chỉnh cú phá sau. Sau mỗi cú phá, câu hỏi đầu tiên phải là "bi cái dừng đâu", không phải "có vào bi nào không".'},
      {h:'Xây lực dần, đừng bắt đầu ở 100%', p:'Bắt đầu ở 70–80% lực và chỉ tăng khi bạn giữ được bi cái ổn định ở mức đó. Tăng lực trước khi có kiểm soát chỉ là tập cho chắc cái sai. Rất nhiều người chơi phong trào sẽ phá tốt hơn ngay lập tức nếu chịu giảm 20% lực.'},
      {h:'Thân người phải giữ được, không được đổ', p:'Cú phá hỏng thường hỏng ở thân: nhổm người, xoay vai, mất điểm tựa nên đầu cơ chạm lệch. Chân trụ chắc, đầu giữ nguyên tới khi bi cái đi hẳn. Nếu sau cú phá bạn phải bước một bước để lấy lại thăng bằng, cú đó đã quá tay so với sức kiểm soát của bạn.'},
      {h:'Cùng một vị trí, lặp cho thành hệ', p:'Đừng mỗi lần phá một kiểu. Chọn một vị trí đặt bi cái cố định, một điểm chạm cố định, phá đi phá lại cho tới khi kết quả lặp lại được. Có một cú phá ỔN ĐỊNH đáng giá hơn nhiều so với một cú phá thỉnh thoảng nổ đẹp. Khi đã ổn định rồi mới thử dịch vị trí để tìm cú tốt hơn.'},
      {h:'Đọc bàn ngay khi bi vừa đứng yên', p:'Cú phá xong là bạn đang ở thời điểm nhiều thông tin nhất ván: bàn mở, chưa có gì bị khoá. Đứng lại đọc bản đồ ngay lúc đó thay vì nhào vào cú dễ nhất trước mắt. Rất nhiều ván mất ở cú THỨ HAI chứ không phải ở cú phá. (Xem "Đọc bàn & chạy hình cả ván".)'},
      {h:'Tập phá: bỏ hẳn việc đếm bi rơi', p:'Bài tập: phá 10 lần và KHÔNG quan tâm có bi vào hay không — chỉ ghi lại bi cái dừng ở đâu. Giữ được bi cái quanh giữa bàn đều đặn nghĩa là cú phá đã lên, phần bi rơi sẽ tự theo sau. (Xem bài tập "Phá bi có kiểm soát" và "Phá 9-bi chuẩn" ở tab Rèn luyện.)'},
    ]},
  {key:'tac_readfast', tag:'Chiến thuật', title:'Đọc bàn nhanh hơn — thấy bản đồ tức thì',
    intro:'Biết CÁCH đọc bàn (nghĩ ngược, bi mồi, chia chặng) là một chuyện; đọc bàn NHANH tới mức bản đồ tự hiện ra khi vừa nhìn bàn lại là chuyện khác. Điểm yếu hay gặp: bắn khi bản đồ chưa đủ trong đầu, vì lập map còn chậm nên sốt ruột cúi xuống. Tốc độ đọc bàn RÈN được — đây là cách.',
    body:[
      {h:'Vì sao lúc đầu map chậm', p:'Người mới phải tính TỪNG cú một cách thủ công nên đọc cả ván rất tốn sức và chậm — đến giữa chừng thì nản, cúi xuống bắn khi mới thấy 2–3 bi đầu. Người giỏi không tính nhanh hơn, họ NHẬN RA MẪU: nhìn cụm bi là thấy ngay "hình này chạy kiểu kia". Tốc độ đến từ mẫu đã gặp nhiều lần, không từ tính nhẩm nhanh.'},
      {h:'Luật vàng: chưa đủ map thì CHƯA cúi', p:'Đặt một luật cứng: chỉ vào bộ khi đã thấy đường chạy TỚI BI CUỐI (ít nhất 2–3 bi tiếp + đường bi cái). Chưa thấy thì đứng thêm vài giây, hoặc nếu bí thì đánh an toàn — TUYỆT ĐỐI không bắn "hy vọng rồi tính tiếp". Dấu hiệu map chưa đủ: còn phân vân thứ tự, chưa biết bi cái đi đâu sau cú này, mắt nhảy loạn giữa các bi.'},
      {h:'Tập KHÔNG tính giờ trước', p:'Đừng ép nhanh khi chưa đọc đúng. Giai đoạn 1: mỗi ván cứ đứng đọc THẬT KỸ, đủ lâu, cho tới khi lập được bản đồ ĐÚNG và đầy đủ — kể cả mất 1–2 phút. Đọc đúng nhiều lần thì não mới gom thành mẫu. Nhanh mà sai thì tập mãi vẫn sai.'},
      {h:'Rồi mới ép nhanh dần', p:'Khi đã đọc đúng ổn định, giảm dần thời gian cho phép: thoải mái → 30 giây → 15 giây → "nhìn phát thấy luôn". Dùng tab 🗺️ Run-out (chế độ Luyện): app đo thời gian bạn lập map và cho đối chiếu — theo dõi thời gian tụt dần qua các buổi.'},
      {h:'Drill chụp ảnh (photograph)', p:'Liếc bàn ~5 giây rồi QUAY ĐI (hoặc nhắm mắt), đọc lại trong đầu: thứ tự dọn + bi cái đi đâu ở 3 cú đầu. Quay lại bàn kiểm xem có khớp không. Bài này ép mắt "chụp" cả bàn một lần thay vì quét từng bi — lên tốc độ đọc rất nhanh.'},
      {h:'Reverse drill', p:'Trước mỗi ván, việc ĐẦU TIÊN: xác định bi cuối và BI MỒI (đứng đâu để ăn bi cuối). Có hai mỏ neo đó thì phần giữa tự nối. Tập riêng thói quen "tìm bi mồi trước" giúp bản đồ hiện ra nhanh vì bạn có đích để lần ngược. (Xem "Đọc bàn & chạy hình cả ván".)'},
      {h:'Progressive run-out', p:'Tăng dần độ phức tạp: đọc & chạy sạch 3 bi → chỉ khi được mới lên 4 → 5 → cả rack. Đừng nhảy vào 9 bi khi 4 bi còn đọc chưa xong. Bản đồ nhanh là nhiều bản đồ NHỎ đã tự động hoá rồi ghép lại — xây từ chuỗi ngắn lên.'},
      {h:'Xem và đoán trước', p:'Xem cơ thủ giỏi đánh: trước mỗi cú, TẠM DỪNG và tự đoán họ sẽ đưa bi cái đâu, đánh bi nào tiếp. So với thực tế. Đây là cách "mượn" kho mẫu của người giỏi — nạp mẫu càng nhiều, bản đồ của bạn hiện càng nhanh.'},
    ]},
  {key:'energy', tag:'Chiến thuật', title:'Đánh tiết kiệm năng lượng',
    intro:'Đánh tiết kiệm năng lượng KHÔNG phải là đánh chậm hay đánh lười — mà là ÍT QUYẾT ĐỊNH, ÍT CHỈNH, ÍT CĂNG CƠ, NHỊP ỔN ĐỊNH. Người tốn sức nhất trên bàn không phải người đánh nhiều cú khó, mà là người đứng phân vân lâu, ép mình điều bi hoàn hảo và dùng xoáy/lực thừa. Chơi "rẻ năng lượng" giúp bạn giữ được sự sắc bén tới tận cuối trận.',
    body:[
      {h:'Nghĩ khi ĐỨNG — vào bộ chỉ RA NGỌN', p:'Sai lầm tốn năng lượng nhất: vào bộ rồi vẫn nghĩ, vẫn đổi lực, đổi áp phê, đổi điểm điều bi.\nKhi còn ĐỨNG, quyết hết 4 thứ:\n1) Bi mục tiêu vào lỗ nào.\n2) Bi cái cần về VÙNG nào.\n3) Lực khoảng bao nhiêu.\n4) Đánh tâm, trô, cu lê hay áp phê.\nKhi đã VÀO BỘ chỉ còn một việc: nhắm điểm chạm – nhấp cơ – ra ngọn. Không thương lượng nữa. Thấy sai thì ĐỨNG LÊN, không chỉnh trong bộ. Đây là nguyên tắc tiết kiệm não số một.'},
      {h:'Điều bi theo VÙNG, không theo điểm', p:'Đừng ép bi cái phải về đúng một chấm nhỏ. Thay vì nghĩ "phải về đúng điểm này để đánh bi 5", hãy nghĩ "bi cái về VÙNG này là đánh được bi 5". Người chơi tốn não vì tự ép mình điều quá chính xác — thực ra chỉ cần về góc còn xử lý được. Càng về cuối bàn càng nên chơi theo vùng an toàn, không chơi cầu kỳ.'},
      {h:'Chọn đường RẺ nhất, không phải đường đẹp nhất', p:'Đường rẻ = ít biến số. Thứ tự ưu tiên:\nĐứng bi / đè tâm → cu lê nhẹ → trô ngắn → áp phê nhẹ → (cuối cùng mới tới) trô đường dài / nhiều băng / áp phê mạnh.\nCàng nhiều xoáy, nhiều băng, trô sâu, lực lớn thì càng phải kiểm soát nhiều thứ: lực, xoáy, góc bật băng, độ trượt, sai số mặt bàn. Nếu đứng bi hoặc cu lê nhẹ mà vẫn có bi tiếp theo — chọn ngay, đó là đường "rẻ năng lượng".'},
      {h:'Một nhịp cố định cho cú thường', p:'Nhịp chuẩn: đứng nhìn ~3 giây → vào bộ → 2–3 nhấp cơ → dừng nửa giây → ra ngọn. Không cần chậm, chỉ cần ĐỀU.\nCú dễ: vẫn nhịp này, không bắn vội. Cú khó: cũng nhịp này, không kéo thành 15–20 giây.\nCái làm bạn mệt không phải cú khó — mà là ĐỨNG PHÂN VÂN QUÁ LÂU.'},
      {h:'Mỗi bàn chỉ cần 1–2 cú căng não', p:'Chia cú đánh làm 3 loại:\n• Cú ĐƠN GIẢN: đánh theo nhịp tự động, không nghĩ nhiều.\n• Cú CHUYỂN HÌNH: tính kỹ hơn vì nó quyết định hình bi tiếp theo.\n• Cú THEN CHỐT: bi 8/9/10, phá cụm, chạy đạn, hill-hill — lúc này mới dồn tập trung cao độ.\nTiết kiệm năng lượng là KHÔNG dùng 100% não cho mọi cú — để dành cho 1–2 cú quan trọng nhất của bàn đó.'},
      {h:'Đánh "đủ tốt", không đánh hoàn hảo', p:'Câu tự nhắc: "Về vùng đánh được là đủ." Không phải cú nào cũng cần đẹp, không phải bi cái nào cũng phải về chuẩn sách giáo khoa. Bi tiếp theo vẫn có góc, vẫn công được, vẫn chạy đạn được — là cú trước đã hoàn thành nhiệm vụ. Người trung cấp lên trình nhanh khi bỏ được thói quen "cú nào cũng muốn điều hoàn hảo".'},
      {h:'Giảm lực trung bình 10–15%', p:'Lực mạnh bắt bạn siết tay, căng vai, căng mắt và khó kiểm soát bi cái — phần lớn cái mệt đó đến từ tư thế phải gồng để giữ thăng bằng. (Xem "Tư thế & đường thẳng cơ thể" ở mục Kỹ thuật.) Rất nhiều cú chỉ cần 60–70% lực là đủ. Nguyên tắc: không cần phá cụm, không đi nhiều băng, không trô đường dài → GIẢM LỰC. Bi-a càng lên trình càng là môn của LỰC NHỎ CHÍNH XÁC, không phải lực lớn.'},
      {h:'Công thức 4 câu trước mỗi cú', p:'Chỉ hỏi đúng 4 câu: "Lỗ nào? Bi cái về vùng nào? Lực mấy? Đánh xong đứng yên nhìn đường bi." — Không thêm.\nĐừng sa vào chuỗi "hay trô nhỉ? hay cu lê? lỡ non thì sao? lỡ quá thì sao?" — hỏi nhiều là mất năng lượng. Quyết xong thì đánh.'},
      {h:'Bi khó: chọn phương án ÍT THIỆT HẠI', p:'Bi khó không nhất thiết phải cố công. Hỏi: "Nếu tôi đánh hỏng, bi cái và bi mục tiêu sẽ nằm ở đâu?" Nếu công vào rủi ro cao, chọn cú vừa công vừa thủ hoặc chạy đạn — bạn không phải đặt áp lực "phải vào" lên một cú xác suất thấp. Đỡ mệt đầu hơn rất nhiều. (Xem thêm "Chơi theo xác suất".)'},
      {h:'Bài tập 45 phút', p:'• 15 phút: chỉ đánh bi đơn, yêu cầu NHỊP giống hệt nhau mỗi cú.\n• 15 phút: chạy 3 bi liên tiếp, CHỈ được dùng đứng bi / cu lê nhẹ / trô ngắn.\n• 15 phút: xếp 6 bi — mục tiêu không phải dọn đẹp, mà là KHÔNG cú nào suy nghĩ quá 7 giây sau khi đã chọn phương án.\nĐích của bài: tạo cảm giác "tôi đánh được mà không cần căng não".\nCâu khoá: "QUYẾT trước khi vào bộ — vào bộ chỉ RA NGỌN."'},
    ]},
  {key:'tac_readtable', tag:'Chiến thuật', title:'Đọc bàn & chạy hình cả ván (pattern play)',
    intro:'Người mới nhìn từng cú; người giỏi nhìn cả VÁN. Trước khi cúi xuống cú đầu tiên, họ đã "vẽ" trong đầu thứ tự dọn bi và đường bi cái nối các cú lại với nhau. Đọc bàn (pattern play) biến một đống bi rời rạc thành một chuỗi cú nối nhau mượt — và là ranh giới lớn nhất giữa người chơi khá và người chơi hay.',
    body:[
      {h:'Nhìn cả ván, không nhìn từng cú', p:'Trước khi đánh, đứng lùi và hỏi: dọn theo thứ tự nào thì bi cái đi ÍT nhất và luôn có cú tiếp? Một cú vào lỗ mà bỏ mặc cú sau là cú nửa vời. Lập "bản đồ" cả ván trước trong đầu, rồi mới cúi xuống cú số một.'},
      {h:'Đọc NGƯỢC từ bi cuối', p:'Cách lập kế hoạch tốt nhất là đi ngược: bi cuối (bi 8/9) muốn đánh từ đâu? → bi áp chót phải để bi cái tới đó → cứ lùi dần về hiện tại. Nghĩ xuôi dễ dọn 4 bi đầu rồi kẹt bi thứ 5; nghĩ ngược bảo đảm cả chuỗi thông suốt tới cuối ván.'},
      {h:'Xác định bi VẤN ĐỀ sớm', p:'Bi khó, bi sát băng, cụm bi, bi gần lỗ đối thủ… là những "chướng ngại" cần giải quyết ĐÚNG LÚC — khi có bi cái thuận nhất — chứ không để tới cuối mới lo. Lên kế hoạch xoay cả ván quanh việc xử lý bi vấn đề. (Xem "Bi khó: bi sát băng, bi kê, bi dính".)'},
      {h:'Nghĩ theo bi MỒI (key ball)', p:'Bi áp chót đưa bạn vào bi quyết định gọi là bi mồi — đây là bi quan trọng cần "để dành" một vị trí ngon. Cả kế hoạch nên hướng tới việc tới bi mồi ở đúng góc để kết ván nhẹ nhàng và an toàn, thay vì tính đẹp mấy bi đầu rồi bí ở khúc cuối.'},
      {h:'Chia ván thành từng chặng', p:'Đừng nhồi cả ván vào đầu một lúc. Nghĩ theo cụm 2–3 bi: dọn xong chặng này thì bi cái phải ở đâu để mở chặng sau. Có kế hoạch lớn nhưng xử lý theo từng chặng dễ hơn nhiều so với cố tính hoàn hảo 8 cú liền một mạch.'},
      {h:'Ưu tiên GÓC và đường ra bi tự nhiên', p:'Chọn thứ tự sao cho mỗi cú để lại GÓC (không phải bi thẳng) và bi cái đi đường ngắn, tự nhiên tới bi sau. Kế hoạch tốt là kế hoạch dùng lực nhỏ, ít băng. (Xem "Điều bi tối giản — ưu tiên đường ngắn, ít băng".)'},
      {h:'Kế hoạch phải MỀM', p:'Bàn không chạy đúng ý 100%. Sau mỗi cú, nhìn lại bi cái nằm đâu và cập nhật kế hoạch, đừng bám cứng bản đồ ban đầu. Đọc bàn là quá trình liên tục suốt ván, không phải quyết một lần rồi thôi. (Xem "Kế hoạch B — khi điều bi lệch".)'},
      {h:'Bi cầm tay: đặt để mở cả loạt', p:'Khi được bi cầm tay (ball-in-hand), đừng chỉ đặt cho một cú dễ trước mắt — đặt để bắt đầu một chuỗi thông suốt và xử lý luôn bi vấn đề. Một lần cầm bi đặt khôn ngoan có thể mở đường dọn sạch cả bàn.'},
      {h:'Tập đọc bàn', p:'Thói quen dễ rèn: trước mỗi ván, tự nói ra (hoặc ghi vào Nhật ký) thứ tự dọn và đường bi cái dự kiến; đánh xong so lại xem chệch ở đâu. Xem cơ thủ giỏi và đoán trước họ đi bi thế nào. Dần dần "bản đồ ván" tự hiện ra trong đầu ngay khi bạn nhìn bàn. (Xem "Đọc bàn nhanh hơn — thấy bản đồ tức thì".)'},
    ]},
  {key:'tac_position_simple', tag:'Chiến thuật', title:'Điều bi tối giản — ưu tiên đường ngắn, ít băng',
    intro:'Điều bi giỏi KHÔNG phải điều bi cầu kỳ. Người mới thích cú bi cái chạy 3 băng về đúng chấm; người giỏi tìm cách để bi cái đi ÍT nhất mà vẫn có cú sau. Mỗi băng, mỗi vòng xoáy, mỗi centimet bi cái lăn thêm đều là một cơ hội sai số. Điều bi tối giản = chọn đường "rẻ" nhất về sai số.',
    body:[
      {h:'Bi cái đi càng xa, sai số càng lớn', p:'Mọi thứ — lực, xoáy, mặt bàn, băng — cộng dồn sai theo quãng đường. Đưa bi cái 20cm tới góc dễ hơn nhiều so với bắt nó chạy 2 mét qua 2 băng về đúng điểm. Nguyên tắc số một: để bi cái nghỉ GẦN, đừng bắt nó đi xa.'},
      {h:'Nghĩ theo VÙNG, không theo điểm', p:'Đừng ép bi cái về đúng một chấm; chỉ cần về VÙNG còn đánh được bi sau. Ngắm vùng cho bạn biên độ sai an toàn; ngắm điểm biến mỗi cú thành bài kiểm tra dễ trượt. (Xem "Đánh tiết kiệm năng lượng".)'},
      {h:'Thang ưu tiên đường "rẻ"', p:'Chọn theo thứ tự tăng dần độ khó: đứng bi / đè tâm → theo (cu lê) nhẹ → rút (trô) ngắn → áp phê nhẹ → cuối cùng mới tới trô dài / nhiều băng / áp phê mạnh. Nếu đứng bi hay theo nhẹ mà vẫn có bi sau — chọn ngay, đừng phô diễn.'},
      {h:'Lực nhỏ, kiểm soát cao', p:'Lực mạnh khuếch đại mọi sai số và bắt bạn siết tay. Rất nhiều cú chỉ cần 50–70% lực. Không cần phá cụm, không cần nhiều băng → giảm lực. Điều bi lên trình là môn của lực NHỎ chính xác, không phải lực lớn.'},
      {h:'Dùng góc tự nhiên thay vì xoáy', p:'Nếu bi cái tự lăn tới vùng cần nhờ đường tiếp tuyến hoặc theo/rút đơn giản, đừng thêm áp phê cho "chắc". Xoáy càng nhiều, biến số càng nhiều (điểm chạm băng đổi, độ trượt đổi). Để vật lý tự nhiên làm việc trước; xoáy chỉ là phương án cuối. (Xem "Góc tự nhiên — đường bi cái đáng tin nhất"; căn cứ vật lý ở "Squirt — bi cái KHÔNG đi theo hướng cây cơ" và "Swerve — bi cái đi đường cong chứ không đi đường thẳng".)'},
      {h:'Một băng hơn hai băng', p:'Mỗi lần chạm băng là một lần nhân sai số — góc ra bị xoáy, tốc độ và độ bám nỉ làm lệch. Ưu tiên phương án 0 hoặc 1 băng. Nếu buộc phải đi nhiều băng, đó thường là dấu hiệu nên xem lại THỨ TỰ dọn bi từ trước. (Xem "Đọc bàn & chạy hình cả ván".)'},
      {h:'Tránh để bi cái dính băng', p:'Bi cái dừng sát băng làm cú sau khó cầm cơ và mất nhiều lựa chọn (không hạ tay đánh thấp được). Điều bi tối giản không chỉ NGẮN, mà còn cố để bi cái ở khu thoáng, dễ đánh cú tiếp — ưu tiên "chỗ đứng đẹp" hơn "đúng điểm".'},
      {h:'Ít quyết định = ít mệt = ít sai', p:'Mỗi lựa chọn cầu kỳ (xoáy gì, mấy băng, lực bao nhiêu) đều đốt năng lượng và mở đường cho sai lầm. Đường đơn giản vừa chính xác hơn vừa giữ đầu bạn tỉnh táo cho cú then chốt. (Xem "Đánh tiết kiệm năng lượng".)'},
      {h:'Khi nào ĐƯỢC phép cầu kỳ', p:'Tối giản không có nghĩa không bao giờ đi băng hay xoáy. Khi thế bàn BẮT BUỘC (bi vấn đề, cần né bi chắn), cứ dùng — nhưng như một lựa chọn có chủ đích, không phải thói quen. Quy tắc: chỉ trả giá bằng độ phức tạp khi thật sự cần thiết.'},
    ]},
  {key:'tac_tangent', tag:'Chiến thuật', title:'Đường tiếp tuyến & 3 hướng bi cái (theo / rút / đứng)',
    intro:'Điều bi bắt đầu từ việc THẤY TRƯỚC bi cái sẽ chạy đâu sau khi chạm bi mục tiêu. Chỉ cần nắm một quy tắc hình học đơn giản — đường tiếp tuyến — cộng ba hướng cơ bản (theo, rút, đứng), bạn đọc được đường bi cái ở gần như mọi cú. Đây là nền tảng của toàn bộ điều bi; thiếu nó thì "điều bi" chỉ là đánh rồi ngạc nhiên.',
    body:[
      {h:'Đường tiếp tuyến là gì', p:'Khi bi cái chạm bi mục tiêu KHÔNG chính giữa (cú cắt), bi mục tiêu đi theo đường nối hai tâm; còn bi cái bật ra theo đường VUÔNG GÓC với đường đó — gọi là đường tiếp tuyến. Với cú đánh TÂM bi (không xoáy dọc), bi cái đi gần đúng đường tiếp tuyến này. Tập "nhìn thấy" đường tiếp tuyến trước mỗi cú cắt là bước một của điều bi. Lưu ý là bi mục tiêu không đi đúng đường nối tâm tuyệt đối, vì ma sát giữa hai bi kéo nó lệch đi một chút. (Xem "Throw — bi mục tiêu bị ma sát kéo lệch khỏi đường hình học".)'},
      {h:'Cú đứng bi (đè tâm / stun) — đi đúng tiếp tuyến', p:'Đánh tâm bi với lực vừa, không theo không rút, bi cái sau va chạm chạy ĐÚNG đường tiếp tuyến (90 độ so với hướng bi mục tiêu). Đây là hướng "mặc định" dễ đoán nhất — làm mốc để tính hai hướng còn lại. Cú đứng bi là công cụ điều bi chính xác và an toàn nhất.'},
      {h:'Cú theo (cu lê / follow) — kéo đường về phía TRƯỚC', p:'Đánh CAO tâm bi, bi cái xoáy tới; sau va chạm nó không đi thẳng tiếp tuyến mà cong RA TRƯỚC (theo hướng bi mục tiêu). Càng đánh cao và mạnh, bi cái càng "chồm" theo. Dùng khi cần bi cái tiến lên phía trước sau cú đánh.'},
      {h:'Cú rút (trô / draw) — kéo đường về phía SAU', p:'Đánh THẤP tâm bi, bi cái xoáy ngược; sau va chạm nó cong LÙI so với đường tiếp tuyến (giật về phía bạn). Càng đánh thấp và dứt khoát, bi cái càng rút mạnh. Dùng khi cần kéo bi cái lùi lại sau khi ăn bi.'},
      {h:'Ba hướng = một cây quạt', p:'Hình dung từ điểm va chạm, bi cái có thể đi theo một "cây quạt": rút kéo đường lùi về sau, đứng bi đi đúng tiếp tuyến, theo đẩy đường ra trước. Chọn cao/tâm/thấp là chọn vị trí trong cây quạt đó. Thấy được cây quạt này là thấy được gần hết các vị trí bi cái có thể tới. Chọn được rồi thì còn phải CHẠM đúng chỗ đã chọn. (Xem "Điểm chạm đầu cơ" và "Giới hạn trượt cơ" ở mục Kỹ thuật.)'},
      {h:'Cú thẳng (full ball) — không có tiếp tuyến', p:'Khi đánh THẲNG (chạm chính giữa, bi mục tiêu đi thẳng về lỗ), không có đường tiếp tuyến ngang: bi cái chỉ có thể đứng (đè tâm), tiến (theo) hoặc lùi (rút) trên cùng một đường thẳng. Đây là lý do bi thẳng khó điều sang ngang — và vì sao nên chừa GÓC. (Xem "Chơi cho bi-a tự dễ đi".)'},
      {h:'Góc cắt càng mỏng, bi cái đi càng xa', p:'Cú cắt mỏng truyền ít lực sang bi mục tiêu nên bi cái giữ nhiều đà, chạy dài theo tiếp tuyến. Cú cắt dày (gần thẳng) thì bi cái mất nhiều đà, đi ngắn. Đọc được "độ dày" của cú giúp bạn đoán bi cái sẽ đi bao xa để canh lực. (Xem "Cảm giác lực & kiểm soát tốc độ".)'},
      {h:'Áp phê chỉ bẻ đường SAU khi chạm băng', p:'Xoáy trái/phải (áp phê) gần như không đổi hướng bi cái ngay sau va chạm — nó chủ yếu bẻ góc khi bi cái CHẠM BĂNG. Nên với điều bi không băng, cứ tính bằng tiếp tuyến + theo/rút; để dành áp phê cho khi cần chỉnh góc bật băng. Đừng thêm xoáy ngang khi chưa cần, vì mỗi lần thêm là mở thêm hai hiện tượng lệch chồng lên nhau. (Xem "Điều bi tối giản" và "Cộng gộp squirt và swerve".)'},
      {h:'Tập "gọi đường bi cái"', p:'Bài tập đơn giản mà đổi trình: trước mỗi cú, NÓI TRƯỚC bi cái sẽ dừng ở đâu, rồi đánh và so. Bắt đầu với cú đứng bi (dễ đoán nhất), rồi thêm theo/rút. Đoán đúng dần nghĩa là bạn đã "thấy" đường bi cái — từ đó điều bi thành chủ động thay vì hên xui. Ghi tiến bộ vào Nhật ký.'},
    ]},
  {key:'tac_natural', tag:'Chiến thuật', title:'Góc tự nhiên — đường bi cái đáng tin nhất',
    intro:'"Góc tự nhiên" là đường bi cái TỰ đi sau va chạm khi bạn để vật lý tự nhiên làm việc — đánh tâm bi, để bi cái lăn tự nhiên, không thêm áp phê, không ép lực. Đây là đường đáng tin nhất, lặp lại được nhất, nên dân giỏi dùng nó làm MỐC GỐC để điều bi: đi theo góc tự nhiên trước, chỉ rời khỏi nó khi buộc phải. Giỏi điều bi phần lớn là biết trước góc tự nhiên và sắp cả ván quanh nó.',
    body:[
      {h:'Góc tự nhiên là gì', p:'Mỗi cú có vô số đường bi cái nếu bạn thêm xoáy hay ép lực — nhưng chỉ có MỘT góc tự nhiên: đường bi cái tự chọn khi đánh tâm bi, lăn tự nhiên, không áp phê. Nó là đường "rẻ" nhất về sai số vì ít biến số nhất. Học điều bi thực chất là học cảm và tin vào góc tự nhiên trước, rồi mới học cách chỉnh khỏi nó.'},
      {h:'Quy tắc 90° — đường tiếp tuyến (cú ĐỨNG bi)', p:'Khi bi cái không lăn, không xoáy lúc chạm bi mục tiêu (cú đè tâm / stun), nó bật ra theo ĐƯỜNG TIẾP TUYẾN — vuông góc (90°) với hướng bi mục tiêu đi. Đây là điểm KHỞI ĐẦU của mọi đường bi cái, và là mốc để hiểu góc tự nhiên. (Xem "Đường tiếp tuyến & 3 hướng bi cái".)'},
      {h:'Quy tắc 30° — bi cái LĂN tự nhiên', p:'Khi bi cái đang lăn tự nhiên lúc chạm (đánh tâm/hơi cao, đã hết trượt), nó xuất phát trên đường tiếp tuyến nhưng topspin lập tức kéo cong nó RA TRƯỚC. Kết quả: với dải góc cắt rất rộng — từ khoảng 1/4 tới 3/4 bi — bi cái lệch xấp xỉ 30° so với HƯỚNG ĐI BAN ĐẦU của chính nó. Con số ~30° ổn định đó chính là "góc tự nhiên".'},
      {h:'Vì sao ~30° đáng để thuộc lòng', p:'Độ lệch lớn nhất (khoảng 34°) xảy ra ở cú NỬA BI (half-ball), và vẫn rất gần 30° cho cả dải 1/4–3/4 bi. Nghĩa là trong phần lớn cú cắt, bi cái lăn tự nhiên LUÔN lệch khoảng 30° — bạn không phải tính lại từng cú, chỉ cần "cảm" sẵn con số này. Đây là lý do góc tự nhiên lặp lại được và xây thành phản xạ.'},
      {h:'Tiếp tuyến là điểm BẮT ĐẦU, góc tự nhiên là điểm KẾT THÚC', p:'Hai mốc nối nhau: bi cái LUÔN khởi hành theo đường tiếp tuyến (90°), rồi natural roll kéo nó cong về trước tới ~30° so với đường đi ban đầu. Cú đứng bi = dừng lại ngay ở tiếp tuyến; cú lăn tự nhiên = trôi hết đường cong tới góc tự nhiên. Thấy được cả hai mốc là đọc được gần hết đường bi cái không băng.'},
      {h:'Góc tự nhiên khi chạm BĂNG', p:'Khái niệm "tự nhiên" cũng áp cho phản xạ băng: khi đánh KHÔNG áp phê, bi cái nảy khỏi băng theo góc tự nhiên (góc tới xấp xỉ góc phản, chỉnh nhẹ theo lực và độ bám nỉ). Thêm áp phê trái/phải là bi cái LỆCH khỏi góc tự nhiên — và sai số tăng vọt. Điều bi qua băng nên ưu tiên góc tự nhiên, chỉ dùng áp phê khi thật cần bẻ góc.'},
      {h:'Vì sao góc tự nhiên quan trọng', p:'• Ít biến số nhất → ít sai nhất (không xoáy ngang, không ép lực). • Lặp lại được → xây được cảm giác, khỏi tính lại từng cú. • Là MỐC để tính mọi đường khác: muốn rộng hơn góc tự nhiên → thêm theo/lực; hẹp hơn → thêm rút; lệch ngang sau băng → áp phê. Luôn xuất phát từ góc tự nhiên rồi mới điều chỉnh. (Xem "Điều bi tối giản".)'},
      {h:'Cú nửa bi (half-ball) là "cú vàng"', p:'Cú chạm nửa bi cho góc tự nhiên rộng nhất (~30–34°) và cực kỳ lặp lại — vì quanh mức nửa bi, góc lệch gần như không đổi dù bạn hơi dày hoặc hơi mỏng. Rất nhiều bài điều bi kinh điển dựng quanh cú nửa bi. Nhận ra khi nào có sẵn cú nửa bi là nhận ra một đường điều bi "miễn phí".'},
      {h:'Dùng góc tự nhiên trong thực chiến', p:'1) ĐỌC góc tự nhiên trước mỗi cú: nếu đánh tâm bi lăn tự nhiên, bi cái trôi ~30° tới đâu? Nếu đường đó đã dẫn tới bi kế → dùng luôn, khỏi ép xoáy. 2) Sắp thứ tự dọn bi sao cho các cú NỐI nhau bằng góc tự nhiên → cả loạt chạy nhẹ. 3) Chỉ rời góc tự nhiên khi buộc phải — mỗi lần thêm xoáy/lực là thêm một lớp sai số. (Xem "Đọc bàn & chạy hình cả ván" và "Chơi cho bi-a tự dễ đi".)'},
      {h:'Gói lại', p:'Đứng bi (stun) → bi cái đi đường tiếp tuyến (90°). Lăn tự nhiên (tâm/hơi cao) → bi cái trôi tới góc tự nhiên (~30° so với hướng đi ban đầu). Không áp phê → nảy băng theo góc tự nhiên. Góc tự nhiên là đường MẶC ĐỊNH, rẻ nhất, đáng tin nhất — giỏi điều bi phần lớn là biết trước nó và sắp ván quanh nó, chỉ dùng xoáy khi thật cần. (Xem "Cảm giác lực & kiểm soát tốc độ" để canh đúng lực đi hết góc tự nhiên.)'},
    ]},
  {key:'tac_speed', tag:'Chiến thuật', title:'Cảm giác lực & kiểm soát tốc độ',
    intro:'Hỏi các cơ thủ giỏi điều gì khó nhất, phần lớn nói: KIỂM SOÁT LỰC. Ngắm đúng hướng mà sai lực thì bi cái vẫn đi sai chỗ — và lực là thứ khó "nhìn" nhất, phải cảm. Điều bi thật ra là điều LỰC nhiều hơn điều xoáy. Đây là cách rèn "đồng hồ lực" trong đầu.',
    body:[
      {h:'Lực quan trọng hơn xoáy', p:'Đa số cú điều bi hỏng vì SAI LỰC, không phải sai xoáy: bi cái quá đà hoặc non, chạy quá hoặc thiếu. Đánh tâm bi với đúng lực xử lý được phần lớn tình huống. Trước khi nghĩ tới áp phê hay trô, hãy hỏi: "lực bao nhiêu?" Lực là biến số số một của điều bi.'},
      {h:'Nghĩ lực theo THANG, không theo cảm hứng', p:'Đặt cho mình một thang lực, ví dụ 1–5: (1) đẩy nhẹ bi cái nhích một chút · (2) đi khoảng nửa bàn · (3) một băng · (4) hai băng · (5) phá/đập. Trước cú, chọn một SỐ trong thang thay vì "đánh đại cho tới". Có ngôn ngữ cho lực thì mới điều khiển được nó.'},
      {h:'Điều bi bằng LỰC trước, xoáy sau', p:'Rất nhiều vị trí đạt được chỉ bằng đánh tâm + đúng lực (bi cái chạy theo tiếp tuyến/theo/rút một quãng đúng bằng lực). Ưu tiên giải bằng lực; chỉ thêm xoáy khi lực không đủ đưa bi cái tới. Ít biến số hơn = ít sai hơn. (Xem "Điều bi tối giản" và "Đường tiếp tuyến & 3 hướng bi cái".)'},
      {h:'Lực nhỏ dễ kiểm soát hơn lực lớn', p:'Cùng một sai số phần trăm, lực lớn đẩy bi cái lệch xa hơn nhiều. Lực mạnh còn bắt tay siết, phá nhịp đưa cơ. Khi phân vân, chọn NHẸ hơn — bi cái đi ngắn thì lệch cũng gần. Chỉ đánh mạnh khi thật sự cần (phá cụm, đường dài). (Xem "Chơi cho bi-a tự dễ đi".)'},
      {h:'Lực đến từ NHỊP, không từ gồng', p:'Bi cái đi xa nhờ tốc độ đầu cơ lúc chạm, mà tốc độ đó đến từ một cú vung MƯỢT và dài, không phải từ siết tay đẩy mạnh. Cầm cơ lỏng, tăng biên độ vung để tăng lực; gồng cơ tay chỉ làm chệch hướng và lực thất thường. Lực êm mới là lực chính xác. (Xem "Cú vung thẳng" và "Nhịp & thời điểm" ở mục Kỹ thuật.)'},
      {h:'Đọc tốc độ mặt bàn hôm nay', p:'Cùng một lực cho quãng đường khác nhau tùy nỉ mới/cũ, ẩm/khô, băng nảy nhiều/ít. Vài cú khởi động đầu buổi/đầu trận là để "hiệu chỉnh đồng hồ lực" với bàn hôm đó. Bàn nhanh thì giảm lực, bàn nặng thì tăng. (Xem "Vào trận chậm — nóng máy muộn".)'},
      {h:'Đủ lực tới vị trí là được', p:'Đừng cố đưa bi cái về đúng một chấm bằng lực hoàn hảo. Nhắm VÙNG và chọn lực sao cho nếu lệch nhẹ, bi cái vẫn nằm trong vùng đánh được. "Đủ tới nơi" chắc ăn hơn "chuẩn từng phân mà liều". (Xem "Điều bi tối giản".)'},
      {h:'Bài tập rèn cảm giác lực', p:'• Đẩy bi cái từ đầu bàn, cố dừng đúng ở băng đối diện — rồi thử dừng ở giữa, ở 3/4. • Đánh một bi rồi bắt bi cái dừng đúng một điểm đánh dấu, tăng dần khoảng cách. • Cùng một cú, tập đi 1 băng / 2 băng / 3 băng về đúng vùng. Chấm điểm và ghi vào Nhật ký — cảm giác lực rèn được như cơ bắp, chỉ cần lặp có mục tiêu.'},
    ]},
  {key:'tac_planb', tag:'Chiến thuật', title:'Kế hoạch B — khi điều bi lệch',
    intro:'Bàn bi hiếm khi chạy đúng 100% ý bạn: bi cái về hơi quá, hơi non, bị vướng, hay nằm trớ — chuyện thường ngày. Điều tách người bình tĩnh với người sụp đổ không phải điều bi hoàn hảo, mà là cách xử lý khi điều bi LỆCH. Kế hoạch B là kỹ năng đọc lại thế bàn và cứu ván thay vì cố đấm một cú xấu.',
    body:[
      {h:'Chấp nhận: lệch là bình thường', p:'Đặt kỳ vọng đúng ngay từ đầu — bi cái sẽ không luôn về đúng chấm. Bực bội vì "sao không về đúng ý" chỉ làm hỏng cú sau. Coi việc bi cái lệch là một phần của trò chơi; việc của bạn là xử lý thế bàn TRƯỚC MẶT cho tốt nhất. (Xem "Chấp nhận may rủi & cú xui".)'},
      {h:'ĐỨNG LÊN đọc lại', p:'Sai lầm lớn nhất khi điều bi lệch: vẫn cúi xuống đánh theo kế hoạch cũ vì "đã định thế rồi". Bi cái ở chỗ mới = thế bàn mới. Lùi lại, đọc lại: cú nào GIỜ là cú tốt nhất? Đừng để quán tính của kế hoạch cũ ép bạn vào một cú xấu.'},
      {h:'Ba câu khi bi cái nằm trớ', p:'(1) Còn cú công nào ăn CHẮC không? (2) Nếu công, trượt thì để lại gì cho đối thủ? (3) Nếu không có cú chắc, cú THỦ nào tốt? Trả lời gọn ba câu này thay cho việc ngồi tiếc kế hoạch vừa hỏng. (Xem "Chơi theo xác suất".)'},
      {h:'Đừng "gồng" cứu kế hoạch bằng cú khó', p:'Khi lệch, cám dỗ lớn là cố một cú % thấp để "về lại đường cũ" — thường đó là cú tặng ván. Hạ tham vọng: đôi khi kế hoạch B chỉ là một cú an toàn đơn giản để giữ lượt hoặc giữ thế, không phải cố dọn tiếp cho bằng được.'},
      {h:'Bi cái quá/non — đổi lỗ hoặc đổi bi', p:'Nếu bi cái đi quá đà, có khi cú tiếp không còn nhưng một bi KHÁC lại thành cú ngon. Kế hoạch B thường là ĐỔI thứ tự dọn, không phải ép bi ban đầu. Linh hoạt đổi bi mục tiêu là cách cứu ván hay bị bỏ quên nhất.'},
      {h:'Bị vướng / mất đường — nghĩ thủ hoặc chạy đạn', p:'Nếu bi cái bị bi khác chắn hoặc góc quá tệ, đừng cố công vào. Chọn safety, hoặc cú "hai đường" (vừa thử công vừa để lại thế). Ép một cú không có đường là cách nhanh nhất để mất ván. (Xem "Safety / phòng thủ — khi nào & đánh thế nào".)'},
      {h:'Một cú hỏng không phải mất ván', p:'Điều bi lệch chỉ tốn của bạn một chút lợi thế — KHÔNG phải cả ván, trừ khi bạn hoảng rồi đánh ẩu tiếp. Giữ đầu lạnh, xử lý gọn thế mới, và ván vẫn có thể thắng. (Xem "Sau lỗi & kiểm soát cảm xúc".)'},
      {h:'Học từ cú lệch', p:'Sau ván, xem lại: bi cái lệch vì ĐỌC sai (chọn sai đường, sai lực) hay vì THỰC HIỆN sai (đánh non/quá)? Đọc sai thì sửa tư duy điều bi; thực hiện sai thì luyện cảm giác lực. Ghi vào Nhật ký để lần sau lệch ít hơn. Lệch đi lệch lại cùng một kiểu thì đã tới lúc truy vào mắt xích kỹ thuật. (Xem "Bi cái không tới đúng chỗ" và "Điều bi chính xác — bản đồ toàn bộ các yếu tố".)'},
    ]},
  {key:'tac_riskreward', tag:'Chiến thuật', title:'Khi nào tấn công, khi nào bỏ (risk/reward)',
    intro:'Mỗi lượt bạn đứng trước một quyết định: CÔNG (cố vào bi và dọn tiếp) hay THỦ (đánh an toàn, nhường lượt để ép đối thủ). Chọn sai — công lúc nên thủ, hoặc thủ lúc nên công — âm thầm làm thua nhiều ván hơn cả đánh trượt. Đây là khung tư duy để quyết đúng.',
    body:[
      {h:'Ba câu trước mỗi lượt', p:'Trước khi chọn công hay thủ, hỏi: (1) Cú công này mình vào bao nhiêu %? (2) Vào rồi có RA BI cho cú sau không? (3) Nếu TRƯỢT, mình để lại gì cho đối thủ? Ba con số này quyết định, không phải cảm hứng. (Nền tảng: xem "Chơi theo xác suất".)'},
      {h:'Công khi: % cao VÀ trượt vẫn an toàn', p:'Trường hợp dễ nhất: cú vào cao, mà lỡ trượt bi cũng không mở bàn cho đối thủ. Cứ công — rủi ro thấp, phần thưởng cao, không cần đắn đo. Nhận ra nhanh nhóm cú này để khỏi tốn não.'},
      {h:'Thủ khi: % thấp VÀ trượt là tặng bàn', p:'Ngược lại: cú khó, mà trượt thì đối thủ có bàn ngon dọn sạch. Đây là lúc thủ gần như luôn đúng, dù cú công "nhìn có vẻ được". Đừng cược cả ván vào một cú % thấp chỉ vì ngại đánh thủ.'},
      {h:'Vùng xám: cân THẾ TRẬN', p:'Khi cú công tầm trung (50–70%), quyết định phụ thuộc: đối thủ mạnh hay yếu (đối thủ giỏi thì đừng cho họ bàn), phần bàn còn lại (khó thì thủ giữ, dễ thì công), và tỉ số. Không có luật cứng — nhưng có khung để cân nhắc thay vì đoán mò.'},
      {h:'Thủ KHÔNG phải là yếu', p:'Nhiều người coi thủ là "nhát" — sai. Safety là nước đi TẤN CÔNG bằng cách khác: ép đối thủ đánh cú khó, tự phạm lỗi, tặng lại bi cầm tay. Thắng nhờ đối thủ hỏng cũng là thắng. (Xem "Safety / phòng thủ — khi nào & đánh thế nào".)'},
      {h:'Điều chỉnh theo TỈ SỐ', p:'Đang dẫn đậm: nghiêng về chắc/thủ, ép đối thủ tự hỏng, giảm rủi ro. Đang bị dẫn sắp thua: chấp nhận cú % thấp hơn để tạo đột biến. Cùng một thế bàn, quyết định đúng đổi theo tình thế ván. (Xem "Tâm lý khi bị dẫn điểm".)'},
      {h:'Bỏ cái tôi — chọn cú xấu mà thắng', p:'Cú thủ hay cú đi vòng "nhìn không ngầu" nhưng thắng ván nhiều hơn thì vẫn là cú ĐÚNG. Người chơi để thắng, không phải để biểu diễn. Cái tôi thích cú đẹp là kẻ thù của quyết định risk/reward tỉnh táo. (Xem "Tâm lý phải trình diễn" trong "Áp lực & khoảnh khắc căng".)'},
      {h:'Cú "hai đường" khi lưỡng lự', p:'Khi không rõ nên công hay thủ, tìm cú vừa thử vào bi VỪA để lại thế thủ nếu trượt. Không phải lúc nào cũng có, nhưng khi có thì nó xoá luôn thế lưỡng nan. Ưu tiên tìm phương án hai-trong-một trước khi ép mình chọn hẳn một bên.'},
      {h:'Sai lầm phổ biến: công theo quán tính', p:'Nhiều người mặc định "tới lượt là phải công", chưa từng cân nhắc thủ. Chỉ cần bắt đầu HỎI "cú chắc nhất lúc này là gì, kể cả thủ?" là bạn đã giảm hẳn số ván tự tặng. Tập dừng lại một nhịp để hỏi trước mỗi lượt.'},
    ]},
  {key:'tac_safety', tag:'Chiến thuật', title:'Safety / phòng thủ — khi nào & đánh thế nào',
    intro:'Safety (đánh an toàn / thủ) là nửa bị bỏ quên của bi-a. Người mới chỉ biết công; người giỏi biết rằng nhường lượt ĐÚNG CÁCH — để lại thế bàn khó cho đối thủ — thường "ghi điểm" nhiều như đánh vào bi. Bạn không cần dọn sạch bàn để thắng; bạn chỉ cần ép đối thủ hỏng trước.',
    body:[
      {h:'Safety là tấn công bằng cách khác', p:'Mục tiêu của thủ không phải "bỏ lượt", mà là buộc đối thủ vào thế: không có cú công, dễ phạm lỗi, phải trả lại lượt hoặc tặng bi cầm tay. Một cú thủ hay đặt bạn vào thế chủ động dù không cầm cơ. Đổi tư duy: thủ là một nước GHI ĐIỂM.'},
      {h:'Khi nào chọn thủ', p:'(1) Không có cú công nào ăn chắc. (2) Cú công có nhưng trượt là tặng bàn. (3) Muốn ép đối thủ đang căng/đang tuột đà tự hỏng thêm. (4) Đầu ván hoặc thế bí, giữ an toàn tốt hơn liều. Không có cú vừa dễ vào vừa ra bi tốt? Nghĩ ngay tới thủ. (Xem "Khi nào tấn công, khi nào bỏ".)'},
      {h:'Nguyên tắc 1: giấu bi cái (snooker)', p:'Cú thủ tốt nhất khiến đối thủ KHÔNG nhìn thẳng được bi mục tiêu: nấp sau bi khác, nép sát băng. Đối thủ phải đi băng để chạm bi → dễ trượt, dễ phạm lỗi. Che tầm nhìn của họ là vũ khí mạnh nhất của thủ.'},
      {h:'Nguyên tắc 2: kéo XA hai bi', p:'Để bi cái và bi mục tiêu càng xa nhau càng tốt. Khoảng cách lớn làm mọi cú của đối thủ khó hơn: khó ngắm, khó canh lực, khó điều bi. Thủ = tạo khoảng cách + góc xấu cho người kế tiếp cầm cơ.'},
      {h:'Nguyên tắc 3: bỏ lại thế KHÓ, không tặng thế dễ', p:'Cú thủ hỏng tệ nhất là để bi mục tiêu ngay gần lỗ hoặc bi cái giữa bàn thoáng. Trước khi đánh thủ, hình dung đối thủ sẽ THẤY gì: nếu họ có cú dễ thì cú thủ của bạn thất bại. Luôn nghĩ từ GÓC NHÌN của đối thủ.'},
      {h:'Kiểm soát lực là chìa khoá', p:'Hầu hết safety hỏng vì lực: quá mạnh thì bi văng ra thế thoáng, quá nhẹ thì phạm lỗi (không chạm đủ băng theo luật). Thủ đòi cảm giác lực tinh tế hơn cả cú công. Luyện cú lực nhỏ, dừng bi đúng chỗ. (Xem "Điều bi tối giản".)'},
      {h:'An toàn hai chiều & chừa đường cho mình', p:'Cú "two-way": vừa nhằm chạm bi kiểu có thể lọt lỗ, vừa để lại thế thủ nếu không lọt. Và luôn chừa cho MÌNH một đường: đừng đánh thủ mà tự nhốt bi cái vào thế lần sau chính mình cũng khó. Thủ phải an toàn cho cả ván sau của bạn.'},
      {h:'Đọc luật bi cầm tay', p:'Giá trị của thủ phụ thuộc luật: nếu phạm lỗi = đối thủ được bi cầm tay (như 9 bi), thủ càng lợi vì ép lỗi là ép tặng cả bàn. Biết luật để tính — đôi khi ép một cú snooker đáng giá hơn cố công. (Khác nhau theo thể thức 8/9/10 bi.)'},
      {h:'Tập thủ như tập công', p:'Dân nghiệp dư gần như không tập thủ, nên đây là nơi lên trình nhanh nhất. Bài tập: dựng thế, đặt mục tiêu đưa bi cái + bi mục tiêu về hai vùng định trước, hoặc giấu được bi cái sau bi chắn. Ghi lại tỉ lệ thủ thành công. Thủ giỏi khiến đối thủ ức chế hơn cả bị dọn bàn.'},
    ]},
  {key:'tac_hardballs', tag:'Chiến thuật', title:'Bi khó: bi sát băng, bi kê, bi dính',
    intro:'Có những viên bi tự thân đã khó: bi nằm sát băng, bi kê/chắn nhau, bi cái dính sát bi mục tiêu. Người mới gặp là đánh đại rồi hỏng; người giỏi có cách xử lý riêng cho từng loại — và quan trọng hơn, biết khi nào KHÔNG cố công mà chọn phương án ít thiệt hại.',
    body:[
      {h:'Nguyên tắc chung: ít thiệt hại hơn cố ăn', p:'Bi khó không bắt buộc phải công. Trước tiên hỏi: "nếu đánh hỏng, bi cái và bi mục tiêu nằm đâu?" Nếu công rủi ro cao, chọn cú vừa công vừa thủ, hoặc thủ hẳn, hoặc để dành xử lý bi khó khi có bi cái THUẬN nhất. Đừng đặt áp lực "phải vào" lên một cú xác suất thấp. (Xem "Chơi theo xác suất".)'},
      {h:'Bi mục tiêu sát băng — ngắm & lực', p:'Bi nằm sát băng có biên vào lỗ hẹp hơn và dễ "chạy băng". Ngắm điểm chạm hơi mỏng về phía lỗ, tránh lực quá mạnh làm bi bám băng rồi văng ra. Với bi chạy dọc băng về lỗ, đánh vừa lực để bi men theo băng, đừng thúc mạnh.'},
      {h:'Bi CÁI sát băng — cầm cơ đúng', p:'Khi bi cái dính băng, bạn mất chỗ hạ tay và không đánh thấp được (dễ nảy cơ, trượt). Chấp nhận đánh tâm hoặc hơi cao, chọn cú đơn giản, lực vừa; đừng cố rút/áp phê mạnh từ thế sát băng. Ưu tiên đưa bi cái ra thế thoáng cho cú sau. Thế này sống chết ở chỗ đặt tay chống. (Xem "Cầu tay — điểm tựa quyết định độ chính xác từng milimet".)'},
      {h:'Bi kê / bi chắn đường', p:'Khi có bi khác chắn giữa bi cái và bi mục tiêu, cân nhắc: (1) đánh vòng qua (đường cong nhẹ nếu gần), (2) đi một băng để lách, hoặc (3) nếu quá rủi ro thì THỦ, đẩy bi về thế an toàn. Đừng cố "ép" bi cái qua khe hẹp khi không chắc — chạm bi chắn thành phạm lỗi.'},
      {h:'Bi cái DÍNH bi mục tiêu', p:'Khi hai bi chạm nhau, luật thường cấm đẩy (push). Đánh vào bi cái theo hướng đường nối hai tâm thì bi mục tiêu sẽ đi thẳng theo hướng đó — dùng điều này để tính đường. Nếu hướng đó không lọt lỗ, đánh sao cho bi mục tiêu về thế khó cho đối thủ. Nắm trước luật chạm bi của thể thức đang chơi.'},
      {h:'Cụm bi — phá đúng lúc', p:'Với cụm bi dính, đừng phá bừa. Phá khi có bi cái tới với GÓC và LỰC kiểm soát được, lý tưởng là vừa phá vừa có một bi vào hoặc để lại thế. Chừa bi bảo hiểm (một bi dễ ở nơi khác) TRƯỚC khi phá, để nếu phá không đẹp vẫn còn đường. Phá cụm là canh bạc — giảm rủi ro bằng thời điểm và lực.'},
      {h:'Bi gần lỗ nhưng góc xấu', p:'Bi sát lỗ chưa chắc dễ nếu bi cái ở góc tệ hoặc bị bi chắn — đừng chủ quan. Đôi khi tốt hơn là để dành bi đó làm bi bảo hiểm / bi mồi và dọn bi khác trước, quay lại nó khi có góc thuận. (Xem "Đọc bàn & chạy hình cả ván".)'},
      {h:'Giảm kỳ vọng, giữ bình tĩnh', p:'Bi khó dễ làm bực và siết tay. Chấp nhận không phải bi nào cũng vào đẹp; mục tiêu là XỬ LÝ gọn — vào được thì tốt, không thì để lại thế khó cho đối thủ — chứ không phải cú xuất thần. Bình tĩnh chọn phương án ít thiệt hại thắng cú liều hoa mỹ. (Xem "Áp lực & khoảnh khắc căng".)'},
      {h:'Tập riêng bi khó', p:'Dựng lại các thế khó hay gặp (bi sát băng, bi kê, bi dính) và luyện nhiều trong môi trường không áp lực, để lúc thật không hoảng. Biết trước "loại bi này mình xử thế nào" khiến bi khó bớt đáng sợ. Ghi lại cách xử hiệu quả vào Nhật ký.'},
    ]},
  {key:'tac_kickbank', tag:'Chiến thuật', title:'Bắn băng & thoát băng (bank / kick) — có hệ thống, đừng đoán',
    intro:'Đa số người chơi coi cú đi băng là chuyện hên xui: nhắm đại, đánh, rồi hy vọng. Nên họ hiếm khi được thưởng, và càng hiếm thì càng né — thành ra bị che là coi như mất lượt. Sự thật ngược lại: băng có QUY LUẬT. Bi vào băng thế nào thì ra thế ấy, lặp đi lặp lại. Việc của bạn không phải đoán, mà là học cách cái bàn phản ứng.',
    body:[
      {h:'Phân biệt bank và kick', p:'BANK là bạn đánh BI MỤC TIÊU vào băng rồi bật vào lỗ. KICK là bạn cho BI CÁI đi băng trước rồi mới chạm bi mục tiêu — thường để thoát khi bị che. Hai thứ dùng chung nguyên lý phản xạ nhưng khác mục đích: bank để ăn bi, kick để sống sót và phản đòn.'},
      {h:'Ngừng đoán, bắt đầu quan sát', p:'Đổi câu hỏi trong đầu từ "chắc nó đi hướng này" sang "cái bàn này phản ứng thế nào". Mỗi cú đi băng bạn đánh — kể cả trượt — là một mẩu dữ liệu, nếu bạn chịu nhìn bi đi hết đường và ghi nhớ. Người đoán thì đánh 1000 cú vẫn đoán; người quan sát thì sau 50 cú đã có cảm giác.'},
      {h:'Học đường TỰ NHIÊN trước, xoáy tính sau', p:'Đánh không xoáy, lực vừa, thì góc vào gần bằng góc ra — đó là đường nền để mọi tính toán bám vào, dù ngay cả đường nền đó cũng không đúng tuyệt đối. (Xem "Băng — góc ra không bằng góc vào".) Thêm áp phê khi chưa nắm đường tự nhiên chỉ tạo hỗn loạn: bạn không biết mình sai vì ngắm hay vì xoáy. Học đường trần cho thuộc rồi mới coi xoáy là công cụ tinh chỉnh.'},
      {h:'Dùng mốc kim cương làm hệ quy chiếu', p:'Các chấm kim cương trên khung bàn không để trang trí — chúng là hệ toạ độ. Có một hệ đếm cố định (dù đơn giản) giúp bạn LẶP LẠI được cú đánh và biết mình sai bao nhiêu để chỉnh, thay vì mỗi lần lại nhắm mới từ đầu. (Xem bài tập "Hệ băng kim cương" ở tab Rèn luyện.)'},
      {h:'Lực làm đổi góc', p:'Cùng một điểm chạm băng, lực mạnh cho góc ra "ngắn" hơn (bi bật ra gần vuông hơn) vì băng bị ép lún, lực nhẹ cho góc "dài" hơn. Đây là lý do một cú tính đúng vẫn trượt. Chốt một mức lực chuẩn cho các cú đi băng của bạn và bám lấy nó — đổi lực là đổi cả bài toán.'},
      {h:'Hình dung TRỌN đường đi trước khi cúi', p:'Đừng chỉ ngắm điểm chạm băng đầu tiên. Vẽ trong đầu cả hành trình: bi rời cơ → chạm băng ở đâu → bật ra theo đường nào → chạm mục tiêu ở mặt nào. Chỉ thấy đoạn đầu thì phần còn lại là hy vọng. Người giỏi cú băng không thấy một cú đánh, họ thấy cả một hành trình của bi cái.'},
      {h:'Một băng cho thuần rồi mới hai băng', p:'Đừng bắt đầu bằng những cú ba băng hoa mỹ. Một băng, lực chuẩn, không xoáy — làm cho tới khi đoán trúng đường đều đặn. Cú nhiều băng chỉ là nhiều cú một băng nối nhau: sai số ở băng đầu bị nhân lên ở băng sau, nên nền tảng phải sạch trước.'},
      {h:'Mỗi bàn một tính nết — hiệu chỉnh lúc khởi động', p:'Băng mới nảy khác băng cũ, nỉ nhanh khác nỉ chậm, bàn lạnh khác bàn đã ấm. Trong lúc khởi động, đánh vài cú đi băng chỉ để ĐO cái bàn hôm nay, đừng bê nguyên cảm giác từ bàn quen sang. Cơ thủ giỏi luôn dành vài phút "hỏi chuyện" cái bàn trước khi tin vào nó.'},
      {h:'Kick trước, nhảy bi sau', p:'Cơ nhảy làm nhiều người lười học kick — và họ mất luôn một vũ khí. Kick không chỉ để chạm hợp lệ: một cú kick tính kỹ có thể vừa thoát vừa để bi cái ở chỗ đối thủ không xử được. Nhảy bi thường chỉ giải quyết cái trước mắt, kick giải quyết cả thế trận. (Xem "Safety / phòng thủ" và bài tập "Thoát snooker".)'},
      {h:'Có cú băng ổn định là đổi cả lối chơi', p:'Khi bạn tin được cú đi băng, bạn hết sợ bị che — mà hết sợ bị che thì bạn dám đánh safety mạnh tay hơn, dám chọn cú an toàn thay vì liều. Kỹ năng này không chỉ cứu vài cú lẻ: nó mở khoá toàn bộ mảng phòng thủ. (Xem "Khi nào tấn công, khi nào bỏ".)'},
    ]},
  {key:'tac_coldenemy', tag:'Chiến thuật', title:'Làm đối thủ "mất tay" — kiểm soát nhịp & thế trận',
    intro:'Có một sự thật ai chơi lâu cũng biết: tay đối thủ NGUỘI đi khi họ ngồi lâu, và khi ra bàn chỉ gặp cú khó. "Mất tay" = tay nguội + mất nhịp + mất tự tin. Toàn bộ chiến thuật ở đây gói trong một câu: GIỮ họ trên ghế, và khi họ ra bàn thì đừng cho cú dễ nào để làm nóng lại. Đây là chiến thuật hợp lệ — khác hẳn tiểu xảo quấy rối.',
    body:[
      {h:'Vì sao đối thủ "mất tay"', p:'Ba thứ nguội cùng lúc khi ai đó ngồi ngoài lâu: CƠ (mất cảm giác lực), NHỊP (rời khỏi guồng), và ĐẦU (bắt đầu nghĩ ngợi, tự nghi). Ra bàn mà cú đầu tiên đã khó thì cả ba thứ đó càng tệ. Bạn không cần "phá" đối thủ — chỉ cần tạo điều kiện để họ tự nguội. (Liên quan "Vào trận chậm — nóng máy muộn".)'},
      {h:'Giữ họ trên ghế càng lâu càng tốt', p:'Chạy loạt dài, dọn gọn — mỗi phút họ ngồi là cơ nguội thêm, nhịp mất thêm. Đây chính là cái khổ của "vào trận chậm", và bạn đang ép họ nếm nó ngay giữa trận. Ưu tiên số một: giành và giữ bàn.'},
      {h:'Safety để họ không có cú làm nóng', p:'Người nguội tay cần một cú DỄ để lấy lại cảm giác — đừng tặng, kể cả khi bạn không ăn. Bắt họ mở màn bằng cú khó, đi băng, hoặc gỡ snooker. Không cho một cú "mượt" nào để họ khởi động lại. (Xem "Safety / phòng thủ — khi nào & đánh thế nào".)'},
      {h:'Giấu bi cái, kéo xa, chừa góc xấu', p:'Mỗi lần họ ra bàn đều phải xử lý thế khó → không cú nào trơn để lấy đà, nản dồn nản. Giấu bi cái sau bi chắn, kéo bi cái và bi mục tiêu ra xa nhau, để lại góc tệ. Nghĩ từ GÓC NHÌN của họ: họ càng ít thấy đường dễ càng tốt.'},
      {h:'Cắt nhịp khi họ đang nóng', p:'Nếu họ đang chạy liền mấy ván (đang lên tay), chủ động bẻ nhịp một cách HỢP LỆ: đi lại, uống nước, dùng quyền nghỉ, chậm lại làm đủ routine — đừng cuốn theo tốc độ hưng phấn của họ. Một ván sạch của bạn có thể tắt đà của họ. (Xem "Đà & động lượng trận đấu".)'},
      {h:'Áp nhịp của MÌNH lên trận', p:'Chơi đều, chậm, chắc. Người bị ép chơi theo nhịp lạ — nhất là chậm hơn họ thích — dễ mất cảm giác tay và sốt ruột. Đừng để đối thủ quy định tốc độ; giữ guồng của bạn và buộc họ theo.'},
      {h:'Mặt lạnh — đừng cho họ năng lượng', p:'Không than khi trượt, không ăn mừng lộ liễu khi ăn. Họ không đọc được bạn, không có "mồi" tinh thần để máu lên; thấy bạn lạnh và đều, họ tự nghi. Poker face vừa giữ bạn ổn định vừa rút năng lượng của đối phương. (Xem "Poker face — giấu cảm xúc & đọc đối thủ".)'},
      {h:'Ép lỗi để lấy bi cầm tay', p:'Ở 9/10 bi, một cú snooker tốt buộc họ đánh trớ → dễ phạm lỗi → bạn được đặt bi cầm tay. Vừa lấy lợi thế thế bàn, vừa khoét thêm bực bội và mất tự tin của họ. Biết luật để tính: đôi khi ép một cú snooker đáng giá hơn cố công.'},
      {h:'Họ vừa ngồi lâu ra bàn — TẤN CÔNG ngay', p:'Đúng lúc tay họ nguội nhất, đừng cho thời gian nóng lại: dồn tập trung, chọn cú chắc và dứt điểm gọn. Khai thác cửa sổ "nguội tay" trước khi họ tìm lại cảm giác. (Xem "Dứt điểm — bản năng sát thủ khi đang dẫn".)'},
      {h:'Ranh giới: chiến thuật vs tiểu xảo', p:'Làm đối thủ mất tay bằng THẾ BÀN + NHỊP ĐỘ + MẶT LẠNH là chơi đàng hoàng. Khác hẳn "sharking" — cố tình gây tiếng động, đứng chắn tầm mắt, nói đểu — vốn là chơi xấu, dễ phản tác dụng và tự đốt tập trung của chính bạn. Thắng bằng kiểm soát ván, không bằng quấy rối. (Xem "Đối phó tiểu xảo tâm lý".)'},
    ]},
  {key:'tac_racemgmt', tag:'Chiến thuật', title:'Quản lý trận theo tỉ số (race management)',
    intro:'Một trận không phải là một chuỗi cú đồng đều — nó có tỉ số, có thể thức (race to mấy), có khúc đầu và khúc cuối. Người quản trị trận tốt điều chỉnh mức RỦI RO theo tình thế: lúc nào chơi chắc, lúc nào chấp nhận liều. Cùng một thế bàn, quyết định đúng đổi theo tỉ số. Đây là tầng chiến thuật trên cả từng cú.',
    body:[
      {h:'Cùng thế bàn, khác tỉ số — khác quyết định', p:'Một cú công 60% có nên đánh hay không phụ thuộc tỉ số. Đang dẫn đậm: bỏ, chơi chắc. Đang bị dẫn sát thua: đánh, vì cần đột biến. Trước khi chọn công/thủ, luôn liếc tỉ số. Chiến thuật không nằm riêng ở bàn bi — nó nằm ở "bàn bi + tỉ số + thể thức". (Nền tảng: "Khi nào tấn công, khi nào bỏ".)'},
      {h:'Đang DẪN: giảm rủi ro, ép đối thủ tự hỏng', p:'Khi dẫn điểm, ưu thế là của bạn — đừng cho không. Nghiêng về cú chắc và safety, tránh cú % thấp, buộc đối thủ phải liều để đuổi. Người dẫn thua thường vì nôn nóng khép trận bằng cú mạo hiểm, không phải vì chơi quá chắc. (Xem "Dứt điểm" để chắc mà vẫn không rén.)'},
      {h:'Đang BỊ DẪN: chọn rủi ro có tính toán', p:'Bị dẫn thì phải chấp nhận cú % thấp hơn để tạo đột biến — nhưng LIỀU CÓ TÍNH, không phải liều loạn. Chia nhỏ mục tiêu: gỡ MỘT ván trước, đừng đòi gỡ hết ngay. Giữ safety khi cần, ép đối thủ (đang căng vì sắp thắng) tự sai. (Xem "Tâm lý khi bị dẫn điểm".)'},
      {h:'Ván "bản lề" — dồn tài nguyên', p:'Không phải ván nào cũng nặng như nhau. Ván gỡ hoà, ván vượt lên, ván hill-hill là bản lề — dồn tập trung và chọn lối chơi kỹ nhất cho những ván đó, chơi tiết kiệm ở ván ít quan trọng. Biết đâu là ván đáng "đốt pin" giúp bạn còn sức cho lúc quyết định. (Xem "Sức bền tâm lý cho trận dài".)'},
      {h:'Đọc thể thức: race dài hay ngắn', p:'Race ngắn (tới 3–5): mỗi ván nặng, ít thời gian sửa sai, khởi đầu tốt cực quan trọng, một cú liều hỏng có thể mất trận. Race dài (tới 9–11+): kỹ năng và sự ổn định thắng thế, đừng hoảng vì bị dẫn sớm, kiên nhẫn để đẳng cấp lên tiếng. Điều chỉnh độ liều theo độ dài race.'},
      {h:'Luật thắng-thua ván (winner/loser break)', p:'Ai được phá ván sau ảnh hưởng lớn tới chiến lược. Nếu người THẮNG ván được phá (winner break), một loạt sạch có thể cuốn nhiều ván liền — càng phải cắt mạch đối thủ và giữ mạch của mình. Nếu người THUA được phá (loser/alternate break), trận cân hơn, an tâm chơi chắc. Biết luật phá để định mức liều.'},
      {h:'Đừng để một ván đổi cả chiến lược', p:'Thắng một ván đẹp không có nghĩa lao vào liều; thua một ván xui không có nghĩa đổi sang thủ thủ cả trận. Giữ chiến lược tổng thể theo tỉ số, đừng để cảm xúc của MỘT ván lái cả trận. Điều chỉnh theo tỉ số là việc của lý trí, không phải của phản ứng. (Xem "Chấp nhận may rủi & cú xui".)'},
      {h:'Chốt kế hoạch trước mỗi ván', p:'Một thói quen nhỏ: đầu mỗi ván, tự nhắc một câu về thế trận — "đang dẫn, chơi chắc", "hill-hill, tập trung cao nhất", "bị dẫn, tìm một cơ hội đột biến". Đặt ý định theo tỉ số cho mỗi ván giúp bạn không đánh trôi theo quán tính. Ghi lại trận nào mình quản lý tỉ số kém vào Nhật ký để sửa.'},
    ]},
  {key:'tac_scouting', tag:'Chiến thuật', title:'Đọc & khai thác thói quen đối thủ (scouting)',
    intro:'Bàn bi không chỉ có bi — còn có một con người bên kia với điểm yếu và thói quen riêng. Người chơi tinh ý QUAN SÁT đối thủ và bày thế trận đánh vào chỗ yếu của họ. Bạn không cần thắng bằng cú hay hơn nếu biết đẩy đối thủ vào đúng cú họ hay hỏng. Đây là chiến thuật "đánh vào người", không chỉ "đánh vào bi".',
    body:[
      {h:'Quan sát từ khi CHƯA tới lượt mình', p:'Lúc ngồi ghế đừng lơ đãng — đó là giờ trinh sát. Xem đối thủ: cú nào họ đánh tự tin, cú nào họ ngập ngừng? Họ điều bi tốt hay hay bỏ vị trí? Phá mạnh hay kiểm soát? Thủ có sắc không? Vài ván đầu thu thập dữ liệu này đáng giá bằng nhiều điểm về sau. (Xem "Ghế chờ là một phần của trận" trong "Ngồi chờ tới lượt".)'},
      {h:'Tìm cú YẾU của họ', p:'Gần như ai cũng có tử huyệt: cú rút cự ly dài, cú cắt mỏng, đôi bi, bi sát băng, cú lực, hay cú dưới áp lực. Nhận ra một-hai cú họ hay hỏng, rồi BÀY THẾ buộc họ phải dùng đúng cú đó — nhất là ở ván quan trọng. Đây là ứng dụng trực tiếp nhất của việc đọc đối thủ.'},
      {h:'Để lại thế đúng vào điểm yếu', p:'Khi đánh safety hoặc buông một cú, đừng chỉ nghĩ "khó chung chung" — nghĩ "khó VỚI HỌ". Nếu họ kém cú đi băng, giấu bi cần một cú kick. Nếu họ yếu lực nhẹ, để lại cú cần chạm khẽ. Safety nhắm vào tử huyệt cụ thể hiệu quả hơn nhiều safety chung chung. (Xem "Safety / phòng thủ".)'},
      {h:'Đọc trạng thái tâm lý qua dấu hiệu', p:'Thở gấp, siết cơ, đánh vội, liếc tỉ số, than thở = đang căng → chơi chắc, kiên nhẫn ép thêm. Buông vai, thở dài, đánh bất cần = đang nản → siết lối chơi, đừng cho cú xui để họ bám lại. Điều chỉnh theo trạng thái đối thủ theo thời gian thực. (Xem "Poker face — giấu cảm xúc & đọc đối thủ".)'},
      {h:'Nhận diện KIỂU người chơi', p:'Phân loại nhanh để biết cách trị: người TẤN CÔNG liều (cho họ ít bàn mở, ép safety, chờ họ tự hỏng cú khó); người THỦ chắc (kiên nhẫn hơn họ, đừng nôn nóng phá thế); người NÓNG VỘI (chơi chậm, đều, để họ tự sốt ruột); người dễ TILT (giữ mặt lạnh, đừng cho cớ, chờ họ tự đổ sau một cú hỏng).'},
      {h:'Học đường ra bi của họ', p:'Người chơi có "gu" điều bi riêng — hay đưa bi cái về vùng nào, thích đánh nhóm bi nào trước. Đoán được lối ra bi của họ giúp bạn biết họ định làm gì và đôi khi chặn trước (để lại thế phá kế hoạch của họ). Quan sát vài ván là thấy khuôn mẫu.'},
      {h:'Đừng để bị đọc ngược lại', p:'Đối thủ cũng đang scouting bạn. Che tử huyệt của mình: đừng lộ cú mình ngại (giữ nhịp và mặt như nhau ở mọi cú), thỉnh thoảng đổi lối để khó đoán, và luyện chính cú yếu của mình ngoài trận để nó thôi là tử huyệt. Người khó đọc buộc đối thủ phải tự phán đoán trong lo lắng.'},
      {h:'Thông tin để QUYẾT ĐỊNH, không để khinh địch', p:'Đọc đối thủ là để chọn thế và chiến thuật sắc hơn — không phải để coi thường rồi lơ là. Người yếu vẫn có cú mạnh, người đang nản vẫn có thể bừng lại. Dùng thông tin lạnh lùng, vẫn làm đủ routine từng cú của mình. Scouting bổ trợ cho lối chơi chắc, không thay thế nó.'},
    ]},
  {key:'tac_initiative', tag:'Chiến thuật', title:'Quyền chủ động — ai đang điều khiển ván (bài dẫn nhập)',
    intro:'Ở bất kỳ thời điểm nào của một ván cũng có một người ĐIỀU KHIỂN và một người PHẢN ỨNG. Người điều khiển quyết định ván sẽ đi theo hướng nào; người phản ứng chỉ được xử lý cái thế mà người kia để lại. Đó là quyền chủ động — thứ định đoạt trận đấu nhiều hơn cả số cú vào lỗ. Bốn bài của chủ đề này: nhận ra ai đang giữ nó, giữ khi đã có, giành lại khi đã mất, và áp nhịp của mình lên trận.',
    body:[
      {h:'Quyền chủ động KHÁC "đang được đánh"', p:'Bạn đứng ở bàn mà bi cái bị giấu, cả bàn chỉ toàn cú khó thì bạn đang PHẢN ỨNG, không hề chủ động. Ngược lại, một cú safety sắc khiến bạn ngồi ghế nhưng đối thủ buộc phải đánh theo kịch bản bạn dựng — quyền chủ động vẫn nằm ở bạn. Thước đo duy nhất: ai đang quyết định ván đi về đâu.'},
      {h:'Ba câu hỏi xác định ai đang giữ', p:'Nhìn thế bàn và tự trả lời: (i) Ai đang có nhiều LỰA CHỌN hơn? (ii) Người kia có buộc phải đánh một cú cụ thể không? (iii) Nếu cả hai đều đánh đúng khả năng thì ván này nghiêng về ai? Ba câu đó cho ra câu trả lời nhanh hơn nhìn tỉ số.'},
      {h:'Chủ động là thứ CHUYỂN TAY, không phải thứ có sẵn', p:'Quyền chủ động đổi chủ vài lần trong một ván: sau một cú safety hay, sau một lỗi điều bi, sau một cú phá tốt. Nó không gắn với người mạnh hơn — nó gắn với người vừa ra quyết định đúng gần nhất. Vì thế mất nó không phải bản án, và có nó cũng không phải giấy bảo đảm. Lần chuyển tay đầu tiên của mọi ván nằm ở cú phá. (Xem "Phá bi — chính xác ở tốc độ cao".)'},
      {h:'Ba nguồn tạo ra quyền chủ động', p:'(i) THẾ BÀN — bi cái ở vùng đẹp, đường dọn thông. (ii) THÔNG TIN — bạn biết điểm yếu của đối thủ, họ chưa đọc được bạn. (iii) NHỊP — trận đang chạy ở tốc độ hợp với bạn. Ba thứ này cộng dồn: giữ được cả ba thì đối thủ gần như chỉ còn việc chống đỡ.'},
      {h:'Người phản ứng luôn tốn nhiều năng lượng hơn', p:'Bên bị động phải tính nhiều hơn, căng hơn, và mỗi cú của họ đều mang rủi ro sai. Ép đối thủ ở thế phản ứng suốt vài ván là cách rút pin họ mà không cần đánh cú nào xuất thần. (Xem "Sức bền tâm lý cho trận dài".)'},
      {h:'Phân biệt với ĐÀ và với "làm đối thủ mất tay"', p:'Đà là chuỗi TÂM LÝ do kết quả gần đây tạo ra; làm đối thủ mất tay là chiến thuật nhắm vào CON NGƯỜI bên kia. Còn quyền chủ động là trạng thái THẾ TRẬN, đo được ngay trên bàn dù ai đang hưng phấn. Bạn có thể đang mất đà mà vẫn nắm chủ động, và ngược lại. (Xem "Đà & động lượng trận đấu" và "Làm đối thủ mất tay".)'},
      {h:'Sai lầm phổ biến: đổi chủ động lấy một điểm', p:'Đánh vào một bi dễ nhưng bi cái văng về vùng chết, ăn được điểm rồi đứng nhìn cả bàn bí — đó là bán quyền chủ động lấy một bi. Trước mỗi cú, hỏi thêm một câu ngoài "có vào không": cú này để mình giữ hay mất quyền điều khiển ván? (Xem "Chơi cho bi-a tự dễ đi".)'},
      {h:'Tập nhận diện: gọi tên sau mỗi lượt', p:'Trong vài buổi tới, sau mỗi lượt đổi tay hãy tự nói thầm một chữ: CHỦ ĐỘNG hay BỊ ĐỘNG. Chỉ cần gọi tên thôi đã đổi cách bạn chọn cú — vì bạn thôi đánh theo quán tính "thấy bi thì bắn". Ghi vào Nhật ký ván nào bạn tự trả bàn để tìm khuôn mẫu lặp lại.'},
    ]},
  {key:'tac_keepinit', tag:'Chiến thuật', title:'Giữ quyền chủ động — phần lớn là tự đánh mất, không phải bị giành',
    intro:'Thống kê tự làm ở bất kỳ buổi nào cũng ra cùng kết quả: bạn mất quyền điều khiển ván không phải vì đối thủ đánh một cú thiên tài, mà vì chính bạn để bi cái đi sai vùng, ăn xong một bi rồi hết đường, hoặc đánh một cú mạo hiểm không cần thiết. Giữ chủ động chủ yếu là NGỪNG TỰ TRẢ BÀN.',
    body:[
      {h:'Đếm cho ra: bạn tự trả bàn mấy lần', p:'Buổi tới hãy đếm hai con số: số lần đối thủ giành bàn bằng một cú hay, và số lần bạn tự đưa bàn cho họ (trượt cú dễ, điều bi hỏng, chết cái, phạm lỗi). Gần như chắc chắn con số thứ hai lớn hơn nhiều. Biết vậy thì biết phải sửa ở đâu.'},
      {h:'Bi cái quan trọng hơn bi mục tiêu', p:'Ăn bi mà bi cái nằm sai vùng thì bạn vừa ghi một điểm và vừa trả bàn. Người giữ được chủ động lâu là người nghĩ về ĐIỂM ĐẾN của bi cái trước khi nghĩ về lỗ. Ưu tiên đường ngắn, ít băng, lực vừa — mỗi băng thêm là một cơ hội mất kiểm soát. (Xem "Điều bi tối giản".)'},
      {h:'Xử bi vấn đề khi ĐANG chủ động', p:'Cụm bi, bi sát băng, bi kê — phá chúng lúc bi cái còn thuận và bạn còn nhiều lựa chọn. Để dành tới cuối ván là tự hẹn giờ cho khoảnh khắc mất chủ động, đúng lúc không còn đường lui. Chủ động là tài nguyên: tiêu nó vào chỗ khó nhất khi còn dư. (Xem "Bi khó: bi sát băng, bi kê, bi dính".)'},
      {h:'Không cần liều khi đang điều khiển', p:'Đang nắm thế thì mọi cú % thấp đều là món hàng đắt: được thêm một bi, mất cả quyền điều khiển. Khi đang chủ động, mặc định là chọn phương án CHẮC; chỉ liều khi đang ở thế phản ứng và cần đột biến. Mức rủi ro phải đi theo trạng thái thế trận, không theo cảm hứng. (Xem "Khi nào tấn công, khi nào bỏ".)'},
      {h:'Luôn có đường lui cho cú tiếp', p:'Trước khi bắn, biết trước mình sẽ làm gì nếu bi cái ra hơi lệch. Người có kế hoạch B không mất chủ động khi điều bi sai vài phân — họ chỉ chuyển sang phương án hai. Người không có thì một sai số nhỏ là mất luôn cả ván. (Xem "Kế hoạch B — khi điều bi lệch".)'},
      {h:'Giữ khoảng cách an toàn với lỗi phạm', p:'Chết cái, không chạm bi hợp lệ, đẩy cơ — mỗi lỗi là tặng thẳng bi cầm tay, tức tặng trọn quyền chủ động chứ không chỉ một lượt. Khi thế bàn có rủi ro phạm lỗi, hạ tham vọng một bậc: đánh cú an toàn hơn thay vì cố ăn.'},
      {h:'Cú hai đường — giữ chủ động cả khi trượt', p:'Cú vừa có cơ hội ăn vừa để lại thế xấu cho đối thủ nếu hỏng là công cụ giữ chủ động tốt nhất. Chọn được cú như vậy nghĩa là bạn không đặt toàn bộ quyền điều khiển vào việc bi có rơi lỗ hay không. Tìm cú hai đường trước khi tìm cú đẹp.'},
      {h:'Dứt điểm gọn khi cửa đang mở', p:'Chủ động không giữ được vô hạn — cửa sổ nào cũng đóng. Đang có bàn đẹp thì dọn dứt khoát, đừng đủng đỉnh chờ cú ngon hơn. Càng kéo dài một lượt bằng những cú không cần thiết, xác suất bạn tự vấp càng cao. (Xem "Dứt điểm — bản năng sát thủ khi đang dẫn".)'},
    ]},
  {key:'tac_regain', tag:'Chiến thuật', title:'Giành lại quyền chủ động khi đã mất',
    intro:'Mất chủ động là chuyện bình thường, xảy ra nhiều lần mỗi trận. Cái làm hỏng trận không phải việc mất, mà là phản xạ sai ngay sau đó: cố đánh như thể mình vẫn đang điều khiển. Giành lại là một quy trình có thứ tự, không phải một cú xuất thần.',
    body:[
      {h:'Bước 0: thừa nhận mình đang bị động', p:'Sai lầm đắt nhất là không chịu nhận. Bi cái bị giấu, bàn bí, mà vẫn bắn một cú công cầu may vì không muốn "chịu thua thế" — đó là cách biến một lượt xấu thành mất luôn ván. Nhận ra đang phản ứng là điều kiện để chọn đúng công cụ.'},
      {h:'Mục tiêu đổi từ GHI ĐIỂM sang MỞ KHOÁ', p:'Ở thế bị động, cú đúng thường không phải cú ăn bi mà là cú gỡ nút: phá cụm, đưa bi cái về vùng có lựa chọn, hoặc trả lại thế khó. Một lượt không ghi điểm nào nhưng lấy lại quyền điều khiển đáng giá hơn một bi ăn được rồi lại bí.'},
      {h:'Safety là đường ngắn nhất để đảo chiều', p:'Không có cú nào vừa dễ vào vừa để lại thế tốt thì đánh thủ. Safety hay chuyển bạn từ người phản ứng thành người ra đề — đối thủ giờ mới là bên phải xử lý. Đây là cách đổi chiều nhanh nhất mà không cần một cú khó nào. (Xem "Safety / phòng thủ — khi nào & đánh thế nào".)'},
      {h:'Ép lỗi để lấy bi cầm tay', p:'Bi cầm tay là quyền chủ động ở dạng đậm đặc nhất: bạn đặt bi cái ở đâu tuỳ ý và dựng lại cả ván. Một cú snooker tốt buộc đối thủ đánh trớ, và tỉ lệ họ phạm lỗi cao hơn nhiều so với việc bạn tự đánh vào một cú khó. Đôi khi ép snooker đáng giá hơn cố công. (Xem "Bắn băng & thoát băng".)'},
      {h:'Đừng đòi lấy lại tất cả trong một cú', p:'Phản xạ khi bị dồn là muốn gỡ trọn vẹn ngay lập tức — và đó chính là cú liều làm mất nốt phần còn lại. Chia nhỏ: lượt này chỉ cần không tặng gì thêm, lượt sau mới tính chuyện đảo chiều. Giành lại chủ động thường mất hai tới ba lượt, không phải một. (Xem "Tâm lý khi bị dẫn điểm".)'},
      {h:'Chờ đúng SAI SỐ của đối thủ', p:'Người đang chủ động cũng phải giữ nó, và họ sẽ hụt ở đâu đó. Kiên nhẫn giữ thế, đừng cho họ cú dễ nào, rồi khoảnh khắc họ điều bi lệch là cửa sổ của bạn. Người biết chờ thường lấy lại chủ động mà không tốn cú khó nào.'},
      {h:'Bẻ nhịp trước khi bẻ thế bàn', p:'Nếu đang bị cuốn theo tốc độ của đối thủ, chậm lại trước đã: làm đủ routine, thở, đứng lâu hơn một nhịp khi đọc bàn. Rất nhiều pha mất chủ động bắt đầu từ việc bạn đánh nhanh hơn mức của mình. (Xem "Nhịp trận — áp guồng của mình".)'},
      {h:'Cửa sổ vàng: ngay sau khi vừa gỡ được', p:'Lượt đầu tiên sau khi bạn vừa lấy lại bàn là lúc thế trận mong manh nhất — dễ vui rồi bắn ẩu và trả lại ngay. Ván vừa đảo chiều thì chọn cú chắc nhất, dọn có thứ tự, xác nhận quyền chủ động bằng một lượt sạch trước khi nghĩ tới chuyện gì lớn hơn.'},
    ]},
  {key:'tac_tempo', tag:'Chiến thuật', title:'Nhịp trận — áp guồng của mình, đừng đánh theo guồng người khác',
    intro:'Mỗi người có một tốc độ chơi tối ưu: nhanh hơn thì bỏ bước và ẩu, chậm hơn thì nghĩ nhiều và cứng tay. Đối thủ nào cũng mang guồng riêng của họ vào trận, và nếu bạn không giữ guồng của mình thì mặc định bạn sẽ bị kéo theo guồng của họ. Nhịp là tầng quyền chủ động ít ai để ý nhất, mà lại tác động lên từng cú.',
    body:[
      {h:'Nhịp bị kéo theo cả hai chiều', p:'Gặp người đánh nhanh, bạn sốt ruột đánh nhanh theo và bắt đầu rút bớt quy trình. Gặp người đánh rất chậm, bạn nguội tay, mất tập trung, rồi ra bàn với cái đầu đã trôi đi đâu mất. Cả hai chiều đều làm phong độ tụt, và cả hai đều xảy ra mà bạn không nhận ra.'},
      {h:'Biết con số của mình', p:'Đo một lần cho biết: một cú bình thường bạn mất bao nhiêu giây từ lúc bắt đầu đọc bàn tới lúc bắn, và đưa cơ mấy nhịp trước khi phát. Có con số rồi thì bạn phát hiện được mình đang lệch guồng ngay giữa trận, thay vì chỉ mơ hồ thấy "hôm nay đánh hơi lạ". (Xem "Quy trình vào cú".)'},
      {h:'Dấu hiệu đang bị kéo nhịp', p:'Cúi xuống mà chưa quyết xong lực; bỏ bước đứng nhìn bàn; đưa cơ ít nhịp hơn thường lệ; hoặc ngược lại, đứng quá lâu tới mức nghĩ ra thêm ba phương án rồi phân vân. Nhận ra một trong các dấu hiệu này là tín hiệu phải kéo về guồng cũ ngay lượt sau.'},
      {h:'Cách kéo về guồng của mình', p:'Không cần làm gì to tát: đứng dậy khỏi bàn, một hơi thở ra dài, làm lại đủ trình tự từ bước đầu, đưa cơ đúng số nhịp quen thuộc. Routine chính là cái neo giữ nhịp — nó tồn tại để những lúc như thế này bạn có chỗ bám. (Xem "Lời tự nhủ & từ khoá neo".)'},
      {h:'Nhịp GIỮA các lượt cũng phải quản', p:'Phần lớn thời gian một trận là lúc bạn ngồi ghế. Ngồi mà nói chuyện, lướt điện thoại, hoặc dán mắt vào từng cú của đối thủ với cảm xúc dâng lên đều làm bạn ra bàn với nhịp sai. Có một thói quen cố định cho ghế chờ cũng quan trọng như routine ở bàn. (Xem "Ngồi chờ tới lượt".)'},
      {h:'Áp nhịp là chiến thuật hợp lệ', p:'Chơi đều và chắc theo tốc độ của mình, dùng quyền nghỉ khi có, đứng dậy uống nước giữa ván — tất cả đều hợp lệ và đều buộc đối thủ phải chơi trong guồng của bạn. Khác hẳn câu giờ hay quấy rối, vốn là chơi xấu và còn tự đốt tập trung của chính bạn. (Xem "Đối phó tiểu xảo tâm lý".)'},
      {h:'Đổi nhịp có chủ đích ở ván bản lề', p:'Ở ván quyết định, chủ động chậm lại một bậc: thêm một nhịp thở, đọc bàn kỹ hơn, xác nhận lại lực trước khi cúi. Đây không phải bỏ guồng mà là chọn guồng — điều bạn quyết định trước, không phải phản ứng theo không khí trận. (Xem "Quản lý trận theo tỉ số".)'},
      {h:'Nhịp ổn định nuôi độ ổn định', p:'Cùng một cú đánh ở hai nhịp khác nhau cho hai kết quả khác nhau. Vì thế guồng đều là một trong những đòn bẩy rẻ nhất để giảm dao động phong độ — bạn không cần thêm kỹ năng nào, chỉ cần thôi để người khác quy định tốc độ của mình. (Xem mục Độ ổn định & phong độ đều.)'},
    ]},
  {key:'tec_intro', tag:'Kỹ thuật', title:'Điều bi chính xác — bản đồ toàn bộ các yếu tố (bài dẫn nhập)',
    intro:'Mục Tư duy & chiến thuật trả lời câu "nên đưa bi cái đi đâu". Mục này trả lời câu khó hơn: "vì sao bi cái KHÔNG tới đúng chỗ mình định". Điều bi chính xác không phải một kỹ năng, mà là một chuỗi khoảng 12 yếu tố nối tiếp nhau — hỏng bất kỳ mắt nào thì bi cái cũng lệch, và phần lớn người chơi cả đời không biết mắt nào của mình đang hỏng. Đây là bản đồ toàn chuỗi; mỗi mục dưới đây là một bài riêng, đọc sâu ở đó.',
    body:[
      {h:'Chuỗi nhân quả từ ý định tới chỗ bi cái dừng', p:'Ý định (muốn bi cái về đâu) → chọn đường và lực → tư thế và đường ngắm → cầu tay giữ hướng → cú vung đưa đầu cơ đi thẳng → đầu cơ chạm ĐÚNG điểm định chạm → bi cái rời đi (có squirt) → bi cái cong trên đường đi (swerve) → bi cái chạm bi mục tiêu (có throw) → bi cái chạy theo tiếp tuyến hoặc góc tự nhiên → ma sát nỉ làm xoáy tắt dần → chạm băng (góc đổi theo lực và xoáy) → dừng. Mười hai mắt xích. Người giỏi không có mắt nào yếu; người trung bình thường hỏng ở 2-3 mắt cố định và không biết là mắt nào.'},
      {h:'Hai loại sai: sai HỆ THỐNG và sai NGẪU NHIÊN', p:'Sai hệ thống là lệch cùng một hướng, lặp đi lặp lại — ví dụ luôn thiếu bi cái về bên phải, luôn non lực. Loại này SỬA ĐƯỢC bằng hiệu chỉnh, và sửa xong là lên trình ngay. Sai ngẫu nhiên là lúc lệch trái lúc lệch phải — đó là dấu hiệu cú vung chưa ổn định, phải rèn lại nền chứ không bù trừ được. Việc đầu tiên của người muốn lên trình: phân biệt mình đang mắc loại nào. Bù trừ cho một cú vung loạn là vô ích.'},
      {h:'Yếu tố bạn kiểm soát được và yếu tố bạn chỉ chịu đựng', p:'Kiểm soát được: tư thế, cầu tay, tay cầm, cú vung, điểm chạm đầu cơ, lực, độ chếch cơ, chất lượng đầu cơ và lơ. Chỉ chịu đựng được: nỉ hôm nay, độ ẩm, độ nảy băng, bi sạch hay bẩn, bi dính bất chợt. Nguyên tắc phân bổ công sức: dồn 90% thời gian tập vào nhóm kiểm soát được, và với nhóm còn lại chỉ cần biết đủ để ĐỌC và bù trừ trong 5 phút khởi động.'},
      {h:'Thứ tự ưu tiên sửa — đừng sửa lung tung', p:'Sửa theo đúng thứ tự này, vì mắt sau vô nghĩa khi mắt trước còn hỏng: (i) cú vung thẳng và mượt · (ii) điểm chạm đầu cơ chính xác · (iii) cảm giác lực · (iv) hiểu squirt và swerve của cây cơ mình đang dùng · (v) hiểu throw · (vi) đọc bàn hôm nay. Rất nhiều người nhảy thẳng vào mục (iv) mua cơ chống lệch trong khi mục (i) còn chưa xong — tiền mất mà bi cái vẫn đi lung tung.'},
      {h:'Ba thủ phạm ăn mất đường ngắm', p:'Ba hiện tượng vật lý làm bi đi khác hẳn hình học bạn ngắm, và cả ba đều VÔ HÌNH với người không biết chúng tồn tại: squirt (bi cái rời đi lệch hướng cơ), swerve (bi cái cong lại trên đường đi), throw (bi mục tiêu bị ma sát kéo khỏi đường nối tâm). Không bù trừ ba thứ này thì trần trình độ của bạn bị chặn cứng, dù tập bao nhiêu giờ. Đây là ranh giới rõ nhất giữa người chơi phong trào và người chơi có trình.'},
      {h:'Vì sao xoáy ngang đắt hơn bạn nghĩ', p:'Đánh tâm bi thì bạn chỉ phải lo đúng một biến: lực. Thêm áp phê là bạn mở thêm ba biến cùng lúc — squirt, swerve, và throw thay đổi — cộng thêm băng phản xạ khác đi. Đây là căn cứ vật lý cho lời khuyên "điều bi tối giản" ở mục Chiến thuật: đó không phải lời khuyên cho người lười, mà là phép tính sai số. Xoáy ngang phải là lựa chọn có chủ đích, không phải phản xạ.'},
      {h:'Nguyên tắc gốc: giảm số biến trước, tăng độ chuẩn sau', p:'Có hai đường lên trình. Đường một: tập cho chuẩn tới mức xử được cú nhiều biến. Đường hai: chọn phương án ít biến để cú nào cũng dễ. Người giỏi đi cả hai, nhưng đi đường hai TRƯỚC vì nó cho kết quả ngay và không cần chờ tay lên. Mỗi lần bạn bỏ được một biến (bớt một băng, bớt áp phê, giảm lực), bạn vừa tăng tỉ lệ thành công mà không cần giỏi hơn chút nào.'},
      {h:'Kiểm soát được nghĩa là LẶP LẠI được, không phải làm được một lần', p:'Đánh trúng một cú rút ba băng đẹp không chứng minh gì cả. Thước đo duy nhất của điều bi là độ lặp lại: cùng cú đó, đánh 10 lần thì bao nhiêu lần bi cái vào vùng. Người chơi hay tự đánh giá mình bằng cú hay nhất họ từng đánh; huấn luyện viên đánh giá bằng cú TỆ NHẤT trong 10 cú. Muốn đẳng cấp thế giới, hãy đo mình bằng thước thứ hai.'},
      {h:'Cách dùng mục này', p:'Đừng đọc một lượt rồi thôi. Cách dùng đúng: đọc bài "Bi cái không tới đúng chỗ — truy lỗi ở đâu" để tìm ra 2-3 mắt xích đang yếu của RIÊNG bạn, rồi chỉ đọc sâu đúng những bài đó và tập theo bài "Tự đo sai số của chính bạn". Đọc hết 21 bài mà không đo gì thì kiến thức nằm trong đầu chứ không nằm trong tay. Dùng tab Ôn luyện để giữ kiến thức, và tab Nhật ký để ghi số đo.'},
    ]},
  {key:'tec_stroke', tag:'Kỹ thuật', title:'Cú vung thẳng — mắt xích quyết định mọi thứ phía sau',
    intro:'Nếu chỉ được sửa MỘT thứ để điều bi chính xác hơn, đó là cú vung thẳng. Lý do đơn giản đến mức tàn nhẫn: mọi kiến thức về squirt, throw, góc tự nhiên đều giả định rằng đầu cơ đi thẳng và chạm đúng chỗ bạn định chạm. Cú vung lệch làm toàn bộ phần còn lại thành vô nghĩa — bạn bù trừ cho một sai số mà bản thân sai số đó lại thay đổi mỗi cú.',
    body:[
      {h:'Vì sao cú vung lệch phá hỏng tất cả', p:'Đầu cơ đi chệch đường ngắm dù chỉ một hai milimet là điểm chạm trên bi cái đổi, kéo theo lượng xoáy đổi, hướng bi cái đổi, và cả throw lên bi mục tiêu cũng đổi. Tệ hơn: lệch lúc trái lúc phải nên bạn không thể học được từ kết quả — cùng một cách ngắm mà lúc vào lúc trượt, dẫn tới việc bạn liên tục sửa CÁCH NGẮM trong khi lỗi nằm ở cú vung. Rất nhiều người chơi mắc kẹt nhiều năm ở đúng vòng luẩn quẩn này.'},
      {h:'Cú vung thẳng là thẳng theo nghĩa nào', p:'Không phải "cơ trông thẳng" mà là: đầu cơ di chuyển trên một đường thẳng duy nhất, cùng phương với đường ngắm, trong suốt hành trình từ lúc lùi cơ tới lúc theo hết. Ba lỗi phá đường thẳng này: cổ tay xoay khi vung, khuỷu tay dạt ra hoặc ép vào thân, và vai chuyển động thay vì chỉ có cẳng tay đung đưa. Cẳng tay phải đung đưa như quả lắc quanh khuỷu, phần còn lại của cơ thể đứng yên.'},
      {h:'Khuỷu tay là bản lề, vai không tham gia', p:'Trong cú vung chuẩn, chỉ khớp khuỷu mở và đóng; cánh tay trên và vai giữ nguyên vị trí cho tới khi đầu cơ đã chạm bi. Vai tham gia là dấu hiệu bạn đang cố tạo lực bằng thân người — hệ quả là đầu cơ đi theo cung tròn chứ không theo đường thẳng, và điểm chạm bị đẩy lệch xuống hoặc lệch lên. Nếu muốn lực lớn hơn, tăng biên độ lùi cơ, đừng huy động vai.'},
      {h:'Điểm chạm bi phải nằm ở đáy quả lắc', p:'Cẳng tay đung đưa quanh khuỷu nên đầu cơ thực chất đi theo cung rất nhẹ, phẳng nhất ở ĐÁY cung. Muốn đầu cơ đi thẳng đúng lúc chạm bi, hãy chỉnh sao cho khi cơ vừa chạm bi cái thì cẳng tay đang thẳng đứng — tức điểm chạm rơi vào đáy cung. Đặt tay cầm quá xa hoặc quá gần thân làm điểm chạm rơi vào đoạn cong, và đầu cơ đang đi lên hoặc đi xuống lúc chạm bi. Đây là lỗi âm thầm rất phổ biến.'},
      {h:'Lùi cơ chậm, đổi chiều mượt', p:'Phần lớn cú vung hỏng ngay ở nhịp lùi: lùi nhanh và giật thì cơ thể phải phanh gấp, và cú phanh gấp đó luôn kèm một chuyển động ngang nhỏ. Lùi cơ CHẬM hơn nhịp đẩy tới, dừng lại một khoảnh khắc gần như không thấy ở điểm cuối, rồi mới tăng tốc. Nhịp lùi chậm - dừng - tăng tốc mượt là dấu hiệu chung của gần như mọi cơ thủ đỉnh, bất kể môn bi-a nào.'},
      {h:'Tăng tốc XUYÊN QUA bi, đừng đạt đỉnh trước bi', p:'Cú vung phải còn đang tăng tốc hoặc ít nhất giữ tốc độ tại thời điểm chạm bi. Người giảm tốc trước khi chạm bi (một dạng "sợ cú") làm lực yếu đi bất thường và đầu cơ dễ dạt. Cảm giác đúng là bạn nhắm tới một điểm PHÍA SAU bi cái chứ không nhắm vào bề mặt bi cái. Đây cũng là lý do vì sao theo cơ tốt và điều bi tốt luôn đi cùng nhau.'},
      {h:'Bài kiểm tra đường thẳng số 1: cú thẳng dài đứng bi', p:'Đặt bi cái và bi mục tiêu thẳng hàng với một lỗ, cách nhau khoảng một mét. Đánh tâm bi lực vừa, đủ để bi mục tiêu vào lỗ. Nếu cú vung thẳng, bi cái phải dừng gần như đứng yên tại chỗ, không nhích trái nhích phải. Bi cái nhảy sang một bên có nghĩa là bạn chạm lệch tâm — và lệch về bên NÀO thì đó chính là hướng cú vung của bạn đang trôi. Đây là bài đo tốt nhất, làm được ngay, không cần dụng cụ.'},
      {h:'Bài kiểm tra đường thẳng số 2: đánh dọc theo mép băng', p:'Đặt bi cái sát băng dọc, đánh dọc theo băng hết chiều dài bàn không có bi mục tiêu, để bi cái đi và về. Cú vung thẳng thì bi cái chạy men băng và về gần chỗ cũ mà không chạm băng dọc lần nào, hoặc chạm rất nhẹ. Bi cái dạt vào băng hoặc dạt ra ngoài đều tố cáo đầu cơ đi chéo. Bài này khắc nghiệt vì băng dọc là một đường thẳng chuẩn để đối chiếu, không cho bạn tự lừa mình.'},
      {h:'Quay phim từ phía sau — không có cách nào thay thế', p:'Cảm giác chủ quan về cú vung của bạn gần như luôn sai; ai cũng nghĩ mình vung thẳng. Đặt điện thoại ngay sau đường ngắm, ngang tầm cơ, quay 10 cú rồi xem chậm. Đây là công cụ rẻ nhất và tàn nhẫn nhất trong bi-a: nó cho thấy trong 30 giây thứ mà bạn có thể tự lừa mình suốt nhiều năm. Người chơi nghiêm túc quay lại cú vung của mình định kỳ, không phải chỉ một lần.'},
      {h:'Ổn định trước, mạnh sau', p:'Đừng tập cú vung ở lực mạnh. Rèn đường thẳng ở lực nhẹ và vừa cho tới khi bi cái đứng yên đều đặn trong bài kiểm tra số 1, rồi mới tăng lực từng nấc và kiểm lại. Tăng lực trước khi có đường thẳng chỉ là tập cho thành thục cái sai — và cái sai đã thành thục thì tốn gấp nhiều lần thời gian để gỡ so với học mới từ đầu.'},
    ]},
  {key:'tec_stance', tag:'Kỹ thuật', title:'Tư thế & đường thẳng cơ thể — nền móng không ai nhìn thấy',
    intro:'Cú vung thẳng không thể mọc ra từ một tư thế lệch. Nếu thân người bạn không nằm đúng trên đường ngắm, thì để đưa đầu cơ đi thẳng bạn buộc phải bù trừ bằng cơ bắp ở từng cú — và bù trừ bằng cơ bắp thì không bao giờ lặp lại được. Tư thế đúng là tư thế mà cú vung thẳng xảy ra một cách LƯỜI BIẾNG, không cần cố.',
    body:[
      {h:'Nguyên tắc gốc: cơ thể phải cho phép cú vung thẳng xảy ra tự nhiên', p:'Tiêu chí duy nhất để đánh giá một tư thế: ở tư thế đó, khi bạn thả lỏng và để cẳng tay đung đưa, đầu cơ có tự đi theo đường ngắm không? Nếu có, tư thế đúng, dù nó trông khác người. Nếu bạn phải "giữ" cho cơ đi thẳng, tư thế sai, dù nó trông rất giống trong sách. Đây là lý do không có một tư thế chuẩn duy nhất cho mọi người — chiều cao, độ dài tay, độ mềm hông đều khác nhau.'},
      {h:'Ba điểm phải nằm trên một mặt phẳng', p:'Mắt dẫn, cây cơ và đường ngắm phải cùng nằm trong một mặt phẳng thẳng đứng. Nếu đầu bạn lệch sang bên so với cây cơ, bạn nhìn đường ngắm ở một góc chéo và não sẽ tự "sửa" hình ảnh đó — kết quả là bạn ngắm sai một cách nhất quán mà không hề biết. Rất nhiều lỗi tưởng là lỗi ngắm thật ra là lỗi đặt đầu.'},
      {h:'Tìm mắt dẫn của bạn', p:'Giơ ngón tay che một vật ở xa khi mở cả hai mắt, rồi nhắm lần lượt từng mắt. Mắt nào giữ ngón tay đứng yên trên vật đó là mắt dẫn. Cây cơ nên đi qua vùng dưới mắt dẫn, không phải giữa hai mắt hay dưới cằm theo mặc định. Đặt sai vị trí đầu là một sai số HỆ THỐNG — nó làm bạn luôn lệch cùng một phía, và là một trong những thứ dễ sửa nhất mà cho kết quả rõ nhất.'},
      {h:'Chân trụ và điểm tựa ba chân', p:'Cơ thể ở tư thế cúi phải tựa vững trên ba điểm: hai chân và cầu tay. Nếu bạn có thể bị đẩy nhẹ mà mất thăng bằng, tư thế chưa đủ vững, và bạn sẽ dùng cơ bắp để giữ mình thay vì để cẳng tay vung tự do. Kiểm tra nhanh: vào tư thế rồi nhấc nhẹ tay cầm cơ ra khỏi cơ — nếu bạn vẫn đứng yên thoải mái, tư thế ổn.'},
      {h:'Độ cúi: thấp không phải luôn tốt hơn', p:'Cúi thấp cho tầm nhìn dọc theo cơ tốt hơn nhưng đòi hỏi hông và lưng mềm; cúi thấp quá mức chịu đựng làm căng cơ, run và mỏi nhanh trong trận dài. Chọn độ cúi thấp nhất mà bạn còn giữ được THOẢI MÁI trong hai tiếng, không phải độ cúi thấp nhất bạn có thể đạt trong một cú. Đây là chỗ nhiều người bắt chước hình ảnh nhà nghề rồi tự làm hỏng thể trạng của mình.'},
      {h:'Chân sau duỗi, chân trước hơi chùng', p:'Khuôn phổ biến và ổn định: chân cùng bên tay cầm cơ duỗi thẳng làm trụ, bàn chân xoay ngoài; chân còn lại bước tới trước, hơi chùng gối để hạ thân. Trọng tâm dồn nhiều hơn về chân trụ. Bố cục này khoá phần hông lại, khiến thân trên khó xoay khi vung — đúng thứ ta cần.'},
      {h:'Vào tư thế TỪ đường ngắm, đừng ngắm sau khi đã cúi', p:'Trình tự đúng: đứng thẳng phía sau bi, xác định đường ngắm khi tầm nhìn còn rộng, đặt chân theo đường đó, rồi mới hạ thân xuống DỌC theo đường ngắm. Trình tự sai và rất phổ biến: cúi xuống trước rồi mới xoay người tìm đường ngắm — lúc đó bạn buộc phải vặn thân, và thân đã vặn thì cú vung không thể thẳng. Đứng lại làm lại từ đầu rẻ hơn nhiều so với cố cứu một tư thế đã vào sai.'},
      {h:'Đầu phải đứng yên tuyệt đối cho tới khi bi đã đi', p:'Ngóc đầu lên sớm để xem kết quả là lỗi phổ biến nhất trong mọi môn thể thao có ngắm. Đầu nhấc lên kéo theo vai, vai kéo theo cánh tay, và đầu cơ dạt đúng vào khoảnh khắc chạm bi. Quy tắc: giữ nguyên đầu và tư thế cho tới khi bi cái đã đi được ít nhất một đoạn — đủ lâu để bạn nghe thấy bi chạm nhau rồi mới ngước lên. Đây cũng là một mẹo tâm lý tốt vì nó ngăn bạn "cầu nguyện" giữa cú.'},
      {h:'Tư thế phải lặp lại được, kể cả khi mệt', p:'Tư thế đúng là tư thế bạn vào được y hệt ở ván thứ nhất và ván thứ ba mươi. Hãy chọn các mốc kiểm tra đơn giản để tự dựng lại: vị trí bàn chân trước so với đường ngắm, khoảng cách cằm tới cơ, độ dài cầu tay. Ba mốc đó là danh sách kiểm tra của bạn khi cảm thấy tay đang trôi. Xem thêm bài "Vào trận chậm" và "Giữ sức khi đánh giải cả ngày" ở các mục khác.'},
    ]},
  {key:'tec_bridge', tag:'Kỹ thuật', title:'Cầu tay — điểm tựa quyết định độ chính xác từng milimet',
    intro:'Cầu tay là thứ duy nhất giữ đầu cơ đúng độ cao và đúng đường trong khoảnh khắc chạm bi. Một cầu tay lỏng lẻo biến mọi kiến thức về điểm chạm thành lý thuyết suông: bạn định chạm thấp 4mm, cây cơ tự nhún lên 2mm, và bi cái làm một chuyện khác hẳn. Đây là bộ phận rẻ nhất để cải thiện và bị xem nhẹ nhiều nhất.',
    body:[
      {h:'Việc của cầu tay: khoá ĐỘ CAO và khoá HƯỚNG', p:'Cầu tay có đúng hai nhiệm vụ. Một, giữ đầu cơ ở đúng độ cao bạn chọn — đây là thứ quyết định bạn đánh cao, tâm hay thấp, tức quyết định theo hay rút. Hai, giữ đầu cơ đi đúng một đường — đây là thứ quyết định bạn có dính áp phê ngoài ý muốn hay không. Cầu tay không tạo lực, không tạo xoáy; nó chỉ có việc KHÔNG ĐỔI trong lúc cú vung diễn ra.'},
      {h:'Cầu tay phải chết cứng cho tới khi bi đã đi', p:'Lỗi nặng nhất là nhấc hoặc nhún cầu tay ngay khi vung tới — thường do phản xạ né hoặc do nôn nóng nhìn kết quả. Cầu tay nhích lên vài milimet đúng lúc chạm bi biến cú rút thành cú đứng bi, biến cú đứng bi thành cú theo. Nếu bạn hay bị "rút mà không rút được", nghi cầu tay trước khi nghi kỹ thuật rút. Ngón tay phải còn ở nguyên chỗ cũ sau khi bi cái đã chạy.'},
      {h:'Độ dài cầu tay: dài cho lực, ngắn cho chuẩn', p:'Khoảng cách từ cầu tay tới bi cái quyết định biên độ vung và độ tha thứ. Cầu ngắn (khoảng 15-20cm) cho kiểm soát cao, ít lệch, hợp cú nhẹ và cú quan trọng. Cầu dài cho biên độ lớn và lực mạnh nhưng khuếch đại mọi sai lệch của cú vung. Nguyên tắc thực dụng: dùng cầu ngắn làm mặc định, chỉ kéo dài khi thật sự cần lực. Nhiều người đánh cầu quá dài suốt ngày và tự hỏi vì sao mình thiếu ổn định.'},
      {h:'Độ dài cầu tay còn liên quan tới bù squirt', p:'Có một lý do kỹ thuật sâu hơn để chú ý độ dài cầu tay: mỗi cây cơ có một "chiều dài chốt xoay tự nhiên", và khi cầu tay của bạn dài đúng bằng chiều dài đó thì kỹ thuật xoay tay sau để tạo áp phê sẽ TỰ ĐỘNG bù trừ được độ lệch bi cái. Đây là nền tảng của kỹ thuật BHE. Ai định dùng áp phê nghiêm túc thì phải biết con số này của cây cơ mình. (Xem "Bù trừ độ lệch".)'},
      {h:'Cầu tay đóng và cầu tay mở', p:'Cầu mở (cơ nằm trong rãnh giữa ngón cái và ngón trỏ) cho tầm nhìn tốt hơn, dễ vào, hợp phần lớn cú và hợp người mới. Cầu đóng (ngón trỏ vòng qua thân cơ) khoá cơ theo mọi hướng, an toàn hơn ở cú mạnh và cú phá, nhưng che tầm nhìn một chút. Không có cái nào hơn tuyệt đối; điều bắt buộc là phải thạo CẢ HAI, vì có những thế bàn chỉ dùng được một loại.'},
      {h:'Ba ngón sau phải bám mặt bàn', p:'Cầu tay vững đến từ diện tiếp xúc, không đến từ việc gồng. Xoè các ngón ra, ấn nhẹ đầu ngón xuống mặt nỉ để tạo chân đế rộng, cổ tay hơi hạ. Cầu tay chỉ chạm bàn bằng vài đầu ngón chụm lại là cầu tay chông chênh, và nó sẽ trôi đúng vào lúc bạn cần nó nhất — ở cú mạnh.'},
      {h:'Cầu tay cho các thế khó là kỹ năng riêng phải tập', p:'Bi cái sát băng, bi cái nằm sau bi khác, phải với xa — mỗi tình huống có một dạng cầu tay riêng: cầu trên băng, cầu ngón dựng cao, cầu có gác cơ. Người chơi phong trào thường chỉ thạo một dạng cầu và mỗi lần gặp thế khó là đánh bằng hy vọng. Dành hẳn buổi tập cho các dạng cầu tay khó là một trong những khoản đầu tư có lãi nhất, vì các thế đó xuất hiện liên tục.'},
      {h:'Cơ phải trượt tự do, không được ma sát', p:'Nếu cây cơ bị kẹt hoặc rít khi trượt qua cầu tay, lực sẽ không đều và hướng bị nhiễu. Tay ẩm mồ hôi là nguyên nhân thường gặp nhất — lau tay, dùng găng hoặc bột trượt khi cần. Rất nhiều cú "tự dưng đi sai" trong trận dài chỉ đơn giản là do tay ướt dần lên. Đây là loại lỗi mà không ai nghĩ tới trong khi nó xảy ra hằng ngày.'},
      {h:'Kiểm tra cầu tay bằng cú rút cực thấp', p:'Bài đo: đặt bi cái cách bi mục tiêu khoảng nửa mét, đánh thật thấp để rút bi về. Nếu cầu tay không vững hoặc bị nhún, cú rút sẽ yếu hơn nhiều so với ý định hoặc bi cái đứng lại. Cải thiện độ vững của cầu tay thường cho kết quả ngay lập tức ở bài này — và đó là bằng chứng trực tiếp rằng khoảng cách từ ý định tới kết quả của bạn vừa ngắn lại.'},
    ]},
  {key:'tec_grip', tag:'Kỹ thuật', title:'Tay cầm cơ — nắm càng chặt, bi cái càng lệch',
    intro:'Tay cầm là nơi lực được truyền vào cây cơ, nhưng nghịch lý là nó phải làm việc đó bằng cách CAN THIỆP ÍT NHẤT. Gần như mọi lỗi nghiêm trọng ở tay cầm đều cùng một gốc: nắm quá chặt. Nắm chặt khiến mọi rung động và mọi động tác thừa của bàn tay được truyền thẳng vào đầu cơ, đúng lúc bạn cần đầu cơ trung thành nhất với đường ngắm.',
    body:[
      {h:'Nắm lỏng như cầm con chim', p:'Chuẩn kinh điển: đủ chặt để cây cơ không rơi, đủ lỏng để không ép nó. Áp lực nắm nên nằm ở mức thấp và QUAN TRỌNG HƠN là không đổi trong suốt cú. Nhiều người nắm lỏng lúc chuẩn bị rồi siết chặt đúng khoảnh khắc vung tới — đó là kiểu tệ nhất, vì cú siết đó vừa làm lệch hướng vừa làm lực nhảy vọt không kiểm soát.'},
      {h:'Nắm chặt giết cú rút', p:'Cú rút cần đầu cơ chạm bi rồi trả lại tự do cho cây cơ đi tiếp. Nắm chặt làm cây cơ bị hãm ngay tại điểm chạm, xoáy ngược truyền vào bi ít hơn hẳn. Người than "tôi rút không được" phần lớn không thiếu sức mà thừa lực nắm. Thử lại chính cú rút đó với bàn tay gần như buông — khác biệt thường lộ ra ngay trong vài cú.'},
      {h:'Chỉ vài ngón làm việc, phần còn lại đi theo', p:'Khuôn ổn định: ngón cái và ngón trỏ (hoặc ngón giữa) giữ nhẹ trọng lượng cơ, các ngón còn lại chạm hờ. Không siết cả nắm tay. Cổ tay thả tự nhiên, không bẻ vào cũng không bẻ ra. Cổ tay cứng ép cẳng tay phải đi vòng để bù, và đó là một nguồn lệch ngang rất khó nhìn thấy.'},
      {h:'Vị trí đặt tay quyết định điểm chạm nằm ở đâu trong cung vung', p:'Đặt tay cầm quá xa về phía sau đuôi cơ hay quá gần cầu tay đều dời đáy cung vung ra khỏi vị trí bi cái, khiến đầu cơ đang đi lên hoặc đi xuống lúc chạm bi. Mốc thực dụng: khi đầu cơ chạm bi cái, cẳng tay của bạn nên thẳng đứng. Điều chỉnh vị trí tay cầm cho tới khi đạt mốc này rồi ghi nhớ nó như một phần tư thế cố định.'},
      {h:'Lực đến từ biên độ, không từ siết tay', p:'Muốn mạnh hơn thì lùi cơ dài hơn và tăng tốc mượt hơn, đừng bóp mạnh hơn. Đây cũng là điều làm nhà nghề trông nhàn hạ trong khi bi cái chạy rất xa: họ tăng biên độ chứ không tăng độ gồng. Cùng một tốc độ đầu cơ, cú vung lỏng cho hướng chuẩn hơn nhiều so với cú vung gồng.'},
      {h:'Buông tay là hành vi tâm lý, không chỉ là kỹ thuật', p:'Áp lực nắm cơ là nơi căng thẳng tâm lý biểu hiện ra tay nhanh nhất và trung thực nhất. Ở cú quyết định, tay siết lại mà bạn không hay biết, và cú đánh đổi tính chất. Vì vậy hãy đưa một câu kiểm tra áp lực nắm cơ vào quy trình trước cú: chạm ngón, thả lỏng, rồi mới vung. (Xem thêm "Buông tay & tin cú đánh" và "Hơi thở & điều tiết hưng phấn" ở mục Tâm lý.)'},
      {h:'Cách tự đo áp lực nắm', p:'Bài đo đơn giản: đánh 10 cú với áp lực nắm mà bạn cho là bình thường, rồi 10 cú với áp lực nhẹ nhất còn giữ nổi cơ, so quãng đường bi cái rút về và độ tản của điểm dừng. Phần lớn người chơi phát hiện bản thân đang nắm chặt hơn mức cần thiết khá nhiều. Ghi kết quả vào Nhật ký để không quên mất phát hiện này sau vài ngày.'},
      {h:'Đừng đổi tay cầm giữa trận', p:'Áp lực nắm và vị trí tay phải là hằng số của bạn, không phải thứ điều chỉnh theo từng cú. Đổi cách cầm giữa trận là đổi luôn cảm giác lực, và bạn mất toàn bộ hiệu chỉnh đã tích lũy trong buổi. Nếu phát hiện tay cầm sai, hãy sửa ở buổi TẬP, không sửa giữa trận đấu.'},
    ]},
  {key:'tec_followthrough', tag:'Kỹ thuật', title:'Theo cơ & giữ yên — phần cú đánh xảy ra sau khi đã quá muộn',
    intro:'Đầu cơ chạm bi cái trong khoảng một phần nghìn giây; sau khoảnh khắc đó, mọi thứ bạn làm đều không thể ảnh hưởng tới bi nữa. Vậy vì sao theo cơ lại quan trọng? Vì cách bạn KẾT THÚC cú đánh quyết định cách bạn thực hiện đoạn TRƯỚC đó. Không có ý định theo hết thì cơ thể tự giảm tốc sớm, và cú đánh bị phá từ trước khi chạm bi.',
    body:[
      {h:'Theo cơ không tác động lên bi, nhưng nó chứng minh cú vung đúng', p:'Bi đã rời đi từ lâu khi cơ còn đang đi tới. Giá trị của theo cơ nằm ở chỗ khác: nó chỉ xảy ra tự nhiên khi bạn tăng tốc xuyên qua bi thay vì phanh lại. Nói cách khác, theo cơ là BẰNG CHỨNG quan sát được của một cú vung không bị sợ. Ai không theo hết được thì gần như chắc chắn đang giảm tốc trước điểm chạm.'},
      {h:'Đầu cơ phải kết thúc ở đâu', p:'Mốc thực dụng: sau cú vung bình thường, đầu cơ dừng ở khoảng 10-15cm phía trước vị trí cũ của bi cái, và vẫn nằm trên đường ngắm. Cú nhẹ thì theo ngắn hơn, cú mạnh thì dài hơn, nhưng hướng luôn phải giữ nguyên. Đầu cơ kết thúc lệch sang bên là tố cáo cú vung đi chéo — dùng chính điểm dừng của đầu cơ làm thước đo sau mỗi cú.'},
      {h:'Giữ yên sau cú đánh là một kỹ năng riêng', p:'Sau khi vung hết, hãy ở nguyên tư thế thêm một nhịp, mắt vẫn ở nơi bi mục tiêu vừa nằm. Việc này vừa loại bỏ động tác ngóc đầu sớm, vừa cho bạn dữ liệu: nếu bạn không giữ nổi tư thế sau cú đánh, nghĩa là tư thế đó vốn không cân bằng ngay từ đầu. Nhiều huấn luyện viên coi khả năng đóng băng sau cú đánh là dấu hiệu nhận biết người chơi có nền tảng.'},
      {h:'Theo cơ ngắn ở cú nhẹ vẫn phải MƯỢT', p:'Cú nhẹ không có nghĩa là cú cụt. Rất nhiều người đánh cú nhẹ bằng cách chọc một phát rồi dừng — cú chọc đó có tốc độ đầu cơ thất thường và làm cảm giác lực rất khó rèn. Đúng là biên độ NGẮN nhưng chuyển động vẫn liên tục và vẫn theo qua bi một đoạn nhỏ. Đây là bí quyết của những người điều bi nhẹ nhàng mà chính xác.'},
      {h:'Không có theo cơ thì không có cú rút thật sự', p:'Cú rút cần đầu cơ ở lại tiếp xúc với bi cái đủ lâu để truyền xoáy ngược. Cú chọc rồi rụt tay lại truyền được rất ít xoáy, và người chơi kết luận nhầm rằng mình cần đánh mạnh hơn hoặc thấp hơn — cả hai đều làm tình hình xấu đi và dễ trượt cơ. Vấn đề thật nằm ở việc thiếu theo cơ.'},
      {h:'Đích tưởng tượng phía sau bi cái', p:'Mẹo giúp cơ thể tự theo hết: đừng nhắm vào bề mặt bi cái, hãy nhắm tới một điểm nằm sau bi cái vài centimet, như thể bạn muốn đưa đầu cơ tới đó. Ý định đó tự sinh ra tăng tốc xuyên qua bi và theo cơ đúng hướng, mà không cần bạn nghĩ tới cơ học của cánh tay ở giữa cú.'},
      {h:'Kiểm tra bằng cách để đầu cơ dừng trên đường ngắm', p:'Bài đo: đánh 10 cú, sau mỗi cú giữ nguyên và nhìn xem đầu cơ đang nằm ở đâu so với đường ngắm ban đầu. Đếm số lần nó lệch và lệch về phía nào. Nếu lệch cùng một phía đều đặn, bạn có một sai số hệ thống rất đáng giá để sửa — nó đang âm thầm thêm áp phê ngoài ý muốn vào mọi cú của bạn.'},
    ]},
  {key:'tec_timing', tag:'Kỹ thuật', title:'Nhịp & thời điểm — vì sao cùng một lực lại ra hai kết quả',
    intro:'Hai người cùng đưa đầu cơ tới bi ở cùng tốc độ vẫn có thể cho hai kết quả rất khác nhau, vì bi cái không chỉ phản ứng với TỐC ĐỘ mà còn với cách tốc độ đó được tạo ra. Nhịp là yếu tố mà người chơi cảm nhận rõ nhất nhưng khó nói thành lời nhất — và cũng là thứ đầu tiên biến mất khi căng thẳng.',
    body:[
      {h:'Nhịp là gì trong một cú đánh', p:'Nhịp là quan hệ thời gian giữa các đoạn của cú: các nhịp vung thử, nhịp lùi cơ cuối, khoảng dừng ở điểm cuối, và pha tăng tốc tới bi. Cú đánh tốt có tỉ lệ thời gian giữa các đoạn này ổn định từ cú này sang cú khác, bất kể lực mạnh hay nhẹ. Cùng một nhịp áp cho mọi cú là dấu hiệu nhận biết người chơi trình cao — bạn có thể nhận ra họ chỉ bằng cách nghe.'},
      {h:'Khoảng dừng ở cuối nhịp lùi', p:'Một khoảng dừng rất ngắn ở điểm lùi xa nhất làm hai việc: cắt đứt mọi rung động còn sót lại từ nhịp lùi, và cho mắt một khoảnh khắc cuối để xác nhận đường ngắm. Cú vung không có khoảng dừng này thường mang theo động lượng thừa từ nhịp lùi và dễ đi chéo. Đây là chi tiết nhỏ nhưng sửa xong thì độ tản của cú giảm rõ.'},
      {h:'Tăng tốc dần, không giật', p:'Từ điểm dừng, cơ phải tăng tốc mượt tới bi. Cú giật là cú đạt tốc độ đỉnh ngay tức thì rồi giảm dần, nên tốc độ tại điểm chạm rất khó lặp lại. Cú tăng tốc dần đạt đỉnh ở gần bi và cho lực nhất quán hơn nhiều. Nếu cảm giác lực của bạn thất thường trong khi cú vung trông thẳng, hãy nghi ngờ pha tăng tốc trước tiên.'},
      {h:'Số nhịp vung thử phải cố định', p:'Vung thử là để chỉnh cảm giác lực và xác nhận đường, không phải để trấn an. Chọn một con số cố định — hai hoặc ba nhịp là phổ biến — và giữ nguyên ở mọi cú, kể cả cú quan trọng nhất. Số nhịp vung thử tăng lên ở cú căng là dấu hiệu chắc chắn của do dự, và do dự đã vào cú thì cú đó hầu như luôn hỏng. (Xem "Buông tay & tin cú đánh".)'},
      {h:'Nhịp vung thử phải giống nhịp thật', p:'Sai lầm phổ biến: vung thử chậm rãi rồi cú thật lại nhanh gấp đôi. Như vậy các nhịp thử không cung cấp thông tin gì về lực, thậm chí đánh lừa cảm giác. Vung thử ở đúng tốc độ bạn định đánh, để cơ thể được diễn tập chính cú sắp thực hiện.'},
      {h:'Nhịp là thứ đầu tiên mất khi căng', p:'Dưới áp lực, cú đánh có xu hướng nhanh lên và cụt lại: ít vung thử hơn, lùi cơ ngắn hơn, tăng tốc giật. Vì thế nhịp vừa là kỹ thuật vừa là công cụ tự kiểm tra trạng thái — thấy mình đang đánh nhanh hơn thường lệ là biết mình đang căng, trước cả khi kịp cảm thấy căng. Đứng dậy, thở, vào lại quy trình. (Xem "Áp lực & khoảnh khắc căng" và "Hơi thở & điều tiết hưng phấn".)'},
      {h:'Dùng máy nhịp để cấy nhịp vào người', p:'Nhịp rèn được bằng cách lặp có mốc bên ngoài. Đặt máy nhịp ở tab Tâm & Thân và đánh sao cho từng đoạn của cú rơi đúng phách trong nhiều buổi liên tiếp. Sau vài tuần, nhịp trở thành mặc định của cơ thể và tự trở lại ngay cả khi bạn đang căng — đó chính là mục tiêu. (Xem bài tập "Nhịp đưa cơ" ở tab Rèn luyện.)'},
      {h:'Nhịp giữa các cú cũng phải đều', p:'Ngoài nhịp bên trong một cú, còn có tốc độ chung của lượt đánh: đi tới bàn, đọc thế, vào cú, đánh, rời bàn. Người ổn định giữ tốc độ này gần như không đổi cả trận, kể cả lúc đang thắng đậm hay đang bị dồn. Tăng tốc khi hưng phấn và chậm lại khi sợ đều là dấu hiệu tay sắp trôi. (Xem "Đà & động lượng trận đấu".)'},
    ]},
  {key:'tec_tipcontact', tag:'Kỹ thuật', title:'Điểm chạm đầu cơ — một milimet ở đây bằng cả gang tay ở kia',
    intro:'Toàn bộ thông tin bạn gửi cho bi cái đi qua đúng một cửa: vị trí đầu cơ chạm lên mặt bi, tính bằng milimet. Hướng, xoáy dọc, xoáy ngang, độ lệch — tất cả được quyết định tại điểm đó trong khoảng một phần nghìn giây. Người chơi thường nghĩ mình đang điều khiển bi cái bằng ý chí; thực tế bạn chỉ điều khiển được một toạ độ hai chiều trên một mặt cầu nhỏ.',
    body:[
      {h:'Bản đồ mặt bi cái', p:'Hình dung mặt bi cái hướng về phía bạn như một mặt đồng hồ có tâm. Chạm trên tâm cho xoáy tới (theo, cu lê). Chạm dưới tâm cho xoáy ngược (rút, trô). Chạm trái hoặc phải tâm cho xoáy ngang (áp phê). Chạm chéo cho tổ hợp cả hai. Mọi cú bi-a từng được đánh trong lịch sử đều chỉ là một điểm trên bản đồ này cộng với một con số lực.'},
      {h:'Vì sao sai một milimet lại nghiêm trọng', p:'Bi tiêu chuẩn có bán kính khoảng 28,6mm, và vùng đánh được an toàn chỉ tới khoảng nửa bán kính, tức khoảng 14mm tính từ tâm. Nghĩa là toàn bộ thang xoáy từ không tới tối đa nằm gọn trong 14mm. Lệch 1mm là lệch khoảng 7% toàn thang — đủ để đổi rõ đường bi cái ở cú dài. Đây là lý do vì sao bi-a là môn của độ chính xác chứ không phải môn của sức.'},
      {h:'Đánh tâm bi khó hơn người ta tưởng', p:'Tâm bi nghe như mặc định nhưng thực ra là một điểm phải NHẮM có ý thức. Rất nhiều người chơi nghĩ mình đánh tâm trong khi thực tế luôn chạm lệch nhẹ một bên — đó chính là sai số hệ thống làm mọi cú của họ dính chút áp phê không mong muốn, khiến bi cái phản xạ băng khác dự đoán và cú thẳng dài hay trượt. Xác định được tâm bi thật của mình là một bước lên trình lớn.'},
      {h:'Cách tự kiểm tra xem mình có đánh trúng tâm không', p:'Bài đo tốt nhất: cú thẳng đứng bi. Đặt bi cái thẳng hàng với bi mục tiêu và một lỗ, đánh tâm, lực vừa. Trúng tâm thì bi cái dừng gần như tại chỗ. Nếu bi cái nhích sang trái, bạn đang chạm lệch phải, và ngược lại. Đánh 10 cú và ghi hướng nhích — nếu 7-8 lần cùng một phía, bạn vừa tìm ra một lỗi hệ thống đang âm thầm phá mọi cú của mình.'},
      {h:'Dùng bi sọc làm thước đo miễn phí', p:'Bề rộng của sọc trên bi sọc tiêu chuẩn bằng đúng một nửa đường kính bi, nên hai mép sọc rơi gần đúng vào giới hạn trượt cơ ở hai bên. Đặt bi sọc nằm ngang làm bi cái để tập: bạn nhìn thấy ngay mình đang chạm trong hay ngoài vùng an toàn, và ước lượng được lượng xoáy theo phần của sọc. Đây là dụng cụ đo chính xác nhất mà không tốn đồng nào.'},
      {h:'Ngôn ngữ "một đầu cơ" và cách nó đánh lừa', p:'Người chơi hay nói "một đầu cơ áp phê", "hai đầu cơ trô". Cách nói này tiện nhưng lỏng lẻo, vì đường kính đầu cơ khác nhau giữa các cây và vì đầu cơ chạm bi theo diện chứ không theo điểm. Với người muốn chính xác, hãy chuyển sang nghĩ theo PHẦN của khoảng cách tới giới hạn trượt cơ: một nửa đường tới giới hạn, sát giới hạn. Cách nghĩ này không đổi khi bạn đổi cây cơ.'},
      {h:'Đầu cơ chạm bi theo diện, không theo điểm', p:'Điểm chạm thật là một vết tiếp xúc nhỏ chứ không phải một điểm toán học, và bề mặt bi cong nên càng ra xa tâm thì vết tiếp xúc càng lệch và càng dễ trượt. Đây là lý do vật lý khiến xoáy cực đại không bao giờ đạt được an toàn, và vì sao đánh sát giới hạn luôn là canh bạc. Người giỏi hầu như không bao giờ đánh sát mép.'},
      {h:'Nhìn đâu ở nhịp cuối', p:'Quy ước phổ biến và hiệu quả: trong các nhịp vung thử, mắt kiểm tra ĐIỂM CHẠM trên bi cái để xác nhận độ cao và độ lệch; ở nhịp cuối, mắt chuyển sang bi mục tiêu hoặc điểm ngắm và giữ nguyên ở đó cho tới khi bi đã đi. Đảo ngược thứ tự này — nhìn bi cái ở nhịp cuối — là một trong những nguyên nhân trượt phổ biến nhất mà người chơi không tự nhận ra.'},
      {h:'Ánh sáng và bụi lơ trên bi cái', p:'Điểm chạm chỉ chính xác khi bạn NHÌN được nó. Bi cái bẩn, ánh đèn hắt bóng cây cơ lên mặt bi, hay bàn thiếu sáng đều làm ước lượng độ cao sai vài milimet. Trước trận, lau bi cái nếu được phép và để ý hướng đèn. Đây là loại chi tiết nhỏ mà người chơi nghiêm túc kiểm tra còn người chơi phong trào không bao giờ nghĩ tới.'},
    ]},
  {key:'tec_miscue', tag:'Kỹ thuật', title:'Giới hạn trượt cơ — vùng an toàn trên mặt bi cái',
    intro:'Có một biên giới vật lý trên mặt bi cái: ra ngoài nó thì đầu cơ không còn bám được nữa và trượt đi, cho ra cú hỏng, tiếng kêu đặc trưng và một bi cái đi lung tung. Biết chính xác biên giới đó ở đâu là biết mình được phép dùng bao nhiêu xoáy — và quan trọng hơn, biết khi nào mình đang liều mà tưởng là đang kỹ thuật.',
    body:[
      {h:'Biên giới nằm ở đâu', p:'Giới hạn trượt cơ nằm vào khoảng NỬA BÁN KÍNH tính từ tâm bi cái, tức khoảng 14mm trên bi tiêu chuẩn đường kính 57mm. Vượt qua mốc đó, lực ma sát giữa đầu cơ và mặt bi không đủ giữ tiếp xúc, đầu cơ trượt khỏi bề mặt và cú đánh hỏng. Đây là hằng số vật lý, không phải vấn đề kỹ năng — không ai vượt qua được nó, kể cả nhà vô địch thế giới.'},
      {h:'Hình dung vùng an toàn', p:'Vẽ trong đầu một vòng tròn có bán kính bằng nửa bán kính bi, đồng tâm với mặt bi cái. Mọi cú hợp lệ nằm TRONG vòng tròn đó. Mép vòng tròn là xoáy tối đa lý thuyết, nhưng vùng sát mép rất kém tin cậy. Vùng làm việc thực tế của người chơi giỏi thường nằm trong khoảng 70-80% bán kính vòng tròn đó, tức họ hiếm khi dùng tới xoáy tối đa.'},
      {h:'Xoáy tối đa gần như vô dụng trong thi đấu', p:'Đánh sát giới hạn cho thêm rất ít xoáy so với đánh ở 80%, nhưng làm tăng vọt xác suất trượt cơ và tăng mạnh độ lệch bi cái. Đây là một trong những phép đánh đổi tệ nhất trên bàn bi-a. Quy tắc thực dụng: nếu bạn cần xoáy sát giới hạn để cú đánh thành công, gần như chắc chắn bạn đang chọn sai phương án — hãy tìm đường khác.'},
      {h:'Ba nguyên nhân gây trượt cơ', p:'Thứ nhất, chạm ra ngoài giới hạn. Thứ hai, đầu cơ thiếu lơ nên hệ số ma sát tụt xuống và giới hạn co lại. Thứ ba, đầu cơ mòn nhẵn hoặc chai cứng, không còn giữ lơ. Nghĩa là hai trong ba nguyên nhân của một cú hỏng nghiêm trọng nằm ở việc bảo dưỡng dụng cụ chứ không nằm ở kỹ thuật của bạn.'},
      {h:'Lơ đúng cách, không phải lơ nhiều lần', p:'Lơ phải phủ đều toàn bộ mặt cong của đầu cơ, đặc biệt là vùng RÌA — vì rìa mới là nơi tiếp xúc khi bạn đánh lệch tâm. Xoay hộp lơ nhẹ nhàng quanh đầu cơ chứ đừng khoan thẳng xuống, vì khoan thẳng chỉ phủ đỉnh và làm mòn lõm chính giữa. Lơ trước MỌI cú có dùng xoáy, không phải chỉ khi nhớ ra.'},
      {h:'Độ cong đầu cơ quyết định vùng làm việc', p:'Đầu cơ mòn phẳng khiến rìa không còn chạm được tới vùng lệch tâm, thu hẹp vùng an toàn thực tế của bạn mà bạn không hay biết — bạn chỉ thấy "dạo này hay trượt cơ". Giữ đầu cơ có độ cong tương đương một đồng xu nhỏ và tạo nhám định kỳ để lơ bám. Đây là bảo dưỡng năm phút cho một cải thiện thấy được ngay.'},
      {h:'Trượt cơ ở cú quan trọng thường không phải kỹ thuật', p:'Trượt cơ hay xảy ra đúng lúc căng vì lúc đó người chơi vô thức đánh thấp hơn hoặc lệch hơn để "chắc ăn", đồng thời quên lơ. Nếu bạn trượt cơ ở cú quyết định, hãy soát lại quy trình trước cú chứ đừng kết luận là mình yếu tâm lý — thường có một mắt xích cụ thể bị bỏ qua. (Xem "Áp lực & khoảnh khắc căng".)'},
      {h:'Nghe tiếng chạm bi để tự chẩn đoán', p:'Cú chạm sạch cho tiếng gọn và chắc. Cú sát giới hạn cho tiếng đục hơn và đôi khi kèm tiếng trượt nhẹ, ngay cả khi bi vẫn đi tạm được. Tập nghe tiếng chạm là một kênh phản hồi bổ sung: nó cho bạn biết mình vừa đánh ở rìa vùng an toàn, trước cả khi nhìn thấy hậu quả trên đường bi.'},
    ]},
  {key:'tec_slideroll', tag:'Kỹ thuật', title:'Trượt và lăn — vì sao bi cái đổi tính giữa đường',
    intro:'Bi cái không giữ nguyên trạng thái từ lúc rời đầu cơ tới lúc chạm bi mục tiêu. Nó bắt đầu ở một trạng thái xoáy nào đó rồi ma sát mặt nỉ liên tục biến đổi trạng thái ấy. Hệ quả rất thực tế: cùng một cú đánh, nếu bi mục tiêu ở gần hay ở xa thì bi cái hành xử khác hẳn nhau. Không hiểu điều này thì điều bi của bạn sẽ luôn đúng ở một khoảng cách và sai ở mọi khoảng cách khác.',
    body:[
      {h:'Ba trạng thái của bi cái trên đường đi', p:'Trượt: bi trôi mà chưa lăn đúng vận tốc, mặt bi cà trên nỉ. Lăn tự nhiên: bi lăn khớp với vận tốc tiến, không còn cà. Xoáy ngược còn sống: bi vừa tiến vừa xoáy lùi. Trạng thái của bi cái TẠI THỜI ĐIỂM chạm bi mục tiêu mới là thứ quyết định nó đi đâu sau đó — không phải trạng thái lúc rời đầu cơ.'},
      {h:'Ma sát nỉ luôn kéo mọi thứ về lăn tự nhiên', p:'Dù bạn đánh cao hay thấp, nỉ luôn làm cùng một việc: đưa bi cái về trạng thái lăn tự nhiên. Cú đánh tâm sẽ chuyển từ trượt sang lăn sau một quãng ngắn. Cú rút sẽ mất dần xoáy ngược, đứng lại, rồi cuối cùng cũng lăn tới. Bi cái đi càng xa thì càng gần trạng thái lăn tự nhiên — đây là quy luật nền của toàn bộ điều bi khoảng cách xa.'},
      {h:'Vì sao cú rút không rút được ở khoảng cách xa', p:'Xoáy ngược tiêu hao theo quãng đường. Nếu bi mục tiêu ở xa, xoáy ngược có thể đã tắt hết trước khi va chạm, và bi cái sẽ đứng hoặc thậm chí đi tới thay vì lùi lại — dù bạn đã đánh rất thấp. Đây không phải lỗi kỹ thuật mà là quy luật; cách xử lý là đánh thấp hơn và dứt khoát hơn, hoặc chấp nhận đổi phương án.'},
      {h:'Vì sao cú đứng bi chỉ đứng ở đúng một khoảng cách', p:'Cú đứng bi cần bi cái đang trượt và không xoáy tại thời điểm va chạm. Nhưng bi cái đánh tâm sẽ chuyển sang lăn sau một quãng, nên cùng một cú đánh tâm sẽ cho đứng bi ở gần và cho theo bi ở xa. Muốn đứng bi ở xa, bạn phải đánh THẤP hơn tâm một chút để xoáy ngược vừa kịp tắt đúng lúc chạm. Nắm được điều này là nắm được một trong những chìa khoá thật sự của điều bi.'},
      {h:'Quy tắc thực dụng theo khoảng cách', p:'Cùng một mục tiêu điều bi, càng xa thì càng phải đánh thấp hơn để bù cho phần xoáy bị tiêu hao. Ngược lại, ở cự ly rất gần, bi cái chưa kịp đổi trạng thái nên cú đánh cho kết quả gần đúng như lý thuyết. Hãy tập cùng một cú ở ba cự ly khác nhau và ghi lại điểm chạm cần thiết cho mỗi cự ly — bảng số đó của riêng bạn quý hơn mọi lời khuyên chung chung.'},
      {h:'Xoáy ngang tồn tại lâu hơn xoáy dọc', p:'Xoáy ngang không bị mặt nỉ triệt tiêu nhanh như xoáy dọc, vì nó xoay quanh trục đứng nên ma sát tác động lên nó theo cách khác. Hệ quả thực tế: áp phê thường vẫn còn sống khi bi cái tới băng, kể cả ở đường dài, và nó sẽ bẻ góc phản xạ. Đây là lý do áp phê rất mạnh ở đường nhiều băng nhưng cũng là lý do nó rất khó kiểm soát ở đó.'},
      {h:'Nỉ nhanh hay chậm đổi hết các mốc trên', p:'Nỉ mới, nhanh, khô thì ma sát ít, xoáy sống lâu hơn và mọi quãng đường chuyển trạng thái đều dài ra. Nỉ cũ, ẩm, nhiều bụi thì ngược lại: xoáy tắt sớm, cú rút chết nhanh. Nghĩa là bảng số bạn tự đo được ở bàn quen KHÔNG mang nguyên sang bàn lạ — phải hiệu chỉnh lại vài cú đầu buổi. (Xem "Nỉ, độ ẩm & tốc độ bàn".)'},
      {h:'Bài tập để cảm được điều này', p:'Đặt bi mục tiêu ở ba cự ly: nửa mét, một mét, hai mét, mỗi lần đều cú thẳng. Với mỗi cự ly, tìm điểm chạm khiến bi cái ĐỨNG YÊN sau va chạm. Bạn sẽ thấy điểm đó tụt thấp dần khi cự ly tăng. Ghi lại ba điểm chạm ấy vào Nhật ký — đó là bảng hiệu chỉnh cá nhân, và nó có giá trị hơn nhiều so với việc đọc lý thuyết mười lần.'},
    ]},
  {key:'tec_squirt', tag:'Kỹ thuật', title:'Squirt — bi cái KHÔNG đi theo hướng cây cơ',
    intro:'Đây là sự thật khó chịu mà phần lớn người chơi phong trào không biết: khi bạn đánh lệch tâm để tạo áp phê, bi cái KHÔNG rời đi theo hướng cây cơ đang chỉ. Nó rời đi lệch sang phía NGƯỢC LẠI với bên bạn đánh. Hiện tượng này gọi là squirt hay độ lệch bi cái, và nó tồn tại ở mọi cây cơ, mọi người chơi, mọi cú có xoáy ngang. Không biết nó tồn tại thì bạn sẽ đổ lỗi cho cách ngắm của mình suốt nhiều năm.',
    body:[
      {h:'Hiện tượng: đánh trái thì bi cái đi lệch phải', p:'Đánh vào bên trái tâm bi cái, bi cái nhận xoáy trái nhưng đường đi ban đầu của nó lệch sang PHẢI so với hướng cây cơ. Đánh phải thì lệch trái. Nguyên nhân: cú chạm lệch tâm đẩy bi cái theo phương không đi qua tâm khối, nên bi vừa quay vừa bị đẩy ngang. Đây là vật lý thuần tuý, không phải lỗi cú vung — người đánh chuẩn nhất thế giới cũng chịu đúng hiện tượng này.'},
      {h:'Squirt phụ thuộc vào cái gì', p:'Hai yếu tố chính. Một, LƯỢNG lệch tâm: đánh càng xa tâm thì squirt càng lớn, gần như tỉ lệ thuận. Hai, khối lượng phần đầu cây cơ: ngọn cơ càng nhẹ ở phần đầu thì squirt càng nhỏ — đó chính là nguyên lý của các ngọn cơ quảng cáo là chống lệch. Đáng chú ý: squirt gần như KHÔNG phụ thuộc vào tốc độ cú đánh, khác hẳn swerve.'},
      {h:'Vì sao điều này quan trọng đến vậy', p:'Squirt là một sai số HỆ THỐNG: nó luôn xảy ra, luôn cùng hướng, và tỉ lệ với lượng xoáy bạn dùng. Sai số hệ thống thì bù trừ được — nghĩa là một khi bạn hiểu nó, bạn có thể xử lý nó gần như hoàn toàn. Nhưng nếu không biết nó tồn tại, bạn sẽ liên tục điều chỉnh cách ngắm một cách ngẫu nhiên và không bao giờ ổn định được. Đây là ranh giới rõ nhất giữa người chơi có trình và người chơi phong trào.'},
      {h:'Mỗi cây cơ có một lượng squirt riêng', p:'Squirt là đặc tính của CÂY CƠ chứ không phải của người chơi. Đổi cơ là đổi toàn bộ lượng bù trừ mà tay bạn đã học thuộc, và đó là lý do người chơi thường đánh tệ hẳn trong vài buổi sau khi đổi cơ, kể cả khi đổi sang cơ đắt tiền hơn. Bài học thực dụng: chọn một cây cơ rồi GẮN BÓ với nó, đừng đổi tới đổi lui.'},
      {h:'Ngọn cơ chống lệch: được gì, mất gì', p:'Ngọn cơ có đầu nhẹ cho squirt nhỏ hơn, nên lượng bù trừ ít hơn và sai lệch khi ước lượng sai cũng nhỏ hơn. Nhưng squirt nhỏ hơn không có nghĩa là bằng không, và nó làm chiều dài chốt xoay tự nhiên dài ra, đôi khi dài hơn cầu tay thoải mái của bạn, khiến kỹ thuật xoay tay sau khó áp dụng hơn. Không có bữa trưa miễn phí; điều quan trọng vẫn là BIẾT cây cơ của mình.'},
      {h:'Cách tự đo squirt của cây cơ mình', p:'Bài đo kinh điển: đặt bi cái sát băng dọc, đánh dọc theo băng về phía băng đối diện với áp phê tối đa một bên, cơ giữ càng ngang càng tốt, lực mạnh vừa và cự ly ngắn để hạn chế swerve. Nhìn xem bi cái đi lệch ra khỏi băng hay ép vào băng bao nhiêu. Lặp lại ở các mức xoáy khác nhau. Đây là lần đầu tiên nhiều người chơi nhìn thấy squirt bằng chính mắt mình — và nó thường lớn hơn họ tưởng.'},
      {h:'Squirt lớn nhất ở cú ngắn và nhanh', p:'Vì squirt xảy ra ngay tại thời điểm chạm còn swerve cần thời gian và quãng đường để cong lại, nên ở cú NGẮN và NHANH bạn thấy squirt gần như thuần tuý, không được swerve bù lại. Đó là lý do cú áp phê ngắn, mạnh hay trượt một cách khó hiểu. Với loại cú này, hoặc bỏ áp phê, hoặc bù trừ có ý thức.'},
      {h:'Ba cách sống chung với squirt', p:'Một, TRÁNH: đánh tâm bi khi không thật sự cần xoáy — cách tốt nhất và rẻ nhất. Hai, BÙ BẰNG CẢM GIÁC: dùng cùng một cây cơ đủ lâu để tay tự học lượng bù, cách của phần lớn người chơi giỏi. Ba, BÙ CÓ HỆ THỐNG: dùng kỹ thuật xoay tay sau hoặc ngắm song song có tính toán. (Xem "Bù trừ độ lệch".)'},
      {h:'Gói lại một câu', p:'Cây cơ chỉ hướng nào không quan trọng bằng bi cái ĐI hướng nào. Với cú đánh tâm, hai hướng đó trùng nhau nên bạn không phải nghĩ. Với cú có áp phê, chúng tách ra, và khoảng cách giữa chúng chính là thứ bạn phải quản lý. Mọi người chơi trình cao đều đang quản lý nó, dù nhiều người trong số họ không gọi tên được hiện tượng.'},
    ]},
  {key:'tec_swerve', tag:'Kỹ thuật', title:'Swerve — bi cái đi đường cong chứ không đi đường thẳng',
    intro:'Squirt đẩy bi cái lệch ngay lúc rời đi; swerve là hiện tượng bi cái CONG TRỞ LẠI trên đường đi. Nguyên nhân: cây cơ của bạn không bao giờ nằm ngang hoàn toàn — đuôi cơ luôn cao hơn đầu cơ để tránh vướng băng — nên mọi cú có áp phê đều là một cú masse rất nhẹ. Ở cú ngắn và nhanh, đường cong này không kịp thể hiện. Ở cú dài và chậm, nó có thể lớn đến mức đổi hẳn kết quả.',
    body:[
      {h:'Cơ chế: mọi cú đều hơi chếch', p:'Để đầu cơ chạm được bi cái mà tay không đè lên băng, đuôi cơ luôn cao hơn đầu cơ ít nhất vài độ. Khi có xoáy ngang, độ chếch đó khiến bi cái vừa trượt vừa xoáy trên nỉ, và ma sát nỉ bẻ đường đi của nó cong về phía CÙNG CHIỀU với áp phê. Đánh trái thì đường cong về trái. Đây chính là chiều ngược với squirt — hai hiện tượng chống nhau.'},
      {h:'Swerve phụ thuộc vào cái gì', p:'Bốn yếu tố, và đây là điểm khác biệt lớn nhất so với squirt: (i) TỐC ĐỘ — càng chậm càng cong nhiều, vì bi có thêm thời gian trượt; (ii) QUÃNG ĐƯỜNG — càng dài càng cong nhiều; (iii) ĐỘ CHẾCH của cơ — càng chếch càng cong; (iv) lượng xoáy và điều kiện nỉ. Nhớ kỹ điểm (i): squirt không đổi theo tốc độ, còn swerve thì đổi rất mạnh.'},
      {h:'Vì sao cùng một cú lại ra hai kết quả', p:'Đây là lời giải cho trải nghiệm khó hiểu quen thuộc: bạn đánh một cú áp phê mạnh thì vào, đánh đúng cú đó nhẹ hơn thì trượt hẳn sang một bên. Không phải bạn ngắm khác — mà là ở cú nhẹ, swerve có thời gian cong bi cái đi. Người không biết hiện tượng này sẽ kết luận nhầm rằng mình không ổn định, trong khi thực ra họ đang rất nhất quán với một quy luật mà họ chưa biết.'},
      {h:'Hạ cơ xuống là cách giảm swerve trực tiếp nhất', p:'Vì swerve sinh ra từ độ chếch, nên giữ cơ càng ngang càng tốt là cách chặn nó tại gốc. Trước cú có áp phê, hãy để ý mình có đang kê tay quá cao không, có thể hạ cầu tay xuống được không. Rất nhiều người chơi cầm cơ chếch hơn mức cần thiết vì thói quen chứ không vì thế bàn bắt buộc — và họ trả giá bằng những cú cong không giải thích được.'},
      {h:'Cú chậm đường dài là vùng nguy hiểm nhất', p:'Tổ hợp tệ nhất cho độ chính xác là: áp phê nhiều, lực nhẹ, quãng đường dài, cơ chếch. Đó chính xác là loại cú mà người chơi hay chọn khi muốn "nhẹ nhàng đưa bi cái về chỗ" ở cuối ván. Nếu buộc phải đánh loại cú này, hãy giảm áp phê xuống mức tối thiểu và chấp nhận một đường ra bi kém đẹp hơn nhưng đoán được.'},
      {h:'Cách tự thấy swerve bằng mắt', p:'Bài đo: đặt bi cái ở một đầu bàn, không có bi mục tiêu, đánh áp phê tối đa một bên với lực RẤT NHẸ, hướng dọc bàn, cơ chếch bình thường. Quan sát đường đi — bạn sẽ thấy nó cong rõ. Lặp lại đúng cú đó với lực mạnh: đường thẳng hơn hẳn. Chênh lệch giữa hai lần chính là swerve, và nó thường làm người chơi kinh ngạc vì độ lớn.'},
      {h:'Swerve là công cụ, không chỉ là kẻ phá hoại', p:'Khi đã hiểu, bạn dùng được nó có chủ đích: cố ý chếch cơ và đánh nhẹ để bi cái đi vòng qua một bi chắn. Đó là cú masse thu nhỏ, và nó giải được những thế mà đường thẳng không giải được. Nhưng đây là kỹ thuật cấp cao, độ tin cậy thấp, nên chỉ dùng khi không còn phương án nào rẻ hơn. (Xem "Bi khó: bi sát băng, bi kê, bi dính" ở mục Chiến thuật.)'},
      {h:'Quy tắc ghi nhớ', p:'Squirt đẩy bi cái sang phía NGƯỢC với áp phê, xảy ra ngay, không đổi theo tốc độ. Swerve kéo bi cái cong về phía CÙNG với áp phê, cần thời gian, mạnh lên khi đánh chậm và đi xa. Hai lực ngược chiều nhau, và tổng của chúng mới là thứ bạn thật sự nhìn thấy trên bàn. (Xem bài tiếp theo.)'},
    ]},
  {key:'tec_squerve', tag:'Kỹ thuật', title:'Cộng gộp squirt và swerve — vì sao có cú lại tự khớp',
    intro:'Squirt và swerve đẩy bi cái theo hai chiều ngược nhau, nên thứ bạn quan sát được trên bàn không bao giờ là một trong hai, mà luôn là TỔNG của chúng. Hiểu phép cộng này giải thích được gần hết những chuyện khó hiểu khi dùng áp phê: vì sao có lúc cú áp phê vào ngon lành như không cần bù trừ gì, có lúc lại lệch hẳn ra ngoài.',
    body:[
      {h:'Hai lực ngược chiều gặp nhau', p:'Ngay lúc rời đầu cơ, squirt đẩy bi cái lệch sang phía ngược với áp phê. Trên đường đi, swerve kéo nó cong ngược trở lại về phía cùng chiều áp phê. Kết quả cuối cùng tại thời điểm chạm bi mục tiêu là hiệu số của hai thứ đó. Vì thế câu hỏi đúng không phải "squirt bao nhiêu" mà là "tại điểm va chạm, tổng còn lại bao nhiêu".'},
      {h:'Ba vùng kết quả', p:'Cú NGẮN và NHANH: swerve chưa kịp làm gì, kết quả gần như thuần squirt, bi cái lệch ngược chiều áp phê — đây là vùng dễ trượt nhất nếu không bù. Cú DÀI và CHẬM: swerve có đủ thời gian và có thể bù quá tay, bi cái lệch cùng chiều áp phê. Ở giữa có một vùng mà hai thứ TRIỆT TIÊU gần hết và bi cái đi gần đúng hướng cây cơ.'},
      {h:'Vùng triệt tiêu giải thích nhiều điều', p:'Vùng cân bằng đó chính là lý do một số người chơi tin rằng squirt không tồn tại: họ tình cờ đánh phần lớn cú ở tốc độ và cự ly rơi vào vùng cân bằng, nên chưa bao giờ thấy hậu quả rõ ràng. Rồi một hôm họ đánh một cú ngắn mạnh có áp phê và trượt không hiểu vì sao. Biết vùng cân bằng nằm ở đâu với cây cơ của mình là một lợi thế lớn.'},
      {h:'Vì sao tốc độ trở thành biến số nguy hiểm', p:'Vì squirt không đổi theo tốc độ còn swerve thì đổi mạnh, nên TỐC ĐỘ trực tiếp làm thay đổi tổng độ lệch. Nghĩa là ở cú có áp phê, sai lực không chỉ làm bi cái đi quá hay non — nó còn làm bi cái đi SAI HƯỚNG. Đây là lý do sâu xa vì sao dùng áp phê đòi hỏi cảm giác lực tốt hơn hẳn so với đánh tâm bi.'},
      {h:'Hệ quả thực chiến số một: giảm số biến', p:'Mỗi cú áp phê buộc bạn phải ước lượng đúng cả tốc độ lẫn cự ly để đoán được tổng độ lệch. Đánh tâm bi xoá sạch bài toán này. Đây chính là căn cứ vật lý cho nguyên tắc điều bi tối giản ở mục Chiến thuật — không phải lời khuyên cho người lười, mà là cách giảm số biến trong một phép tính vốn đã khó.'},
      {h:'Hệ quả thực chiến số hai: cố định tốc độ', p:'Nếu bạn phải dùng áp phê thường xuyên, hãy cố gắng dùng nó ở một dải tốc độ QUEN THUỘC thay vì mỗi lần một kiểu. Tay bạn học được lượng bù trừ cho một tốc độ nhanh hơn nhiều so với học cho cả một dải. Người chơi giỏi thường có một tốc độ "ruột" cho các cú xoáy và tránh chệch khỏi nó khi không cần thiết.'},
      {h:'Cách lập bảng cá nhân', p:'Chọn ba mức xoáy (nhẹ, vừa, gần tối đa), ba mức lực, và hai cự ly. Với mỗi tổ hợp, đánh vào một mục tiêu cố định và ghi lại lệch bao nhiêu và về phía nào. Bảng đó chỉ mất một buổi để làm và sẽ phục vụ bạn nhiều năm, miễn là bạn không đổi cơ. Rất ít người chơi từng làm việc này — và đó chính là cơ hội của bạn.'},
      {h:'Khi nào nên bỏ hẳn áp phê', p:'Ba trường hợp nên bỏ: khi cú đã khó sẵn về hình học, khi đang căng và cảm giác lực không đáng tin, và khi cùng mục tiêu điều bi đó có thể đạt được bằng lực và điểm chạm dọc. Bỏ áp phê ở ba tình huống này thường cải thiện tỉ lệ thành công ngay lập tức mà không cần tập thêm giờ nào.'},
    ]},
  {key:'tec_throw', tag:'Kỹ thuật', title:'Throw — bi mục tiêu bị ma sát kéo lệch khỏi đường hình học',
    intro:'Squirt và swerve làm bi CÁI đi sai; throw làm bi MỤC TIÊU đi sai. Khi hai bi chạm nhau, bề mặt chúng cà vào nhau, và ma sát đó kéo bi mục tiêu lệch khỏi đường nối tâm mà hình học dự đoán. Đây là lý do vì sao bạn ngắm đúng theo lý thuyết mà bi vẫn trượt, đặc biệt ở cú chậm — và cũng là hiện tượng bị hiểu sai nhiều nhất trong bi-a.',
    body:[
      {h:'Đường hình học chỉ đúng khi không có ma sát', p:'Lý thuyết bi va chạm nói bi mục tiêu đi theo đường nối tâm hai bi tại thời điểm chạm. Điều đó chỉ đúng nếu hai mặt bi hoàn toàn trơn. Trong thực tế chúng có ma sát, và nếu tại điểm chạm hai mặt bi đang trượt tương đối với nhau, ma sát sẽ kéo bi mục tiêu đi lệch. Hình học cho bạn điểm xuất phát; ma sát quyết định phần còn lại.'},
      {h:'Throw do góc cắt: cú cắt luôn bị đi "non"', p:'Ngay cả khi bạn đánh tâm bi không xoáy ngang, cú CẮT vẫn sinh ra throw. Lý do: ở cú cắt, mặt bi cái trượt ngang qua mặt bi mục tiêu, ma sát kéo bi mục tiêu theo chiều trượt đó — tức là kéo nó về phía hướng bi cái đang đi, làm cú cắt bị "non" hơn hình học. Hệ quả thực hành cực kỳ quan trọng: ở cú cắt bạn phải ngắm MỎNG hơn lý thuyết một chút.'},
      {h:'Throw lớn nhất ở góc cắt vừa và lực nhẹ', p:'Throw do góc cắt không đều nhau ở mọi góc: nó gần như bằng không ở cú thẳng và ở cú cực mỏng, lớn nhất ở dải góc cắt trung bình. Và nó phụ thuộc mạnh vào LỰC — đánh càng chậm, throw càng lớn; đánh mạnh thì hai mặt bi trượt qua nhau nhanh và ma sát có ít thời gian tác dụng. Đây là lý do vì sao cú cắt vừa, đánh nhẹ, cự ly xa là loại cú hay trượt một cách oan uổng nhất.'},
      {h:'Throw do xoáy ngang', p:'Áp phê cũng gây throw, theo cùng cơ chế: xoáy làm mặt bi cái cà ngang lên bi mục tiêu và kéo nó lệch. Đánh áp phê một bên thì bi mục tiêu bị kéo về phía ngược lại với chiều mặt bi cái đang cà. Với người chơi, điều cần nhớ là: dùng áp phê không chỉ đổi đường của bi cái, mà còn đổi cả đường của bi mục tiêu — hai sai số cộng vào nhau trên cùng một cú.'},
      {h:'Áp phê ngoài có thể TRIỆT TIÊU throw', p:'Có một điểm ngọt rất hữu ích: nếu bạn dùng đúng một lượng áp phê ngoài (áp phê về phía cùng chiều với hướng cắt), xoáy đó làm hai mặt bi lăn khớp lên nhau thay vì trượt, và throw biến mất gần như hoàn toàn. Người chơi giỏi dùng mẹo này ở cú cắt quan trọng. Ngược lại, áp phê trong LÀM TĂNG throw — đây là lý do áp phê trong nổi tiếng là khó dùng.'},
      {h:'Bi bẩn làm throw lớn hơn nhiều', p:'Throw sinh ra từ ma sát, nên mọi thứ làm tăng ma sát đều làm tăng throw: bi bẩn, bụi lơ, dấu tay, độ ẩm. Cùng một cú, bàn bi sạch và bàn bi bẩn cho hai kết quả khác nhau thấy rõ. Nếu được phép lau bi trước trận, hãy lau — đó là năm giây đổi lấy độ đoán trước được của cả buổi.'},
      {h:'Vì sao rất nhiều người ngắm sai mà không biết', p:'Throw là sai số hệ thống nên tay bạn tự học bù trừ cho nó sau đủ số giờ — bạn ngắm mỏng hơn một chút mà không ý thức. Vấn đề nảy sinh khi điều kiện đổi: bi sạch hơn, bàn nhanh hơn, hay bạn đổi sang đánh mạnh hơn. Lúc đó lượng bù đã học không còn đúng, và bạn tưởng mình đang mất phong độ trong khi thực ra chỉ là điều kiện đã đổi.'},
      {h:'Cách tự thấy throw', p:'Bài đo kinh điển: đặt bi cái và bi mục tiêu chạm nhau, xếp thẳng hàng chỉ về một điểm cụ thể trên băng đối diện. Đánh nhẹ với áp phê một bên. Vì hai bi đã dính nhau nên không có chuyện ngắm sai — vậy mà bi mục tiêu vẫn đi lệch khỏi điểm đã ngắm. Toàn bộ độ lệch đó là throw thuần tuý. Bài này thường làm người chơi sửng sốt vì độ lệch lớn hơn hẳn tưởng tượng.'},
      {h:'Ba việc cần làm với throw', p:'Một, ở cú cắt chậm hãy chủ động ngắm mỏng hơn một chút. Hai, khi cú cắt quan trọng, cân nhắc đánh mạnh hơn một nấc để giảm throw, nếu điều bi cho phép. Ba, học dùng áp phê ngoài lượng nhỏ ở cú cắt khó. Ba việc này không cần thêm giờ tập nào mà cải thiện tỉ lệ vào bi ngay lập tức.'},
    ]},
  {key:'tec_cling', tag:'Kỹ thuật', title:'Bi dính (skid / kick) — cú trượt không phải lỗi của bạn',
    intro:'Thỉnh thoảng bạn đánh một cú hoàn hảo và bi vẫn đi sai hẳn, kèm một tiếng chạm nghe khác lạ. Đó nhiều khả năng là bi dính: một lớp lơ hoặc bụi bẩn nằm đúng chỗ hai bi chạm nhau, làm ma sát tăng vọt và throw lớn bất thường. Đây là hiện tượng thật, đã được đo đạc, và nó xảy ra với cả nhà vô địch thế giới. Biết về nó không giúp bạn tránh được nó, nhưng giúp bạn không tự đổ lỗi sai chỗ.',
    body:[
      {h:'Cơ chế', p:'Ma sát giữa hai bi thường khá ổn định. Nhưng nếu có một hạt lơ hoặc vết bẩn nằm đúng vào điểm tiếp xúc, hệ số ma sát tại đó tăng đột ngột, throw tăng theo, và bi mục tiêu bị kéo lệch nhiều hơn hẳn bình thường. Vì lơ và bụi phân bố ngẫu nhiên trên mặt bi nên hiện tượng này không đoán trước được.'},
      {h:'Dấu hiệu nhận biết', p:'Ba dấu hiệu thường đi cùng nhau: tiếng chạm bi nghe đục và nặng hơn thường lệ, bi mục tiêu lệch rõ về một phía, và bi cái thường bị hãm lại nhiều hơn dự tính. Nếu bạn nghe thấy tiếng lạ trước khi kịp thấy bi đi sai, khả năng cao đó là bi dính chứ không phải lỗi ngắm.'},
      {h:'Khi nào dễ xảy ra nhất', p:'Bi dính hay xuất hiện ở cú CHẬM và cú gần THẲNG hoặc cắt mỏng nhẹ, vì đó là lúc thời gian tiếp xúc dài và ma sát có nhiều tác dụng nhất. Nó cũng phổ biến hơn hẳn trên bàn có bi bẩn, phòng ẩm, hoặc lơ rơi vãi nhiều. Đánh mạnh hơn giảm khả năng bị dính, nhưng dĩ nhiên không phải lúc nào cũng chọn được.'},
      {h:'Việc duy nhất bạn kiểm soát được: giữ bi sạch', p:'Không có kỹ thuật nào chống được bi dính khi nó đã xảy ra. Cách phòng duy nhất là giảm xác suất: lau bi khi được phép, dùng lơ chất lượng và lơ vừa đủ chứ không lơ dày, giữ tay khô. Ở giải đấu nghiêm túc, bi được lau thường xuyên chính vì lý do này.'},
      {h:'Phản ứng đúng khi bị dính', p:'Ghi nhận, gọi tên nó trong đầu, rồi bỏ qua. Sai lầm tai hại là sửa cách ngắm sau một cú bị dính — bạn vừa phá một cách ngắm vốn đúng để chạy theo một sự cố ngẫu nhiên. Bi dính thuộc nhóm may rủi, và cách xử lý nó là cách xử lý may rủi. (Xem "Chấp nhận may rủi & cú xui" ở mục Tâm lý.)'},
      {h:'Đừng lạm dụng nó làm cớ', p:'Bi dính có thật nhưng hiếm. Nếu bạn thấy mình "bị dính" vài lần mỗi buổi, gần như chắc chắn phần lớn trong số đó là lỗi ngắm hoặc throw thông thường mà bạn chưa bù đủ. Tiêu chí phân biệt là TIẾNG CHẠM và độ lệch bất thường — không có hai dấu hiệu đó thì đừng gọi là bi dính.'},
      {h:'Vì sao vẫn nên biết về nó', p:'Giá trị của kiến thức này chủ yếu nằm ở tâm lý: nó cho bạn một lời giải thích đúng cho một sự kiện khó hiểu, và ngăn bạn tự đục vào lòng tin vào cú đánh của mình. Người không biết bi dính tồn tại sẽ mất niềm tin sau vài cú kiểu này, và mất niềm tin thì hỏng cả buổi. (Xem "Buông tay & tin cú đánh".)'},
    ]},
  {key:'tec_aimcomp', tag:'Kỹ thuật', title:'Bù trừ độ lệch — xoay tay sau, xoay tay trước và chốt xoay',
    intro:'Biết squirt và swerve tồn tại là bước một; bước hai là làm gì với chúng. Có ba cách bù trừ, mỗi cách có logic riêng và vùng dùng riêng. Đây là phần kỹ thuật nhất của mục này, nhưng cũng là phần cho lợi thế lớn nhất — vì rất ít người chơi phong trào từng học nó một cách có hệ thống.',
    body:[
      {h:'Chốt xoay tự nhiên của cây cơ là gì', p:'Mỗi cây cơ có một khoảng cách đặc trưng, gọi là chiều dài chốt xoay tự nhiên: nếu bạn đặt cầu tay đúng ở khoảng cách đó và xoay cây cơ quanh cầu tay để tạo áp phê, thì độ lệch hướng cơ do việc xoay vừa vặn TRIỆT TIÊU squirt. Nói cách khác, cây cơ tự bù cho chính nó. Cơ có squirt lớn cho chốt xoay ngắn; ngọn cơ chống lệch cho chốt xoay dài, thường vào khoảng trên dưới 30cm tuỳ cây.'},
      {h:'Xoay tay sau (BHE) — cách thường dùng nhất', p:'Ngắm như thể sẽ đánh tâm bi, giữ NGUYÊN cầu tay, rồi chỉ dịch tay cầm phía sau sang bên để đầu cơ trượt tới điểm chạm lệch tâm mong muốn. Vì cây cơ xoay quanh cầu tay, hướng cơ tự đổi một lượng đúng bằng lượng cần bù. Điều kiện để nó chuẩn: cầu tay phải đặt gần bằng chiều dài chốt xoay của cây cơ. Đây là lý do độ dài cầu tay không phải chuyện tuỳ tiện.'},
      {h:'Xoay tay trước (FHE) — dùng khi nào', p:'Ngược lại: giữ nguyên tay sau, dịch CẦU TAY sang bên để tạo lệch tâm. Cách này KHÔNG bù squirt, thậm chí làm hướng cơ lệch thêm về phía cùng chiều áp phê. Nghe như vô dụng, nhưng nó hữu ích đúng ở tình huống mà swerve sẽ bù quá tay — tức cú chậm, đường dài, cơ chếch. Ở đó FHE trả lại phần bù cần thiết.'},
      {h:'Kết hợp cả hai', p:'Thực tế phổ biến nhất: cầu tay của bạn ngắn hơn chốt xoay của cây cơ, nên BHE thuần tuý bù chưa đủ. Cách xử lý là dùng phần lớn BHE cộng một chút FHE, hoặc chấp nhận điều chỉnh đường ngắm bằng cảm giác. Người chơi trình cao gần như luôn dùng một tổ hợp chứ không dùng một phương pháp thuần tuý.'},
      {h:'Ngắm song song — đơn giản nhưng phải học lượng bù', p:'Cách thứ ba: giữ cây cơ song song với đường ngắm gốc rồi dịch cả cây sang bên. Cách này không tự bù gì cả, nên bạn phải tự cộng thêm một lượng ngắm lệch dựa trên kinh nghiệm. Đây thực chất là cách của phần lớn người chơi lâu năm chưa học lý thuyết: họ bù bằng cảm giác đã tích luỹ. Nó hiệu quả, nhưng chỉ đúng với đúng một cây cơ và mất nhiều năm để hình thành.'},
      {h:'Cách đo chốt xoay của cây cơ bạn', p:'Đặt bi cái cách băng đối diện một quãng vừa phải, ngắm một mục tiêu cụ thể trên băng. Đánh với áp phê tạo bằng kỹ thuật xoay tay sau, thử với vài độ dài cầu tay khác nhau: ngắn, vừa, dài. Độ dài cầu tay nào cho bi cái tới đúng mục tiêu ban đầu chính là chốt xoay của cây cơ. Đánh nhanh và cự ly ngắn để loại bớt ảnh hưởng của swerve.'},
      {h:'Đừng học bù trừ trước khi cú vung ổn định', p:'Cảnh báo quan trọng: mọi kỹ thuật bù trừ đều giả định đầu cơ đi thẳng và chạm đúng điểm định chạm. Nếu cú vung của bạn còn lệch ngẫu nhiên, việc bù trừ chỉ chồng thêm một biến nữa lên mớ hỗn độn. Hãy hoàn thành mắt xích cú vung trước. Đây là lý do bài "Cú vung thẳng" đứng đầu mục này chứ không phải bài này.'},
      {h:'Kết luận thực dụng', p:'Với đa số người chơi, thứ tự đúng là: (i) đánh tâm bi bất cứ khi nào có thể — xoá sạch bài toán; (ii) khi cần áp phê, dùng một cây cơ duy nhất đủ lâu để tay học lượng bù; (iii) đo chốt xoay của cây cơ đó và chỉnh độ dài cầu tay cho gần nó, để BHE làm việc thay bạn. Ba bước này đưa bạn đi xa hơn hẳn phần lớn người chơi phong trào.'},
    ]},
  {key:'tec_cloth', tag:'Kỹ thuật', title:'Nỉ, độ ẩm & tốc độ bàn — bàn hôm nay không phải bàn hôm qua',
    intro:'Cùng một cú đánh cho hai kết quả khác nhau trên hai cái bàn, và người chơi thường quy điều đó cho phong độ. Thực ra mặt nỉ là một biến số vật lý lớn ngang với kỹ thuật của bạn: nó quyết định bi lăn bao xa, xoáy sống bao lâu, cú rút còn rút được không. Người chơi trình cao dành năm phút đầu buổi để ĐO cái bàn trước mặt; người chơi phong trào nhảy thẳng vào ván một rồi thắc mắc.',
    body:[
      {h:'Nỉ nhanh và nỉ chậm khác nhau ở đâu', p:'Nỉ mới, mịn, căng và khô cho ma sát thấp: bi lăn xa hơn với cùng lực, xoáy sống lâu hơn, cú rút ăn hơn, và bi cái trôi nhiều hơn dự tính. Nỉ cũ, xù, ẩm, bám bụi lơ thì ngược lại: cùng lực đó bi đi ngắn hơn, xoáy tắt sớm, cú rút chết giữa đường. Chênh lệch giữa hai loại bàn có thể lên tới mức phải đổi hẳn một nấc lực.'},
      {h:'Độ ẩm là biến số bị xem nhẹ nhất', p:'Sợi nỉ hút ẩm từ không khí. Phòng ẩm hoặc trời mưa làm nỉ nặng hẳn: bi đi ngắn, throw tăng, băng cũng bớt nảy. Điều đáng nói là nó đổi TRONG BUỔI — bàn buổi sáng và bàn buổi tối cùng một chỗ có thể khác nhau rõ. Nếu thấy tự dưng non lực hàng loạt sau vài tiếng chơi, hãy nghĩ tới độ ẩm trước khi nghĩ tới tay mình.'},
      {h:'Hướng sợi nỉ', p:'Nỉ có hướng dệt, nên bi lăn xuôi chiều sợi đi hơi khác so với ngược chiều, rõ nhất ở cú rất nhẹ và ở đoạn cuối khi bi sắp dừng. Trên bàn chất lượng cao và bảo dưỡng tốt, ảnh hưởng này nhỏ. Trên bàn quán cũ, nó đủ lớn để làm hỏng những cú điều bi tinh tế. Biết mà tính vào, đừng lấy làm cớ.'},
      {h:'Quy trình đo bàn trong năm phút', p:'Trước trận, làm ba phép đo: (i) đẩy bi cái từ băng này sang băng kia, xem cần lực nào để nó về đúng chỗ cũ — đây là thước tốc độ bàn; (ii) một cú rút cự ly vừa, xem bi cái lùi được bao xa — đây là thước ma sát và độ bám; (iii) một cú vào băng chéo không xoáy, xem góc ra — đây là thước độ nảy băng. Ba phép đo này định lại toàn bộ thang lực của bạn cho buổi hôm đó.'},
      {h:'Bàn nhanh đòi hỏi đổi cả chiến thuật, không chỉ đổi lực', p:'Trên bàn nhanh, bi cái trôi nhiều nên đường ra bi dài hơn dự tính và nguy cơ chết cái tăng — nên chọn đường ngắn hơn và lực nhẹ hơn hẳn. Trên bàn chậm, bạn phải đánh mạnh hơn để tới nơi, mà đánh mạnh thì kiểm soát kém đi — nên ưu tiên phương án ít băng và chấp nhận vùng ra bi rộng hơn. Bàn đổi thì phương án tối ưu cũng đổi.'},
      {h:'Bi cũng là một phần của phương trình', p:'Bi bẩn, bi trầy, bi không cùng bộ đều làm ma sát và throw thay đổi. Bàn quán thường có bi phủ một lớp lơ mỏng làm throw lớn hơn hẳn bàn thi đấu. Nếu bạn tập ở nhà với bi sạch rồi ra quán đánh, hãy chuẩn bị tinh thần rằng cú cắt sẽ đi non hơn bạn quen.'},
      {h:'Đừng mang hiệu chỉnh từ bàn này sang bàn khác', p:'Sai lầm phổ biến của người tập chăm: xây một cảm giác lực rất tinh trên bàn quen, rồi ra bàn lạ và giữ nguyên cảm giác đó trong hai ván đầu, thua liền hai ván rồi mới bắt đầu chỉnh. Quy tắc: mỗi lần đổi bàn là một lần đo lại, không có ngoại lệ. (Xem "Vào trận chậm — nóng máy muộn" ở mục Tâm lý.)'},
      {h:'Ghi lại đặc tính từng bàn hay chơi', p:'Nếu bạn hay chơi ở vài chỗ cố định, hãy ghi vào Nhật ký đặc tính từng bàn: nhanh hay chậm, băng nảy nhiều hay ít, bi sạch hay bẩn. Lần sau tới, bạn nạp lại hiệu chỉnh trong một phút thay vì dò lại từ đầu. Đây là kiểu chuẩn bị mà rất ít người làm và nó cho lợi thế thật ngay từ ván đầu tiên.'},
    ]},
  {key:'tec_rail', tag:'Kỹ thuật', title:'Băng — góc ra không bằng góc vào',
    intro:'Ai cũng được dạy rằng bi nảy khỏi băng theo góc bằng góc tới, như ánh sáng phản xạ trên gương. Điều đó chỉ gần đúng trong một trường hợp hẹp: bi trượt, tốc độ vừa, không xoáy. Trong thực tế thi đấu, gần như không cú nào rơi vào trường hợp đó. Băng là nơi mọi thứ bạn làm với bi cái — lực, xoáy dọc, xoáy ngang — hiện ra thành sai số, và cũng là nơi tay nghề lộ rõ nhất.',
    body:[
      {h:'Băng không phải gương', p:'Băng là cao su đàn hồi: bi nén vào nó, biến dạng, rồi được đẩy ra. Trong khoảnh khắc tiếp xúc đó, mọi loại xoáy trên bi đều tương tác với mặt băng và làm đổi hướng ra. Vì thế quy tắc góc tới bằng góc ra chỉ nên coi là điểm khởi đầu để ước lượng, không phải công thức để tin.'},
      {h:'Lực đổi góc ra', p:'Quy tắc thực dụng đã được kiểm chứng rộng rãi: đánh nhẹ thì bi ra góc RỘNG hơn, đánh mạnh thì góc HẸP lại. Lý do là ở cú mạnh bi nén sâu vào băng và bị đẩy ra theo hướng vuông góc hơn. Hệ quả: cùng một đường ngắm vào băng, sai lực là sai điểm ra. Đây là lý do các cú nhiều băng cần cảm giác lực tốt hơn hẳn.'},
      {h:'Xoáy dọc đổi góc ra', p:'Bi cái đang lăn tới (xoáy theo) sẽ chồm ra khỏi băng và đi DÀI hơn dự tính. Bi cái mang xoáy ngược sẽ bị băng hãm lại và ra ngắn hơn, thậm chí giật lùi ở cú chạm gần vuông góc. Nghĩa là điểm chạm dọc trên bi cái, thứ bạn chọn để điều bi trước băng, còn tiếp tục ảnh hưởng SAU băng.'},
      {h:'Xoáy ngang đổi góc ra mạnh nhất', p:'Áp phê là thứ tác động lên góc ra rõ rệt nhất. Áp phê thuận chiều với hướng bi lăn dọc băng làm góc ra rộng ra và bi chạy nhanh hơn sau băng. Áp phê ngược chiều làm góc ra hẹp lại và hãm bi. Đây vừa là công cụ mạnh nhất để bẻ đường bi cái, vừa là nguồn sai số lớn nhất — và nhớ rằng xoáy ngang sống rất dai nên nó vẫn còn hiệu lực ở băng thứ hai, thứ ba.'},
      {h:'Vì sao đường nhiều băng khó gấp bội', p:'Mỗi lần chạm băng là một lần nhân sai số: sai lực, sai xoáy, sai góc vào đều được khuếch đại. Sai một độ ở băng thứ nhất thành sai vài độ ở băng thứ ba. Đây là căn cứ vật lý cho nguyên tắc "một băng hơn hai băng" ở mục Chiến thuật — không phải sở thích, mà là phép nhân sai số.'},
      {h:'Băng cũng khác nhau giữa các bàn', p:'Độ cứng cao su, độ căng vải bọc băng, nhiệt độ phòng và tuổi của bàn đều làm băng nảy khác nhau. Bàn cũ thường có băng chết, bi ra ngắn và mất lực nhiều. Đo độ nảy băng là một trong ba phép đo bắt buộc đầu buổi. Đừng bao giờ áp hệ băng học ở bàn này sang bàn khác mà chưa kiểm.'},
      {h:'Hệ kim cương chỉ là khung, không phải chân lý', p:'Các hệ tính đường băng theo điểm kim cương rất hữu ích để có một con số khởi đầu, nhưng chúng được xây trên một điều kiện chuẩn: một tốc độ nhất định, một loại xoáy nhất định, một cái bàn nhất định. Dùng chúng như bộ khung rồi hiệu chỉnh bằng quan sát thực tế của chính bạn ở bàn đó. Ai áp hệ thống một cách mù quáng sẽ thấy nó sai và kết luận sai rằng hệ thống vô dụng.'},
      {h:'Bài tập nền cho băng', p:'Bài đơn giản mà cực kỳ có giá trị: chọn một điểm vào băng cố định, đánh vào đó với ba mức lực và ghi lại ba điểm ra khác nhau. Rồi lặp lại với áp phê thuận, không áp phê, áp phê ngược. Chín kết quả đó là bản đồ băng cá nhân của bạn ở bàn đó. Sau vài buổi, bạn sẽ nhìn đường băng theo cách hoàn toàn khác. (Xem bài tập "Cú băng" và "Hệ băng kim cương" ở tab Rèn luyện.)'},
    ]},
  {key:'tec_equipment', tag:'Kỹ thuật', title:'Cơ, đầu cơ & lơ — phần bạn kiểm soát được trước khi vào bàn',
    intro:'Dụng cụ không làm bạn giỏi lên, nhưng dụng cụ tệ chắc chắn giữ bạn lại. Điều quan trọng hơn cả chất lượng là TÍNH NHẤT QUÁN: một cây cơ tầm trung dùng suốt hai năm sẽ cho kết quả tốt hơn nhiều so với đổi ba cây cao cấp trong cùng thời gian, vì tay bạn học lượng bù trừ theo cây cơ chứ không theo giá tiền.',
    body:[
      {h:'Nhất quán quan trọng hơn chất lượng', p:'Mỗi cây cơ có lượng squirt riêng, chiều dài chốt xoay riêng, độ cứng và cảm giác riêng. Tay bạn học tất cả những thứ đó một cách vô thức qua hàng nghìn cú. Đổi cơ là xoá phần lớn dữ liệu đã học. Nếu bạn nghiêm túc muốn lên trình, hãy chọn một cây cơ vừa tay rồi cam kết với nó — cam kết ấy đáng giá hơn bất kỳ nâng cấp nào.'},
      {h:'Đầu cơ là bộ phận duy nhất chạm bi', p:'Toàn bộ ý định của bạn truyền qua vài milimet vuông đầu cơ. Đầu cơ mòn phẳng, chai bóng hoặc nứt thì không giữ được lơ, ma sát tụt, vùng an toàn trên bi cái co lại và bạn trượt cơ nhiều hơn mà không hiểu vì sao. Kiểm tra đầu cơ hằng tuần là việc năm phút cho một cải thiện thấy được ngay.'},
      {h:'Giữ độ cong và độ nhám', p:'Giữ đầu cơ có độ cong tương đương mặt cong của một đồng xu nhỏ, để rìa đầu cơ còn chạm được vùng lệch tâm. Tạo nhám nhẹ định kỳ để lơ bám, nhưng đừng mài quá tay làm mất hình. Đầu cơ quá mềm mòn nhanh và phải chỉnh liên tục; quá cứng thì khó giữ lơ. Chọn một loại độ cứng rồi giữ nguyên, vì đổi độ cứng đầu cơ cũng là đổi cảm giác lực.'},
      {h:'Lơ: cách bôi quan trọng hơn số lần bôi', p:'Xoay hộp lơ quanh đầu cơ để phủ đều cả mặt cong và RÌA, đừng khoan thẳng xuống giữa. Rìa mới là chỗ tiếp xúc khi đánh lệch tâm, tức đúng lúc bạn cần ma sát nhất. Lơ trước mọi cú có xoáy. Lơ dày quá thì bột rơi lên bi và làm tăng bi dính — vừa đủ là đúng.'},
      {h:'Ngọn cơ chống lệch: mua khi nào thì hợp lý', p:'Ngọn cơ đầu nhẹ giảm squirt thật, nhưng nó chỉ đáng tiền khi cú vung của bạn đã ổn định và bạn đã dùng áp phê một cách có ý thức. Mua nó khi cú vung còn lệch ngẫu nhiên là mua một cải thiện mà bạn không đo được. Thứ tự hợp lý: sửa cú vung trước, dùng một cây cơ đủ lâu, rồi mới cân nhắc nâng cấp.'},
      {h:'Trọng lượng và độ dài cơ', p:'Cơ nặng cho cảm giác chắc và dễ đánh mạnh với biên độ nhỏ; cơ nhẹ cho cảm giác nhạy và dễ đánh tinh tế. Không có chuẩn đúng cho mọi người — chuẩn duy nhất là cây cơ nào để cẳng tay bạn đung đưa tự nhiên. Chiều dài phải phù hợp chiều cao và sải tay; cơ quá ngắn ép bạn vào tư thế gò bó.'},
      {h:'Bảo quản', p:'Cơ cong là cơ vứt đi về mặt độ chính xác. Đừng dựng cơ tựa tường, đừng để trong xe nóng hoặc nơi ẩm, dùng bao đựng. Lau thân cơ sau mỗi buổi để tay trượt mượt. Kiểm tra khớp nối chặt trước khi chơi — khớp lỏng làm mất lực và mất cảm giác một cách rất khó chẩn đoán.'},
      {h:'Găng tay và bột trượt', p:'Nếu tay bạn ra mồ hôi, cây cơ sẽ rít qua cầu tay và lực trở nên thất thường trong trận dài. Găng tay hoặc bột trượt giải quyết việc này rẻ và dứt điểm. Đây là một trong những cải thiện có tỉ lệ lợi ích trên chi phí cao nhất mà người chơi phong trào thường bỏ qua vì ngại trông cầu kỳ.'},
    ]},
  {key:'tec_aiming', tag:'Kỹ thuật', title:'Ngắm — bốn hệ thống và cách chọn một hệ để theo',
    intro:'Ngắm là mắt xích nối giữa "muốn bi đi đâu" và "đặt cây cơ thế nào". Có nhiều hệ ngắm và người chơi thường nhảy từ hệ này sang hệ khác mỗi khi trượt vài cú — đó là cách chắc chắn nhất để không bao giờ giỏi ngắm. Điều quan trọng không phải chọn được hệ đúng nhất, mà là chọn MỘT hệ rồi ở lại đủ lâu để tay tích luỹ được lượng bù trừ cho throw và squirt.',
    body:[
      {h:'Bi ma — nền tảng của mọi hệ', p:'Hình dung một quả bi tưởng tượng đặt sát bi mục tiêu, nằm trên đường thẳng nối bi mục tiêu tới lỗ, ở phía đối diện lỗ. Đưa bi cái tới đúng chỗ quả bi tưởng tượng đó là bi mục tiêu vào lỗ. Đây là cách nghĩ trực quan nhất và là gốc của mọi hệ khác. Nhược điểm: rất khó hình dung chính xác một vật thể vô hình lơ lửng trên bàn, nhất là ở cự ly xa.'},
      {h:'Điểm chạm — chính xác về lý thuyết, khó về thực hành', p:'Xác định đúng điểm trên bi mục tiêu sẽ bị bi cái chạm vào, rồi đưa điểm tương ứng trên bi cái tới đó. Rất chính xác về hình học, nhưng có một cái bẫy: bạn không nhìn thẳng vào điểm chạm mà nhìn nó ở góc chéo, nên ước lượng thường sai, đặc biệt ở cú cắt mỏng. Nhiều người dùng hệ này mà không biết mình đang sai hệ thống.'},
      {h:'Phần bi — hệ thực dụng nhất cho người tiến bộ', p:'Thay vì tính góc, hãy nghĩ theo độ dày của cú: chạm đầy bi, ba phần tư, nửa bi, một phần tư, cực mỏng. Chỉ vài mức đó phủ gần hết tình huống, và mỗi mức nối với một đường bi cái quen thuộc — đặc biệt cú nửa bi cho góc tự nhiên rộng nhất và lặp lại nhất. Hệ này mạnh vì nó gộp cả ngắm lẫn điều bi vào một khái niệm duy nhất.'},
      {h:'Cảm giác qua lặp lại — đích đến của tất cả', p:'Người chơi trình cao cuối cùng đều ngắm bằng nhận dạng: nhìn thế bi là biết đặt cơ ở đâu, không tính toán gì cả. Đó không phải năng khiếu mà là kết quả của hàng nghìn lần lặp cùng một hệ. Mọi hệ ngắm chỉ là giàn giáo giúp bạn đi tới đó nhanh hơn; ai đổi hệ liên tục thì tháo giàn giáo trước khi nhà xây xong.'},
      {h:'Không hệ nào tự bù throw và squirt', p:'Đây là điều quan trọng nhất trong bài này: mọi hệ ngắm đều thuần hình học, trong khi bi thật bị throw và squirt kéo lệch. Nghĩa là hệ ngắm luôn cho bạn một đáp án hơi sai, và phần bù phải do kinh nghiệm cung cấp. Ai hiểu điều này sẽ ngừng đổ lỗi cho hệ ngắm và bắt đầu tích luỹ lượng bù đúng cách.'},
      {h:'Ngắm khi đứng, xác nhận khi cúi', p:'Đường ngắm phải được xác định khi bạn còn ĐỨNG, lúc mắt nhìn bao quát được cả hình. Khi đã cúi xuống, tầm nhìn bị nén và bạn gần như không còn khả năng đánh giá lại đường ngắm một cách khách quan — lúc đó chỉ nên xác nhận, không nên quyết định lại. Ai quyết định đường ngắm sau khi đã cúi sẽ liên tục chỉnh vặt và mất niềm tin vào cú đánh.'},
      {h:'Ngắm sai hệ thống thì sửa được, ngắm loạn thì không', p:'Nếu bạn luôn trượt về cùng một phía, đó là tin tốt: có một lượng bù cố định cần thêm vào, và bạn sửa được trong một buổi. Nếu bạn trượt lung tung hai bên, vấn đề không nằm ở ngắm mà nằm ở cú vung hoặc ở tư thế đặt đầu. Phân biệt được hai trường hợp này trước khi sửa là tiết kiệm được hàng tháng trời.'},
      {h:'Bài đo cách ngắm của bạn', p:'Dựng cùng một cú cắt vừa, đánh 20 lần, ghi lại mỗi lần trượt về phía nào. Nếu 15 lần trở lên cùng một phía, bạn có sai số hệ thống — hãy chủ động ngắm lệch đi một chút và đo lại. Nếu phân bố đều hai bên, quay về bài "Cú vung thẳng". Đây là phép chẩn đoán quan trọng nhất mà một người tự học có thể tự làm.'},
    ]},
  {key:'tec_preshot', tag:'Kỹ thuật', title:'Quy trình vào cú — biến kỹ thuật thành thứ lặp lại được',
    intro:'Mọi kiến thức trong mục này chỉ có giá trị nếu bạn áp dụng được chúng GIỐNG NHAU ở cú thứ nhất và cú thứ hai trăm. Quy trình vào cú là cơ chế đảm bảo điều đó: một chuỗi bước cố định biến các quyết định phức tạp thành thói quen. Không có quy trình thì bạn đánh mỗi cú theo một cách hơi khác, và không thể học được gì từ kết quả vì không có gì để so sánh.',
    body:[
      {h:'Vì sao quy trình là vấn đề KỸ THUẬT chứ không chỉ tâm lý', p:'Người ta hay xếp quy trình vào cú vào nhóm tâm lý, nhưng lý do kỹ thuật còn mạnh hơn: nếu tư thế, độ dài cầu tay, số nhịp vung thử và tốc độ vung của bạn đổi từ cú này sang cú khác thì mọi lượng bù trừ bạn học được đều không áp dụng được. Quy trình cố định chính là điều kiện để kinh nghiệm tích luỹ được.'},
      {h:'Tách rõ hai giai đoạn: quyết định và thực hiện', p:'Đứng: quyết định tất cả — lỗ nào, độ dày nào, điểm chạm nào, lực nào, bi cái đi đâu. Cúi: chỉ thực hiện, không quyết định lại. Ranh giới này phải sắc. Người mang việc quyết định xuống dưới tư thế cúi sẽ do dự giữa cú, và do dự làm nhịp vỡ. Nếu phát hiện nghi ngờ sau khi đã cúi, hãy ĐỨNG DẬY và bắt đầu lại — luôn rẻ hơn là cố đánh.'},
      {h:'Khung sáu bước', p:'Một khung dùng được ngay: (i) đọc bàn và chọn phương án khi đang đứng · (ii) chọn điểm chạm trên bi cái và mức lực, nói thành lời trong đầu · (iii) đặt chân theo đường ngắm · (iv) hạ thân dọc theo đường ngắm, đặt cầu tay · (v) hai hoặc ba nhịp vung thử đúng tốc độ định đánh, mắt kiểm điểm chạm · (vi) nhịp cuối mắt chuyển sang mục tiêu, dừng nhẹ, vung xuyên qua, giữ yên. Sáu bước, không thêm không bớt.'},
      {h:'Nói thành lời điểm chạm và lực', p:'Một thói quen nhỏ có tác dụng lớn: trước khi cúi, tự nhủ ngắn gọn kiểu "thấp một chút, lực ba, bi cái về vùng giữa". Việc phát biểu ra buộc bạn phải QUYẾT thay vì đánh theo cảm hứng, và nó tạo một bản ghi để sau cú bạn đối chiếu ý định với kết quả. Không có ý định rõ ràng thì không có gì để học.'},
      {h:'Đối chiếu ngay sau cú', p:'Sau mỗi cú, dành một giây so kết quả với ý định: bi cái dừng đúng vùng chưa, lệch về phía nào, quá hay non. Một giây đó biến buổi tập thành dữ liệu. Không có bước này thì bạn chỉ đang lặp lại, và lặp lại mà không đối chiếu thì củng cố cả cái đúng lẫn cái sai như nhau.'},
      {h:'Quy trình phải sống sót dưới áp lực', p:'Giá trị thật của quy trình lộ ra ở cú quyết định, khi tim đập nhanh và tay muốn đánh vội. Vì đã lặp hàng nghìn lần, quy trình trở thành thứ cơ thể tự làm mà không cần ý chí. Đây là lý do người có quy trình vững ít sụp ở cú căng: họ không cần bình tĩnh hơn người khác, họ chỉ cần làm đúng thứ đã quen. (Xem "Áp lực & khoảnh khắc căng" và "Dứt điểm".)'},
      {h:'Đứng dậy làm lại không phải là yếu đuối', p:'Đặt sẵn ba điều kiện bắt buộc đứng dậy: thấy nghi ngờ về đường ngắm, thấy tư thế không thoải mái, hoặc bị phân tâm giữa chừng. Coi việc đứng dậy là một bước hợp lệ trong quy trình chứ không phải sự cố. Chi phí của một lần đứng dậy là mười giây; chi phí của một cú đánh trong nghi ngờ thường là cả ván.'},
      {h:'Rút gọn dần khi đã thuộc', p:'Ban đầu quy trình sẽ thấy rườm rà và chậm. Đó là bình thường và cần thiết. Sau vài tuần, các bước gộp lại thành một dòng chảy liên tục và bạn không còn phải nghĩ tới chúng. Mục tiêu cuối là quy trình biến mất khỏi ý thức mà vẫn được thực hiện đầy đủ — lúc đó toàn bộ sự chú ý của bạn được giải phóng cho việc đọc bàn.'},
    ]},
  {key:'tec_calibrate', tag:'Kỹ thuật', title:'Tự hiệu chỉnh — đo sai số của CHÍNH BẠN thay vì đọc lý thuyết',
    intro:'Mọi con số trong mục này là con số trung bình của môn bi-a nói chung. Con số của BẠN thì khác: cây cơ của bạn có lượng squirt riêng, cú vung của bạn có độ trôi riêng, bàn bạn hay chơi có tốc độ riêng. Người lên trình nhanh nhất không phải người đọc nhiều nhất mà là người biến lý thuyết thành một bảng số của riêng mình. Đây là cách làm việc đó trong vài buổi.',
    body:[
      {h:'Nguyên tắc: mỗi lần chỉ đo MỘT biến', p:'Đo lường chỉ có giá trị khi các yếu tố khác được giữ nguyên. Muốn đo squirt thì cố định lực, cự ly và cách vung, chỉ đổi lượng áp phê. Muốn đo lực thì bỏ hết xoáy. Đổi hai thứ cùng lúc thì kết quả không nói lên điều gì — và đây chính là lý do phần lớn thời gian "tập luyện" của người chơi phong trào không tạo ra tiến bộ nào.'},
      {h:'Phép đo 1 — độ trôi của cú vung', p:'Cú thẳng đứng bi, cự ly một mét, đánh tâm, mười lần. Ghi bi cái nhích sang trái hay phải sau va chạm. Kết quả cho bạn biết cú vung của mình lệch về phía nào và bao nhiêu. Đây là phép đo phải làm ĐẦU TIÊN, vì mọi phép đo sau đều bị nhiễu bởi sai số này nếu nó còn lớn.'},
      {h:'Phép đo 2 — thang lực cá nhân', p:'Đẩy bi cái từ băng đầu này, tìm lực khiến nó dừng đúng ở băng đối diện, gọi đó là mức ba. Rồi tìm lực đi được một nửa quãng đó, gọi là mức hai; lực đi hết một vòng về chỗ cũ, gọi là mức bốn. Bạn vừa dựng được một thang lực có thể GỌI TÊN, và từ đó mọi quyết định về lực trở nên nói được thành lời thay vì đánh theo cảm hứng.'},
      {h:'Phép đo 3 — điểm đứng bi theo cự ly', p:'Cú thẳng ở ba cự ly: nửa mét, một mét, hai mét. Với mỗi cự ly, tìm điểm chạm khiến bi cái đứng yên hoàn toàn sau va chạm. Ba điểm đó sẽ tụt thấp dần theo cự ly. Bảng ba số này là công cụ điều bi thực dụng bậc nhất, vì cú đứng bi là mốc gốc để tính theo và rút. (Xem "Trượt và lăn".)'},
      {h:'Phép đo 4 — squirt của cây cơ', p:'Bi cái sát băng dọc, đánh dọc băng, cự ly ngắn, lực mạnh vừa, cơ giữ ngang nhất có thể, áp phê tối đa một bên. Đo bi cái dạt ra hay ép vào băng bao nhiêu. Lặp lại với nửa lượng áp phê. Hai con số này là đặc tính cây cơ của bạn, và chúng không đổi cho tới khi bạn đổi cơ.'},
      {h:'Phép đo 5 — chốt xoay của cây cơ', p:'Vẫn cú như trên nhưng tạo áp phê bằng cách giữ nguyên cầu tay và chỉ dịch tay sau. Thử ba độ dài cầu tay khác nhau. Độ dài nào cho bi cái đi thẳng nhất tới mục tiêu ban đầu chính là chốt xoay. Chỉnh cầu tay quen dùng của bạn về gần con số đó là bạn được cây cơ tự bù squirt hộ. (Xem "Bù trừ độ lệch".)'},
      {h:'Phép đo 6 — bản đồ băng', p:'Chọn một điểm vào băng cố định, đánh vào đó ở ba mức lực, ghi ba điểm ra. Lặp lại với áp phê thuận và áp phê ngược. Chín điểm ra đó là bản đồ băng của bạn ở bàn đó. Làm lại rất nhanh ở mỗi bàn mới, chỉ cần ba cú thay vì chín.'},
      {h:'Ghi ra đĩa, đừng ghi trong đầu', p:'Ghi mọi số đo vào Nhật ký trong app, kèm ngày và tên bàn. Trí nhớ về cảm giác phai rất nhanh và bị bóp méo bởi kết quả trận gần nhất. Một bảng số viết ra còn cho bạn thứ quý hơn: khả năng đo lại sau ba tháng và thấy mình đã tiến bộ ở đâu — thứ mà cảm giác chủ quan không bao giờ nói thật.'},
      {h:'Đo lại định kỳ', p:'Đo lại toàn bộ khi có bất kỳ thay đổi nào: đổi cơ, thay đầu cơ, đổi bàn hay chơi, hoặc sau một đợt nghỉ dài. Ngoài ra cứ ba tháng đo lại một lần dù không có gì đổi, vì kỹ thuật của bạn cũng trôi dần mà bạn không nhận ra. Đây là kỷ luật phân biệt người tập có hệ thống với người chỉ chơi nhiều.'},
    ]},
  {key:'tec_diagnose', tag:'Kỹ thuật', title:'Bi cái không tới đúng chỗ — truy lỗi ở đâu',
    intro:'Đây là bài dùng nhiều nhất trong mục này. Khi điều bi hỏng, phản xạ thông thường là đánh mạnh hơn, đánh thấp hơn, hoặc đổi cách ngắm — tức là sửa mò. Sửa mò thì lúc được lúc không và bạn không học được gì. Bài này cho một cây truy lỗi: bắt đầu từ triệu chứng, đi ngược về nguyên nhân, sửa đúng chỗ.',
    body:[
      {h:'Bước 0 — phân loại: hệ thống hay ngẫu nhiên', p:'Trước mọi chẩn đoán, đánh cùng một cú mười lần và xem sai số phân bố thế nào. Luôn lệch cùng một phía là lỗi HỆ THỐNG: nguyên nhân nằm ở ngắm, ở vị trí đặt đầu, hoặc ở lượng bù chưa đúng — sửa được nhanh. Lệch loạn hai bên là lỗi NGẪU NHIÊN: nguyên nhân nằm ở cú vung, cầu tay hoặc tay cầm — phải rèn nền, không bù trừ được. Nhầm hai loại này là nguồn gốc của nhiều năm luyện tập lãng phí.'},
      {h:'Triệu chứng: bi vào nhưng bi cái luôn đi quá', p:'Nguyên nhân thường gặp theo thứ tự: lực quá tay do chưa đo bàn hôm nay; đánh cao hơn ý định do cầu tay bị nhún; hoặc bàn nhanh hơn bàn quen. Kiểm bằng phép đo thang lực đầu buổi. Nếu chỉ đi quá ở cú xa mà không ở cú gần, gần như chắc chắn là vấn đề hiệu chỉnh tốc độ bàn.'},
      {h:'Triệu chứng: rút không ăn', p:'Theo thứ tự khả năng: nắm cơ quá chặt làm cơ bị hãm tại điểm chạm; thiếu theo cơ nên xoáy truyền ít; cầu tay nhấc lên đúng lúc chạm; đánh chưa đủ thấp; hoặc cự ly quá xa nên xoáy ngược đã tắt trước va chạm. Bốn nguyên nhân đầu đều là kỹ thuật và sửa được ngay trong một buổi; nguyên nhân cuối là quy luật, phải chấp nhận và đổi phương án.'},
      {h:'Triệu chứng: cú thẳng dài hay trượt', p:'Cú thẳng dài là bài kiểm tra khắc nghiệt nhất của đường thẳng cú vung, vì nó không cho phép sai số góc nào. Nếu trượt cùng một phía, nghi vị trí đặt đầu so với cây cơ trước tiên, rồi tới độ trôi cú vung. Nếu trượt hai bên, đó là cú vung chưa ổn định. Đừng đổ cho ngắm — cú thẳng thì không có gì để ngắm sai.'},
      {h:'Triệu chứng: cú có áp phê lúc vào lúc trượt', p:'Đây gần như luôn là squirt và swerve chưa được quản lý. Kiểm chứng nhanh: đánh cùng cú đó ở hai mức lực rất khác nhau. Nếu hướng bi cái đổi theo lực, bạn đã xác nhận swerve đang tham gia. Cách xử lý ngắn hạn là bỏ áp phê; cách xử lý dài hạn là đo cây cơ và chỉnh cầu tay về gần chốt xoay.'},
      {h:'Triệu chứng: cú cắt luôn đi non', p:'Nếu bi mục tiêu thường xuyên đi non hơn tính toán ở cú cắt chậm, thủ phạm nhiều khả năng là throw do góc cắt mà bạn chưa bù. Thử ngắm mỏng hơn một chút, hoặc đánh mạnh hơn một nấc, hoặc thêm chút áp phê ngoài. Nếu chỉ xảy ra trên bàn quán mà không xảy ra ở bàn sạch, càng chắc chắn là throw do bi bẩn.'},
      {h:'Triệu chứng: đường băng luôn sai điểm ra', p:'Kiểm theo thứ tự: đã đo độ nảy băng của bàn này chưa; lực có ổn định không; có đang dính áp phê ngoài ý muốn không. Nguyên nhân thứ ba là phổ biến và ngấm ngầm nhất — nếu cú vung của bạn trôi nhẹ sang một bên thì mọi cú đều mang áp phê nhỏ, và điều đó chỉ lộ ra ở băng chứ không lộ ra ở cú ăn bi thường.'},
      {h:'Triệu chứng: đầu buổi tốt, cuối buổi loạn', p:'Đây không phải lỗi kỹ thuật mà là thể trạng: mỏi làm tư thế cao dần, cầu tay lỏng dần, nhịp nhanh dần. Kiểm bằng cách quay phim cú vung ở đầu và cuối buổi rồi so. Cách xử lý nằm ở nghỉ ngắn giữa hiệp, nước, và cường độ hợp lý. (Xem "Chơi bi-a khi mệt" và "Giữ sức khi đánh giải cả ngày".)'},
      {h:'Quy tắc vàng của truy lỗi', p:'Chỉ đổi MỘT thứ mỗi lần rồi đo lại. Đổi ba thứ cùng lúc và thấy khá hơn thì bạn không biết thứ nào đã giúp, và khi nó hỏng lại bạn không biết trả về đâu. Chậm mà chắc ở đây thật sự nhanh hơn: một tuần sửa đúng một mắt xích đáng giá hơn ba tháng sửa mò.'},
    ]},
  {key:'tec_practice', tag:'Kỹ thuật', title:'Cách tập điều bi cho thật sự lên trình',
    intro:'Giờ tập không tự chuyển thành trình độ. Rất nhiều người chơi vài trăm giờ một năm mà đứng yên, trong khi người khác tiến rõ với ít giờ hơn. Khác biệt không nằm ở số giờ mà nằm ở cấu trúc: có mục tiêu đo được, có phản hồi ngay, có độ khó vừa tầm, và có ghi chép. Đây là cách biến thời gian trên bàn thành tiến bộ.',
    body:[
      {h:'Đánh vu vơ không phải là tập', p:'Rải bi ra rồi đánh cho vui củng cố những gì bạn đã làm được và né những gì bạn chưa làm được — vì bản năng luôn chọn cú quen. Kết quả là bạn giỏi thêm ở chỗ vốn đã giỏi và vẫn dở ở đúng chỗ đang dở. Tập thật sự phải nhắm vào mắt xích yếu, và mắt xích yếu thì theo định nghĩa là chỗ khó chịu.'},
      {h:'Mỗi buổi tập một mục tiêu duy nhất', p:'Chọn đúng một thứ cho cả buổi: hôm nay là đường thẳng cú vung, hôm sau là thang lực, hôm sau nữa là điểm đứng bi theo cự ly. Một mục tiêu cho phép bạn đo được tiến bộ và không bị nhiễu. Buổi tập ôm ba bốn thứ thường không tiến được thứ nào.'},
      {h:'Phải có ĐIỂM SỐ, không chỉ có cảm giác', p:'Mọi bài tập đều phải quy ra một con số: mấy trên mười. Điểm số biến cảm giác mơ hồ thành dữ liệu, cho bạn thấy tiến bộ ở quy mô tuần và tháng, và quan trọng nhất là nó không cho bạn tự lừa mình. Tab Rèn luyện trong app đã có sẵn thang điểm và mục tiêu cho từng bài — dùng nó thay vì tự chấm bằng ấn tượng.'},
      {h:'Giữ độ khó ở vùng vừa tầm', p:'Bài quá dễ thì không tạo thích nghi, bài quá khó thì chỉ tạo thất bại và nản. Vùng hiệu quả nhất là nơi bạn thành công khoảng sáu tới tám lần trên mười. Nếu đạt gần tuyệt đối, hãy tăng độ khó ngay — kéo dài cự ly, giảm vùng chấp nhận, thêm điều kiện. Nếu dưới bốn, hạ xuống một nấc thay vì cố.'},
      {h:'Tập xen kẽ hiệu quả hơn tập lặp một khối', p:'Đánh một trăm lần cùng một cú cho cảm giác tiến bộ nhanh trong buổi nhưng nhớ kém. Xoay vòng giữa vài dạng cú khác nhau thì trong buổi thấy khó hơn, nhưng giữ được lâu hơn và chuyển sang thi đấu tốt hơn — vì thi đấu vốn không bao giờ cho bạn cùng một cú hai lần liên tiếp. Chấp nhận cảm giác khó chịu để đổi lấy kết quả thật.'},
      {h:'Tập dưới áp lực nhân tạo', p:'Kỹ thuật chỉ có giá trị nếu nó sống sót được ở cú quan trọng. Hãy tự tạo áp lực: đặt điều kiện phải đạt bao nhiêu mới được về, chơi ghost game, hoặc đặt cược nhỏ với bản thân về số lần lặp. Kỹ năng học trong trạng thái thoải mái không tự chuyển sang trạng thái căng — nó phải được học trong điều kiện gần giống điều kiện sử dụng.'},
      {h:'Chia thời gian theo tỉ lệ có chủ đích', p:'Một phân bổ hợp lý cho người muốn lên trình nghiêm túc: khoảng một phần ba cho nền tảng cú vung và điểm chạm, một phần ba cho điều bi và lực, một phần ba cho chơi thật hoặc ghost game. Người chơi phong trào thường dành gần như toàn bộ cho phần thứ ba — đó là lý do họ vui nhưng không tiến.'},
      {h:'Ghi chép là phần bắt buộc, không phải phần thêm', p:'Sau mỗi buổi ghi ba dòng: hôm nay tập gì, điểm bao nhiêu, phát hiện gì. Ba dòng đó là thứ nối các buổi tập rời rạc thành một quá trình. Không có nó, bạn sẽ phát hiện lại cùng một điều bốn lần trong một năm và quên nó bốn lần. Dùng tab Nhật ký cho việc này.'},
      {h:'Kiên nhẫn với đường cong tiến bộ', p:'Sửa một mắt xích nền tảng thường làm bạn đánh TỆ ĐI trong một tới hai tuần, vì cơ thể đang thay thế thói quen cũ. Đây là hiện tượng bình thường và là dấu hiệu việc sửa đang có tác dụng thật. Người bỏ cuộc ở giai đoạn này quay về thói quen cũ và mắc kẹt vĩnh viễn ở đó. Biết trước điều này là điều kiện để vượt qua nó. (Xem "Thoát khỏi giai đoạn sa sút" ở mục Tâm lý.)'},
    ]},
  {key:'psy_intro', tag:'Tâm lý', title:'Đầu vững thì tay mới vững (bài dẫn nhập)',
    intro:'Kỹ thuật quyết định TRẦN trình độ của bạn, còn tâm lý quyết định bao nhiêu phần của cái trần đó thật sự xuất hiện trên bàn vào ngày thi đấu. Gần như không ai thua vì không biết đánh cú đó; người ta thua vì lúc căng thì đánh khác lúc tập. Mục này gom 07 nhóm, đi từ nền tảng cho tới đường dài. Mỗi mục dưới đây là một nhóm, mở từng bài trong nhóm để đọc sâu. Hồ sơ tâm lý cơ thủ đỉnh cao nay nằm ở mục riêng bên cạnh, dựng từ phụ đề hàng chục video phỏng vấn: hai người cùng lên đỉnh thế giới bằng hai hệ thống gần như đối xứng nhau, nên đọc để đối chiếu với chính mình thay vì để bắt chước. (Xem "Filler: tự tin dựng có chủ đích", "Gorst: quy trình bịt nỗi sợ trượt" và "Filler vs Gorst: hai lối tâm lý đối lập".)',
    body:[
      {h:'Vấn đề gốc: khoảng cách giữa lúc tập và lúc đấu', p:'Hãy tự đo một lần cho cụ thể: cùng một cú, tập một mình vào 9/10, ra trận có tiền hoặc có người đứng xem thì còn 6/10. Ba cú chênh lệch đó không phải vấn đề kỹ thuật, vì tay bạn vẫn là tay đó, bàn vẫn là bàn đó. Toàn bộ mục Tâm lý tồn tại để thu hẹp đúng khoảng cách này. Vì thế cách đọc đúng không phải đi tìm mẹo lấy lại bình tĩnh, mà là tìm ra nhóm nào bên dưới đang là chỗ rò rỉ lớn nhất của RIÊNG bạn.'},
      {h:'🧭 Nền tảng & quy trình — thứ phải có trước tiên', p:'Chín bài về tập trung, hơi thở, lời tự nhủ, hình dung, chơi hết công lực, và cái khó nhất là buông tay để tin cú đánh. Đây là nhóm phải đọc đầu tiên, vì mọi kỹ năng tâm lý khác đều dựng trên nó: không giữ nổi sự chú ý ở cú đang đánh thì không bài nào phía dưới dùng được. (Xem "Tự tin & giữ bình tĩnh" và "Vào vùng dòng chảy".)'},
      {h:'🎯 Trước trận & khởi động — trận đấu bắt đầu trước cú đầu tiên', p:'Hai bài về chuẩn bị đầu óc trước giờ đánh và về kiểu người vào trận chậm, nóng máy muộn. Rất nhiều trận thua nằm gọn trong ba ván đầu, lúc bạn còn đang dò bàn trong khi đối thủ đã chạy. Chuẩn bị trước là cách rẻ nhất để không phải gỡ điểm về sau, vì gỡ luôn tốn nhiều sức hơn giữ.'},
      {h:'🔥 Áp lực & khoảnh khắc quyết định — sáu bài cho sáu kiểu căng khác nhau', p:'Áp lực không phải một thứ duy nhất: căng vì tiền, căng vì có người xem, căng vì sắp dứt điểm, căng vì ngồi ngoài quá lâu rồi vào bàn với tay nguội, và kiểu nặng nhất là chết tay ở một cú cụ thể. Mỗi kiểu có cách xử riêng, nên chữa nhầm bài thì không ăn thua. (Xem "Toàn cú khó, nguội cơ" và "Sợ cú cụ thể & chết tay".)'},
      {h:'💢 Cảm xúc, lỗi & phục hồi — bốn bài về chuyện sau khi hỏng', p:'Cú hỏng nào cũng có hai cái phải trả: mất lượt, và mất bình tĩnh cho vài cú tiếp theo. Khoản thứ hai mới là khoản làm thua trận. Nhóm này chỉ cách cắt cơn ngay tại chỗ, cách phân biệt mình đánh dở với mình gặp xui, và cách đứng dậy sau một trận thua đau mà không mang nó sang trận sau.'},
      {h:'♟️ Đối thủ & thế trận — năm bài về người ngồi bên kia', p:'Đọc cảm xúc đối thủ và giấu cảm xúc của mình, xử lý tiểu xảo, giữ đầu lạnh trên ghế chờ, và tâm lý riêng của thế kèo trên hoặc kèo dưới. Nguyên tắc chung của cả nhóm: đối thủ chỉ tác động được vào bạn qua đúng một cửa là sự chú ý của bạn, nên đóng cửa đó lại là mọi tiểu xảo mất hiệu lực. (Xem "Đánh kèo trên & kèo dưới".)'},
      {h:'🎚️ Độ ổn định & phong độ đều — nhóm dày nhất, mười bài', p:'Đây là nhóm dành cho người đã đánh được nhưng ngày lên ngày xuống. Trọng tâm không phải nâng đỉnh mà nâng SÀN: đo dao động của chính mình, đối xử với mọi cú như nhau, giữ mức khi đổi bàn đổi quán, và thôi chỉnh kỹ thuật liên tục. (Xem "Độ ổn định", "Ổn định của QUYẾT ĐỊNH" và "Đầu vào đều thì đầu ra mới đều".)'},
      {h:'📈 Đường dài & rèn luyện — năm bài cho quãng nhiều tháng', p:'Sức bền tâm lý trong trận dài, kỷ luật tập lúc hết hứng, cách đặt mục tiêu không tự làm khổ mình, dấu hiệu kiệt sức, và cách thoát khỏi giai đoạn sa sút kéo dài. Nhóm này ít cấp bách nhất nên hay bị bỏ qua, trong khi nó quyết định bạn còn chơi bi-a sau ba năm nữa hay không. (Xem "Chọn một thể loại mà chín" và "Trở lại sau kỳ nghỉ dài".)'},
      {h:'Cách dùng mục này', p:'Đừng đọc tuần tự 41 bài. Cách dùng đúng: mở tab Nhật ký, xem lại ba trận gần nhất rồi ghi ra bạn mất điểm vì lý do gì nhiều nhất, sau đó chỉ đọc đúng nhóm tương ứng. Mỗi lần chỉ mang MỘT thứ vào bàn, giữ nó vài buổi cho thành phản xạ rồi mới lấy thêm thứ khác. Dùng tab Ôn luyện để nhắc lại, vì kiến thức tâm lý đọc xong quên rất nhanh mà lại chỉ cần tới đúng lúc bạn đang căng nhất.'},
    ]},
  {key:'psy_coldchance', tag:'Tâm lý', title:'Toàn cú khó, nguội cơ — rồi run lúc có cơ hội',
    intro:'Một cảnh rất quen: cả trận vào bàn toàn phải đá băng, nhảy bi, gỡ bi khó — không cú nào "mượt" để ấm tay, nên cơ nguội và mất nhịp. Rồi khi một cơ hội ngon hiếm hoi tới, nó bị phóng đại thành cú sống-còn; tay đang lạnh gặp áp lực cao = run, và bạn hỏng đúng cú đáng lẽ dễ. Đây là một VÒNG LẶP có thật — và gỡ được: giữ ấm khi khó, hạ trọng lượng khi dễ.',
    body:[
      {h:'Hiểu vòng lặp để cắt nó', p:'Khó → nguội cơ → mất nhịp → cơ hội tới thì hồi hộp → hỏng cú dễ → càng ít cơ hội. Vì sao cú dễ lại hoá khó: bạn chờ nó quá lâu nên gán cho nó "trọng lượng" khổng lồ, cộng với tay đang nguội — đúng công thức của choke. Gọi tên được vòng lặp là bước đầu để phá nó.'},
      {h:'Mỗi cú khó là cú NGHIÊM TÚC, không phải cú bỏ đi', p:'Đừng đánh cú đá băng/nhảy bi kiểu buông xuôi "kiểu gì cũng trượt". Chính lúc đó là lúc bạn GIỮ tập trung và giữ tay hoạt động. Làm đủ routine cả cú khó — thái độ nghiêm túc từng cú giữ cho cơ không nguội và đầu không rời trận. (Xem "Chơi 100% công lực".)'},
      {h:'Giữ ROUTINE giống hệt ở mọi cú', p:'Đá băng, nhảy bi, hay cú dễ — cùng MỘT chuỗi động tác trước cú. Routine là mỏ neo giữ nhịp tay và đầu; lặp nó đều đặn thì tay không "nguội" và không cú nào bị coi là "sự kiện đặc biệt". Cú dễ dùng đúng routine như cú khó → nó thôi làm bạn run. (Xem "Tập trung & ở hiện tại".)'},
      {h:'Đổi khung: cú khó là bài tập tự chọn', p:'Thay vì "lại toàn bi khó, chán và nản", nghĩ "mỗi cú khó là một lần luyện đá băng / nhảy bi / gỡ khó ngay trong trận". Khung này vừa giữ động lực vừa giữ tập trung — và bạn thật sự giỏi lên đúng những cú đó. Nản là thứ làm nguội tay nhanh nhất; đổi khung để không nản. (Xem "Sợ cú cụ thể & chết tay").'},
      {h:'Đặt mục tiêu THỰC TẾ cho cú khó', p:'Cú đá băng/khó ít khi vào — nên đừng chấm mình bằng "vào hay trượt". Đặt mục tiêu vừa tầm: chạm đúng bi (không phạm lỗi), để lại thế an toàn, hoặc đưa bi cái về chỗ đỡ. Vào lỗ là bonus. Mục tiêu vừa tầm làm bạn bớt căng và bớt đánh ẩu. (Xem "Cú hai đường" trong "Khi nào tấn công, khi nào bỏ" và "Safety".)'},
      {h:'Khi CƠ HỘI tới: hạ trọng lượng cú xuống', p:'Cái đầu sẽ hét "đây là cú quyết định, không được hỏng" — chính nó làm tay cứng. Tự nhủ ngược lại: "chỉ là một cú như bao cú tôi từng đánh vào hàng trăm lần". Dồn chú ý vào thứ CỤ THỂ trong tầm kiểm soát — điểm chạm, đưa cơ thẳng — không phải hậu quả. (Xem "Áp lực cú/ván quyết định" trong "Áp lực & khoảnh khắc căng".)'},
      {h:'Đừng VỒ lấy cơ hội — chậm một nhịp', p:'Nghịch lý: chờ lâu nên khi có cú dễ ta muốn "kết thúc cho nhanh" → vội → hỏng. Đúng lúc này càng phải chậm lại, làm ĐỦ routine. Cơ hội hiếm càng đáng được đánh cẩn thận, không phải vội vàng cho xong. Nhắc mình: "có thời gian — làm đúng quy trình". (Xem "Buông tay & tin cú đánh".)'},
      {h:'Một hơi thở + câu neo trước cú cơ hội', p:'Ngay trước cú ngon: đứng thẳng, một hơi thở ra thật dài (hạ adrenaline, hạ nhịp tim), buông vai, một từ khoá ("mượt" hoặc "chạm"), rồi mới cúi xuống. Chuỗi này kéo bạn từ "nguội + run" về "ấm + tĩnh" đủ để bắn chuẩn. Nút ⟳ Reset (thở) trong app chạy đúng chuỗi này. (Xem "Hơi thở & điều tiết hưng phấn".)'},
      {h:'Giữ tay ấm giữa các lượt', p:'Nguội cơ một phần vì ngồi ghế lâu. Giữa lượt, khẽ nhấp cơ trong không khí, siết–thả bàn tay, vài hơi thở đều để giữ nhịp; đầu lượt mới làm nóng lại vài giây bằng một cú chắc trong đầu. Đừng để cơ thể "tắt máy" hẳn khi chờ. (Xem "Vào trận chậm — nóng máy muộn" và "Sức bền tâm lý cho trận dài".)'},
      {h:'Tập ĐÚNG tình huống này', p:'Ở nhà, tự dựng bài mô phỏng: xen kẽ vài cú khó (đá băng, nhảy bi, bi sát băng) rồi ĐỘT NGỘT đặt một cú dễ — tập bắn chuẩn cú dễ đó ngay sau chuỗi khó, tái tạo cảm giác "cơ hội tới sau khi đã nguội". Lặp nhiều lần thì lúc thật, cú cơ hội không còn làm bạn run. Ghi tiến bộ vào Nhật ký. (Xem "Giải mẫn cảm bằng tập lặp" trong "Sợ cú cụ thể & chết tay").'},
    ]},
  {key:'serious', tag:'Tâm lý', title:'Chơi 100% công lực — không cú nào hời hợt',
    intro:'Muốn luôn chơi với 100% công lực và sự nghiêm túc, phải hiểu đúng một điểm: KHÔNG phải cú nào cũng căng 100% não — mà là cú nào cũng làm 100% QUY TRÌNH. Cố "gồng" từ đầu tới cuối thì sẽ mệt, đuối, rồi tới bi quyết định lại sựng. Cơ thủ bản lĩnh không phải lúc nào cũng căng — họ LẠNH, ĐỀU và CÓ KỶ LUẬT.',
    body:[
      {h:'Định nghĩa lại "100% công lực"', p:'100% công lực KHÔNG phải là: đánh thật chậm, nghĩ thật nhiều, siết cơ thể, cố chứng minh mình hay, cú nào cũng phải hoàn hảo.\n100% công lực LÀ: cú nào cũng có quyết định rõ · cú nào cũng vào bộ nghiêm túc · cú nào cũng ra ngọn có cam kết · cú nào đánh xong cũng chấp nhận kết quả. Đây mới là kiểu nghiêm túc bền vững.'},
      {h:'Chỉ kiểm soát 5 thứ', p:'Trước mỗi cú, bạn chỉ kiểm soát được đúng 5 thứ:\n1) Chọn lỗ. 2) Chọn vùng đưa bi cái tới. 3) Chọn lực. 4) Chọn tâm bi / trô / cu lê / áp phê. 5) Vào bộ và đánh đúng nhịp.\nNgoài 5 thứ đó — BỎ: đối thủ đánh hay: bỏ. Đang dẫn hay bị dẫn: bỏ. Người khác xem: bỏ. Cú trước trượt: bỏ. Sợ thua: bỏ.\nCâu neo: "Tôi không cần kiểm soát trận đấu. Tôi chỉ cần kiểm soát cú đánh này."'},
      {h:'Mỗi cú là một nghi thức bắt buộc', p:'Không được phép đánh cú nào hời hợt — kể cả bi dễ: đứng sau bi cái → nhìn đường bi → chọn vùng bi cái → vào bộ → 2–3 nhấp cơ → dừng nhẹ → ra ngọn. Không cần lâu, nhưng phải ĐỦ.\nTừ nay chia 2 loại cú: cú CÓ quy trình = nghiêm túc; cú KHÔNG quy trình = lỗi kỷ luật, DÙ BI CÓ VÀO. Nhiều người tưởng vào là tốt — không: vào lỗ bằng sự cẩu thả là đang nuôi thói quen xấu.'},
      {h:'Đừng chờ sắp thua mới nghiêm túc', p:'Kiểu quen thuộc: hời hợt tới khi sắp thua mới tập trung — vì não chỉ coi "nguy hiểm" là công tắc bật công lực. Phải đổi: KHÔNG cần nguy hiểm mới nghiêm túc; cú dễ cũng là cú xây bản lĩnh, là cơ hội rèn sự chuyên nghiệp. Chỉ nghiêm túc khi bị dồn vào chân tường thì bạn sẽ mãi cần áp lực mới chơi hay. Cơ thủ lì TỰ TẠO CHUẨN, không chờ hoàn cảnh ép.'},
      {h:'Thang năng lượng 3 mức', p:'Để nghiêm túc 100% mà không cạn pin, đừng dùng 100% não cho mọi cú:\n• Mức 1 — bi DỄ: làm đúng quy trình, đánh gọn, không phân tích sâu.\n• Mức 2 — bi CHUYỂN HÌNH: tính kỹ hơn vì nó quyết định bi tiếp theo.\n• Mức 3 — bi THEN CHỐT: bi khó, bi 8/9/10, phá cụm, chạy đạn, hill-hill — lúc này mới dùng tập trung cao độ.\nVẫn nghiêm túc từng cú, nhưng không đốt sạch năng lượng từ đầu trận. (Xem thêm "Sức bền tâm lý cho trận dài".)'},
      {h:'Tự đặt luật phạt sự hời hợt', p:'Muốn nghiêm túc thật thì phải có LUẬT. Khi tập hoặc đánh kèo nhẹ:\n• Luật 1: đánh bi dễ mà không đứng sau bi cái quan sát đủ → tự trừ 1 điểm kỷ luật.\n• Luật 2: vào bộ rồi còn đổi ý, chỉnh vặt quá nhiều → đứng dậy làm lại.\n• Luật 3: trượt xong mà phản ứng, than, tiếc, giải thích → mất 1 điểm tinh thần.\nMục tiêu mỗi buổi không chỉ là thắng — là giữ ĐIỂM KỶ LUẬT TINH THẦN.'},
      {h:'20 giây trước trận', p:'Trước khi đánh, đọc trong đầu: "Hôm nay tôi không đánh cho vui kiểu hời hợt. Tôi đánh để rèn cái đầu. Tôi không quan tâm tỉ số, không quan tâm đối thủ, không tiếc cú đã qua. Tôi chỉ làm đúng cú đánh hiện tại. Bi dễ cũng nghiêm túc, bi khó cũng bình tĩnh. Trước khi vào bộ thì chọn kỹ — khi đã vào bộ thì tin và đánh." Dùng bi-a để rèn tập trung, kỷ luật và bản lĩnh — không chỉ để chứng minh mình lên hạng.'},
      {h:'Sau mỗi ván chỉ hỏi 3 câu', p:'Đừng phân tích lan man. Hỏi đúng 3 câu:\n1) Có cú nào tôi đánh hời hợt không?\n2) Có cú nào tôi vào bộ rồi vẫn phân vân không?\n3) Có cú nào tôi phản ứng cảm xúc không?\nCó thì sửa ngay ván sau. Không tự trách — chỉ lạnh lùng ghi nhận: "Lỗi kỷ luật. Sửa cú tiếp theo."'},
      {h:'Bài 7 ngày bật chế độ nghiêm túc', p:'Trong 7 ngày, mỗi buổi tập/chơi chỉ chấm MỘT chỉ số: tỉ lệ cú đánh có quy trình đầy đủ.\n• Ngày 1–2: đạt 70%.\n• Ngày 3–4: đạt 80%.\n• Ngày 5–6: đạt 90%.\n• Ngày 7: giữ 90% kể cả khi mệt, đang dẫn, đang thua, hoặc có người xem.\nKhi giữ được 90% đều, bạn không cần "gồng" nữa — sự nghiêm túc thành chế độ mặc định. (Chấm bằng bài tập "Điểm kỷ luật" trong Rèn luyện.)'},
      {h:'Câu khoá', p:'"100% công lực không phải là gồng 100% sức. 100% công lực là KHÔNG CÚ NÀO bị đánh bằng sự hời hợt."\nVào bàn với thái độ: ÍT NÓI. ÍT PHẢN ỨNG. QUYẾT RÕ. VÀO BỘ CHẮC. RA NGỌN DỨT KHOÁT. ĐÁNH XONG BUÔNG.\nĐó là kiểu cơ thủ lạnh, lì và đáng sợ.'},
    ]},
  {key:'phy_intro', tag:'Thể trạng', title:'Cơ thể quyết định bao nhiêu phần trăm khả năng thật được dùng (bài dẫn nhập)',
    intro:'Bi-a nhìn bề ngoài là môn tĩnh, nhưng nó đòi ba thứ mà cơ thể phải cấp đều đặn suốt nhiều giờ: thị giác chiều sâu ổn định, một cánh tay lặp lại được cùng một quỹ đạo hàng trăm lần, và đủ nhiên liệu cho não giữ chú ý. Cả ba thứ đó đều tụt TRƯỚC khi bạn kịp cảm thấy mệt. Mục này gom những thứ nằm ngoài kỹ thuật nhưng quyết định hôm nay bạn dùng được bao nhiêu phần trăm trình thật của mình.',
    body:[
      {h:'Vì sao môn tĩnh vẫn cần thể lực', p:'Một trận bốn tiếng gồm vài trăm lần cúi xuống rồi đứng lên, mỗi lần đều bắt lưng dưới, hông và chân giữ nguyên một tư thế trong khi tay chuyển động độc lập. Thiếu sức bền thì tư thế xấu dần từ ván thứ ba trở đi, và tư thế xấu là nguồn sai lệch không ai nhìn thấy trong lúc đang chơi. (Xem "Tư thế & đường thẳng cơ thể".)'},
      {h:'Thứ tự ưu tiên nếu chỉ sửa được một thứ', p:'Theo mức ảnh hưởng trên mỗi đơn vị công bỏ ra: giấc ngủ đứng đầu, rồi tới nước và bữa ăn, rồi mới tới thể lực nền và khởi động. Ngủ đứng đầu vì nó chạm cùng lúc cả ba thứ — thị giác, độ chính xác của động tác và khả năng kiềm chế cảm xúc, trong khi các yếu tố còn lại mỗi thứ chỉ chạm được một phần. (Xem "Giấc ngủ — biến số ảnh hưởng phong độ mạnh nhất".)'},
      {h:'Cơ thể tụt trước khi cảm giác kịp báo', p:'Cảm giác mệt xuất hiện sau khi hiệu suất đã đi xuống một quãng, nên tới lúc bạn thấy mình mệt thì đã trượt vài cú vì lý do đó rồi. Cách duy nhất đi trước cảm giác là quản lý theo lịch thay vì theo cảm nhận: uống nước theo mốc thời gian, ăn nhẹ theo mốc thời gian, nghỉ theo mốc thời gian.'},
      {h:'Phân biệt buổi dở vì đầu với buổi dở vì thân', p:'Buổi dở vì tâm lý thường lệch theo tình huống — hỏng ở cú quan trọng, hỏng khi bị dẫn, hỏng khi có người xem. Buổi dở vì thể trạng thì lệch đều: mọi cú đều kém hơn một chút, kể cả cú không có sức ép nào. Nhận đúng nhóm nguyên nhân mới sửa đúng chỗ. (Xem "Đo độ ổn định của chính mình".)'},
      {h:'Ba dấu hiệu cho biết thân đang là thủ phạm', p:'(i) Cú dễ trượt nhiều hơn cú khó một cách bất thường. (ii) Lực tay lúc quá tay lúc non tay trong cùng một ván. (iii) Phải nhìn lâu hơn thường lệ mới thấy rõ điểm chạm. Có đủ hai trong ba dấu hiệu thì đừng đi sửa kỹ thuật hôm đó, hãy hạ chế độ chơi xuống một bậc. (Xem "Nâng sàn phong độ".)'},
      {h:'Nối với phần tâm lý ở chỗ nào', p:'Thể trạng kém không chỉ làm tay kém, nó làm ngưỡng chịu bực thấp xuống, và ngưỡng chịu bực thấp mới là thứ phá cả buổi. Rất nhiều chuỗi lỗi liên tiếp bắt đầu bằng một cơ thể thiếu ngủ chứ không bắt đầu bằng một cái đầu yếu. (Xem "Đầu vào đều thì đầu ra mới đều".)'},
      {h:'Cách dùng mục này', p:'Đọc bốn nhóm theo thứ tự: sức bền và năng lượng cho ngày chơi, những bộ phận hay hỏng vì nghề, ăn uống, rồi thể lực nền. Mỗi nhóm chọn đúng một thứ để sửa trong hai tuần, đo lại rồi mới sửa thứ tiếp theo. Sửa nhiều thứ cùng lúc thì không biết thứ nào có tác dụng.'},
    ]},
  {key:'tired', tag:'Thể trạng', title:'Chơi bi-a khi mệt',
    intro:'Khi mệt, kỹ thuật và quyết định tụt cùng lúc, và cái tụt trước tiên lại là thứ khó nhận ra nhất — khả năng kiên nhẫn chờ đúng thời điểm. Mục tiêu của một buổi mệt không phải chơi hay nhất, mà là chơi đủ tốt và ít lỗi nhất có thể, để buổi đó vẫn dùng được thay vì thành một buổi vứt đi.',
    body:[
      {h:'Nhận ra mình đã mệt trước khi nó tính tiền', p:'Dấu hiệu theo thứ tự xuất hiện: mắt khó dán vào điểm chạm và phải nhìn lại lần hai, lực tay thất thường giữa các cú giống nhau, bắt đầu bỏ bớt bước trong quy trình, rồi mới tới cáu và đánh vội. Nhận ra ở hai dấu hiệu đầu thì còn kịp đổi chế độ chơi; nhận ra ở dấu hiệu cuối thì đã mất vài ván.'},
      {h:'Hạ độ khó thay vì cố giữ phong độ', p:'Chọn cú chắc nhất chứ không phải cú hay nhất, giảm ra bi cầu kỳ và chấp nhận vị trí tạm được cho cú sau. Phân vân giữa tấn công và phòng thủ thì chọn phòng thủ, vì lúc mệt xác suất thành công của cú khó tụt nhiều hơn xác suất của cú an toàn. (Xem "Khi nào tấn công, khi nào bỏ".)'},
      {h:'Giữ quy trình tối thiểu, đừng bỏ hẳn', p:'Mệt là lúc quy trình bị rút bớt đầu tiên, và cũng là lúc cần nó nhất vì cơ thể không còn tự động làm đúng. Rút xuống bản ngắn nhưng cố định: một hơi thở ra dài, nhìn rõ điểm chạm, hai nhịp thử, bắn. Thà chậm một nhịp còn hơn bắn lúc chưa sẵn sàng. (Xem "Quy trình vào cú".)'},
      {h:'Chủ động giảm lực xuống một bậc', p:'Người mệt có xu hướng đánh mạnh hơn bình thường để bù cảm giác, và đó chính là lúc tay giật nhiều nhất. Đặt luật cho cả buổi: mọi cú nhẹ hơn thường ngày một bậc, ưu tiên cú dừng và cú theo ngắn, tránh mọi cú cần bi cái chạy dài qua nhiều băng. (Xem "Cảm giác lực & kiểm soát tốc độ".)'},
      {h:'Tư thế tốn ít sức nhất', p:'Đứng vững trên hai chân, tì cầu tay chắc xuống mặt bàn và tuyệt đối không gồng vai, vì vai gồng là nơi ngốn sức nhanh nhất mà không đóng góp gì cho cú đánh. Giữa các cú thì đứng thẳng và thả lỏng tay, đừng đứng cúi lom khom chờ tới lượt.'},
      {h:'Tiếp năng lượng đúng lúc, đừng đợi kiệt', p:'Uống nước từng ngụm đều đặn và ăn nhẹ trước khi thấy đói, vì khi đã thấy đói thì đường huyết đã xuống được một lúc rồi. Giữa hiệp duỗi cổ tay, vai và cổ chừng hai mươi tới ba mươi giây, nhắm mắt vài chục giây cho mắt nghỉ. (Xem "Dinh dưỡng cho cơ thủ".)'},
      {h:'Chỉnh lại kỳ vọng ngay từ đầu buổi', p:'Vào bàn với kỳ vọng của ngày khoẻ rồi mới vỡ mộng giữa chừng là cách hỏng cả buổi. Khai báo trước với chính mình rằng hôm nay là buổi giữ sàn, mục tiêu là ít lỗi chứ không phải chuỗi dài, thì mỗi cú hỏng không còn kéo theo cảm xúc. (Xem "Nâng sàn phong độ".)'},
      {h:'Khi nào nên dừng hẳn', p:'Mắt hoa, tay không còn kiểm soát được lực, hoặc trượt liên tục những cú vốn không bao giờ trượt thì nên dừng. Tập trong trạng thái quá mệt không những không lên trình mà còn ghim động tác sai vào trí nhớ cơ, và gỡ một thói quen sai tốn nhiều thời gian hơn nhiều so với việc nghỉ một buổi.'},
      {h:'Mệt kéo dài nhiều tuần là chuyện khác', p:'Mệt một buổi thì xử theo bài này, nhưng mệt dai dẳng kèm mất hứng tập là dấu hiệu của kiệt sức chứ không phải của một đêm ngủ kém. Hai thứ đó cần hai cách xử lý khác hẳn nhau. (Xem "Tránh kiệt sức & giữ lửa lâu dài".)'},
    ]},
  {key:'allday', tag:'Thể trạng', title:'Giữ sức khi đánh giải cả ngày',
    intro:'Giải kéo dài nhiều trận từ sáng tới tối, và người đứng vững tới trận cuối thường không phải người mạnh nhất lúc chín giờ sáng mà là người tiêu năng lượng đều nhất. Một ngày giải nên được quản lý như một cuộc chạy đường dài: chia sức theo chặng, tiếp nhiên liệu theo lịch, và giữ lại một phần cho chặng quyết định.',
    body:[
      {h:'Ngày giải bắt đầu từ tối hôm trước', p:'Ngủ đủ và đi ngủ đúng khung giờ quen thuộc quan trọng hơn việc ngủ thêm một tiếng ở khung giờ lạ. Soạn sẵn từ tối nước uống, đồ ăn nhẹ, khăn, phấn và áo khoác mỏng, để sáng hôm sau không phải quyết định gì cả — mỗi quyết định vụn vặt buổi sáng đều lấy đi một ít khả năng tập trung của buổi trưa.'},
      {h:'Ăn nhẹ theo lịch, không theo cảm giác đói', p:'Bữa sáng nên là tinh bột chậm cộng chút đạm để no lâu và giữ đường huyết phẳng. Trong ngày ăn nhẹ mỗi hai tới ba tiếng bằng khẩu phần nhỏ, và ăn trước khi thấy đói. Tránh bữa trưa quá no giữa giải vì cơ thể dồn máu cho tiêu hoá đúng lúc bạn cần nó cho mắt và não. (Xem "Ăn uống khi đi giải xa nhà".)'},
      {h:'Uống nước đều cả ngày', p:'Chỉ cần mất một tới hai phần trăm lượng nước là khả năng tập trung và độ nhạy của mắt đã giảm thấy rõ, trong khi cảm giác khát tới muộn hơn thế nhiều. Đặt mốc uống theo trận thay vì theo cảm giác: mỗi lần đổi trận là uống, mỗi lần nghỉ giữa hiệp là uống một ngụm. (Xem "Nước và điện giải".)'},
      {h:'Cà phê dùng như một quân bài, không dùng như nước uống', p:'Một liều đúng lúc giúp giữ tỉnh táo qua khoảng trũng đầu giờ chiều, nhưng uống rải rác cả ngày thì chỉ đổi được sự tỉnh táo lấy tay run và một cú tụt sâu hơn sau đó. Chọn trước một hoặc hai thời điểm dùng trong ngày rồi giữ đúng kế hoạch đó. (Xem "Caffeine — liều, thời điểm và cái giá phải trả".)'},
      {h:'Nghỉ chủ động giữa các trận', p:'Ngồi lì bấm điện thoại là kiểu nghỉ tệ nhất vì mắt vẫn làm việc ở cự ly gần trong khi thân người cứng lại. Kiểu nghỉ có tác dụng gồm đi lại nhẹ vài phút, duỗi vai lưng cổ tay, nhìn ra xa cho mắt đổi tiêu cự, rồi mới ngồi tựa thả lỏng. (Xem "Mắt và thị giác của cơ thủ".)'},
      {h:'Khởi động lại trước mỗi trận, không chỉ đầu ngày', p:'Nghỉ một tiếng là đủ để cơ nguội và cảm giác lực lệch đi. Trước mỗi trận mới nên làm nóng cổ tay và vai chừng một phút rồi đánh vài cú chắc để hiệu chỉnh lại lực, thay vì bước vào ván đầu với tay lạnh rồi mất hai ván để tìm lại cảm giác. (Xem "Khởi động cơ thể trước khi vào bàn".)'},
      {h:'Giữ ấm và giữ tư thế suốt ngày dài', p:'Phòng điều hoà lạnh làm cổ tay cứng và giảm độ mượt của cú vung, nên áo khoác mỏng là dụng cụ thi đấu chứ không phải đồ thừa. Trong lúc chờ, ngồi tựa lưng thẳng thay vì ngồi gập người, vì lưng dưới mỏi từ giữa ngày sẽ đổi tư thế cúi bàn của bạn mà bạn không nhận ra.'},
      {h:'Mỗi trận là một trận mới', p:'Thắng thì đừng mang sự tự mãn sang trận sau, thua thì đừng mang cơn bực. Đặt một nghi thức ngắn giữa hai trận để đóng trận cũ lại, chẳng hạn vài hơi thở ra dài rồi ghi đúng một dòng vào sổ, sau đó không nghĩ về nó nữa. (Xem "Sức bền tâm lý cho trận dài".)'},
      {h:'Chế độ tiết kiệm cho cuối ngày', p:'Tới trận thứ tư hay thứ năm thì gần như chắc chắn bạn không còn ở mức sáng nay, và cố đánh như buổi sáng là cách thua nhanh nhất. Chuyển sang chế độ tiết kiệm: đơn giản hoá lối chơi, giảm lực một bậc, giữ quy trình tối thiểu. Tránh rượu bia trong suốt giải vì tác động rơi vào ngày thi đấu kế tiếp. (Xem "Chơi bi-a khi mệt".)'},
      {h:'Ghi lại đường cong của ngày', p:'Sau giải, ghi lại bạn tụt ở trận thứ mấy và tụt vì cái gì. Sau vài giải, khuôn mẫu hiện ra rất rõ và thường chỉ nằm ở một hai nguyên nhân lặp lại, chẳng hạn bỏ bữa trưa hoặc uống cà phê quá muộn. Sửa đúng một hai chỗ đó có tác dụng lớn hơn mọi lời khuyên chung. (Xem "Hồi phục sau buổi chơi dài và sau giải".)'},
    ]},
  {key:'phy_sleep', tag:'Thể trạng', title:'Giấc ngủ — biến số ảnh hưởng phong độ mạnh nhất',
    intro:'Trong tất cả những thứ nằm ngoài kỹ thuật, giấc ngủ là thứ đổi kết quả nhiều nhất trên mỗi đơn vị công bỏ ra, và cũng là thứ dễ bị bỏ qua nhất vì hậu quả của nó không bao giờ tự giới thiệu tên. Người thiếu ngủ không cảm thấy mình đánh kém, họ chỉ thấy bi dễ tự nhiên trượt và trận đấu hôm nay sao mà nhiều xui.',
    body:[
      {h:'Thiếu ngủ đánh vào đúng ba thứ bi-a cần', p:'Thứ nhất là thị giác chiều sâu và khả năng giữ mắt yên trên một điểm nhỏ. Thứ hai là độ chính xác của động tác lặp lại, tức là chính cú vung. Thứ ba là khả năng kiềm chế phản ứng sau lỗi. Một môn khác có thể chỉ mất một trong ba, bi-a mất cả ba cùng lúc.'},
      {h:'Bạn không tự đánh giá được mức tụt của mình', p:'Cảm nhận chủ quan về sự tỉnh táo hồi phục nhanh hơn hiệu suất thực tế, nghĩa là sau một cốc cà phê bạn thấy mình tỉnh trong khi tay vẫn đang ở mức của người thiếu ngủ. Đây là lý do phải quyết định chế độ chơi dựa trên số giờ đã ngủ chứ không dựa trên cảm giác lúc bước vào quán.'},
      {h:'Giờ đi ngủ ổn định đáng giá hơn tổng số giờ', p:'Bảy tiếng đều đặn cùng một khung giờ cho phong độ ổn định hơn tám tiếng nhưng mỗi hôm một giờ khác nhau. Cơ thể chuẩn bị cho trạng thái tỉnh táo theo nhịp đã học được, và nhịp đó chỉ hình thành khi khung giờ lặp lại. (Xem "Đầu vào đều thì đầu ra mới đều".)'},
      {h:'Đêm trước giải thường ngủ kém, và điều đó bình thường', p:'Lo lắng trước giải làm giấc ngủ nông đi ở hầu hết mọi người, kể cả cơ thủ nhà nghề. Cái quyết định không phải đêm cuối mà là ba tới bốn đêm trước đó, nên hãy giữ kỷ luật ngủ từ đầu tuần thay vì cố ép mình ngủ sớm vào đúng đêm áp chót rồi nằm trằn trọc vì áp lực phải ngủ.'},
      {h:'Ngủ trưa ngắn có tác dụng, ngủ trưa dài thì không', p:'Một giấc chừng hai mươi phút giúp lấy lại độ tỉnh mà không rơi vào trạng thái nặng đầu sau khi dậy. Ngủ quá bốn mươi phút thì thường phải mất nửa tiếng mới hết ì, và nửa tiếng đó có thể rơi đúng vào trận buổi chiều. Nếu định ngủ trưa trong giải thì tính ngược thời gian từ giờ vào trận.'},
      {h:'Ánh sáng và màn hình buổi tối', p:'Ánh sáng mạnh vào buổi tối đẩy lùi thời điểm cơ thể sẵn sàng ngủ, mà phòng bi-a buổi đêm thì sáng và kích thích. Sau buổi chơi khuya, giảm ánh sáng và tránh màn hình chừng nửa tiếng trước khi nằm, nếu không thì bạn về nhà lúc mười một giờ nhưng cơ thể vẫn ở chế độ thi đấu tới một giờ sáng.'},
      {h:'Chơi khuya thường xuyên thì đổi cả lịch, đừng đổi từng hôm', p:'Người hay đánh đêm không nhất thiết phải ngủ sớm, họ chỉ cần một lịch cố định muộn hơn. Cái hại không nằm ở việc ngủ muộn mà ở việc nay ngủ muộn mai ngủ sớm, vì cơ thể phải liên tục hiệu chỉnh lại và không bao giờ ổn định. (Xem "Bàn lạ, quán lạ".)'},
      {h:'Ngày ngủ thiếu thì khai báo trước khi cầm cơ', p:'Biết mình ngủ năm tiếng thì chọn chế độ chơi ngay từ trước: hạ lực một bậc, bỏ cú mạo hiểm, tăng tỉ lệ phòng thủ, và đặt mục tiêu là ít lỗi thay vì chuỗi dài. Một buổi thiếu ngủ được quản lý đúng vẫn là buổi dùng được; cũng buổi đó mà đánh như ngày thường thì mất cả buổi lẫn sự tự tin. (Xem "Chơi bi-a khi mệt".)'},
      {h:'Đo bằng số, đừng đo bằng trí nhớ', p:'Ghi hai con số trước mỗi buổi là đủ: đêm qua ngủ mấy tiếng và giờ đi ngủ. Sau chừng hai mươi buổi, đặt cạnh điểm phong độ tự chấm, quan hệ giữa hai cột sẽ hiện ra rõ hơn mọi lời khuyên chung vì đó là số liệu của riêng cơ thể bạn. (Xem "Đo độ ổn định của chính mình".)'},
    ]},
  {key:'phy_warmup', tag:'Thể trạng', title:'Khởi động cơ thể trước khi vào bàn',
    intro:'Phần lớn người chơi bước thẳng từ xe máy vào bàn và đánh cú đầu tiên trong vòng hai phút, rồi mất nửa tiếng đầu để tìm lại cảm giác. Nửa tiếng đó không phải là cái giá bắt buộc — nó là hậu quả của việc bỏ qua năm phút khởi động.',
    body:[
      {h:'Khởi động giải quyết vấn đề gì', p:'Nó làm ba việc riêng biệt: tăng độ mượt cho khớp vai và cổ tay, đánh thức lại độ nhạy cảm giác lực, và chuyển đầu óc từ trạng thái đời thường sang trạng thái thi đấu. Bỏ phần nào thì thiếu đúng phần đó, và thiếu phần thứ ba là lý do nhiều người đánh ván đầu như đang nghĩ chuyện khác.'},
      {h:'Ba phút cho cơ thể', p:'Xoay vai và cổ tay theo cả hai chiều, lắc lỏng bàn tay, xoay nhẹ thân trên sang hai bên, gập duỗi cổ tay có giữ vài giây. Mục tiêu là làm ấm chứ không phải kéo giãn sâu, vì kéo giãn mạnh ngay trước khi chơi làm giảm cảm giác kiểm soát lực. Phần giãn sâu để dành cho sau buổi. (Xem "Giãn cơ và phòng chấn thương do lặp động tác".)'},
      {h:'Năm phút cho cây cơ, theo thứ tự cố định', p:'Bắt đầu bằng cú vung không bi để tìm lại đường thẳng, rồi bi cái chạy dọc bàn về đúng chỗ cũ để hiệu chỉnh lực, rồi vài cú thẳng cự ly ngắn, rồi mới tới cú có góc. Thứ tự này đi từ dễ tới khó nên mỗi bước đều thành công, và chuỗi thành công nhỏ chính là thứ dựng lại sự tự tin cho ván đầu. (Xem "Cú vung thẳng".)'},
      {h:'Hiệu chỉnh theo bàn hôm nay, không theo trí nhớ hôm qua', p:'Nỉ mới, nỉ ẩm hay băng lạnh đều đổi tốc độ bàn, và cảm giác lực bạn mang từ buổi trước sang sẽ sai một cách có hệ thống. Dành riêng một phút đánh bi cái đi hai băng về chỗ cũ chỉ để đọc tốc độ bàn hôm nay trước khi đánh cú thật nào. (Xem "Nỉ, độ ẩm & tốc độ bàn".)'},
      {h:'Khởi động mắt cũng cần thời gian', p:'Đổi từ ánh sáng ngoài trời sang ánh đèn bàn khiến mắt cần vài phút mới thích nghi, và trong vài phút đó độ nhạy với điểm chạm chưa về mức bình thường. Vào sớm vài phút, nhìn thử vài đường ngắm ở cả cự ly gần lẫn xa trước khi tính điểm.'},
      {h:'Khởi động lại sau mỗi lần nghỉ dài', p:'Nghỉ trên ba mươi phút là đủ để cơ nguội và cảm giác lực trôi. Trong giải, mỗi lần chờ trận là một lần phải làm lại bản rút gọn chừng một phút, gồm xoay cổ tay và vài cú chắc. (Xem "Giữ sức khi đánh giải cả ngày".)'},
      {h:'Bản rút gọn khi không có bàn trống', p:'Ở giải đông, thường không có bàn để khởi động. Bản tối thiểu làm được ở ghế chờ gồm xoay vai và cổ tay, vài lần vung tay không trong không khí để nhắc lại quỹ đạo, và một lượt thở chậm để hạ nhịp tim. Nó không thay được bàn thật nhưng đủ để tránh cú đầu tiên bị lạnh tay. (Xem "Hơi thở & điều tiết hưng phấn".)'},
      {h:'Đừng biến khởi động thành buổi tập kỹ thuật', p:'Khởi động là để lấy trạng thái, không phải để phát hiện lỗi và sửa. Thấy có gì lệch trong lúc khởi động thì ghi lại để tập sau buổi, tuyệt đối đừng bắt đầu chỉnh động tác ngay trước trận — chỉnh kỹ thuật sát giờ thi đấu là cách chắc chắn nhất để vào trận với một cú vung lạ. (Xem "Ngưỡng ĐỦ TỐT".)'},
    ]},
  {key:'phy_recovery', tag:'Thể trạng', title:'Hồi phục sau buổi chơi dài và sau giải',
    intro:'Phần lớn người chơi kết thúc buổi bằng việc cất cơ rồi đi về, và sáng hôm sau ngạc nhiên vì vai mỏi, lưng cứng và không có hứng cầm cơ. Hồi phục không phải chuyện của vận động viên chuyên nghiệp, nó chỉ là mười lăm phút quyết định buổi tập kế tiếp bắt đầu ở mức nào.',
    body:[
      {h:'Vì sao cần hồi phục cho một môn không đổ mồ hôi', p:'Cái mỏi của bi-a không đến từ cường độ mà đến từ sự lặp lại và từ việc giữ nguyên một tư thế lệch trong nhiều giờ. Cổ, vai bên tay cầm cơ, lưng dưới và cổ tay là bốn chỗ chịu tải tĩnh liên tục, và tải tĩnh kéo dài gây cứng cơ nhiều hơn cả tải nặng ngắn.'},
      {h:'Mười phút ngay sau khi chơi xong', p:'Giãn nhẹ những nhóm vừa làm việc: cổ, vai, ngực, lưng dưới, cổ tay và cẳng tay, mỗi động tác giữ hai mươi tới ba mươi giây và không nín thở. Đây là lúc duy nhất giãn sâu có lợi, khác hẳn với trước khi chơi. (Xem "Giãn cơ và phòng chấn thương do lặp động tác".)'},
      {h:'Bù nước và ăn lại trong vòng một tiếng', p:'Nhiều giờ trong phòng lạnh làm mất nước nhiều hơn cảm nhận, và bỏ bữa sau buổi khuya kéo theo giấc ngủ kém rồi hôm sau lại đổ cho tâm lý. Uống nước và ăn một bữa nhẹ có đạm trước khi ngủ là hai việc rẻ nhất trong toàn bộ danh sách này. (Xem "Nước và điện giải".)'},
      {h:'Ghi sổ trước khi quên, nhưng chỉ ba dòng', p:'Ghi ngay sau buổi vì trí nhớ về nguyên nhân phai rất nhanh, nhưng chỉ ghi ba lỗi lặp lại nhiều nhất chứ không ghi tất cả. Sổ ghi mọi thứ thì không ai đọc lại, còn ba dòng mỗi buổi sau bốn tuần sẽ chỉ ra rất rõ chỗ đáng tập. (Xem "Đo độ ổn định của chính mình".)'},
      {h:'Một ngày nghỉ sau giải không phải là lười', p:'Sau một ngày giải, cả hệ thần kinh lẫn khả năng tập trung đều cần thời gian về mức nền, và tập nặng ngay hôm sau thường chỉ ghim thêm mệt mỏi chứ không lên trình. Nghỉ hẳn một ngày hoặc chỉ đánh nhẹ không tính điểm là lựa chọn cho kết quả tốt hơn ở tuần kế tiếp.'},
      {h:'Xem lại giải khi đã nguội, không xem lúc còn cay', p:'Đánh giá ngay sau trận thua thường sai vì cảm xúc kéo trí nhớ về phía những cú gây đau nhất. Để một ngày rồi mới ngồi xem lại thì bạn đọc được cả những cú quyết định nhưng không gây cảm xúc, và đó thường mới là chỗ trận đấu thật sự lật. (Xem "Vượt qua thất bại & lì đòn".)'},
      {h:'Dấu hiệu cần nghỉ dài hơn một ngày', p:'Mỏi vai hoặc cổ tay còn dai dẳng sau hai ngày, ngủ đủ mà vẫn uể oải, hoặc mất hẳn hứng cầm cơ trong hơn một tuần đều là dấu hiệu tích luỹ quá tải chứ không phải thiếu ý chí. Ép tập tiếp trong trạng thái đó là cách nhanh nhất đi tới một giai đoạn sa sút dài. (Xem "Tránh kiệt sức & giữ lửa lâu dài".)'},
      {h:'Đau thì dừng và đi khám, đừng tự chẩn đoán', p:'Mỏi cơ là chuyện bình thường và hết sau một hai ngày; đau nhói ở khớp vai, khuỷu tay hay cổ tay, hoặc tê lan xuống ngón tay thì không. Những dấu hiệu đó cần bác sĩ chứ không cần thêm bài tập, và càng để lâu càng tốn thời gian nghỉ về sau. (Xem "Đau lưng, cổ và vai gáy".)'},
    ]},
  {key:'phy_eyes', tag:'Thể trạng', title:'Mắt và thị giác của cơ thủ',
    intro:'Bi-a là môn thị giác trước khi là môn vận động: mọi thứ bắt đầu bằng việc mắt xác định được một điểm chạm rộng chừng vài milimet ở cách xa cả mét. Vậy mà mắt lại là bộ phận duy nhất người chơi gần như không bao giờ chăm sóc, cũng không bao giờ nghĩ tới khi giải thích một buổi đánh dở.',
    body:[
      {h:'Mắt mỏi biểu hiện giống hệt lỗi kỹ thuật', p:'Khi mắt mỏi, điểm chạm mờ đi rất ít nhưng đủ để đường ngắm lệch, và cảm giác của người chơi là ngắm đúng mà bi vẫn không vào. Đó là lý do rất nhiều buổi mỏi mắt bị chẩn đoán thành lỗi cú vung, rồi người chơi đi sửa cú vung và làm hỏng thêm thứ vốn không sai. (Xem "Bi cái không tới đúng chỗ".)'},
      {h:'Ba dấu hiệu mắt đang là thủ phạm', p:'Phải nhìn lại lần thứ hai mới thấy rõ điểm chạm, cảm giác nặng hoặc khô quanh hốc mắt, và khó chuyển nhanh từ nhìn xa sang nhìn gần. Có đủ hai dấu hiệu thì việc cần làm là cho mắt nghỉ, không phải chỉnh động tác.'},
      {h:'Nghỉ mắt đúng cách giữa các trận', p:'Nhìn ra xa hơn năm mét trong chừng hai mươi giây làm giãn cơ điều tiết vốn bị giữ căng suốt thời gian nhìn gần. Nhắm mắt vài chục giây và nháy mắt chủ động cũng có tác dụng, còn lướt điện thoại thì làm điều ngược lại vì nó giữ mắt ở cự ly gần và giảm số lần nháy mắt. (Xem "Giữ sức khi đánh giải cả ngày".)'},
      {h:'Ánh sáng của bàn và của phòng', p:'Bàn sáng trong phòng tối buộc mắt liên tục thích nghi mỗi lần bạn đứng lên rồi cúi xuống, và sự thích nghi liên tục đó chính là nguồn mỏi. Ở bàn tập của mình, giữ ánh sáng phòng đủ để chênh lệch với ánh sáng bàn không quá lớn; ở quán lạ, dành thêm vài phút cho mắt quen trước khi tính điểm. (Xem "Bàn lạ, quán lạ".)'},
      {h:'Khô mắt trong phòng điều hoà', p:'Điều hoà làm không khí khô và giảm màng nước trên bề mặt mắt, kéo theo cảm giác cay và mờ nhẹ vào cuối ngày dài. Uống nước đủ, nháy mắt có ý thức khi ngắm lâu, và nếu hay khô mắt thì mang theo nước nhỏ mắt loại nước muối sinh lý.'},
      {h:'Mắt trội và vị trí đầu', p:'Mỗi người có một mắt trội, và vị trí đặt đầu trên cây cơ phải khớp với mắt đó, nếu không thì cùng một cú vung đúng vẫn cho đường ngắm sai một cách nhất quán. Cách thử là ngắm một đường thẳng dễ rồi dịch đầu từng chút cho tới khi cảm giác đường ngắm rõ nhất, rồi ghim vị trí ấy thành cố định. (Xem "Ngắm — bốn hệ thống".)'},
      {h:'Đi khám mắt nếu chưa từng khám', p:'Một độ loạn thị nhỏ hoặc lệch độ giữa hai mắt gần như không ảnh hưởng đời sống thường ngày nhưng đủ làm lệch đánh giá cự ly và điểm chạm. Đây là một trong rất ít thứ mà một lần đi khám có thể giải thích được nhiều năm chơi bị chững, nên đáng làm dù không thấy có vấn đề gì.'},
      {h:'Kính khi chơi bi-a', p:'Kính thường có khung và vùng nhìn không thiết kế cho việc cúi thấp rồi nhìn chéo lên, nên người đeo kính hay bị nhìn qua mép kính mà không biết. Ai đeo kính nên tự kiểm xem ở tư thế cúi bàn thật thì tâm mắt còn nằm trong vùng nhìn của kính hay không, và cân nhắc loại kính chuyên dùng nếu chơi nhiều.'},
      {h:'Giữ mắt yên trước khi bắn', p:'Ngoài chuyện nhìn rõ còn chuyện nhìn ổn định: mắt phải dừng lại trên một điểm trong khoảng thời gian ngay trước khi tay đưa cơ ra. Người đảo mắt qua lại giữa bi cái và bi mục tiêu tới đúng lúc bắn thường trượt vì thông tin cuối cùng não nhận được không phải điểm cần bắn tới. (Xem "Quy trình vào cú".)'},
    ]},
  {key:'phy_tremor', tag:'Thể trạng', title:'Run tay — nguyên nhân sinh lý và cách xử lý',
    intro:'Run tay bị mặc định là bệnh của tâm lý, nhưng phần lớn các trường hợp có nguyên nhân sinh lý thuần túy: caffeine, đường huyết thấp, thiếu ngủ, lạnh hoặc mỏi cơ. Nhận đúng nguyên nhân quan trọng vì cách chữa của hai nhóm này hoàn toàn khác nhau, và chữa nhầm thì càng cố càng nặng.',
    body:[
      {h:'Phân biệt run sinh lý với run vì áp lực', p:'Run sinh lý xuất hiện cả ở cú không quan trọng, có mặt từ đầu buổi, và thường kèm cảm giác lâng lâng hoặc tim đập nhanh. Run vì áp lực chỉ xuất hiện ở cú có sức ép và biến mất ngay khi tình huống hết căng. Trả lời được một câu là xong: cú vừa rồi có quan trọng không. (Xem "Áp lực & khoảnh khắc căng".)'},
      {h:'Caffeine là nghi phạm đầu tiên', p:'Đây là nguyên nhân phổ biến nhất và cũng dễ kiểm nhất: thử một buổi không cà phê và một buổi có, so cùng một bài tập. Ngưỡng gây run rất khác nhau giữa người với người, nên con số hợp lý phải tự đo chứ không lấy của người khác. (Xem "Caffeine — liều, thời điểm và cái giá phải trả".)'},
      {h:'Đường huyết thấp gây run kèm cáu', p:'Bỏ bữa hoặc để bụng rỗng nhiều giờ làm tay run nhẹ, đồng thời làm ngưỡng chịu bực tụt xuống, nên biểu hiện gộp lại rất giống mất bình tĩnh. Dấu hiệu nhận ra là run kèm cảm giác trống rỗng và hết kiên nhẫn, và nó biến mất trong vòng mười lăm phút sau khi ăn nhẹ. (Xem "Dinh dưỡng cho cơ thủ".)'},
      {h:'Lạnh làm cứng và làm run', p:'Phòng điều hoà mạnh làm cổ tay và ngón tay giảm độ mượt, và cơ thể đáp lại bằng những rung nhỏ để sinh nhiệt. Áo khoác mỏng, xoa hai tay và làm nóng cổ tay trước khi vào bàn xử được phần lớn trường hợp này. (Xem "Khởi động cơ thể trước khi vào bàn".)'},
      {h:'Mỏi cơ cuối ngày dài', p:'Sau nhiều giờ, cơ giữ tư thế bắt đầu rung ở tần số thấp, thấy rõ nhất khi giữ cầu tay lâu trước cú khó. Cách xử là giảm thời gian giữ tư thế trước khi bắn và bỏ những cú cần lực lớn, chứ không phải cố giữ lâu hơn để ngắm cho chắc. (Xem "Chơi bi-a khi mệt".)'},
      {h:'Nắm cơ chặt làm run nặng thêm', p:'Phản xạ tự nhiên khi thấy tay run là nắm chặt hơn để giữ yên, nhưng nắm chặt truyền rung từ cẳng tay xuống đầu cơ nhiều hơn chứ không ít hơn. Nắm lỏng và để cây cơ nằm trên các ngón thay vì bị kẹp là cách giảm biên độ run thật sự. (Xem "Tay cầm cơ".)'},
      {h:'Xử lý ngay tại bàn theo thứ tự', p:'Đứng lên khỏi tư thế, thở ra dài hai lần, thả lỏng bàn tay và lắc nhẹ, uống một ngụm nước, rồi vào bộ lại từ đầu thay vì cố bắn từ tư thế đang run. Nếu vẫn run thì đổi sang cú đơn giản hơn hoặc cú phòng thủ, đừng chọn đúng cú khó nhất để chứng minh mình không run.'},
      {h:'Cách phòng dài hạn', p:'Cổ tay và cẳng tay khoẻ hơn thì biên độ run ở cuối buổi nhỏ hơn, và một quy trình vào cú cố định làm giảm khoảng thời gian tay phải giữ yên. Hai thứ đó xử phần sinh lý; phần còn lại nếu vẫn chỉ xuất hiện ở cú quan trọng thì đó mới là việc của tâm lý. (Xem "Sợ cú cụ thể & chết tay".)'},
      {h:'Khi nào nên đi khám', p:'Run xuất hiện cả trong sinh hoạt thường ngày, run một bên rõ hơn bên kia, hoặc run tăng dần theo tháng thì không còn là chuyện tập luyện. Đó là lúc cần bác sĩ, và đi sớm thì đường xử lý luôn nhẹ hơn.'},
    ]},
  {key:'phy_backpain', tag:'Thể trạng', title:'Đau lưng, cổ và vai gáy — bệnh nghề nghiệp của cơ thủ',
    intro:'Tư thế cúi bàn của bi-a bắt cột sống giữ một trạng thái gập và xoay nhẹ trong nhiều giờ, mỗi ván lặp lại hàng chục lần. Đây là nguyên nhân phổ biến nhất khiến người chơi lâu năm phải giảm giờ tập, và gần như toàn bộ đều phòng được nếu xử từ sớm.',
    body:[
      {h:'Ba chỗ chịu tải nhiều nhất', p:'Lưng dưới chịu phần gập người, cổ chịu phần phải ngửa mặt lên để nhìn theo đường ngắm, và vai bên tay cầm cơ chịu động tác lặp lại. Ba chỗ này đau theo ba cơ chế khác nhau nên cũng cần ba cách phòng khác nhau, không có một bài tập nào xử hết cả ba.'},
      {h:'Tư thế đúng tốn ít sức hơn tư thế thấp', p:'Cúi càng thấp thì đường ngắm càng rõ nhưng tải lên lưng dưới và cổ càng lớn, và nhiều người chọn độ thấp theo cách người khác đứng thay vì theo cơ thể mình. Độ cúi đúng là độ thấp nhất mà bạn giữ được nhiều giờ mà không phải đổi tư thế, không phải độ thấp nhất bạn với tới được. (Xem "Tư thế & đường thẳng cơ thể".)'},
      {h:'Chia tải bằng chân, đừng dồn hết vào lưng', p:'Chân trước hơi gập và trọng lượng phân bổ trên cả hai chân thì phần lớn tải rơi vào hông và chân thay vì rơi vào cột sống. Người đứng thẳng hai chân rồi gập hẳn phần thân trên là người dồn toàn bộ tải lên lưng dưới, và đó là kiểu đứng gây đau nhanh nhất.'},
      {h:'Cổ là chỗ dễ bỏ qua nhất', p:'Ngửa cổ để mắt vào đúng đường ngắm là động tác kéo căng phần sau cổ, giữ trong nhiều giờ thì gây mỏi vai gáy và đau đầu vùng chẩm. Cách giảm là hạ độ cúi thân xuống một chút để cổ khỏi phải ngửa nhiều, và giữa các cú thì đứng thẳng đưa cổ về vị trí trung tính.'},
      {h:'Đứng lên giữa các cú là bài tập chống đau', p:'Mỗi lần đứng thẳng dậy giữa hai cú là một lần giải phóng tải cho cột sống, và nó gần như miễn phí về thời gian. Người ngồi hoặc cúi chờ liên tục trong lúc đối thủ đánh mất luôn cơ hội hồi phục nhỏ này, và tới cuối ngày thì khác biệt tích lại rất rõ.'},
      {h:'Cái gì mạnh lên thì lưng đỡ chịu', p:'Cơ lõi và cơ lưng dưới khoẻ giúp giữ tư thế mà không phải dựa vào dây chằng, còn cơ lưng trên và cơ xoay vai khoẻ giúp vai không bị kéo lệch theo động tác lặp lại. Đây là lý do thể lực nền của cơ thủ tập trung vào lõi và lưng trên chứ không tập trung vào cánh tay. (Xem "Bài tập thể lực cho cơ thủ".)'},
      {h:'Giãn sau buổi chơi, không giãn trước', p:'Giãn phần ngực, hông và cơ gập hông sau buổi chơi giúp chống lại trạng thái co ngắn do giữ tư thế gập lâu. Làm việc này trước khi chơi thì giảm cảm giác kiểm soát lực, nên đúng chỗ của nó là sau buổi. (Xem "Giãn cơ và phòng chấn thương do lặp động tác".)'},
      {h:'Phân biệt mỏi với dấu hiệu cần khám', p:'Mỏi cơ đối xứng, hết sau một hai ngày và đỡ khi vận động nhẹ là chuyện bình thường. Đau nhói khi cúi, đau lan xuống chân, tê hoặc yếu ở tay chân thì phải đi khám, và đừng tự tập thêm để chữa. (Xem "Hồi phục sau buổi chơi dài và sau giải".)'},
      {h:'Ghế và bàn ở nơi bạn tập', p:'Nhiều người chơi ngồi chờ trên ghế thấp không tựa lưng trong nhiều giờ, và phần lớn cái mỏi cuối ngày đến từ chỗ ngồi chứ không đến từ chỗ đánh. Chọn ghế có tựa và ngồi thẳng khi chờ là thay đổi rẻ nhất trong bài này.'},
    ]},
  {key:'phy_substances', tag:'Thể trạng', title:'Rượu bia, thuốc lá và các chất trong môi trường bi-a',
    intro:'Bi-a là môn gắn với quán, và quán là nơi rượu bia cùng thuốc lá luôn có mặt. Bài này không bàn chuyện đạo đức mà chỉ nói về ảnh hưởng lên thứ bạn đang cố xây, tức là độ ổn định của một cú đánh và độ tỉnh của một cái đầu.',
    body:[
      {h:'Rượu bia làm mất thứ khó xây nhất', p:'Cảm giác lâng lâng ban đầu có thể làm giảm lo lắng và người chơi lầm rằng mình đánh thoải mái hơn, nhưng thứ bị lấy đi là độ chính xác của động tác và khả năng đánh giá cự ly. Đổi một chút bớt căng lấy một phần điều bi là đổi lỗ, vì phần căng đó có thể xử bằng hơi thở và quy trình mà không phải trả giá gì. (Xem "Hơi thở & điều tiết hưng phấn".)'},
      {h:'Cái giá phần lớn rơi vào ngày hôm sau', p:'Ngay cả lượng nhỏ cũng làm giấc ngủ nông đi và làm cơ thể mất nước, nên buổi bị ảnh hưởng nặng nhất thường là buổi chơi ngày kế tiếp. Đây là lý do rất nhiều người thấy hôm uống vẫn đánh được rồi hôm sau tụt mà không nối được hai việc với nhau. (Xem "Giấc ngủ — biến số ảnh hưởng phong độ mạnh nhất".)'},
      {h:'Trong giải thì tính là không', p:'Một ngày giải đã lấy đi nhiều nước và nhiều sức tập trung, cộng thêm rượu bia vào buổi tối là bảo đảm cho một buổi sáng dưới mức. Quy tắc đơn giản và dễ giữ nhất là suốt thời gian giải thì không uống, thay vì mỗi tối lại tự thương lượng một lượng vừa phải. (Xem "Giữ sức khi đánh giải cả ngày".)'},
      {h:'Thuốc lá và khoảng nghỉ giữa ván', p:'Ngoài tác động lên sức bền, việc ra ngoài hút thuốc giữa các ván còn cắt vụn trạng thái tập trung và làm nguội tay, nên nó lấy đi nhiều hơn phần bình tĩnh nó mang lại. Ai đang dùng nó như nghi thức bình tĩnh thì nên thay bằng một nghi thức khác giữ được nhịp, chẳng hạn vài hơi thở ra dài tại ghế. (Xem "Ngồi chờ tới lượt".)'},
      {h:'Khói thuốc trong phòng làm mỏi mắt', p:'Không khí nhiều khói gây khô và cay mắt, mà mắt là bộ phận bi-a phụ thuộc nhiều nhất. Chọn chỗ tập thoáng khí là quyết định về hiệu suất chứ không chỉ về sức khoẻ dài hạn. (Xem "Mắt và thị giác của cơ thủ".)'},
      {h:'Đánh có cược và bia thường đi cùng nhau', p:'Môi trường có cược thường cũng là môi trường có rượu, và hai thứ cộng lại làm khả năng đánh giá rủi ro tụt đúng lúc rủi ro tăng cao nhất. Nếu chơi có cược thì tách hai thứ ra, giữ đầu tỉnh cho phần quyết định. (Xem "Áp lực khi đánh có cược".)'},
      {h:'Nước tăng lực không phải nước uống', p:'Chúng gộp một liều caffeine cao với một lượng đường nhanh, cho một quãng tỉnh táo ngắn rồi một cú tụt sâu kèm tay run. Với một trận kéo dài vài tiếng thì lịch tiếp nước và ăn nhẹ đều đặn cho kết quả ổn định hơn nhiều. (Xem "Caffeine — liều, thời điểm và cái giá phải trả".)'},
      {h:'Thuốc đang dùng cũng là một biến số', p:'Một số thuốc thông thường gây buồn ngủ hoặc làm tay hơi run, và người chơi thường không nối chúng với buổi đánh dở. Nếu đang dùng thuốc dài ngày thì hỏi bác sĩ về ảnh hưởng lên độ tỉnh táo và độ ổn định của tay, và tuyệt đối đừng tự dùng thứ gì để giảm run.'},
    ]},
  {key:'nutrition', tag:'Dinh dưỡng', title:'Dinh dưỡng cho cơ thủ (bài dẫn nhập)',
    intro:'Bi-a không đốt nhiều năng lượng nhưng lại đòi một thứ khó hơn: mức đường huyết phẳng trong nhiều giờ, vì mọi dao động đều hiện ra thành dao động của khả năng tập trung. Ăn uống cho bi-a vì thế không hướng tới nạp nhiều, mà hướng tới nạp đều.',
    body:[
      {h:'Nguyên tắc gốc là phẳng, không phải mạnh', p:'Một bữa lớn cho cảm giác no rồi kéo theo trạng thái ì, còn một thanh kẹo cho một khoảng tỉnh ngắn rồi tụt dốc kèm tay run. Cả hai đều là dao động, và dao động của đường huyết luôn hiện ra thành mất kiên nhẫn trước khi hiện ra thành mất chính xác.'},
      {h:'Bữa trước khi chơi', p:'Ăn trước chừng một tới hai tiếng, gồm tinh bột hấp thu chậm cộng một phần đạm, chẳng hạn yến mạch, bánh mì nguyên cám, trứng hoặc thịt nạc. Tránh bữa nhiều dầu mỡ vì nó làm chậm tiêu hoá và kéo theo cảm giác nặng đúng vào giờ đầu chơi.'},
      {h:'Ăn nhẹ trong khi chơi', p:'Mỗi hai tới ba tiếng một khẩu phần nhỏ như chuối, hạt, trái cây khô hay bánh yến mạch là đủ giữ mức phẳng. Điểm quan trọng là ăn theo mốc thời gian chứ không đợi tới lúc đói, vì cảm giác đói xuất hiện sau khi đường huyết đã xuống một quãng. (Xem "Chơi bi-a khi mệt".)'},
      {h:'Đường nhanh chỉ dùng như thuốc cấp cứu', p:'Khi đã tụt thật, một ít đường nhanh giúp lấy lại tỉnh táo trong vài phút, nhưng dùng nó làm nguồn năng lượng chính thì tạo ra chuỗi lên tụt liên tục suốt ngày. Cách dùng đúng là hạn hữu và luôn kèm theo một thứ hấp thu chậm để giữ mức không rơi lại.'},
      {h:'Nước đứng trước mọi chuyện ăn', p:'Mất nước nhẹ đã đủ làm giảm tập trung và tăng mỏi mắt, và điều này xảy ra sớm hơn nhiều so với lúc bạn thấy khát. Uống rải cả buổi thay vì uống nhiều một lúc. (Xem "Nước và điện giải".)'},
      {h:'Caffeine là công cụ, không phải nền', p:'Một liều đúng lúc giúp giữ sự tỉnh táo qua khoảng trũng, nhưng vượt ngưỡng của riêng bạn thì đổi lấy tay run và một cú tụt sâu hơn. Ngưỡng đó khác nhau rất nhiều giữa người với người nên phải tự đo. (Xem "Caffeine — liều, thời điểm và cái giá phải trả".)'},
      {h:'Ba thứ nên tránh trong ngày thi đấu', p:'Rượu bia vì giảm phản xạ và làm mất nước, bữa quá no vì gây ì, và bỏ bữa vì gây run kèm cáu. Trong ba thứ đó, bỏ bữa là thứ hay xảy ra nhất ở giải vì lịch trận dồn và người chơi tưởng mình không đói. (Xem "Rượu bia, thuốc lá và các chất trong môi trường bi-a".)'},
      {h:'Túi mang đi cố định', p:'Một chai nước, một hai quả chuối, một gói hạt, ít bánh yến mạch và một ít socola đen là đủ cho cả ngày giải. Chuẩn bị sẵn cùng một túi mỗi lần thì bạn không phải quyết định gì lúc đang thi đấu, và không phải phụ thuộc vào việc quán có bán gì. (Xem "Ăn uống khi đi giải xa nhà".)'},
      {h:'Tự đo thay vì tin bài viết chung', p:'Cơ thể mỗi người phản ứng khác nhau với cùng một bữa ăn, nên cách duy nhất tìm được công thức của mình là ghi lại đã ăn gì, cách giờ vào bàn bao lâu, rồi chấm phong độ buổi đó. Sau chừng hai mươi buổi bạn có một công thức riêng đáng tin hơn mọi hướng dẫn chung. (Xem "Đo độ ổn định của chính mình".)'},
    ]},
  {key:'phy_caffeine', tag:'Dinh dưỡng', title:'Caffeine — liều, thời điểm và cái giá phải trả',
    intro:'Caffeine là chất duy nhất trong danh sách này vừa giúp vừa hại cùng lúc, và biên giữa hai bên rất hẹp: đúng liều thì tăng độ tỉnh và khả năng giữ chú ý, quá liều thì tay run và đánh giá rủi ro kém đi. Nó xứng đáng có một bài riêng vì đây là chất mà người chơi bi-a dùng nhiều nhất và tính toán ít nhất.',
    body:[
      {h:'Nó giúp cái gì', p:'Nó làm giảm cảm giác buồn ngủ và giúp giữ chú ý lâu hơn trong những quãng trận kéo dài, đặc biệt ở khoảng trũng đầu giờ chiều và ở trận đêm. Đây là lợi ích thật, không phải cảm giác chủ quan, nhưng nó không tạo thêm kỹ năng nào cả.'},
      {h:'Nó lấy cái gì', p:'Quá ngưỡng thì gây run tay, tăng nhịp tim và một trạng thái hưng phấn khiến người chơi đánh nhanh hơn bình thường. Đánh nhanh hơn là một thay đổi nguy hiểm vì nó rút ngắn quy trình vào cú mà bạn không nhận ra. (Xem "Run tay — nguyên nhân sinh lý và cách xử lý".)'},
      {h:'Tự đo ngưỡng của mình, đừng lấy số của người khác', p:'Độ nhạy với caffeine khác nhau rất nhiều giữa người với người, nên con số hợp lý chỉ tìm được bằng cách thử. Cách thử gọn nhất là chấm cùng một bài tập cố định ở ba mức khác nhau trong ba buổi tương đương rồi so điểm, thay vì kết luận theo cảm giác tỉnh táo. (Xem "Đo độ ổn định của chính mình".)'},
      {h:'Thời điểm quan trọng hơn liều', p:'Cùng một lượng, uống trước trận ba mươi tới sáu mươi phút thì tác dụng rơi đúng lúc cần, còn uống rải rác thì tạo chuỗi lên tụt suốt ngày. Chọn trước một hoặc hai mốc trong ngày rồi giữ đúng kế hoạch, và mốc đó phải tính theo giờ vào trận chứ không theo lúc thấy buồn ngủ.'},
      {h:'Đừng uống muộn nếu còn trận hôm sau', p:'Caffeine tồn tại trong cơ thể nhiều giờ, nên một ly buổi chiều muộn vẫn đủ làm giấc ngủ nông đi, và giấc ngủ nông đó tính tiền vào buổi thi đấu ngày kế tiếp. Ở giải nhiều ngày, đây là một trong những sai lầm âm thầm nhất. (Xem "Giấc ngủ — biến số ảnh hưởng phong độ mạnh nhất".)'},
      {h:'Bụng rỗng cộng caffeine là công thức gây run', p:'Uống cà phê khi chưa ăn gì thường cho run tay ở mức cao nhất vì nó cộng vào đường huyết đang thấp. Nếu định dùng thì ăn nhẹ trước, và nhớ rằng cảm giác run lúc đó có hai nguyên nhân chứ không phải một. (Xem "Dinh dưỡng cho cơ thủ".)'},
      {h:'Nước tăng lực và trà là cùng một chất, khác liều', p:'Nước tăng lực gộp caffeine liều cao với đường nhanh nên cho cả hai kiểu dao động cùng lúc. Trà cho liều thấp và lên chậm hơn, thường phù hợp hơn với một trận dài. Chọn theo độ dài trận thay vì chọn theo thói quen.'},
      {h:'Nếu đang dùng quá nhiều thì giảm dần', p:'Cắt đột ngột gây đau đầu và uể oải trong vài ngày, và những ngày đó nếu trùng giải thì tệ hơn cả việc đang dùng nhiều. Giảm từng bước trong hai tới ba tuần, và chọn thời điểm không có giải để làm việc này.'},
      {h:'Nó không sửa được thiếu ngủ', p:'Caffeine làm bạn thấy tỉnh hơn mà không đưa độ chính xác của tay trở lại mức bình thường, nên nó xoá dấu hiệu cảnh báo chứ không xoá vấn đề. Buổi thiếu ngủ vẫn phải chơi theo chế độ giữ sàn dù đã uống cà phê. (Xem "Nâng sàn phong độ".)'},
    ]},
  {key:'phy_hydration', tag:'Dinh dưỡng', title:'Nước và điện giải',
    intro:'Nước là thứ rẻ nhất, dễ nhất và bị bỏ qua nhiều nhất trong toàn bộ mục này. Mức mất nước đủ làm giảm khả năng tập trung và tăng mỏi mắt xuất hiện sớm hơn nhiều so với cảm giác khát, nghĩa là tới lúc bạn thấy khát thì bạn đã chơi một quãng ở dưới mức của mình.',
    body:[
      {h:'Vì sao khát là tín hiệu tới muộn', p:'Cảm giác khát chỉ rõ rệt khi cơ thể đã thiếu một lượng đáng kể, còn khả năng giữ chú ý và độ nhạy của mắt đã bắt đầu giảm trước đó. Vì thế nước phải được uống theo lịch, giống như tiếp nhiên liệu, chứ không theo cảm giác.'},
      {h:'Phòng bi-a làm mất nước nhiều hơn cảm nhận', p:'Không khí điều hoà khô, nhiều giờ trong phòng kín và việc gần như không đổ mồ hôi khiến người chơi không có tín hiệu nào cho thấy mình đang mất nước. Đây là lý do các buổi chơi dài trong phòng lạnh thường kết thúc bằng khô mắt và đau đầu nhẹ. (Xem "Mắt và thị giác của cơ thủ".)'},
      {h:'Lịch uống gắn vào mốc của trận', p:'Cách dễ giữ nhất là nối việc uống với những mốc đã có sẵn: một ngụm mỗi lần đổi ván, một lần uống mỗi khi đổi trận, một lần khi nghỉ giữa hiệp. Gắn vào mốc thì không cần nhớ, và không cần quyết định gì trong lúc đang tập trung. (Xem "Giữ sức khi đánh giải cả ngày".)'},
      {h:'Uống rải, đừng uống dồn', p:'Uống một lượng lớn một lúc phần lớn đi ra ngoài và còn làm bạn phải rời bàn giữa ván. Từng ngụm nhỏ đều đặn giữ mức tốt hơn và không cắt vụn trạng thái tập trung.'},
      {h:'Khi nào cần điện giải, khi nào không', p:'Trong phòng lạnh và không ra mồ hôi thì nước lọc là đủ. Điện giải chỉ đáng thêm khi trời nóng, phòng không điều hoà, hoặc ngày giải kéo dài và bạn ra mồ hôi thấy rõ. Dùng điện giải cho một buổi mát mẻ chỉ thêm đường vào người chứ không thêm gì khác.'},
      {h:'Nước ngọt có ga và nước ngọt đóng chai', p:'Chúng cho một lượng đường nhanh kèm cảm giác đầy hơi, tức là gộp đúng hai thứ bạn không muốn trong một trận dài. Nếu buộc phải dùng thì coi nó là món đường nhanh chứ không coi là nước uống. (Xem "Dinh dưỡng cho cơ thủ".)'},
      {h:'Cà phê và trà tính riêng', p:'Chúng vẫn cấp nước nhưng đi kèm caffeine, nên không dùng chúng để đạt lượng nước trong ngày. Giữ hai dòng riêng biệt trong đầu: nước để đủ nước, cà phê để giữ tỉnh táo theo kế hoạch. (Xem "Caffeine — liều, thời điểm và cái giá phải trả".)'},
      {h:'Cách tự kiểm rất đơn giản', p:'Màu nước tiểu nhạt là dấu hiệu đủ nước, đậm là dấu hiệu thiếu, và đó là phép đo miễn phí duy nhất bạn có trong ngày giải. Kèm theo là hai dấu hiệu mềm: khô miệng và đau đầu nhẹ vào cuối buổi.'},
      {h:'Sau buổi chơi vẫn phải bù', p:'Buổi khuya kết thúc bằng đi ngủ ngay thường để lại tình trạng thiếu nước qua đêm, kéo theo giấc ngủ kém và một buổi sáng uể oải bị quy oan cho chuyện khác. Uống nước trước khi ngủ là một trong những việc rẻ nhất có tác dụng thật. (Xem "Hồi phục sau buổi chơi dài và sau giải".)'},
    ]},
  {key:'phy_awayfood', tag:'Dinh dưỡng', title:'Ăn uống khi đi giải xa nhà',
    intro:'Ở nhà thì mọi thứ ăn uống đều nằm trong tầm kiểm soát, còn đi giải xa thì bạn ăn theo cái gần nhất còn mở cửa. Đây là chỗ mà kế hoạch dinh dưỡng của phần lớn người chơi sụp xuống, và nó sụp đúng vào những giải quan trọng nhất.',
    body:[
      {h:'Nguyên tắc gốc là quen, không phải tốt', p:'Ở giải, món ăn quen dạ dày đáng giá hơn món bổ dưỡng lạ, vì rủi ro lớn nhất không phải thiếu chất mà là một cái bụng khó chịu trong lúc thi đấu. Đây không phải lúc thử món mới hay thử chế độ ăn mới.'},
      {h:'Mang theo phần nền của mình', p:'Hạt, bánh yến mạch, trái cây khô và chuối đều gọn và không cần bảo quản, đủ cấp phần ăn nhẹ giữa các trận mà không phụ thuộc vào chỗ nào đang mở cửa. Chỉ cần mang cố định cùng một túi mỗi lần đi thì bạn không phải nghĩ gì thêm. (Xem "Dinh dưỡng cho cơ thủ".)'},
      {h:'Bữa chính đặt theo giờ trận, không theo giờ quán', p:'Nhìn lịch trận từ tối hôm trước rồi chọn trước sẽ ăn lúc nào, thay vì để lịch trận đẩy bạn vào cảnh ăn ngay trước khi vào bàn hoặc bỏ hẳn một bữa. Nếu trận rơi vào giờ ăn thì chuyển bữa đó thành hai lần ăn nhẹ. (Xem "Giữ sức khi đánh giải cả ngày".)'},
      {h:'Ăn hàng thì chọn theo mức dầu mỡ và độ lạ', p:'Món nhiều dầu mỡ làm chậm tiêu hoá và gây nặng người trong giờ đầu, còn món lạ mang thêm rủi ro về bụng. Cơm với thịt nạc và rau luộc thì nhàm nhưng đáng tin, và ở giải thì đáng tin là tiêu chuẩn duy nhất đáng dùng.'},
      {h:'Nước uống ở nơi lạ', p:'Mang theo chai nước riêng và tự nhớ lịch uống, vì ở giải sẽ không có ai nhắc và cũng không tiện rời bàn để đi tìm nước. Ở nơi khí hậu nóng hơn nhà thì tính thêm phần mất nước và thêm điện giải cho ngày dài. (Xem "Nước và điện giải".)'},
      {h:'Múi giờ và giờ ăn lệch', p:'Đi xa làm lệch cả giờ ăn lẫn giờ ngủ, và cơ thể mất vài ngày mới điều chỉnh. Nếu tới trước được một ngày thì hãy ăn ngủ theo giờ địa phương ngay từ hôm đầu, đừng giữ giờ cũ rồi cố sửa vào đúng ngày thi đấu. (Xem "Giấc ngủ — biến số ảnh hưởng phong độ mạnh nhất".)'},
      {h:'Bữa sáng ở khách sạn là bữa dễ hỏng nhất', p:'Buffet dễ dẫn tới ăn quá nhiều và ăn quá nhiều loại, kéo theo trạng thái ì suốt buổi sáng thi đấu. Chọn trước một khẩu phần giống ngày thường rồi lấy đúng thế, và giữ nó y nguyên mọi ngày trong giải để loại thêm một biến số.'},
      {h:'Không rượu bia trong suốt giải', p:'Giao lưu buổi tối là phần bình thường của giải, nhưng cái giá rơi vào buổi sáng hôm sau và ở giải nhiều ngày thì nó tích lại. Quy tắc cứng dễ giữ hơn quy tắc vừa phải. (Xem "Rượu bia, thuốc lá và các chất trong môi trường bi-a".)'},
    ]},
  {key:'behind', tag:'Tâm lý', title:'Tâm lý khi bị dẫn điểm',
    intro:'Bị dẫn không có nghĩa đã thua. Nhiều trận lật ngược nhờ giữ được cái đầu.',
    body:[
      {h:'Chấp nhận & bình tĩnh', p:'Thừa nhận đang bị dẫn, nhưng bi-a tính từng cú, từng ván — đối thủ vẫn phải thắng nốt phần còn lại. Hoảng lên là tự thua trước.'},
      {h:'Thu nhỏ mục tiêu', p:'Đừng nghĩ "phải gỡ mấy ván". Chỉ tập trung thắng CÚ này, rồi VÁN này. Áp lực tan khi mục tiêu nhỏ lại.'},
      {h:'Đừng liều sớm', p:'Bị dẫn hay sinh đánh liều cú khó → càng lún sâu. Vẫn chọn cú chắc và safety, ép đối thủ mắc lỗi thay vì tự mạo hiểm.'},
      {h:'Giữ nhịp của mình', p:'Đừng đánh nhanh theo hưng phấn của đối thủ. Chậm lại, đủ routine. Người đang dẫn dễ nôn nóng khép trận và tự sai.'},
      {h:'Đọc đối thủ', p:'Người dẫn điểm thường chuyển sang thủ, hoặc căng cứng khi sắp thắng. Kiên nhẫn chờ khoảnh khắc họ do dự.'},
      {h:'Ngôn ngữ cơ thể', p:'Đứng thẳng, thở đều, giữ vẻ bình thản — vừa trấn an mình, vừa khiến đối thủ không thấy bạn nao núng.'},
      {h:'Một ván đổi đà', p:'Gỡ được một ván sạch có thể xoay chuyển tâm lý cả trận. Dồn tập trung cho ván "bẻ ghi" đó.'},
      {h:'Nếu vẫn thua', p:'Rút bài học và ghi lại (Nhật ký) để trận sau mạnh hơn. Bị dẫn mà vẫn chiến đấu tử tế đã là thắng về bản lĩnh.'},
    ]},
  {key:'psy_pressure', tag:'Tâm lý', title:'Áp lực & khoảnh khắc căng',
    intro:'Áp lực không đến từ TÌNH HUỐNG mà từ cách bạn ĐÁNH GIÁ nó. Cùng một cú ăn cả, người nghĩ "cơ hội" thì tay mượt, người nghĩ "trượt là xong" thì tay cứng. Cơ thể phản ứng theo suy nghĩ: thấy nguy hiểm là tim đập nhanh, cơ căng, tầm nhìn hẹp lại. Người giỏi không hết áp lực — họ ĐIỀU TIẾT nó và kéo chú ý ra khỏi hậu quả.',
    body:[
      {h:'Nền tảng: điều tiết căng thẳng bằng hơi thở', p:'Có một "vùng vàng" của độ hưng phấn: thấp quá thì uể oải, cao quá thì cứng tay và vội. Khi thấy mình vượt ngưỡng (tim đập nhanh, nín thở, tay siết), kéo về bằng hơi thở:\n• Thở RA dài gấp đôi hít vào (vd hít 4 – thở ra 6–8). Thở ra dài kích hoạt hệ thần kinh "phanh", hạ nhịp tim chỉ trong 2–3 hơi.\n• Làm việc này TRƯỚC khi cúi xuống, không phải khi đã vào bộ.\n• Kèm thả lỏng: hạ vai, thả hàm, xoè rồi nắm lại tay cầm cho mềm. Chỗ căng thẳng lộ ra sớm nhất và phá cú đánh nhanh nhất là bàn tay sau. (Xem "Tay cầm cơ — nắm càng chặt, bi cái càng lệch".)'},
      {h:'Áp lực cú/ván quyết định', p:'Vì sao: não gán cho cú này "trọng lượng" lớn hơn nên đổ adrenaline, làm tay và mắt (vận động tinh) kém đi đúng lúc cần nhất.\nCách chữa: hạ trọng lượng cú xuống — tự nhủ "vẫn là một cú như bao cú tôi từng đánh". Dồn TOÀN BỘ chú ý vào thứ cụ thể và trong tầm kiểm soát: điểm chạm trên bi mục tiêu, không phải kết quả. Làm đúng y hệt routine mọi khi; chính sự QUEN THUỘC của quy trình trấn an hệ thần kinh.'},
      {h:'Sợ thắng (bóp cơ khi sắp về đích)', p:'Vì sao: gần thắng, ta chuyển từ "tấn công để thắng" sang "phòng thủ để khỏi thua". Tư duy phòng thủ khiến đánh rón rén, ngập ngừng, đổi lối chơi đang hiệu quả.\nCách chữa: giữ NGUYÊN lối chơi và tốc độ đã đưa bạn tới đây, đừng "giữ của". Thu nhỏ mục tiêu về "thắng cú này", không phải "thắng cả trận". Cam kết đánh dứt khoát — cú do dự gần như luôn trượt. Muốn thắng thì phải dám kết liễu.'},
      {h:'Bị đối thủ áp đảo tâm lý', p:'Vì sao: ta tự dựng hình ảnh đối thủ "bất khả chiến bại" rồi tin vào nó, nên thi đấu thu mình.\nCách chữa: tách khỏi con người đối thủ — bàn bi không biết bạn đang đánh với ai, chỉ có bạn, viên bi và đường cơ. Nhớ: người giỏi cũng mắc lỗi và cũng căng. Đừng cố THẮNG họ, hãy chơi ĐÚNG lối của mình từng cú; áp lực sẽ dồn về phía họ khi thấy bạn không nao núng.'},
      {h:'Cầu toàn / kỳ vọng quá cao', p:'Vì sao: tiêu chuẩn "cú nào cũng phải hoàn hảo" biến mỗi cú thành một bài kiểm tra dễ trượt, và mỗi cú chưa hoàn hảo thành một "thất bại" gây ức chế dồn nén.\nCách chữa: đổi thước đo từ KẾT QUẢ sang QUY TRÌNH — "tôi có làm đủ routine, ngắm rõ, đưa cơ thẳng không?". Chấp nhận biên độ sai: ngay cả nhà vô địch cũng có ngày 70% phong độ. Mục tiêu là "đủ tốt, ít lỗi", không phải hoàn hảo.'},
      {h:'Tâm lý "phải trình diễn"', p:'Vì sao: có người xem, cái tôi muốn được công nhận nên ta chọn cú khó/đẹp để gây ấn tượng thay vì cú đúng.\nCách chữa: chơi cho VÁN đấu, không cho khán giả. Người hiểu bi-a nể cú đơn giản mà thắng, không nể cú liều mà may. Trước mỗi cú tự hỏi: "cú này giúp tôi THẮNG ván, hay giúp tôi trông ngầu?" — luôn chọn vế đầu.'},
    ]},
  {key:'psy_focus', tag:'Tâm lý', title:'Tập trung & ở hiện tại',
    intro:'Tâm trí chỉ thật sự làm được MỘT việc mỗi lúc. Mọi cú trượt vì "mất tập trung" thực ra là chú ý bị kéo sang chỗ khác: tỉ số, khán giả, cú vừa hỏng, hay cả trăm ý nghĩ vụn. Tập trung không phải "cố gồng nghĩ", mà là biết ĐẶT chú ý đúng chỗ (đường cơ, điểm chạm) và nhẹ nhàng kéo nó về mỗi khi lạc.',
    body:[
      {h:'Nền tảng: quy trình trước cú (pre-shot routine)', p:'Một routine cố định là mỏ neo giữ tâm trí. Lặp y hệt MỌI cú, ví dụ 4 bước:\n1) Đứng sau bàn — chọn cú & đường ra bi.\n2) Xác định điểm chạm khi CÒN ĐỨNG.\n3) Cúi xuống theo đúng đường ngắm, đưa cơ thử 2–3 lần.\n4) Nhịp cuối: mắt DÁN vào bi mục tiêu (không nhìn theo bi cái), giữ ánh mắt yên ~1 giây rồi bắn — kỹ thuật "quiet eye" của người bắn giỏi.\nRoutine giống nhau mỗi cú giúp não khỏi "quyết định lại", giải phóng chú ý cho việc quan trọng. Đây là bài nền của cả mục Tâm lý; muốn biết các nhóm còn lại giải quyết chuyện gì thì đọc bài dẫn nhập trước. (Xem "Đầu vững thì tay mới vững".)'},
      {h:'Mất tập trung', p:'Vì sao: chú ý là nguồn lực hữu hạn và trôi tự nhiên; càng mệt/căng càng dễ trôi.\nCách chữa: đừng cố "không nghĩ gì" (bất khả thi) — hãy cho tâm trí một CÔNG VIỆC cụ thể ở mỗi bước: nói thầm "điểm chạm", "đưa cơ thẳng", "giữ yên". Khi nhận ra đã lạc, không tự trách, chỉ nhẹ nhàng kéo về bước đang làm. Một hơi thở trước mỗi cú để reset chú ý.'},
      {h:'Suy nghĩ quá nhiều (paralysis by analysis)', p:'Vì sao: cúi xuống rồi vẫn phân tích (đủ lực chưa, xoáy bao nhiêu...) là chuyển từ chế độ "làm" tự động sang "nghĩ" thủ công, khiến động tác quen bỗng gượng.\nCách chữa: tách rõ hai pha. SUY NGHĨ khi còn ĐỨNG (quyết cú, lực, xoáy). THỰC HIỆN khi đã CÚI (ngưng phân tích, tin vào lần tập, bắn). Còn phân vân lúc đã vào bộ thì ĐỨNG DẬY tính lại — đừng "vừa nghĩ vừa bắn".'},
      {h:'Ám ảnh tỉ số / kết quả', p:'Vì sao: nghĩ thắng-thua là nghĩ về TƯƠNG LAI và thứ ngoài tầm kiểm soát, tạo lo âu mà chẳng giúp cú hiện tại.\nCách chữa: chuyển hẳn sang mục tiêu QUY TRÌNH bạn kiểm soát được: routine đủ, ngắm rõ, đưa cơ thẳng, ra bi có kế hoạch. Nghịch lý: càng buông kết quả, kết quả càng tốt. Bắt gặp mình đang tính điểm thì dán nhãn "đang nghĩ tỉ số" rồi quay về cú trước mặt.'},
      {h:'Dễ bị ngoại cảnh phân tâm', p:'Vì sao: não luôn quét môi trường tìm cái mới lạ (tiếng động, chuyển động, điện thoại) — bản năng, không phải bạn yếu.\nCách chữa: đừng CHỐNG tiếng ồn (càng chống càng để ý), chấp nhận nó tồn tại rồi dồn chú ý vào đường cơ; routine tạo "đường hầm chú ý". Giữa trận TRÁNH lướt điện thoại — vừa mỏi mắt vừa kéo tâm trí ra khỏi trận; thay bằng nhìn xa thư giãn.'},
      {h:'Chủ quan khi đang dẫn', p:'Vì sao: dẫn điểm tạo cảm giác an toàn giả, não giảm cảnh giác và ta bắt đầu đánh cẩu thả những cú "chắc ăn".\nCách chữa: coi mỗi cú như lúc đang HOÀ. Vẫn làm đủ routine cho cả cú dễ (cú dễ bị coi thường là lúc dễ trượt nhất). Tự nhắc "trận chưa xong tới bi cuối". Dẫn là lợi thế, không phải chiến thắng.'},
    ]},
  {key:'psy_crowd', tag:'Tâm lý', title:'Tập trung khi có người xem',
    intro:'Bị nhiều người nhìn, ta dễ tưởng "ai cũng soi từng cú của mình" — nên căng, tay cứng, chú ý trôi khỏi bàn ra phía khán giả. Sự thật: người xem để ý bạn ÍT hơn bạn tưởng rất nhiều (hiệu ứng "ánh đèn sân khấu"), và dù họ có nhìn thì ánh mắt đó cũng không đổi được đường cơ. Việc cần rèn là NHẬN RA khi chú ý trôi và KÉO nó về thật nhanh.',
    body:[
      {h:'Vì sao có người xem là mất tập trung', p:'Não coi "bị quan sát" như một mối đe doạ nhẹ: tim đập nhanh hơn, cơ căng, và chú ý tự động quét ra ngoài tìm những khuôn mặt đang nhìn. Cộng thêm hiệu ứng "ánh đèn sân khấu" — ta phóng đại mức người khác chú ý và phán xét mình. Kết quả: đầu bận lo "họ nghĩ gì" thay vì lo đường cơ.'},
      {h:'Nhận ra mình đã tuột tập trung', p:'Bước đầu tiên là BẮT được lúc chú ý trôi. Dấu hiệu:\n• Cúi xuống bàn mà đầu vẫn nghĩ chuyện khác (tỉ số, khán giả, cú vừa hỏng).\n• Mắt liếc về phía người xem, để ý ai đang nhìn mình.\n• Đánh vội cho "xong", bỏ bước ngắm.\n• Lo mình TRÔNG thế nào thay vì lo cú này đi ĐÂU.\nChỉ cần gọi tên nó trong đầu — "mình đang mất tập trung" — là đã kéo lại được một nửa.'},
      {h:'Reset nhanh 10 giây (khi thấy mình mất tập trung)', p:'Đừng cố "ép mình phải tập trung" — hãy cho mắt và đầu một việc CỤ THỂ:\n1) LÙI khỏi bàn, đứng thẳng (đổi tư thế = đổi trạng thái).\n2) Thở hắt ra MỘT hơi thật dài, buông vai.\n3) NEO mắt vào đúng một điểm — chấm trên bi mục tiêu hoặc điểm chạm — nhìn tới khi mọi thứ xung quanh mờ đi.\n4) Một từ khoá ("điểm chạm"), rồi mới cúi xuống.\nTrong app: nút ⟳ Reset (thở) và Thi đấu → 🎯 Neo mắt chạy đúng chuỗi này cho bạn.'},
      {h:'Thu nhỏ "đường hầm chú ý"', p:'Không thể xoá đám đông khỏi phòng — nhưng có thể chủ động đẩy họ ra RÌA tầm nhìn. Dồn toàn bộ chú ý vào thứ nhỏ và trong tầm kiểm soát: đường cơ, điểm chạm, nhịp đưa cơ. Kỹ thuật "quiet eye": trước khi bắn, dán mắt YÊN trên bi mục tiêu khoảng 1 giây rồi mới đưa cơ. Mắt yên thì đầu yên.'},
      {h:'"Họ không soi mày kỹ như mày tưởng"', p:'Người xem phần lớn đang lo ván của họ, xem điện thoại, hoặc chờ tới lượt — hiếm ai chấm điểm từng cú của bạn như bạn sợ. Và kể cả họ có nhìn: ánh mắt của họ KHÔNG chạm vào viên bi, không đổi được góc cơ. Đường cơ chỉ nghe theo tay bạn. Nhả bớt gánh nặng "phải trông cho giỏi" thì tay tự mềm ra.'},
      {h:'Chơi cho VÁN, không cho khán giả', p:'Bị nhìn dễ sinh ý muốn đánh cú đẹp/khó để gây ấn tượng — đó là bẫy. Người hiểu bi-a nể cú đơn giản mà thắng ván, không nể cú liều mà may. Trước mỗi cú hỏi: "cú này giúp tôi THẮNG, hay chỉ để tôi trông ngầu?" — luôn chọn vế đầu. (Xem thêm bài "Áp lực & khoảnh khắc căng".)'},
      {h:'Biến ánh mắt thành nhiên liệu', p:'Đảo lại cách nhìn: có người xem nghĩa là trận này ĐÁNG xem — một đặc quyền, không phải mối đe doạ. Đối thủ cũng đang bị nhìn y như bạn, và cũng đang căng. Dùng sự chú ý đó làm lý do để vào cú NGHIÊM TÚC hơn, tập trung hơn — thay vì để nó rút cạn năng lượng của mình.'},
      {h:'Tập cho quen bị nhìn', p:'Tập trung khi bị quan sát là kỹ năng RÈN được, không phải tính cách. Cách quen dần: rủ người đứng xem lúc tập; tự quay video mình đánh (cảm giác "bị ghi hình" gần giống bị nhìn); đánh giải nhỏ / độ nhẹ thường xuyên cho hệ thần kinh chai với áp lực. Càng phơi nhiễm có kiểm soát, đám đông càng lùi thành "nền" chứ không còn là "tâm điểm".'},
      {h:'Giữ tập trung suốt cả trận', p:'Tập trung là cơ bắp — nó mỏi và trôi; việc của bạn là kéo về, lặp lại. Neo bằng pre-shot routine giống hệt mỗi cú. Giữa các cú, nhìn ra xa thư giãn và TRÁNH lướt điện thoại (vừa mỏi mắt vừa kéo đầu ra khỏi trận). Sau mỗi lỗi, chạy reset rồi coi cú kế là cú mới. Đừng đòi tập trung 100% cả trận — chỉ cần tập trung ĐÚNG LÚC: khoảnh khắc cúi xuống và bắn.'},
    ]},
  {key:'psy_chair', tag:'Tâm lý', title:'Ngồi chờ tới lượt — vì sao nói chuyện là mất tập trung',
    intro:'Bạn đang tĩnh và tập trung, rồi ngồi xuống ghế chờ tới lượt — chỉ cần nói vài câu với ai đó là tập trung bay sạch. Không phải bạn kém bản lĩnh: tập trung (khi đánh) và trò chuyện DÙNG CHUNG một kênh trí óc nhưng ở hai chế độ ĐỐI NGHỊCH. Nói chuyện bật "não ngôn ngữ – xã hội" lên, đá văng trạng thái tĩnh bạn vừa gây dựng, và để lại "dư âm" bám theo khi quay lại bàn.',
    body:[
      {h:'Vì sao chỉ một câu nói cũng phá tập trung', p:'Khi đánh, chú ý của bạn HẸP – HƯỚNG VÀO TRONG – KHÔNG lời: chỉ có cảm giác cú đánh, điểm chạm, nhịp tay. Trò chuyện thì NGƯỢC HẲN: rộng, hướng ra ngoài, bằng ngôn ngữ và mang tính xã hội (nghe, hiểu, nghĩ câu đáp, đọc nét mặt). Não gần như không chạy được hai chế độ này cùng lúc. Tệ hơn: bật chế độ "nói" lên thì dễ, còn tắt nó đi để về lại trạng thái tĩnh thì CHẬM.'},
      {h:'"Dư âm" bám theo về bàn', p:'Khi chuyển từ việc này sang việc khác, một phần tâm trí bị kẹt lại ở việc cũ. Vừa buôn xong một câu chuyện, bạn về bàn nhưng đầu vẫn đang "phát lại" câu vừa nói, chuyện vừa nghe. Cái dư âm đó tranh chỗ với cú đánh — nên dù đã cúi xuống, bạn vẫn thấy "chưa thật vào".'},
      {h:'Bộ nhớ làm việc bị chiếm chỗ', p:'Đầu ta chỉ giữ được vài thứ cùng lúc. Trước khi ngồi xuống, "bộ nhớ" đang chứa game plan, nhịp và cảm giác tay. Một cuộc nói chuyện nhồi vào đó toàn nội dung xã hội (câu chữ, phải đáp gì, thái độ người kia) — đẩy hết kế hoạch và cảm giác ra ngoài. Tới lượt, bạn phải dựng lại từ số 0.'},
      {h:'Trạng thái bị xê dịch', p:'Nói chuyện — nhất là cười đùa hay một câu hơi khó chịu — làm đổi nhịp tim và cảm xúc, kéo bạn ra khỏi "vùng tĩnh" vừa canh được. Biên độ cảm xúc càng lớn (cười to, bực nhẹ) thì càng lâu mới lắng lại. Nó cũng gọi sự để-ý-người-khác quay lại (xem bài "Tập trung khi có người xem").'},
      {h:'Ghế chờ là MỘT PHẦN của trận', p:'Sai lầm gốc: coi lúc ngồi là "giờ giải lao". Người chơi giỏi khi ở trên ghế vẫn Ở TRONG trận — mắt theo bàn, tính sẵn đường đi của mình, giữ nhịp thở và trạng thái. Họ không rời trận rồi mới cố nhảy vào lại; họ chưa từng rời đi. Nói chuyện phiếm chính là bước "rời trận" đó.'},
      {h:'Giữ tập trung khi ngồi chờ', p:'• Quyết TRƯỚC: trong trận không sa vào chuyện phiếm. Đáp lịch sự, ngắn — hoặc nói thẳng, vui vẻ: "cho tao tập trung tí nhé".\n• Mắt nhìn BÀN hoặc nhìn xuống, đừng quét khán giả; theo dõi bi để đọc thế bàn.\n• Giữ một mỏ neo tĩnh: cơ trong tay, một hơi thở đều, một từ khoá.\n• Ở yên trong "bong bóng" của mình — đây là thói quen bình thường của dân chuyên, không phải bất lịch sự.'},
      {h:'Lỡ nói chuyện rồi — nghi thức VÀO LẠI', p:'Nếu đã trót buôn, đừng bước thẳng vào bàn từ trạng thái nguội. Khi tới lượt:\n1) Đứng dậy sớm vài giây, tách khỏi cuộc nói chuyện.\n2) Một–hai hơi thở ra thật dài (nút ⟳ Reset).\n3) NEO mắt về một điểm cho tới khi xung quanh mờ đi (Thi đấu → 🎯 Neo mắt).\n4) Chạy ĐỦ pre-shot routine, thật chậm ở cú đầu, để khởi động lại cảm giác.\nCoi cú đầu sau khi ngồi là "cú làm nóng lại", đừng kỳ vọng vào ngay.'},
      {h:'Tập trung tự nhiên bền hơn tập trung gồng', p:'Nếu bạn đang PHẢI gồng để tĩnh thì trạng thái đó mong manh — một câu nói là vỡ. Đích đến không phải "cấm tiệt nói chuyện" (bất khả và không cần), mà là xây một routine vào-lại-trạng-thái NHANH và đáng tin, để dù bị ngắt thì bạn quay lại chỉ trong vài hơi thở. Khi việc "vào lại" thành phản xạ, chuyện phiếm không còn giết được sự tập trung của bạn.'},
    ]},
  {key:'psy_after', tag:'Tâm lý', title:'Sau lỗi & kiểm soát cảm xúc',
    intro:'Không ai chơi cả trận không lỗi. Điều tách người bản lĩnh với người thường không phải SỐ lỗi, mà là thời gian trở lại bình thường sau lỗi. Một cú hỏng chỉ mất một điểm; nhưng nếu nó kéo theo cáu giận và ba cú ẩu tiếp theo, bạn mất cả ván. Kỹ năng cốt lõi ở đây là RESET — cắt cảm xúc khỏi cú vừa rồi.',
    body:[
      {h:'Nền tảng: quy trình reset sau lỗi', p:'Định sẵn một "nghi thức" ngắn làm NGAY sau mỗi cú hỏng, trước khi rời tâm trí khỏi nó:\n1) Thở ra một hơi thật dài (xả căng).\n2) Đứng thẳng, thả vai — đổi tư thế để đổi trạng thái.\n3) Một câu ngắn: "Xong rồi, cú tiếp theo." (không phân tích lúc đang nóng).\n4) Nếu cần, đi vài bước rời bàn rồi quay lại như bắt đầu lượt mới.\nLàm y hệt mỗi lần để thành phản xạ. Phân tích lỗi để dành lúc bình tĩnh — hoặc ghi vào Nhật ký sau trận.'},
      {h:'Mất bình tĩnh sau lỗi (tilt)', p:'Vì sao: lỗi kích hoạt phản ứng cảm xúc (bực, xấu hổ); cuốn theo thì phần lý trí bị lấn át và ta đánh ẩu để "gỡ gấp".\nCách chữa: nhận diện SỚM ("mình đang tilt") — gọi tên nó là đã giảm một nửa sức mạnh của nó. Chạy quy trình reset ở trên. Hạ mục tiêu về một cú kế thật đơn giản để lấy lại nhịp. Tuyệt đối KHÔNG ra quyết định lớn (đánh liều) khi đang nóng.'},
      {h:'Nóng vội', p:'Vì sao: căng hoặc bực làm nhịp sinh học tăng tốc; ta cúi xuống và bắn khi cơ thể "muốn cho xong", chưa thật sự sẵn sàng.\nCách chữa: chèn một khoảng dừng cố định trước cú — một hơi thở + câu "chắc chưa?". Chỉ bắn khi mọi thứ đã yên (mắt đúng chỗ, tay đặt xong, ngắm rõ). Đặt luật cho mình: PHÂN VÂN LÀ ĐỨNG DẬY, không bắn.'},
      {h:'Thiếu kiên nhẫn', p:'Vì sao: khao khát ghi điểm hoặc kết thúc nhanh khiến ta ép cú không đủ chắc và bỏ qua lựa chọn an toàn.\nCách chữa: chấp nhận KHÔNG phải cú nào cũng phải ăn. Không có cú chắc thì safety là nước đi MẠNH, không phải yếu. Kiên nhẫn là vũ khí — người vội tự dâng cơ hội cho người biết chờ. Hỏi "cú CHẮC nhất lúc này là gì?" thay vì "cú nào ghi nhiều điểm nhất?".'},
      {h:'Vội gỡ khi bị dẫn', p:'Vì sao: bị dẫn tạo cảm giác cấp bách, ta muốn gỡ TẤT CẢ ngay bằng cú liều, và thường lún sâu hơn.\nCách chữa: chia nhỏ khoảng cách — chỉ tập trung gỡ MỘT ván, rồi một ván nữa. Giữ cú chắc và safety, ép đối thủ mắc lỗi thay vì tự mạo hiểm. Nhiều trận lật ngược nhờ người bị dẫn giữ cái đầu lạnh trong khi người dẫn bắt đầu nôn nóng.'},
      {h:'Mất động lực khi thua đậm', p:'Vì sao: khi kết quả gần như đã định, não thấy "cố cũng vô ích" và rút năng lượng để tự bảo vệ.\nCách chữa: đổi mục tiêu từ THẮNG TRẬN sang thứ bạn kiểm soát — gỡ một ván sạch, tập một kỹ năng (vd điều bi), giữ thái độ chuyên nghiệp tới bi cuối. Mỗi ván vẫn là dữ liệu quý và cơ hội rèn bản lĩnh; cách bạn thua hôm nay định hình cách bạn thắng mai sau.'},
    ]},
  {key:'psy_confidence', tag:'Tâm lý', title:'Tự tin & giữ bình tĩnh',
    intro:'Tự tin trong bi-a không phải cảm giác "chắc chắn sẽ vào", mà là tin RẰNG mình sẽ thực hiện đúng quy trình dù kết quả thế nào. Nó không đến từ tự nhủ suông, mà xây từ ba nguồn: sự chuẩn bị (đã tập), quy trình đáng tin (routine), và cách bạn nói chuyện với chính mình. Run và thiếu tự tin là bình thường — việc cần làm là không để chúng điều khiển tay bạn.',
    body:[
      {h:'Run tay khi căng', p:'Vì sao: adrenaline khi căng làm cơ nhỏ (bàn tay, cẳng tay) run nhẹ và siết chặt cơ cầm — đúng những cơ cần MỀM để đưa cơ mượt.\nCách chữa (theo lớp):\n• Hô hấp: 1–2 hơi thở ra dài trước khi cúi để hạ adrenaline.\n• Cơ: hạ vai, thả hàm; cầm cơ LỎNG như cầm con chim, chỉ siết nhẹ đúng lúc chạm bi.\n• Nhịp: đưa cơ theo một nhịp đều (đếm thầm hoặc mở tab Nhịp) — chuyển động nhịp nhàng che lấp cái run.\n• Thời gian: ngắm xong thì bắn, đừng nấn ná "ở dưới" cho tay run thêm.'},
      {h:'Mất tự tin sau chuỗi trượt', p:'Vì sao: vài cú hỏng liên tiếp tạo "bằng chứng" giả rằng "hôm nay tay mình hỏng", và niềm tin đó tự ứng nghiệm.\nCách chữa: CẮT chuỗi bằng một cú chắc và dễ — chủ động chọn cú đơn giản để ghi một "chiến thắng nhỏ", lấy lại cảm giác + nhịp. Quay về nền tảng: cú dừng, cú thẳng ngắn. Nhắc mình bằng SỰ THẬT: "mình đã đánh cú này vào hàng trăm lần" — một chuỗi xui không xoá được kỹ năng đã có.'},
      {h:'Tự nói tiêu cực', p:'Vì sao: lời tự nhủ ("kiểu gì cũng trượt", "đừng có hỏng") định hướng chú ý và cơ thể. Não lại khó xử lý phủ định — "đừng đánh xuống lỗ" khiến tâm trí bám vào "xuống lỗ".\nCách chữa: đổi NỘI DUNG và DẠNG câu.\n• Từ phán xét → hướng dẫn: thay "đừng run" bằng "đưa cơ thẳng, giữ yên".\n• Từ phủ định → khẳng định điều CẦN LÀM: thay "đừng chết cái" bằng "đánh tâm, dừng bi cái".\n• Ngắn, ở hiện tại: một–hai từ khoá cho mỗi cú (vd "chạm — thẳng") đủ dẫn dắt mà không lan man.\nGiọng nói bên trong là huấn luyện viên của bạn — hãy để nó bình tĩnh và giúp ích.'},
    ]},
  {key:'psy_flow', tag:'Tâm lý', title:'Vào "vùng dòng chảy" (the zone)',
    intro:'Trạng thái "dòng chảy" (flow / the zone) là khi bạn đánh mà như không cần nghĩ: tay tự làm, thời gian như chậm lại, bi vào nhẹ nhàng. Nghịch lý: không thể ÉP mình vào zone bằng ý chí — càng cố "phải vào zone" càng bật cái đầu phân tích lên và đẩy nó ra xa. Nhưng bạn tạo được ĐIỀU KIỆN để nó dễ tới, và học được cách không phá nó khi đã ở trong.',
    body:[
      {h:'Zone là gì & cảm giác thế nào', p:'Dấu hiệu: động tác trơn tru không gợn, đầu im lặng (không lảm nhảm phân tích), chú ý dán hoàn toàn vào bàn, mất cảm giác thời gian, tự tin nhẹ nhõm chứ không gồng. Bạn không "cố" — mọi thứ tự diễn ra. Đó là lúc kỹ năng đã tập chảy ra tự nhiên vì cái đầu ý thức thôi chen vào.'},
      {h:'Vì sao không thể ÉP vào zone', p:'Zone là trạng thái tâm trí VÔ THỨC làm việc. Khi bạn tự nhủ "phải vào zone ngay", bạn kích hoạt tâm trí Ý THỨC (phân tích, kỳ vọng, theo dõi) — đúng thứ khoá zone lại. Giống giấc ngủ: càng cố ngủ càng tỉnh. Việc của bạn không phải "gọi" zone, mà là dọn đường rồi để nó tự tới.'},
      {h:'Dọn điều kiện để zone dễ đến', p:'• Lo phần chuẩn bị: khởi động kỹ, thuộc routine tới mức không phải nghĩ.\n• Đặt mục tiêu QUÁ TRÌNH (routine, điểm chạm), không phải kết quả — bỏ kỳ vọng là bỏ rào cản lớn nhất.\n• Chọn độ căng vừa: quá dễ thì chán, quá khó thì lo — zone hay tới ở mức "thách thức vừa đủ".\n• Một routine lặp đều tạo nhịp, ru cái đầu phân tích ngủ.'},
      {h:'Đừng phá zone khi đang ở trong', p:'Sai lầm kinh điển: đang chạy ngon bỗng nghĩ "ồ mình đang vào zone!" hay "thắng 5 ván liền rồi" — thế là ý thức bật lại và zone tắt. Khi thấy mình đang trôi chảy, ĐỪNG phân tích nó, đừng đếm thành tích. Cứ làm y hệt: routine, điểm chạm, cú tiếp theo. Coi như không có gì đặc biệt.'},
      {h:'Đường trở lại khi tuột khỏi zone', p:'Tuột khỏi zone là bình thường (một cú hỏng, một tiếng động, một ý nghĩ chen vào). Đừng tiếc "mất cảm giác rồi" — càng níu càng xa. Quay về nền tảng: một hơi thở, một điểm neo cho mắt, làm đủ routine một cú thật đơn giản. Zone không bật/tắt bằng công tắc, nhưng làm đúng quy trình là mở cửa cho nó quay lại.'},
      {h:'Tập để zone đến thường hơn', p:'Zone không phải phép màu ngẫu nhiên — nó tới thường hơn với người (1) có kỹ năng đã tự động hoá nhờ tập nhiều, (2) có routine ổn định, (3) quen buông kết quả. Càng tập tới mức "không phải nghĩ mới làm được", nền cho zone càng dày. Bạn không ép được zone, nhưng luyện tập khiến nó ghé thăm nhiều hơn.'},
    ]},
  {key:'psy_momentum', tag:'Tâm lý', title:'Đà & động lượng trận đấu',
    intro:'Bi-a hiếm khi đều đều — nó đi theo TỪNG ĐỢT. Có lúc mọi thứ trơn tru (bạn đang lên đà), có lúc đối thủ ghi liên tục (họ đang có đà), và có những khoảnh khắc đà đổi chủ. Người bản lĩnh biết cưỡi trên đà của mình, chủ động chặn đà đối thủ, và không hoảng khi đà tạm nghiêng về phía kia.',
    body:[
      {h:'Momentum là thật, nhưng phần lớn ở TÂM LÝ', p:'Bàn bi không "nhớ" ván trước — mỗi cú độc lập về vật lý. Nhưng đà là thật ở chỗ nó tác động lên cái ĐẦU: đang thắng thì tự tin, tay mềm, dám đánh; thua liền mấy ván thì căng, rén, tự nghi. Momentum chủ yếu là chuỗi tâm lý tự nuôi. Hiểu vậy để không thần thánh hoá nó — bạn tác động được vào nó.'},
      {h:'Đang lên đà: đừng nghĩ về nó', p:'Đang chạy ngon thì cứ chạy — giữ NGUYÊN nhịp và lối chơi đã đưa bạn tới đây. Cạm bẫy: (1) bắt đầu đếm "thắng mấy ván rồi", (2) đổi sang đánh "giữ của", (3) tự mãn lơ là cú dễ. Cả ba đều bật ý thức lên và làm nguội đà. Coi mỗi cú vẫn như lúc đang hoà.'},
      {h:'Đối thủ đang có đà: chủ động cắt', p:'Đừng ngồi yên xem họ ghi. Cách chặn: (1) Dùng quyền nghỉ / đi lại / uống nước để BẺ nhịp của họ (hợp lệ, không phải tiểu xảo). (2) Tới lượt thì chậm lại, làm đủ routine — đừng cuốn theo tốc độ hưng phấn của họ. (3) Chọn một cú CHẮC để ghi điểm "cắt mạch", lấy lại cảm giác. Một ván sạch của bạn có thể tắt đà của họ.'},
      {h:'Khoảnh khắc đà đổi chủ', p:'Đà thường xoay ở một cú bản lề: đối thủ vừa trượt cú dễ, hoặc bạn vừa gỡ được một ván khó. Nhận ra khoảnh khắc đó và DỒN tập trung vào nó — đây là lúc một cú tốt tạo hiệu ứng dây chuyền. Ngược lại, đừng để một cú xui thành cái cớ cho đà tuột: xử nó như một cú lẻ, không phải "điềm".'},
      {h:'Không hoảng khi đà nghiêng về đối thủ', p:'Đà là sóng — lên xuống, không phải bản án. Bị dồn một mạch không nghĩa là trận đã hết; nó chỉ nghĩa tới lượt bạn phải kiên nhẫn chờ sóng đổi. Giữ cú chắc, giữ safety, giữ đầu lạnh — người đang hưng phấn dễ nôn nóng và tự tạo khoảnh khắc cho đà quay lại. Đà là chuyện cảm xúc, còn thứ đo được ngay trên bàn là quyền điều khiển ván. (Xem thêm "Tâm lý khi bị dẫn điểm", "Quyền chủ động — ai đang điều khiển ván" và "Giành lại quyền chủ động khi đã mất".)'},
    ]},
  {key:'psy_stamina', tag:'Tâm lý', title:'Sức bền tâm lý cho trận dài',
    intro:'Tập trung không vô hạn — nó là một loại "pin" tiêu hao dần. Trong trận dài hay giải cả ngày, người thua ở ván cuối thường không phải vì kém tay, mà vì đã CẠN tập trung từ trước. Kỹ năng ở đây là phân bổ sự tập trung cho khôn, và biết cách sạc lại.',
    body:[
      {h:'Tập trung là pin, không phải công tắc', p:'Mỗi lần bạn gồng ý chí để tập trung, để kìm cảm xúc, để tính toán — bạn rút pin. Cố tập trung 100% suốt cả ngày là cách chắc chắn để cạn giữa chừng. Người bền không tập trung MẠNH hơn, họ tập trung KHÔN hơn: đúng lúc, đúng chỗ.'},
      {h:'Bật/tắt tập trung có chủ đích', p:'Không giữ đèn pha bật liên tục. Chỉ bật tập trung CAO ở "vùng làm việc": từ lúc bắt đầu đọc bàn tới khi bắn xong. Giữa các cú và giữa các lượt, chủ động TẮT bớt — nhìn xa, thả lỏng, thở. Biết nghỉ 20–30 giây giữa cú giúp bạn còn pin cho ván thứ 10.'},
      {h:'Dấu hiệu tập trung đang cạn', p:'Bắt đầu bỏ bước routine, đọc bàn hời hợt, quyết định nhanh ẩu, trượt những cú vốn dễ, dễ cáu hoặc thẫn thờ. Nhận ra SỚM để sạc lại, đừng đợi đổ dốc mới biết. (Trùng dấu hiệu với mệt cơ thể — xem "Chơi bi-a khi mệt".)'},
      {h:'Sạc nhanh giữa trận', p:'• Giữa các ván: vài hơi thở ra dài, nhìn ra xa cho mắt và đầu nghỉ.\n• TRÁNH lướt điện thoại — nó mỏi mắt và không cho não nghỉ thật.\n• Một câu tự nhủ gọn để "reset" về hiện tại trước ván mới.\n• Uống nước, ăn nhẹ — đường huyết tụt là tập trung tụt (xem "Dinh dưỡng").'},
      {h:'Ưu tiên hoá khi đã ngấm mệt', p:'Cuối trận/cuối ngày, pin còn ít thì XÀI cho đúng chỗ: dồn phần tập trung ít ỏi cho các cú/ván QUYẾT ĐỊNH, đơn giản hoá phần còn lại. Chọn cú chắc, giảm tính toán cầu kỳ, giữ routine tối thiểu. Chơi "tiết kiệm pin" thông minh thắng chơi "đốt pin" đều tay.'},
      {h:'Rèn sức bền tập trung', p:'Sức bền tâm lý tập được như cơ bắp: tập những buổi DÀI có chủ đích (đánh 1–2 tiếng vẫn giữ đủ routine mỗi cú), tập thở/thiền ngoài bàn cho quen kéo chú ý về, ngủ đủ và giữ thể lực (đầu mệt theo thân). Càng quen "ở lâu trong tập trung", pin của bạn càng lớn. (Xem "Bài tập thể lực cho cơ thủ".)'},
    ]},
  {key:'psy_shark', tag:'Tâm lý', title:'Đối phó tiểu xảo tâm lý (sharking)',
    intro:'Không phải đối thủ nào cũng chơi đẹp. Có người dùng tiểu xảo tâm lý ("sharking"): cố tình làm bạn phân tâm, khó chịu, mất bình tĩnh để bạn tự hỏng. Biết trước các chiêu và có sẵn cách phản ứng là bạn đã miễn nhiễm phần lớn — vì tiểu xảo chỉ ăn thua khi nó khiến bạn ĐỔI trạng thái.',
    body:[
      {h:'Nhận diện các chiêu quen thuộc', p:'• Câu giờ, chần chừ, phá nhịp khi bạn đang lên đà.\n• Bình luận đá xoáy, khen đểu, nhắc "cú này khó đấy" để gợi bạn căng.\n• Cử động/gây tiếng động đúng lúc bạn cúi xuống, đứng trong tầm mắt.\n• Cố bắt chuyện để kéo bạn ra khỏi trạng thái (xem "Ngồi chờ tới lượt").\nGọi tên được chiêu là đã tháo nửa ngòi nổ.'},
      {h:'Nguyên tắc gốc: đừng cho họ thứ họ muốn', p:'Mục tiêu của sharking là khiến bạn PHẢN ỨNG — cáu, vội, mất tập trung. Chỉ cần bạn không đổi trạng thái, chiêu đó vô dụng. Phản ứng mạnh nhất thường là… không phản ứng: giữ vẻ bình thản, tiếp tục routine như không có gì. Họ sẽ hiểu là vô ích.'},
      {h:'Dựng "bong bóng" của riêng mình', p:'Trước và trong cú, thu mình vào routine: đây là vùng bất khả xâm phạm. Mắt trên bàn/điểm chạm, không giao tiếp mắt lúc đang vào cú, một hơi thở neo lại. Càng có routine chắc, ngoại cảnh (kể cả cố ý) càng lùi thành nền. Nếu bị phá đúng lúc bắn — ĐỨNG DẬY, làm lại từ đầu, đừng cố bắn cho xong.'},
      {h:'Xử lý bình tĩnh & đúng luật', p:'Nếu bị làm phiền thật sự (đứng chắn, gây tiếng động cố ý), xử điềm đạm: lùi lại, chờ, hoặc nhờ trọng tài/chủ nhà một cách lịch sự — đúng luật, không sa vào cãi vã (sa vào là bạn thua trận tâm lý). Đừng đáp trả bằng tiểu xảo: nó kéo bạn xuống sân chơi của họ và đốt tập trung của chính bạn.'},
      {h:'Biến khó chịu thành nhiên liệu', p:'Người dùng tiểu xảo thường vì họ THẤY bạn đáng gờm — coi đó là lời khen ngầm. Chuyển cơn khó chịu thành quyết tâm tập trung hơn, đánh sạch hơn. Cách trả đũa ngọt nhất là chơi hay và thắng trong khi vẫn nhã nhặn.'},
    ]},
  {key:'psy_variance', tag:'Tâm lý', title:'Chấp nhận may rủi & cú xui',
    intro:'Bi-a có yếu tố may rủi: bi kê nhau, lăn trớ, đối thủ đánh trượt mà bi lại nằm đẹp, cú của bạn hoàn hảo mà bi lại dội ra. Ức chế vì xui là cách nhanh nhất tự thua thêm — vì bạn không đổi được cú đã qua, chỉ đổi được cú sắp tới. Bản lĩnh là tách rõ CÁI MÌNH KIỂM SOÁT khỏi cái không.',
    body:[
      {h:'Phân biệt cú TỆ và cú XUI', p:'Cú tệ = bạn ngắm/đánh sai, rút được bài học. Cú xui = bạn làm đúng nhưng kết quả xấu vì yếu tố ngoài tầm (bi kê, mặt bàn, lăn trớ). Hai cái cần thái độ khác: cú tệ thì sửa; cú xui thì… buông. Nhầm xui thành tệ khiến mất tự tin oan; nhầm tệ thành xui khiến không chịu sửa. Đọc đúng bản chất trước. Có một loại cú trượt trông y hệt lỗi của bạn nhưng thật ra do bụi bám giữa hai viên bi. (Xem "Bi dính" ở mục Kỹ thuật.)'},
      {h:'Vì sao ức chế vì xui nhân đôi thiệt hại', p:'Cú xui lấy của bạn 1 điểm. Nếu bạn cáu và để nó làm hỏng 3 cú sau vì mất bình tĩnh, bạn mất 4. Bàn bi không "nợ" bạn sự công bằng và không "đền" nếu bạn giận. Cảm xúc tiêu cực chỉ rút pin và làm cứng tay — không đổi được viên bi đã nằm.'},
      {h:'Chấp nhận là một quyết định, không phải cảm giác', p:'Không cần "thấy vui" khi bị xui — chỉ cần QUYẾT ĐỊNH không mang nó theo. Một câu ngắn: "xui thật, xong rồi, cú tiếp theo." Thở ra một hơi, buông. Đây là kỹ năng lặp lại được, không phải tính cách trời cho. (Chạy nghi thức reset — xem "Sau lỗi & kiểm soát cảm xúc".)'},
      {h:'May rủi cân bằng về dài; kỹ năng thì không', p:'Qua nhiều ván, xui và hên gần như bù nhau — không ai bị bàn bi ghét riêng. Thứ tạo khác biệt bền vững là kỹ năng và quyết định, không phải vài cú lăn trớ. Dồn năng lượng vào cái bạn kiểm soát (ngắm, lực, chọn cú, thái độ), kệ phần ngẫu nhiên tự cân bằng.'},
      {h:'Khi ĐỐI THỦ gặp may', p:'Đối thủ đánh trượt mà bi nằm đẹp, hay "ăn may" một cú — bực là tự nhiên, nhưng vô ích. Họ không kiểm soát được cái may đó, và bạn cũng thế. Việc của bạn không đổi: xử lý thế bàn TRƯỚC MẶT cho tốt nhất. Giữ mặt lạnh còn khiến họ không đọc được bạn. Tập trung vào bàn, không vào sự "bất công".'},
    ]},
  {key:'psy_visual', tag:'Tâm lý', title:'Hình dung & diễn tập trong đầu',
    intro:'Trước khi cơ chạm bi, người chơi giỏi đã "thấy" cú đánh trong đầu: đường bi mục tiêu vào lỗ, đường bi cái chạy tới vị trí kế. Hình dung (visualization / mental imagery) không phải mê tín — nó là cách lập trình cho cơ thể biết phải làm gì, và là công cụ mạnh để ngắm, điều bi, và giữ bình tĩnh.',
    body:[
      {h:'Vì sao hình dung có tác dụng', p:'Não kích hoạt gần giống nhau khi bạn TƯỞNG TƯỢNG một động tác và khi THỰC HIỆN nó. "Xem" trước cú đánh cho cơ thể một "bản đồ" để làm theo, giảm do dự, giúp mắt–tay phối hợp. Nó cũng lấp chỗ trống trong đầu bằng hình ảnh cú đánh — thay vì bằng lo lắng.'},
      {h:'Hình dung khi CÒN ĐỨNG sau bàn', p:'Trước khi cúi xuống, đứng sau đường cơ và "chiếu phim" cú đánh: thấy điểm chạm trên bi mục tiêu, thấy bi lăn vào lỗ, và quan trọng — thấy ĐƯỜNG bi cái chạy sau va chạm tới vị trí cho cú kế. Quyết xong toàn bộ hình ảnh này rồi mới vào bộ; cúi xuống chỉ để thực hiện, không để nghĩ lại.'},
      {h:'Dùng hình dung để ĐIỀU BI', p:'Điều bi tốt bắt đầu trong đầu: hình dung bi cái sau khi chạm bi mục tiêu sẽ đi hướng nào (theo/rút/xoáy), chạm băng ở đâu, dừng ở đâu. "Thấy" cả đường đi giúp bạn chọn đầu cơ và lực phù hợp, thay vì đánh xong mới ngạc nhiên bi cái chạy đâu. (Kết hợp mục Điều bi trong Thi đấu.)'},
      {h:'Thấy cú THÀNH CÔNG, không thấy cú hỏng', p:'Não bám vào hình ảnh cuối cùng bạn cho nó. Nếu bạn hình dung "đừng đánh xuống lỗ" thì đầu đầy hình ảnh xuống lỗ. Luôn hình dung KẾT QUẢ MUỐN CÓ: bi vào lỗ gọn, bi cái dừng đúng chỗ. Hình ảnh tích cực, cụ thể, rõ nét dẫn đường cho tay.'},
      {h:'Tập hình dung ngoài bàn', p:'Không cần bàn cũng tập được: nhắm mắt, dựng lại một thế bi, "đánh" nó trong đầu với đầy đủ chi tiết (góc, lực, đường bi cái). Xem video cơ thủ giỏi rồi hình dung mình thực hiện. Trước giải, "diễn tập" cảnh mình bình tĩnh xử lý tình huống khó. Đầu quen thì tay theo.'},
      {h:'Ngắn gọn, đừng biến thành phân tích', p:'Hình dung là THẤY (hình ảnh, cảm giác), không phải NGHĨ (lời, tính toán). Giữ nó nhanh và trực quan — một hai giây "xem phim" là đủ. Nếu nó biến thành lảm nhảm phân tích lúc đã cúi xuống thì phản tác dụng (xem "Buông tay & tin cú đánh").'},
    ]},
  {key:'psy_trust', tag:'Tâm lý', title:'Buông tay & tin cú đánh (inner game)',
    intro:'Có một nghịch lý ai cũng gặp: tập thì đánh ngon, vào trận quan trọng lại gượng. Thường không phải vì thiếu kỹ năng, mà vì cái đầu Ý THỨC chen vào điều khiển động tác vốn đã tự động. "Inner game" là học cách BUÔNG — để phần cơ thể đã tập nhuần làm việc, và làm im cái đầu hay xen vào.',
    body:[
      {h:'Hai "cái tôi" khi đánh', p:'Trong bạn có hai phần: phần BIẾT LÀM (cơ thể, đã tập tới mức tự động) và phần HAY NÓI (cái đầu phân tích, phán xét, lo lắng). Đánh hay là khi phần biết-làm được tự do thực hiện. Đánh dở thường là khi phần hay-nói giành lấy tay lái: "cẩn thận", "đừng hỏng", "siết chặt hơn"… làm động tác quen bỗng gượng.'},
      {h:'Tách pha NGHĨ và pha LÀM', p:'Suy nghĩ có chỗ của nó — KHI CÒN ĐỨNG: chọn cú, lực, đường bi cái, điểm chạm. Nhưng khi đã CÚI xuống vào bộ, đóng cửa phòng phân tích lại: ngắm rồi bắn, tin lần tập. Còn phân vân lúc đã ở dưới thì ĐỨNG DẬY quyết lại — tuyệt đối không "vừa nghĩ vừa bắn".'},
      {h:'Đừng "lái" cú đánh', p:'Cố điều khiển từng milimet lúc đưa cơ (ghì tay, ép đường cơ) làm cứng cơ và phá nhịp tự nhiên. Thay vì lái, hãy NGẮM cho kỹ rồi GIAO việc cho cú đánh — như ném phi tiêu: bạn ngắm, rồi buông, không điều khiển mũi tiêu giữa không trung. Tin vào đường ngắm đã chọn — và muốn tin được thì phải có MỘT hệ ngắm cố định để theo, cùng thói quen giữ yên người sau khi ra ngọn. (Xem "Ngắm — bốn hệ thống và cách chọn một hệ để theo" và "Theo cơ & giữ yên".)'},
      {h:'Cho cái đầu một việc đơn giản', p:'Không thể bảo cái đầu "im đi" (càng bảo càng ồn). Hãy giao cho nó một việc nhỏ, cụ thể, không phán xét để nó bận: một từ khoá ("chạm"), đếm nhịp đưa cơ, hoặc chỉ dán mắt vào điểm chạm. Bận việc lành thì nó thôi xen vào việc của cơ thể.'},
      {h:'Tin là kết quả của chuẩn bị', p:'"Buông tay tin cú đánh" chỉ dễ khi có gì để tin: đó là hàng trăm lần lặp lúc tập. Càng tập tới mức tự động, càng dễ buông trong trận. Niềm tin không phải tự nhủ suông — nó xây từ phòng tập. Vào trận, nhắc mình bằng sự thật: "mình đã đánh cú này vô số lần rồi" — rồi để cơ thể làm phần của nó.'},
    ]},
  {key:'psy_prematch', tag:'Tâm lý', title:'Chuẩn bị tâm lý trước trận',
    intro:'Trận đấu tâm lý bắt đầu TRƯỚC khi bạn đánh cú đầu tiên. Vào trận trong trạng thái vội vàng, đầu còn ngổn ngang, thân chưa nóng — là tự cho mình một hiệp "khởi động" đầy lỗi. Một nghi thức trước trận giúp bạn bước vào bàn với đầu tĩnh, thân sẵn sàng và ý định rõ ràng.',
    body:[
      {h:'Tới sớm, không vội', p:'Đến sớm để khỏi cuống. Vội vã (kẹt xe, tới sát giờ, lắp cơ vội) đẩy nhịp sinh học lên cao và bạn mang sự hấp tấp đó vào cú đầu. Cho mình thời gian ổn định chỗ ngồi, làm quen ánh sáng/bàn/không khí phòng đấu. Phần chuẩn bị rẻ nhất mà hay bị bỏ là kiểm cây cơ, đầu cơ và lơ từ tối hôm trước. (Xem "Cơ, đầu cơ & lơ".)'},
      {h:'Khởi động THÂN trước khi vào trận', p:'Cơ nguội thì cú đầu run và sai cảm giác. Làm nóng cổ tay–vai, đánh vài cú thẳng và vài cú lực để lấy "cảm giác tay" và tốc độ bàn hôm nay. Đừng để trận đấu chính là lúc khởi động (xem tab Tâm & Thân → khởi động).'},
      {h:'Khởi động ĐẦU: hạ nhiễu, đặt ý định', p:'Vài phút trước giờ: gác chuyện ngoài (công việc, điện thoại), vài hơi thở dài để hạ căng, và đặt Ý ĐỊNH cho trận — không phải "phải thắng", mà kiểu "làm đủ routine mỗi cú", "kiên nhẫn, chọn cú chắc", "bình tĩnh sau lỗi". Ý định quá trình cho bạn thứ để bám khi căng.'},
      {h:'Diễn tập trong đầu', p:'Hình dung trước cảnh mình chơi bình tĩnh, xử lý tình huống khó gọn gàng, reset nhanh sau một cú hỏng. "Xem phim" phiên bản tốt của mình cho cơ thể sẵn kịch bản, và giảm lo âu về cái chưa biết. (Xem "Hình dung & diễn tập trong đầu".)'},
      {h:'Một nghi thức cố định', p:'Làm y hệt mỗi lần trước trận (cùng thứ tự khởi động, cùng vài hơi thở, cùng câu tự nhủ) tạo cảm giác quen thuộc — thứ trấn an hệ thần kinh khi bối cảnh lạ. Nghi thức là cái mỏ neo bạn mang theo tới bất kỳ phòng đấu nào.'},
      {h:'Chấp nhận hồi hộp trước trận', p:'Tim đập nhanh, bụng nôn nao trước giờ đấu là BÌNH THƯỜNG — kể cả nhà vô địch. Đừng diễn giải nó thành "mình đang sợ, hỏng rồi". Coi nó là dấu hiệu cơ thể đang sẵn sàng, là năng lượng để tập trung. (Xem "Áp lực & khoảnh khắc căng".)'},
    ]},
  {key:'psy_resilience', tag:'Tâm lý', title:'Vượt qua thất bại & lì đòn',
    intro:'Ai chơi lâu cũng thua — thua trận, thua giải, thua cả những trận tưởng đã nắm chắc. Điều phân biệt người tiến bộ với người chững lại không phải SỐ trận thua, mà là cách họ XỬ LÝ nó: biến mỗi thất bại thành dữ liệu và động lực, thay vì thành vết thương và nỗi sợ.',
    body:[
      {h:'Cho phép mình thất vọng — có thời hạn', p:'Thua mà buồn/tức là bình thường và lành mạnh — nó chứng tỏ bạn quan tâm. Đừng chối bỏ cảm xúc, nhưng đặt cho nó một GIỚI HẠN: buồn hết tối nay, hết chặng đường về — rồi chuyển sang mổ xẻ tỉnh táo. Cảm xúc được thừa nhận sẽ nguôi; bị đè nén sẽ âm ỉ thành nỗi sợ.'},
      {h:'Tách CON NGƯỜI khỏi kết quả', p:'"Mình thua trận này" không phải "mình là kẻ thua cuộc". Một trận là mẫu nhỏ, chịu tác động của may rủi, phong độ ngày, đối thủ. Đừng để một kết quả định nghĩa giá trị hay tài năng của bạn. Người bản lĩnh thua trận mà không thua niềm tin vào chính mình.'},
      {h:'Mổ xẻ để HỌC, không để dằn vặt', p:'Khi đã bình tĩnh, xem lại tỉnh táo: cú/ván nào là bước ngoặt? Mình sai QUYẾT ĐỊNH hay sai THỰC HIỆN? Lỗi nào lặp lại? Ghi vào Nhật ký 1–2 điều cụ thể cần sửa. Mổ xẻ để rút bài học khác hẳn tua đi tua lại tự trách — cái đầu học được, cái sau chỉ gặm mòn.'},
      {h:'"Thua" hay nhất là bài học đắt nhất', p:'Thất bại chỉ ra chính xác lỗ hổng mà lúc thắng bạn không thấy: một loại cú yếu, một kiểu tâm lý dễ vỡ, một quyết định sai lặp lại. Đối thủ mạnh và trận thua là ông thầy nghiêm khắc nhất. Đổi câu hỏi từ "sao mình tệ thế" sang "trận này dạy mình điều gì".'},
      {h:'Đừng mang trận cũ vào trận mới', p:'Sợ lặp lại thất bại khiến ta đánh rén ở trận sau — và thế là tự ứng nghiệm. Đã rút bài học và ghi lại thì KHÉP nó lại. Vào trận mới với trang giấy trắng: đối thủ khác, thế bàn khác, phiên bản mình đã học thêm một điều. Lì đòn là gì? Là thua rồi vẫn quay lại bàn với đủ tự tin.'},
      {h:'Nhìn đường dài', p:'Mọi cơ thủ giỏi đều có một "nghĩa địa" trận thua phía sau. Sự nghiệp là đường dài; một trận, một giải chỉ là một điểm trên đó. Quan trọng là đồ thị đi LÊN qua nhiều tháng, không phải thắng mọi trận. Kiên trì qua các thất bại chính là thứ tách người trụ lại khỏi người bỏ cuộc.'},
    ]},
  {key:'psy_yips', tag:'Tâm lý', title:'Sợ cú cụ thể & "chết tay" (yips)',
    intro:'Nhiều người chơi tốt mọi thứ nhưng "chết tay" ở một loại cú: cú quyết định, cú cắt mỏng, đôi bi, hay cú ngắn tưởng dễ. Tay bỗng cứng, do dự, đánh sai một cách vô lý. Đây là "yips" — một cái khoá tâm lý, không phải bạn mất kỹ năng. Và vì là khoá tâm lý, nó gỡ được.',
    body:[
      {h:'"Chết tay" là khoá tâm lý, không phải mất nghề', p:'Bạn vẫn đánh được cú đó lúc tập hay lúc không quan trọng — chứng tỏ kỹ năng còn nguyên. Cái hỏng là khi cú đó bị gán "trọng lượng" đặc biệt (sợ hỏng, ám ảnh lần trượt trước), cái đầu ý thức nhảy vào điều khiển động tác tự động và làm nó gượng. Hiểu đúng bản chất là bước gỡ đầu tiên.'},
      {h:'Vòng lặp nuôi nỗi sợ', p:'Trượt một cú → nhớ mãi → lần sau tới cú đó thì căng → càng căng càng dễ trượt → "bằng chứng" củng cố nỗi sợ. Vòng lặp tự nuôi này mới là kẻ thù, không phải cú đánh. Cắt vòng lặp ở khâu diễn giải: một lần trượt là một cú lẻ, không phải "mình luôn hỏng cú này".'},
      {h:'Hạ trọng lượng cú đánh', p:'Đối xử với cú đáng sợ y như mọi cú khác: "chỉ là một cú như bao cú". Đừng dồn kịch tính vào nó. Dồn chú ý vào thứ CỤ THỂ và trong tầm kiểm soát — điểm chạm, đưa cơ thẳng, nhịp — thay vì vào hậu quả "nếu trượt thì…". Làm đúng y routine mọi khi.'},
      {h:'Buông tay, đừng lái', p:'Yips nặng lên khi bạn cố "kiểm soát cực kỳ cẩn thận" — ghì tay, đưa cơ chậm rề, canh từng li. Đó chính là ý thức giành tay lái. Ngược lại: ngắm kỹ rồi bắn DỨT KHOÁT, tin lần tập. Cú do dự gần như luôn hỏng. (Xem "Buông tay & tin cú đánh".)'},
      {h:'Giải mẫn cảm bằng tập lặp', p:'Tập riêng cú đó thật nhiều trong môi trường KHÔNG áp lực, dễ trước rồi khó dần, để não ghi đè "bằng chứng" cũ bằng hàng loạt lần THÀNH CÔNG. Mỗi lần vào gọn là một viên gạch xây lại niềm tin. Có thể đổi nhẹ routine/nhịp cho cú đó để "làm mới" cảm giác, thoát liên tưởng xấu.'},
      {h:'Khi đang trong trận', p:'Nếu cú đáng sợ xuất hiện giữa trận: một hơi thở ra dài, một từ khoá, hình dung cú THÀNH CÔNG, rồi làm đủ routine và bắn dứt khoát. Chấp nhận có thể chưa hết sợ ngay — nhưng đừng để nỗi sợ điều khiển tay. Hành động đúng nhiều lần, cảm giác sẽ theo sau.'},
    ]},
  {key:'psy_discipline', tag:'Tâm lý', title:'Động lực & kỷ luật tập luyện',
    intro:'Tiến bộ trong bi-a đến từ hàng trăm giờ tập — phần lớn không hào hứng chút nào. Ai cũng có động lực vào ngày đẹp trời; người giỏi lên là người vẫn tập vào ngày KHÔNG có hứng. Bí quyết không phải "nhiều động lực hơn", mà là dựng KỶ LUẬT và THÓI QUEN để không phụ thuộc vào cảm hứng.',
    body:[
      {h:'Động lực bấp bênh, kỷ luật thì bền', p:'Động lực là cảm xúc — nó lên xuống theo tâm trạng, thời tiết, kết quả trận gần nhất. Nếu chỉ tập khi "có hứng", bạn sẽ tập chập chờn. Kỷ luật là làm điều đã định DÙ cảm xúc thế nào. Người tiến bộ dựa vào hệ thống (lịch tập, thói quen), không dựa vào việc sáng nay có thấy thích hay không.'},
      {h:'Biến tập thành THÓI QUEN', p:'Thói quen giảm sức ì: cùng khung giờ, cùng chỗ, cùng cách bắt đầu, để "vào tập" không cần quyết định mỗi lần (mỗi lần phải "quyết có tập không" là một lần dễ bỏ). Gắn buổi tập vào một mỏ neo có sẵn trong ngày. Khi tập thành nếp như đánh răng, động lực không còn là điều kiện.'},
      {h:'Tập có MỤC TIÊU, không đánh cho vui', p:'Đánh lông bông vài tiếng khác xa tập có chủ đích. Mỗi buổi đặt 1–2 trọng tâm cụ thể (vd cú rút cự ly trung bình, điều bi một băng, routine + hơi thở mỗi cú). Đo được thì tiến bộ thấy được, và thấy tiến bộ lại nuôi động lực. (Dùng mục Bài tập + Nhật ký để chấm điểm và theo dõi.)'},
      {h:'Tập ĐIỂM YẾU, đừng chỉ tập cái sướng', p:'Ai cũng thích lặp cú mình đã giỏi (nó sướng). Nhưng tiến bộ nằm ở chỗ KHÓ CHỊU: đúng những cú/tình huống bạn hay hỏng. Dành phần lớn buổi tập cho điểm yếu — nó nhàm và bực, nhưng đó mới là nơi điểm số của bạn thật sự lớn lên. (Xem "Cách tập điều bi cho thật sự lên trình".)'},
      {h:'Mục tiêu quá trình, kỳ vọng thực tế', p:'Đặt mục tiêu bạn KIỂM SOÁT được: "tập 4 buổi tuần này", "500 cú rút", không phải "phải lên hạng trong tháng". Tiến bộ không tuyến tính — có tuần chững, có tuần như tụt. Đừng bỏ cuộc ở khúc chững (nó luôn có). Tin vào tích luỹ: gạch xây tường, không phải phép màu một đêm.'},
      {h:'Nuôi ngọn lửa dài hạn', p:'Kỷ luật giúp tập đều, nhưng vẫn cần giữ TÌNH YÊU với môn này để đi đường dài: thi thoảng chơi cho vui, đánh giải nhỏ tạo mục tiêu, xem cơ thủ giỏi lấy cảm hứng, chơi cùng người hợp. Kỷ luật đưa bạn qua ngày xám; niềm vui khiến cả hành trình đáng đi.'},
    ]},
  {key:'psy_stakes', tag:'Tâm lý', title:'Áp lực khi đánh có cược',
    intro:'Khi có tiền hoặc sĩ diện đặt lên bàn, cùng một cú bỗng nặng hơn hẳn — tay run, tính toán rối, dễ đánh liều hoặc rén quá mức. Áp lực được–mất là thật, nhưng nó tác động qua cách bạn NGHĨ về nó. Quản được cái đầu khi có cược là một kỹ năng riêng, tách khỏi kỹ năng đánh.',
    body:[
      {h:'Vì sao có cược làm tay đổi', p:'Khi kết quả gắn với mất mát cụ thể (tiền, sĩ diện), não gán cho mỗi cú "trọng lượng" lớn hơn và đổ adrenaline — đúng thứ làm vận động tinh (tay, mắt) kém đi. Bạn không "yếu"; đây là phản ứng sinh lý ai cũng có. Biết vậy để không hoảng khi thấy tay mình khác lúc đánh vui.'},
      {h:'Tách tiền khỏi cú đánh', p:'Trên bàn chỉ có bi và đường cơ — con số tiền không nằm trên mặt nỉ. Nghĩ về được–mất là nghĩ về TƯƠNG LAI và thứ ngoài tầm kiểm soát, tạo lo mà chẳng giúp cú hiện tại. Kéo chú ý về thứ cụ thể: điểm chạm, routine, nhịp. Chơi CÚ, không chơi con số tiền.'},
      {h:'Đặt mức cược trong ngưỡng bình tĩnh', p:'Đây là điều KIỂM SOÁT ĐƯỢC lớn nhất: chỉ chơi ở mức mà nếu thua bạn vẫn thấy bình thường. Cược quá khả năng chịu đựng thì áp lực lớn tới mức không kỹ thuật nào trụ nổi — và bạn học phải điều tệ (đánh trong sợ hãi). Giữ mức đủ nhỏ để cái đầu còn tỉnh là điều kiện tiên quyết.'},
      {h:'Đừng để cảm xúc leo thang', p:'Thua vài ván dễ sinh muốn "gỡ gấp" bằng cách tăng cược và đánh liều — con đường nhanh nhất xuống hố cả tâm lý lẫn túi tiền. Định trước LẰN RANH (thua tới đâu thì dừng) và tôn trọng nó lúc đầu còn lạnh, vì lúc đang nóng bạn sẽ không đủ tỉnh để quyết. Biết dừng là bản lĩnh, không phải yếu đuối.'},
      {h:'Dùng áp lực làm tập trung', p:'Có cược khiến bạn buộc phải tập trung hơn — tận dụng theo hướng lành: coi nó là lý do để làm đủ routine, chọn cú chắc, kiên nhẫn hơn thường ngày. Áp lực biến thành sự nghiêm túc thay vì nỗi sợ khi bạn hướng nó vào QUÁ TRÌNH. (Xem "Áp lực & khoảnh khắc căng".)'},
      {h:'Giữ tỉnh táo và chừng mực', p:'Áp lực tiền dễ kéo theo rượu bia, cay cú, chơi thâu đêm — tất cả đều phá cả phong độ lẫn quyết định. Giữ đầu lạnh, chơi trong khả năng, coi trọng việc rèn kỹ năng và sự bình tĩnh hơn ăn thua một buổi. Cái đầu biết dừng đúng lúc giá trị hơn mọi cú xuất thần.'},
    ]},
  {key:'psy_slowstart', tag:'Tâm lý', title:'Vào trận chậm — nóng máy muộn (slow starter)',
    intro:'Có kiểu người 2–3 ván đầu luôn đánh dưới sức: tay lạnh, cảm giác lực chưa có, đầu còn ở ngoài trận — tới lúc "nóng máy" thì đã bị dẫn. Vấn đề thường không phải kỹ năng, mà là bạn chưa CHUYỂN TRẠNG THÁI kịp trước khi cú đầu tiên diễn ra. Đây là thứ rèn được.',
    body:[
      {h:'Vì sao mình luôn khởi đầu chậm', p:'Ba thứ nguội cùng lúc: CƠ (chưa làm nóng, cú đầu run, chưa có cảm giác lực), HỆ THẦN KINH (chưa chuyển sang "chế độ thi đấu"), và ĐẦU (còn vướng chuyện ngoài — công việc, đường đi tới, điện thoại). Bạn bước vào bàn nhưng chưa thật sự vào trận, nên vài ván đầu như đang khởi động.'},
      {h:'Cái giá của khởi đầu chậm', p:'Trong nhiều thể thức, ván đầu đáng giá y như ván cuối. Bị dẫn 0–2 vì "chưa nóng" là tự đào hố rồi phải leo. Ở trận ngắn (race to 4–5) gần như không có thời gian sửa — nóng máy tới ván 4 thì trận đã gần xong. Khởi đầu chậm không "vô hại", nó thường quyết định trận.'},
      {h:'Khởi động THÂN trước khi vào trận', p:'Đừng để trận đấu chính là lúc làm nóng. Trước giờ: làm nóng cổ tay–vai, đánh vài cú thẳng và vài cú lực để lấy cảm giác tay và cảm nhận tốc độ nỉ/băng hôm nay. Vào trận với tay đã ấm thì cú đầu không còn là cú "dò đường". (Xem tab Tâm & Thân → khởi động; và "Chuẩn bị tâm lý trước trận".)'},
      {h:'Khởi động ĐẦU: vào trận trước khi vào trận', p:'Vài phút trước giờ đấu: gác chuyện ngoài, vài hơi thở dài để hạ nhiễu, "diễn tập trong đầu" cảnh mình chơi bình tĩnh, và đặt ý định quá trình cho trận. Bước tới bàn với cái đầu đã ở TRONG trận, không mang theo dòng suy nghĩ dở dang từ bên ngoài.'},
      {h:'Ép mình nghiêm túc từ cú ĐẦU TIÊN', p:'Nhiều người vô thức "đợi tới lúc quan trọng mới tập trung" — nên đầu trận đánh lơ là. Đảo lại: coi ván đầu là ván quyết định, làm đủ pre-shot routine ngay cú một. Nếu chỉ nghiêm túc khi bị dồn, bạn sẽ mãi khởi đầu chậm. (Xem "Chơi 100% công lực".)'},
      {h:'Đơn giản hoá vài ván đầu', p:'Khi tay còn lạnh, chưa có cảm giác lực — chọn cú CHẮC, lực vừa, bỏ cú hoa mỹ và cú % thấp. Ghi điểm bằng cú đơn giản để "mồi" sự tự tin và đánh thức cảm giác tay, thay vì thử cú khó lúc chưa nóng rồi trượt và tụt tinh thần ngay từ đầu.'},
      {h:'Biến ván "nguội" thành ván trinh sát', p:'Nếu chưa nóng máy được ngay, ít nhất dùng những ván đầu để THU THẬP dữ liệu: tốc độ bàn, băng nảy ra sao, đối thủ mạnh/yếu cú nào, hay đánh kiểu gì. Vậy là ngay cả khi tay chưa vào, cái đầu đã làm việc có ích và bạn không "mất trắng" giai đoạn đầu.'},
      {h:'Một nghi thức chuyển trạng thái', p:'Có một tín hiệu cố định báo cho cơ thể "giờ vào trận rồi": buộc lại phấn, một hơi thở ra thật dài, một câu neo ("bắt đầu — cú này như bao cú"). Lặp y hệt mỗi lần để não học đường chuyển từ "nguội" sang "chiến". Nghi thức quen thuộc trấn an hệ thần kinh nhanh hơn ý chí.'},
      {h:'Tập riêng "cú đầu tiên"', p:'Trong buổi tập, thỉnh thoảng dừng lâu (đứng dậy, đi vài vòng) rồi bắt mình đánh CHUẨN ngay cú đầu sau khi nghỉ — mô phỏng cảm giác vào trận lạnh. Quen với "lạnh mà vẫn đánh đúng routine" thì cái tật khởi đầu chậm mờ dần, vì cơ thể học được cách vào việc không cần khởi động dài.'},
    ]},
  {key:'psy_closeout', tag:'Tâm lý', title:'Dứt điểm — bản năng sát thủ khi đang dẫn',
    intro:'Ngược với "sợ thua": khi đang dẫn hoặc sắp thắng, rất nhiều người tự nhiên "nhả ga" — chuyển sang giữ, đánh rén, và cho đối thủ đường sống. Dứt điểm (closing out) là một kỹ năng riêng: kết liễu nhanh gọn khi cơ hội tới, không rề rà để trận vuột khỏi tay lúc đã cầm chắc.',
    body:[
      {h:'Vì sao càng gần thắng càng khó đánh', p:'Gần đích, đầu chuyển ngầm từ "tấn công để THẮNG" sang "phòng thủ để KHỎI THUA". Nó bắt đầu tính hậu quả nếu để tuột, đổ một ít adrenaline, và tay rén lại đúng lúc cần dứt khoát. Bạn không yếu bản lĩnh — đây là phản ứng ai cũng có; biết nó để không bị nó dắt.'},
      {h:'Giữ NGUYÊN lối chơi đã đưa bạn tới đây', p:'Cái làm bạn dẫn điểm là sự dứt khoát và lối chơi tấn công. Bỏ nó đi để "giữ của" lúc sắp thắng là tự cởi vũ khí. Đánh ván hill như đánh ván đầu — cùng tốc độ, cùng cách chọn cú. Đổi sang đánh rón rén thường là lúc trận bắt đầu tuột.'},
      {h:'Thu mục tiêu về "cú này"', p:'Nghĩ "còn 2 ván nữa là vô địch" là nghĩ về tương lai và tạo áp lực ngay hiện tại. Kéo chú ý về cú trước mặt: chỉ cần thắng CÚ này, rồi ván này. Áp lực dứt điểm tan khi mục tiêu nhỏ lại thành thứ đang nằm trên bàn. (Xem "Tập trung & ở hiện tại".)'},
      {h:'Đổi khung: dứt điểm là CƠ HỘI, không phải nghĩa vụ', p:'"Mình PHẢI không được hỏng" tạo sợ; "mình ĐƯỢC kết liễu bây giờ" tạo hưng phấn lành. Tâm thế săn mồi khác hẳn tâm thế giữ mạng. Cùng một cú, cách bạn gọi tên nó quyết định tay bạn mềm hay cứng.'},
      {h:'Nhận diện khoảnh khắc kết liễu', p:'Khi đối thủ vừa hỏng để lại bàn ngon, hoặc bạn có loạt bi dọn được — DỒN tập trung cao nhất vào đúng lúc đó. Đây là lúc một loạt sạch đóng luôn trận. Đừng lơ là vì "coi như xong": trận chưa xong tới khi bi quyết định rơi. (Xem "Đà & động lượng trận đấu".)'},
      {h:'Cú do dự gần như luôn trượt', p:'Lúc dứt điểm, cam kết đánh dứt khoát là bắt buộc. Ngắm cho kỹ khi còn ĐỨNG, xuống bộ thì tin và bắn — không "vừa nghĩ vừa đánh", không giảm lực nửa chừng vì sợ. Muốn thắng thì phải dám kết liễu. (Xem "Buông tay & tin cú đánh".)'},
      {h:'Đừng cho đối thủ đường sống', p:'Mỗi cú rén, mỗi safety thừa lúc đáng lẽ dứt điểm là một nhịp cho đối thủ hồi tinh thần và bám lại. Người bị dẫn sống nhờ chính những khoảnh khắc bạn ngần ngừ. Có cú ăn chắc thì ăn; đưa họ về ghế càng nhanh, họ càng ít cơ hội lật.'},
      {h:'Nếu bị gỡ — reset, đừng sụp', p:'Sắp thắng mà bị gỡ 1–2 ván là bình thường, đừng để nó thành hoảng loạn ("lại tuột nữa rồi"). Chạy reset, quay về cú chắc, giữ đầu lạnh. Trận chưa mất tới bi cuối — người giữ được bình tĩnh trong đoạn này thường vẫn về đích. (Xem "Sau lỗi & kiểm soát cảm xúc".)'},
      {h:'Tập "đóng trận"', p:'Trong tập hoặc kèo nhẹ, tự dựng tình huống áp lực: "đang dẫn hill, phải dọn nốt cụm này". Tập kết liễu dưới sức ép để cảm giác về đích thành quen. Quen rồi thì lúc thật, tay không còn rén — dứt điểm trở thành phản xạ chứ không phải bài kiểm tra mỗi lần.'},
    ]},
  {key:'psy_handicap', tag:'Tâm lý', title:'Đánh kèo trên & kèo dưới (tâm lý chấp)',
    intro:'Bi-a Việt Nam đầy kèo chấp. Mỗi vai có bẫy tâm lý riêng: cửa trên gánh áp lực "phải thắng, thua kẻ yếu hơn là mất mặt"; cửa dưới dễ tự ti "kiểu gì cũng thua". Biết bẫy của vai mình đang đứng — và cách lật nó thành lợi thế — quan trọng ngang kỹ thuật.',
    body:[
      {h:'Hai vai, hai áp lực khác nhau', p:'Cửa trên: sợ thua người bị coi là yếu hơn nên đánh "để khỏi mất mặt" thay vì để thắng. Cửa dưới: dễ buông xuôi, đánh cho có vì "đằng nào chả thua". Cùng một bàn bi nhưng cái đầu hai người mang gánh nặng ngược nhau. Gọi tên gánh nặng của vai mình là bước gỡ đầu tiên.'},
      {h:'Cửa TRÊN: bỏ gánh "phải thắng"', p:'Áp lực của cửa trên đến từ KỲ VỌNG (của mình, của người xem), không từ đối thủ. Đổi mục tiêu sang quá trình: đánh đúng lối của mình, chọn cú chắc, kiên nhẫn. Bạn mạnh hơn thì cứ chơi bình thường là lợi thế tự hiện ra qua nhiều ván; cố "chứng minh đẳng cấp" bằng cú khó mới là tự phá.'},
      {h:'Cửa TRÊN: đừng khinh địch', p:'Coi thường đối thủ yếu dẫn tới lơ là cú dễ, đánh ẩu, bỏ routine — và đó là lúc dễ trượt nhất. Tôn trọng mọi đối thủ, làm đủ quy trình cả cú dễ. Rất nhiều cửa trên thua không phải vì kém tay, mà vì tự mãn. (Xem "Chủ quan khi đang dẫn" trong bài "Tập trung & ở hiện tại".)'},
      {h:'Cửa TRÊN: thua kèo chấp không phải "nhục"', p:'Về dài, cửa trên thắng nhiều hơn nhưng không phải 100% — chấp là để cân lại cơ hội. Một trận thua kèo chấp là bình thường về xác suất. Đừng để nó thành vết thương lòng khiến trận sau đánh trong sợ hãi, càng dễ thua tiếp. Tách kết quả một trận khỏi giá trị của mình.'},
      {h:'Cửa DƯỚI: "không có gì để mất" là vũ khí', p:'Không ai kỳ vọng bạn thắng, nên bạn được chơi THẢ LỎNG, dám đánh, dám tấn công. Đây là trạng thái nhiều cơ thủ phải cố mới có được — bạn có sẵn. Tận dụng sự tự do đó thay vì tự trói mình bằng mặc cảm "mình yếu hơn nên chắc thua".'},
      {h:'Cửa DƯỚI: điểm chấp là lợi thế thật — hãy dùng', p:'Điểm chấp không phải bố thí, nó là ưu thế có thật. Chơi kiên nhẫn, giữ cú chắc và safety, ép cửa trên phải thắng sòng phẳng từng ván. Đừng nôn nóng "phải đánh cho hay" để chứng tỏ — cứ bám điểm chắc chắn là cách khai thác lợi thế chấp tốt nhất.'},
      {h:'Cửa DƯỚI: đừng thần thánh hoá đối thủ', p:'Người mạnh cũng mắc lỗi, cũng căng — nhất là khi bị cửa dưới bám sát, vì lúc đó HỌ mới là người "phải thắng". Đừng dựng hình ảnh "bất khả chiến bại" rồi tin vào nó. Tách khỏi con người đối thủ, chơi đúng lối của mình từng cú. (Xem "Bị đối thủ áp đảo tâm lý" trong "Áp lực & khoảnh khắc căng".)'},
      {h:'Đảo áp lực về phía cửa trên', p:'Khi cửa dưới bám điểm, gánh nặng "sao mãi chưa dứt được người yếu hơn" đè lên cửa trên và họ tự căng. Chỉ cần bạn (cửa dưới) giữ mặt lạnh và bám sát, đối thủ sẽ nôn nóng và tự tạo khoảnh khắc cho bạn. Kiên nhẫn là đòn mạnh nhất của cửa dưới.'},
      {h:'Chọn kèo trong ngưỡng lành mạnh', p:'Dù ở vai nào, chấp quá chênh khiến một bên chơi trong tuyệt vọng còn bên kia chủ quan — hỏng cả tính rèn luyện lẫn niềm vui. Kèo hay là kèo mà cả hai đều phải nghiêm túc từng cú. Giữ mức chấp và mức cược đủ để cái đầu còn tỉnh. (Xem "Áp lực khi đánh có cược".)'},
    ]},
  {key:'psy_pokerface', tag:'Tâm lý', title:'Poker face — giấu cảm xúc & đọc đối thủ',
    intro:'Bi-a là trò chơi tâm lý hai chiều. Cảm xúc lộ ra mặt vừa tiếp thêm tự tin cho đối thủ, vừa tự khoét sâu trạng thái xấu của bạn. Ngược lại, đọc được dấu hiệu căng/nản của đối thủ cho bạn lợi thế chọn chiến thuật. Giữ mặt trung tính và quan sát tinh là một kỹ năng — và trước hết nó phục vụ chính bạn.',
    body:[
      {h:'Vì sao "mặt lạnh" là lợi thế', p:'Lộ cảm xúc làm hai việc xấu cùng lúc: (1) TIẾP NĂNG LƯỢNG cho đối thủ — thấy bạn nao núng, tiếc nuối, cáu là họ được cổ vũ; (2) KHUẾCH ĐẠI cảm xúc của chính bạn — biểu lộ ra ngoài khiến nó "thật" hơn và khó nguôi hơn. Giữ trung tính làm dịu cả hai.'},
      {h:'Trung tính, không phải vô hồn', p:'Không cần diễn "lạnh như băng" hay che giấu gồng gượng — chỉ cần đừng phản ứng thái quá: không đấm tay ăn mừng khi vào cú đẹp, không lắc đầu than trời khi trượt. Một trạng thái đều đều khiến đối thủ không đọc được bạn đang dẫn tinh thần hay đang sụp.'},
      {h:'Sau cú xấu: giấu, rồi buông', p:'Trượt cú dễ mà chửi thề, đập cơ, thở hắt bực bội là báo thẳng cho đối thủ biết bạn đang tilt. Nuốt phản ứng đó, chạy nghi thức reset, giữ mặt như không có gì xảy ra. Đối thủ mất một manh mối, còn bạn thì nguôi nhanh hơn vì không "diễn" lại cơn bực. (Xem "Sau lỗi & kiểm soát cảm xúc".)'},
      {h:'Sau cú đẹp: đừng ăn mừng lộ liễu', p:'Hả hê quá sớm vừa xui (chưa thắng đã mừng) vừa cho đối thủ lý do "máu" hơn để lật lại. Một cái gật nhẹ rồi quay về routine là đủ. Sát thủ thật đáng sợ vì bình thản, không vì biểu diễn cảm xúc. (Xem "Dứt điểm — bản năng sát thủ khi đang dẫn".)'},
      {h:'Đọc đối thủ: dấu hiệu CĂNG', p:'Quan sát: thở gấp hoặc nín thở trước cú, siết cơ, đánh vội cho xong, lặp đi lặp lại việc chỉnh cơ/chần chừ, ánh mắt liếc tỉ số hay khán giả, than thở lẩm bẩm. Đó là dấu họ đang vào vùng áp lực — lúc để bạn kiên nhẫn, chơi chắc và ép thêm cho họ tự hỏng.'},
      {h:'Đọc đối thủ: dấu hiệu NẢN / tuột đà', p:'Buông vai, thở dài, đánh nhanh bất cần, thôi làm routine, lẩm bẩm "thôi xong". Khi thấy vậy, siết chặt lối chơi chắc và đừng cho họ một cú xui để bám lại. Một ván sạch lúc này thường dập tắt luôn hy vọng của họ. (Xem "Đà & động lượng trận đấu".)'},
      {h:'Đọc để CHỌN chiến thuật, không để khinh địch', p:'Biết đối thủ đang căng thì đánh safety ép họ tự sai; biết họ yếu cú rút thì để lại thế buộc dùng đúng cú đó. Dùng thông tin để ra quyết định sắc hơn — nhưng đừng để nó sinh chủ quan. Đọc vị là để chơi khôn hơn, không phải để coi thường. Quan sát rời rạc trong một trận chỉ là mẩu tin; gom lại có hệ thống mới thành hồ sơ dùng được lần sau. (Xem "Đọc & khai thác thói quen đối thủ".)'},
      {h:'Đừng để bị đọc ngược', p:'Đối thủ cũng đang đọc bạn. Che những thói quen lộ tẩy: giữ nhịp đánh không đổi dù đang thắng hay thua, đừng nhìn chằm về nơi bạn định điều bi (lộ ý đồ safety), giữ ngôn ngữ cơ thể ổn định trước mọi tình huống. Bạn càng khó đoán, đối thủ càng phải tự đoán trong lo lắng. (Liên quan "Đối phó tiểu xảo tâm lý".)'},
      {h:'Ưu tiên: mặt lạnh cho MÌNH trước', p:'Mục đích số một của poker face không phải lừa đối thủ, mà là giữ CHÍNH BẠN ổn định. Ngay cả khi tập một mình hay không ai xem, phản ứng trung tính sau mỗi cú vẫn giúp bạn nguôi nhanh và giữ đầu lạnh. Đọc được đối thủ chỉ là phần thưởng thêm — nền tảng vẫn là làm chủ cảm xúc của mình.'},
    ]},
  {key:'psy_breath', tag:'Tâm lý', title:'Hơi thở & điều tiết hưng phấn',
    intro:'Hơi thở là cần gạt DUY NHẤT bạn điều khiển được trực tiếp để chỉnh trạng thái thần kinh. Gần như mọi bài tâm lý đều mượn nó — bài này đi sâu: hiểu "vùng vàng" của hưng phấn và dùng hơi thở kéo mình về đó, dù đang quá căng hay đang quá nguội.',
    body:[
      {h:'"Vùng vàng" của hưng phấn', p:'Có một mức kích thích tối ưu: THẤP quá thì uể oải, lơ đãng, thiếu sắc bén; CAO quá thì tim đập nhanh, cơ cứng, tầm nhìn hẹp, tay vội. Đánh hay nhất ở khoảng GIỮA. Việc của hơi thở là kéo bạn về khoảng giữa đó — từ cả hai phía, không chỉ để "bình tĩnh lại".'},
      {h:'Vì sao thở RA dài là cái phanh', p:'Hít vào kích hoạt hệ "ga" (giao cảm, tăng nhịp tim); thở ra kích hoạt hệ "phanh" (phó giao cảm, hạ nhịp tim). Nên khi quá căng, kéo dài hơi THỞ RA. Quy tắc gọn: thở ra dài gấp đôi hít vào (hít 4 — thở ra 6–8). Chỉ 2–3 hơi là nhịp tim đã dịu rõ rệt.'},
      {h:'Khi đang CĂNG (trên vùng vàng)', p:'Dấu hiệu: nín thở lúc ngắm, tim đập nhanh, tay siết cơ, đánh vội. Chữa: đứng thẳng, 2–3 hơi thở ra thật dài, buông vai – thả hàm – xoè rồi nắm lại tay cầm cho mềm — TRƯỚC khi cúi xuống. Đây chính là chuỗi của nút ⟳ Reset (thở) trong app.'},
      {h:'Khi đang NGUỘI (dưới vùng vàng)', p:'Dấu hiệu: lơ đãng, đánh cho có, thiếu hứng — hay gặp lúc dẫn đậm, trận dài, hoặc cuối ngày. Chữa: vài hơi thở nhanh và mạnh hơn, đi lại, siết–thả bàn tay, một câu neo để "bật" lại sự sắc bén. Hơi thở kéo bạn LÊN chứ không chỉ kéo xuống — điều tiết là hai chiều.'},
      {h:'Thở TRƯỚC khi cúi, không phải khi đã vào bộ', p:'Điều tiết trạng thái là việc làm lúc còn đứng sau bàn. Nếu đã vào bộ mà còn phải "trấn tĩnh" thì đã muộn — đứng dậy, thở, làm lại. Vào bộ chỉ để ngắm và bắn. Đặt hơi thở đúng chỗ trong quy trình mới có tác dụng.'},
      {h:'Thở như một phần của routine', p:'Gắn MỘT hơi thở ra cố định vào pre-shot routine (vd: đứng sau bàn → một hơi thở ra dài → mới cúi). Lặp mỗi cú để nó thành mỏ neo tự động, thay vì thứ chỉ nhớ ra lúc đã khủng hoảng. Routine có hơi thở là routine tự trấn an. (Xem "Tập trung & ở hiện tại".)'},
      {h:'Nhịp thở giữa các cú & giữa ván', p:'Đừng chỉ thở khi căng. Giữa các cú và giữa các ván, vài hơi thở đều giúp "sạc" lại tập trung và giữ nhịp tim ổn định suốt trận — tránh kiểu nín thở dồn căng thẳng cả trận rồi vỡ ở ván cuối. (Xem "Sức bền tâm lý cho trận dài".)'},
      {h:'Tập thở NGOÀI bàn', p:'Luyện lúc không đánh để lúc đánh dùng được ngay: mỗi ngày vài phút thở 4–6 (hít 4, thở ra 6), hoặc thở hộp (4–4–4–4: hít 4 – giữ 4 – thở 4 – giữ 4). Hệ thần kinh quen rồi thì trong trận chỉ cần một hơi là về vùng vàng. (Kết hợp tab Nhịp và Tâm & Thân.)'},
      {h:'Đừng biến hơi thở thành áp lực mới', p:'Mục đích là thả lỏng, không phải "phải thở cho đúng kỹ thuật". Nếu đếm nhịp làm bạn căng thêm thì bỏ đếm — chỉ cần một hơi thở ra dài và buông vai là đủ. Đơn giản mà làm ĐỀU quan trọng hơn cầu kỳ mà làm rối.'},
    ]},
  {key:'psy_selftalk', tag:'Tâm lý', title:'Lời tự nhủ & từ khoá neo (self-talk)',
    intro:'Giọng nói trong đầu bạn là huấn luyện viên hoặc kẻ phá hoại — cả ngày nó bình luận từng cú. Bạn không tắt được nó, nhưng CHỌN được nó nói gì và nói thế nào. Xây một bộ "câu neo" của riêng mình là cách biến giọng nói đó thành đồng minh thay vì kẻ dìm bạn.',
    body:[
      {h:'Giọng nói trong đầu định hướng tay', p:'Lời tự nhủ không vô hại — nó lái chú ý và cả cơ thể. "Kiểu gì cũng trượt" khiến cơ thể ngầm chuẩn bị cho trượt. Đây là một công cụ mạnh nhưng hay bị bỏ mặc cho chạy tự phát; dùng nó có ý thức thì nó làm việc CHO bạn.'},
      {h:'Não khó xử lý câu PHỦ ĐỊNH', p:'"Đừng đánh xuống lỗ" khiến tâm trí bám vào hình ảnh "xuống lỗ". Luôn đổi sang điều CẦN LÀM: "đánh tâm, dừng bi cái", "đưa cơ thẳng". Nói với bản thân cái bạn MUỐN xảy ra, không phải cái bạn sợ. (Xem thêm "Thấy cú thành công" trong "Hình dung & diễn tập trong đầu".)'},
      {h:'Từ phán xét sang hướng dẫn', p:'"Sao ngu thế", "lại hỏng rồi" là phán xét — chỉ khoét sâu và làm cứng tay. Đổi sang hướng dẫn hành động: "chậm lại", "ngắm rõ điểm chạm", "một hơi thở". Huấn luyện viên giỏi chỉ ra việc cần làm tiếp theo, không đứng mắng học trò giữa trận.'},
      {h:'Ngắn, hiện tại, cụ thể', p:'Lúc đánh không có chỗ cho diễn văn. Một–hai TỪ KHOÁ cho mỗi cú là đủ: "chạm", "thẳng", "giữ yên", "mượt". Từ khoá gọn dẫn dắt động tác mà không kéo cái đầu vào phân tích lan man — càng nói dài càng dễ "vừa nghĩ vừa bắn".'},
      {h:'Xây bộ câu neo của RIÊNG bạn', p:'Mỗi người hợp một kiểu chữ khác nhau. Tự soạn vài câu cho các tình huống hay gặp:\n• Trước cú quan trọng: "chỉ là một cú như bao cú."\n• Khi tay run: "cầm lỏng, đưa mượt."\n• Sau lỗi: "xong rồi, cú tiếp theo."\n• Khi vội: "chậm lại — chắc chưa?"\n• Khi đang dẫn: "cú này như đang hoà."\nChọn chữ CỦA BẠN — câu nào bật lên mà thấy dịu ngay thì giữ.'},
      {h:'Một từ khoá cho cú đánh (cue word)', p:'Chọn MỘT từ tóm cả cảm giác cú đánh tốt của bạn — "mượt", "xuyên", "nhẹ" — và nói thầm đúng nó ở nhịp cuối trước khi bắn. Nó gom sự chú ý vào một điểm và chặn cái đầu phân tích chen vào đúng khoảnh khắc thực hiện. (Xem "Buông tay & tin cú đánh".)'},
      {h:'Tự nhủ bằng SỰ THẬT khi mất tự tin', p:'Chống lại "hôm nay tay mình hỏng rồi" bằng bằng chứng thật: "mình đã đánh cú này vào hàng trăm lần." Không phải hô khẩu hiệu sáo rỗng ("mình là số một") — mà nhắc lại điều CÓ THẬT để cân lại giọng nói tiêu cực. Sự thật đáng tin hơn lời động viên rỗng.'},
      {h:'Gọi tên trạng thái để tháo ngòi', p:'Khi nhận ra mình đang tilt, đang mất tập trung, hay đang tính tỉ số — chỉ cần dán nhãn thầm: "đang tilt", "đang nghĩ tỉ số". Gọi tên được cảm xúc là đã giảm một nửa sức mạnh của nó và tự động kéo bạn về hiện tại. Cái gì gọi được tên thì bớt điều khiển được bạn.'},
      {h:'Tập tới mức tự bật', p:'Viết bộ câu neo ra (ghi vào Nhật ký), đọc lại trước buổi tập, dùng có ý thức trong vài tuần. Dần dần đúng câu sẽ TỰ bật lên đúng lúc mà không cần cố nhớ — giọng nói bên trong đã được huấn luyện lại thành đồng minh. Như mọi kỹ năng, nó thành phản xạ nhờ lặp.'},
    ]},
  {key:'psy_slump', tag:'Tâm lý', title:'Thoát khỏi giai đoạn sa sút kéo dài (slump)',
    intro:'Khác với vài cú trượt trong một trận, "slump" là chuỗi ngày, tuần, thậm chí tháng phong độ tụt không rõ lý do: cú từng dễ bỗng hỏng, mất tự tin, càng cố càng tệ. Ai chơi lâu cũng gặp. Đây là hiện tượng có quy luật và CÓ đường ra — hoảng loạn chỉ kéo dài nó.',
    body:[
      {h:'Slump là bình thường, không phải "hết thời"', p:'Mọi cơ thủ, kể cả đỉnh cao, đều có giai đoạn tụt. Nó thường là một phần của đường cong tiến bộ — cơ thể "sắp xếp lại" trước khi lên nấc mới nên tạm khựng. Diễn giải nó thành "mình xong rồi" mới chính là thứ biến một khựng tạm thời thành slump dài.'},
      {h:'Chẩn đoán trước: THỂ CHẤT, KỸ THUẬT hay TÂM LÝ', p:'Trước khi sửa, tìm đúng bệnh. Có phải mệt, thiếu ngủ, stress cuộc sống đang kéo phong độ? Hay một lỗi kỹ thuật nhỏ mới nhiễm (tư thế, nhịp, grip)? Hay chỉ là mất niềm tin thuần tâm lý? Ba loại cần ba loại thuốc khác nhau — sửa nhầm chỗ càng làm rối thêm.'},
      {h:'Vòng xoáy tự nuôi', p:'Trượt → lo → soi động tác quá mức → gồng, đánh gượng → trượt tiếp → "bằng chứng" củng cố nỗi lo. Bẫy lớn nhất của slump là bạn bắt đầu "sửa" cả những thứ vốn KHÔNG hỏng, làm hỏng luôn cái đang chạy tốt. Nhận ra vòng xoáy này đã là nửa đường thoát ra.'},
      {h:'Về lại NỀN TẢNG', p:'Bỏ cú khó, bỏ tham vọng. Quay về những cú đơn giản nhất — cú thẳng ngắn, cú dừng — đánh vào để nghe lại cảm giác "bi rơi lỗ". Xây lại niềm tin bằng hàng loạt chiến thắng nhỏ, như đổ lại móng trước khi xây tiếp. Đừng cố đánh khó để "chứng minh mình chưa mất nghề".'},
      {h:'Giảm kỳ vọng, đổi thước đo', p:'Trong slump, đừng chấm mình bằng thắng–thua hay tỉ lệ vào bi. Đổi sang mục tiêu quá trình kiểm soát được: "làm đủ routine mỗi cú", "cầm cơ lỏng", "một hơi thở trước cú". Bỏ được áp lực kết quả thường tự tháo phần lớn slump có gốc tâm lý. (Xem "Đặt mục tiêu đúng cách".)'},
      {h:'Đừng đại tu toàn bộ', p:'Hoảng lên mà thay tư thế, thay cơ, thay grip, đổi tất cả cùng lúc là cách chắc chắn kéo dài slump — bạn mất luôn cả cái nền vốn ổn. Nếu nghi lỗi kỹ thuật, đổi MỘT thứ, cho nó thời gian, quan sát kết quả. Kiên nhẫn với một thay đổi hơn là loạn xạ nhiều thứ một lúc.'},
      {h:'Bớt cường độ, đừng bỏ hẳn', p:'Nghỉ vài buổi cho đầu nhẹ thì tốt, nhưng nghỉ dài trong sợ hãi khiến lần trở lại càng nặng nề. Duy trì tập nhẹ, ít áp lực, và tìm lại NIỀM VUI đánh bi thay vì biến mỗi buổi thành một kỳ thi. Đổi thể thức, rủ bạn đánh vui, đổi quán cho mới mẻ cũng giúp phá vòng xoáy.'},
      {h:'Nhờ con mắt ngoài', p:'Trong slump, bạn vừa khó tự nhìn ra lỗi thật, vừa dễ tưởng tượng ra lỗi không hề có. Nhờ người giỏi hơn xem, hoặc tự quay video: thường vấn đề nhỏ hơn bạn sợ rất nhiều. Một góc nhìn khách quan cắt được vòng xoáy tự soi mà bản thân bạn không tự cắt nổi.'},
      {h:'Tin vào đường dài', p:'Slump nào rồi cũng qua nếu bạn không bỏ cuộc giữa chừng. Đồ thị phong độ đi lên theo bậc thang — luôn có đoạn phẳng và đoạn tụt trước mỗi nấc mới. Ghi lại quá trình (Nhật ký) để thấy mình từng qua slump trước và sẽ qua lần này. Kiên trì qua khúc xám chính là thứ tách người trụ lại khỏi người bỏ cuộc.'},
    ]},
  {key:'psy_goals', tag:'Tâm lý', title:'Đặt mục tiêu đúng cách',
    intro:'Mục tiêu mơ hồ ("chơi giỏi hơn") không dẫn đường; mục tiêu sai loại ("phải lên hạng tháng này") chỉ tạo áp lực. Đặt mục tiêu đúng biến khát vọng thành lộ trình cụ thể, và biến áp lực kết quả thành động lực quá trình mà bạn kiểm soát được mỗi ngày.',
    body:[
      {h:'Ba tầng mục tiêu', p:'Phân biệt rõ:\n• Mục tiêu MƠ ƯỚC (dài hạn, truyền cảm hứng: "lên hạng A", "vô địch giải CLB").\n• Mục tiêu THÀNH TÍCH (trung hạn, đo được: "tỉ lệ vào bi 80%", "thắng 6/10 kèo").\n• Mục tiêu QUÁ TRÌNH (việc làm hằng ngày, kiểm soát 100%: "tập 4 buổi/tuần", "routine đủ mỗi cú").\nCả ba đều cần — nhưng khi THI ĐẤU, chỉ ôm mục tiêu quá trình.'},
      {h:'Thi đấu phải nghĩ QUÁ TRÌNH, không nghĩ KẾT QUẢ', p:'Kết quả (thắng/thua, lên hạng) không nằm trong tầm kiểm soát trực tiếp và nằm ở tương lai — ôm nó lúc đánh chỉ tạo lo. Mục tiêu quá trình thì kiểm soát được ngay bây giờ. Nghịch lý quen thuộc: càng buông kết quả và lo cho quá trình, kết quả càng tới. (Xem "Ám ảnh tỉ số" trong "Tập trung & ở hiện tại".)'},
      {h:'Mục tiêu tốt thì CỤ THỂ & ĐO ĐƯỢC', p:'"Chơi tốt hơn" không dẫn đường. "500 cú rút tuần này", "giữ routine đủ trên 90% số cú" thì đo được — biết đã đạt hay chưa, và thấy rõ tiến bộ. Đo được thì tiến bộ THẤY được, và thấy tiến bộ lại nuôi động lực để đi tiếp.'},
      {h:'Thách thức vừa tầm', p:'Mục tiêu quá dễ thì chán, quá xa thì nản rồi bỏ. Đặt ở mức phải với tay mới tới. Chia mục tiêu lớn thành cột mốc nhỏ hằng tuần để mỗi tuần có một chiến thắng cụ thể — chuỗi thắng nhỏ giữ lửa cho một chặng đường dài.'},
      {h:'Gắn mục tiêu với ĐIỂM YẾU', p:'Mục tiêu nên kéo bạn vào chỗ khó chịu — cú hay hỏng, tình huống hay sụp tâm lý — không phải lặp lại cái đã giỏi cho sướng tay. Đó mới là nơi điểm số thật sự lớn lên. Dành phần lớn mục tiêu tập cho điểm yếu, dù nó nhàm và bực. (Xem "Động lực & kỷ luật tập luyện".)'},
      {h:'Viết ra & theo dõi', p:'Mục tiêu trong đầu dễ trôi. Ghi ra (dùng tab Nhật ký và mục Bài tập của app), chấm điểm định kỳ, điều chỉnh. Việc theo dõi biến mục tiêu từ một mong muốn mơ hồ thành một hệ thống có phản hồi — bạn thấy được mình đang đi tới đâu.'},
      {h:'Kỳ vọng thực tế: tiến bộ không tuyến tính', p:'Sẽ có tuần chững, có tuần như tụt lùi. Đừng đặt mục tiêu kiểu "tháng nào cũng phải lên hạng" rồi bỏ cuộc khi gặp đoạn chững (nó luôn có). Tin vào tích luỹ: gạch xây tường, không phải phép màu một đêm. (Xem "Thoát khỏi giai đoạn sa sút kéo dài".)'},
      {h:'Xem lại & điều chỉnh định kỳ', p:'Mục tiêu không phải khắc đá. Mỗi vài tuần soi lại: đạt chưa, còn hợp không, cần nâng hay hạ? Đạt rồi thì đặt mốc mới; mãi không đạt thì có thể mốc quá xa hoặc sai trọng tâm. Mục tiêu là la bàn — chỉnh nó theo đường đi thực tế của bạn.'},
      {h:'Mục tiêu phục vụ bạn, không hành bạn', p:'Nếu mục tiêu chỉ tạo áp lực và giết niềm vui thì đã đặt sai — thường vì quá nặng kết quả. Mục tiêu tốt làm mỗi buổi tập rõ ràng hơn và mỗi tiến bộ nhỏ đáng ăn mừng hơn. Giữ cân bằng giữa tham vọng và niềm vui chơi bi. (Xem "Tránh kiệt sức & giữ lửa lâu dài".)'},
    ]},
  {key:'psy_burnout', tag:'Tâm lý', title:'Tránh kiệt sức & giữ lửa lâu dài (burnout)',
    intro:'Đam mê quá mức, tập quá tải, hoặc biến mỗi buổi chơi thành áp lực thành–bại lâu ngày sẽ "cháy": mất hứng, chán bàn bi, đánh đâu hỏng đó, thậm chí muốn bỏ. Burnout không phải lười — nó là tín hiệu cạn pin. Đi đường dài với bi-a cần giữ LỬA, không chỉ cần kỷ luật.',
    body:[
      {h:'Nhận biết dấu hiệu cháy', p:'Mất hứng thú với thứ từng yêu, thấy tập luyện là gánh nặng chứ không phải niềm vui, cáu bẳn, phong độ tụt kéo dài dù vẫn tập, ngại cầm cơ, kết quả kém làm hỏng tâm trạng cả ngày. Nhận ra SỚM để chỉnh, đừng đợi tới lúc chỉ muốn bỏ hẳn mới biết mình đã cháy.'},
      {h:'Vì sao dân đam mê dễ cháy', p:'Nghịch lý: càng yêu và càng nghiêm túc càng dễ cháy — vì dồn quá nhiều, kỳ vọng quá cao, và gắn giá trị bản thân vào kết quả. Cường độ cao mà không có phục hồi = cạn kiệt. Lửa lớn nhưng không biết giữ thì cháy nhanh hơn lửa vừa.'},
      {h:'Nghỉ CHỦ ĐỘNG là một phần của tập luyện', p:'Đầu và cơ thể cần phục hồi để tiến bộ, y như cơ bắp cần ngày nghỉ. Nghỉ vài ngày, đôi khi một–hai tuần, không phải lười biếng — nó cho hệ thần kinh "sắp xếp lại" và làm bạn NHỚ bàn bi. Trở lại sau khoảng nghỉ đúng lúc thường tươi và sắc hơn.'},
      {h:'Tách giá trị bản thân khỏi kết quả', p:'Nếu mỗi trận thua là một vết vào lòng tự trọng thì áp lực tích tụ tất yếu dẫn tới cháy. Bạn là người chơi bi, không phải cái tỉ số. Chơi vì bạn yêu nó và vì nó rèn bạn, không phải để chứng minh giá trị con người mình. (Xem "Vượt qua thất bại & lì đòn".)'},
      {h:'Giữ lửa: chơi CHO VUI xen kẽ', p:'Không phải buổi nào cũng là tập nghiêm túc hay kèo căng. Thỉnh thoảng đánh vô tư, thử thể thức lạ, chơi với người hợp gu, đánh vài cú cho đẹp mắt. Niềm vui nguyên thuỷ của trò chơi là nhiên liệu — đừng để kỷ luật đốt sạch chính thứ đã kéo bạn đến với bi-a.'},
      {h:'Đa dạng để không nhàm', p:'Lặp mãi một kiểu tập dễ chán và dễ cháy. Đổi bài, đổi mục tiêu, đổi quán, đổi đối thủ, xem cơ thủ giỏi lấy cảm hứng, đặt một giải nhỏ làm mốc để mong chờ. Cái mới mẻ giữ cho não hứng thú — và não hứng thú thì học nhanh hơn.'},
      {h:'Cân bằng với phần đời còn lại', p:'Bi-a lành mạnh khi nó là MỘT phần của cuộc sống, không nuốt chửng nó. Giữ ngủ đủ, quan hệ, công việc, sức khoẻ ổn định — nền tảng đời sống vững thì mới chơi bền và chơi vui. Đánh bi thâu đêm, bỏ bê mọi thứ khác là con đường ngắn nhất tới cháy.'},
      {h:'Kỷ luật VÀ niềm vui, không phải chọn một', p:'Kỷ luật đưa bạn qua ngày xám không có hứng; niềm vui khiến cả hành trình đáng đi. Người đi đường dài cần cả hai: đủ kỷ luật để không bỏ khi chán, đủ niềm vui để không cháy khi ép. Mất một trong hai thì sớm muộn cũng dừng lại. (Xem "Động lực & kỷ luật tập luyện".)'},
      {h:'Nếu đã cháy: hạ tải, đừng bỏ hẳn', p:'Đừng ra quyết định lớn ("bỏ bi-a") lúc đang cháy — đó là tiếng nói của kiệt sức, không phải của bạn. Hạ cường độ, chơi nhẹ không mục tiêu, hoặc nghỉ hẳn một thời gian rồi để nỗi nhớ tự quay lại. Ngọn lửa nguội gần như luôn bùng lại khi được cho một khoảng thở đủ dài.'},
    ]},
  {key:'psy_consistency', tag:'Tâm lý', title:'Độ ổn định (consistency) — nâng SÀN chứ không nâng đỉnh (bài dẫn nhập)',
    intro:'Ai chơi vài năm cũng từng có buổi đánh như lên đồng, rồi tuần sau không vào nổi bi dễ. Cảm giác lúc đó là mình vừa mất trình — nhưng trình không bốc hơi trong bảy ngày. Cái dao động là PHONG ĐỘ, và biên độ dao động đó chính là thứ phân biệt người chơi hay với người chơi giỏi. Bốn bài của chủ đề này bàn về việc thu hẹp nó lại.',
    body:[
      {h:'Trình thật của bạn là mức ở ngày TỆ NHẤT', p:'Buổi đỉnh cao nói cho bạn biết bạn CÓ THỂ đánh tới đâu, còn buổi tệ nhất nói bạn THƯỜNG đánh tới đâu. Trong một giải kéo dài cả ngày, gần như chắc chắn bạn sẽ phải chơi vài trận ở gần mức sàn. Người vô địch không phải người có đỉnh cao nhất mà là người có sàn cao nhất.'},
      {h:'Đỉnh cao là cái bẫy dễ chịu', p:'Nhớ về buổi đánh hay nhất khiến bạn tin mình đã ở mức đó, rồi mọi buổi bình thường thành thất vọng. Tệ hơn, nó khiến bạn đi tìm lại CẢM GIÁC hôm đó thay vì làm lại QUY TRÌNH hôm đó. Đuổi theo cảm giác là cách chắc chắn để phong độ dao động mạnh hơn nữa.'},
      {h:'Sáu nguồn gây dao động', p:'(i) Kỹ thuật chưa cố định — cùng cú mà mỗi lần một kiểu. (ii) Quy trình bị rút bớt lúc dễ hoặc lúc căng. (iii) Cảm xúc sau lỗi. (iv) Thể trạng: ngủ, ăn, mệt. (v) Môi trường: bàn lạ, nỉ nhanh chậm, ánh sáng. (vi) Nhịp bị đối thủ kéo. Năm trong sáu thứ đó bạn kiểm soát được.'},
      {h:'Ổn định là KỸ NĂNG, không phải tính cách', p:'Không ai sinh ra đã đánh đều. Nó được xây bằng ba thứ có thể tập: một quy trình vào cú giống hệt nhau ở mọi cú, một kỹ thuật đã được đo và hiệu chỉnh, và một kế hoạch cho ngày không có cảm giác. Cả ba đều nằm ngoài chuyện tài năng. (Xem "Quy trình vào cú" và "Tự hiệu chỉnh".)'},
      {h:'Đo bằng khoảng cách, không bằng đỉnh', p:'Chỉ số đáng theo dõi không phải điểm cao nhất mà là KHOẢNG CÁCH giữa buổi tốt nhất và buổi tệ nhất trong mười buổi gần đây. Khoảng đó hẹp lại nghĩa là bạn đang lên trình thật, kể cả khi đỉnh không đổi.'},
      {h:'Ổn định trước, tốc độ tiến bộ sau', p:'Kỹ thuật mới chỉ dính khi nền cũ đã đều — học thêm chiêu trên một nền dao động chỉ làm dao động rộng thêm. Thứ tự đúng là: làm cho cái đang có lặp lại được, rồi mới thêm cái mới. Đây cũng là lý do người tập lâu mà không lên hay mắc kẹt.'},
      {h:'Chín bài còn lại của chủ đề', p:'Ba bài về hành vi tại bàn: Nâng sàn phong độ · Mọi cú như nhau · Ổn định của quyết định. Một bài về phép đo: Đo độ ổn định của chính mình. Hai bài về điều kiện bên ngoài: Đầu vào đều thì đầu ra mới đều · Bàn lạ, quán lạ. Ba bài về quãng dài: Ngưỡng ĐỦ TỐT · Chọn một thể loại mà chín · Trở lại sau kỳ nghỉ dài. Đọc theo thứ tự đó.'},
    ]},
  {key:'psy_floor', tag:'Tâm lý', title:'Nâng sàn phong độ — ngày không có cảm giác vẫn phải đánh được',
    intro:'Sẽ có những ngày tay không có, mắt không nét, bi dễ cũng trượt. Ngày đó không tránh được — nhưng mức bạn đánh được trong ngày đó thì nâng lên được. Đây là bài về việc chuẩn bị sẵn một lối chơi dự phòng, thay vì mỗi lần gặp ngày xấu lại loay hoay tự phá thêm.',
    body:[
      {h:'Đừng đi tìm lại cảm giác giữa trận', p:'Phản xạ tự nhiên khi thấy tay không có là thử đủ thứ để lấy lại cảm giác: đổi cách cầm, đổi thế đứng, đổi lực, đánh mạnh lên cho bõ. Mỗi thay đổi lại thêm một biến số, và buổi đang dở thành buổi hỏng hẳn. Ngày xấu là ngày cần ÍT thay đổi nhất.'},
      {h:'Có sẵn một chế độ dự phòng', p:'Quyết trước, lúc đầu óc còn tỉnh táo, rằng ngày không có cảm giác sẽ chơi thế nào: lực nhỏ hơn một bậc, đường bi cái ngắn nhất có thể, bỏ hết cú biểu diễn, tăng tỉ lệ safety, chọn cú chắc thay vì cú đẹp. Có sẵn chế độ này thì bạn chuyển sang được trong hai phút thay vì mất ba ván để chấp nhận.'},
      {h:'Quy trình là thứ cuối cùng được phép bỏ', p:'Đúng lúc mọi thứ trục trặc thì routine lại là thứ đầu tiên bị rút bớt — và đó là lúc nó cần nhất. Ngày xấu hãy làm quy trình vào cú CHẬM và ĐỦ hơn ngày thường. Nó là cái neo duy nhất còn giữ được khi cảm giác đã đi mất.'},
      {h:'Hạ mục tiêu, đừng hạ nỗ lực', p:'Ngày sàn không phải ngày để đòi chơi hay. Đổi mục tiêu sang thứ đo được và vẫn nắm được: không phạm lỗi, không tặng bàn, làm đủ routine mọi cú. Giữ nguyên 100% công lực cho từng cú, chỉ hạ tham vọng của từng quyết định. (Xem "Chơi 100% công lực".)'},
      {h:'Tách "hôm nay tay không có" khỏi "mình kém"', p:'Hai câu đó nghe giống nhau nhưng dẫn tới hai buổi hoàn toàn khác. Câu đầu là một trạng thái nhất thời, xử lý được bằng chế độ dự phòng. Câu sau là một phán xét về con người bạn, và nó sẽ làm hỏng nốt phần còn lại của buổi. (Xem "Vượt qua thất bại & lì đòn".)'},
      {h:'Kiểm mấy thứ vật lý trước khi kết luận', p:'Trước khi tin là mình mất phong độ, kiểm nhanh: ngủ đủ không, ăn cách đây bao lâu, có đang mất nước không, đầu cơ có lơ đủ không, bàn hôm nay nỉ nhanh hay chậm hơn quen. Rất nhiều "ngày xấu tâm lý" thực ra là ngày thiếu ngủ hoặc bàn lạ. (Xem "Chơi bi-a khi mệt" và "Nỉ, độ ẩm & tốc độ bàn".)'},
      {h:'Ngày xấu là ngày rèn giá trị nhất', p:'Chơi tốt lúc đang có cảm giác thì ai cũng làm được. Kỹ năng thật sự được xây đúng vào những buổi phải xoay xở với cái mình đang có. Mỗi lần bạn giữ được một buổi xấu không tuột dốc, cái sàn của bạn nhích lên một chút.'},
      {h:'Ghi lại để nhận ra khuôn mẫu', p:'Sau buổi dở, ghi ba dòng vào Nhật ký: hôm nay hỏng ở đâu, thể trạng thế nào, đã chuyển sang chế độ dự phòng chưa. Sau vài tháng bạn sẽ thấy ngày xấu của mình có khuôn mẫu rất rõ, và phần lớn có nguyên nhân đoán trước được. (Xem "Thoát khỏi giai đoạn sa sút kéo dài".)'},
    ]},
  {key:'psy_sameness', tag:'Tâm lý', title:'Mọi cú như nhau — nguồn dao động lớn nhất nằm ở chỗ bạn đối xử khác nhau',
    intro:'Nếu quay lại video của chính mình, bạn sẽ thấy ba con người khác nhau: một người đánh cú dễ, một người đánh cú khó, một người đánh cú quyết định. Ba người đó có tốc độ khác nhau, số nhịp đưa cơ khác nhau, thời gian đứng khác nhau. Chính sự khác nhau đó là nguồn dao động lớn nhất — và cũng là thứ sửa được nhanh nhất.',
    body:[
      {h:'Cú dễ bị rút bớt quy trình', p:'Thấy bi nằm ngay miệng lỗ, bạn cúi xuống luôn, đưa cơ hai nhịp rồi bắn. Phần lớn cú trượt gây tiếc nhất trong đời chơi của bất kỳ ai đều thuộc loại này. Không phải vì cú khó, mà vì đó là cú duy nhất bạn không làm đúng trình tự.'},
      {h:'Cú quan trọng bị thêm vào những thứ lạ', p:'Ở cú quyết định thì ngược lại: đứng lâu hơn, ngắm kỹ hơn, đưa cơ thêm mấy nhịp, siết tay chặt hơn một chút. Tất cả đều là thay đổi so với những cú đã tập hàng nghìn lần. Bạn đang đánh một cú chưa từng tập, đúng vào lúc quan trọng nhất. (Xem "Áp lực & khoảnh khắc căng".)'},
      {h:'Một cú = một quy trình, không phân loại', p:'Nguyên tắc gốc: từ lúc quyết xong phương án tới lúc bắn, mọi cú phải giống hệt nhau — cùng số bước, cùng số nhịp đưa cơ, cùng khoảng thời gian, cùng độ chặt tay. Cú dễ nhất và cú ăn cả trận phải trông như nhau từ bên ngoài. Đó là toàn bộ định nghĩa của ổn định. (Xem "Quy trình vào cú".)'},
      {h:'Tách phần NGHĨ ra khỏi phần LÀM', p:'Mọi tính toán — chọn lỗ, chọn lực, chọn điểm chạm, chọn vùng bi cái — làm xong khi còn ĐỨNG. Cúi xuống là chỉ còn thực thi. Người dao động mạnh thường là người vẫn đang nghĩ lúc đã ở tư thế bắn, nên mỗi cú lại có một trạng thái đầu khác nhau. (Xem "Buông tay & tin cú đánh".)'},
      {h:'Số nhịp đưa cơ là chỉ báo dễ đo nhất', p:'Chọn một con số cố định, thường là hai tới bốn nhịp, rồi giữ đúng con số đó ở mọi cú. Chỉ riêng việc này đã lộ ra ngay lúc nào bạn đang vội và lúc nào bạn đang do dự — vì đó là hai lúc con số tự đổi mà bạn không hay.'},
      {h:'Đứng dậy khi thấy có gì lệch', p:'Cúi xuống rồi mà thấy phân vân, thấy đường ngắm không khớp, hay thấy tay siết — đứng dậy làm lại từ đầu. Bắn tiếp một cú đã lệch trình tự là chấp nhận một kết quả ngẫu nhiên. Đứng dậy tốn năm giây và giữ nguyên độ ổn định của cả buổi.'},
      {h:'Tự kiểm bằng video', p:'Quay hai phút một buổi tập, chọn ra một cú dễ, một cú khó và một cú áp lực rồi so ba đoạn. Chỗ khác nhau hiện ra rất rõ và thường làm bạn ngạc nhiên. Đây là phép đo trung thực hơn mọi cảm nhận, vì cảm nhận trong lúc đánh gần như luôn sai.'},
      {h:'Đều đặn nghe nhàm nhưng chính là đẳng cấp', p:'Người xem thích cú xoáy đẹp; bảng tỉ số thì thưởng cho người làm đúng một việc giống nhau hàng trăm lần. Chấp nhận rằng lối chơi ổn định trông tẻ nhạt là một bước trưởng thành — và nó cũng là lối chơi khiến đối thủ nản nhất. (Xem "Chơi 100% công lực".)'},
    ]},
  {key:'psy_varmeasure', tag:'Tâm lý', title:'Đo độ ổn định của chính mình',
    intro:'Cảm giác về phong độ nói dối rất nhiều: một cú trượt cuối buổi đủ khiến bạn nhớ cả buổi là dở, còn một cú đẹp đủ khiến bạn quên năm cú hỏng. Muốn thu hẹp dao động thì phải đo được nó. Ba con số dưới đây tự đo được, không cần thiết bị gì, và chúng nói thật.',
    body:[
      {h:'Vì sao trí nhớ không dùng được', p:'Bạn nhớ cú gây cảm xúc mạnh nhất, không nhớ cú điển hình nhất. Vì thế đánh giá phong độ bằng trí nhớ luôn lệch, và nó lệch theo hướng làm bạn sửa nhầm chỗ. Một cuốn sổ tầm thường vẫn chính xác hơn cảm nhận của một người chơi giỏi.'},
      {h:'Con số 1: tỉ lệ hỏng ở cú DỄ', p:'Đếm riêng những cú mà bạn tin chắc phải vào. Đây là chỉ báo ổn định nhạy nhất, vì cú khó hỏng thì có nhiều lý do, còn cú dễ hỏng gần như luôn là do quy trình bị rút bớt. Mục tiêu là kéo con số này xuống, không phải kéo tỉ lệ cú khó lên.'},
      {h:'Con số 2: biên độ giữa các buổi', p:'Chọn MỘT bài tập cố định và chấm nó ở mọi buổi. Ghi lại điểm cao nhất và thấp nhất trong mười buổi gần nhất — khoảng cách giữa hai số đó chính là độ dao động của bạn. Khoảng thu hẹp lại là bằng chứng lên trình rõ hơn cả điểm trung bình tăng.'},
      {h:'Con số 3: số lượt tự trả bàn', p:'Đếm số lần bạn mất lượt vì lỗi của chính mình chứ không vì đối thủ đánh hay. Con số này gộp cả kỹ thuật lẫn quyết định, và nó liên hệ thẳng với việc giữ quyền chủ động. (Xem "Giữ quyền chủ động".)'},
      {h:'Đo bằng bài CỐ ĐỊNH, đừng đổi bài mỗi buổi', p:'Đổi bài tập liên tục thì không so được buổi này với buổi kia, và bạn mất luôn khả năng biết mình có tiến bộ hay không. Giữ ít nhất một bài làm thước đo suốt nhiều tháng, các bài khác muốn đổi thì đổi. Dùng phần Rèn luyện của app để lưu điểm cho khỏi phụ thuộc trí nhớ.'},
      {h:'Nhìn đường trung bình, đừng nhìn từng điểm', p:'Một buổi tệ không nói lên gì cả; ba buổi tệ liên tiếp mới là tín hiệu. Xem xu hướng của trung bình vài buổi gần nhau thay vì phản ứng với từng buổi lẻ — phản ứng quá nhanh với nhiễu chính là cách người ta tự tạo ra giai đoạn sa sút. (Xem "Chấp nhận may rủi & cú xui".)'},
      {h:'Ghi ba lỗi lặp thay vì ghi tất cả', p:'Sổ ghi mọi thứ thì không ai đọc lại. Mỗi buổi chỉ ghi ba lỗi lặp lại nhiều nhất; sau bốn tuần nhìn lại, một hai lỗi sẽ nổi lên chiếm đa số. Đó là chỗ đáng tập, và cũng là chỗ trả về nhiều độ ổn định nhất cho mỗi giờ bỏ ra.'},
      {h:'Đặt mục tiêu theo độ ổn định, không theo đỉnh', p:'Thay vì đặt mục tiêu kiểu đánh được chuỗi bao nhiêu bi, hãy đặt mục tiêu kiểu giữ điểm bài chuẩn không tụt dưới một mức nào đó trong mười buổi liên tiếp. Mục tiêu dạng này ép bạn xây sàn, và cái sàn mới là thứ đi theo bạn vào giải. (Xem "Đặt mục tiêu đúng cách".)'},
    ]},
  {key:'psy_offtable', tag:'Tâm lý', title:'Đầu vào đều thì đầu ra mới đều — nhịp sinh hoạt ngoài bàn',
    intro:'Phần lớn những buổi "tự nhiên hôm nay đánh dở" không bắt đầu ở phòng bi-a, mà bắt đầu từ tối hôm trước. Bạn có thể tập quy trình vào cú giỏi tới đâu thì cơ thể mang tới bàn vẫn là cơ thể của hai mươi tư giờ vừa rồi. Bài này bàn về việc giữ cho đầu vào ít dao động, để đầu ra khỏi dao động theo.',
    body:[
      {h:'Phong độ hôm nay phần lớn được quyết từ hôm qua', p:'Thị lực chiều sâu, độ ổn định của tay và khả năng giữ chú ý đều tụt rất nhanh khi thiếu ngủ, và bạn không cảm nhận được mức tụt đó — chỉ thấy bi dễ tự nhiên trượt. Đây là lý do vì sao rất nhiều buổi bị quy oan cho tâm lý trong khi nguyên nhân đã nằm sẵn từ đêm trước. (Xem "Cơ thể quyết định bao nhiêu phần trăm khả năng thật được dùng".)'},
      {h:'Ba biến ngốn nhiều nhất', p:'Theo thứ tự ảnh hưởng: (i) tổng giờ ngủ và giờ đi ngủ, (ii) khoảng cách từ bữa ăn tới lúc vào bàn, (iii) lượng caffeine và thời điểm uống. Ba thứ này bạn quyết được hoàn toàn, và chúng giải thích phần lớn khoảng dao động giữa buổi tốt nhất với buổi tệ nhất. (Xem "Dinh dưỡng cho cơ thủ".)'},
      {h:'Mục tiêu là HẰNG SỐ, không phải tối ưu', p:'Không cần tìm chế độ ăn ngủ hoàn hảo. Cần một chế độ LẶP LẠI được: cùng khung giờ ngủ, cùng loại bữa ăn trước buổi chơi, cùng khoảng cách thời gian. Một chế độ tầm thường nhưng giống nhau mọi lần cho phong độ đều hơn hẳn một chế độ tốt nhưng mỗi hôm một kiểu.'},
      {h:'Giờ chơi cố định đáng giá hơn số giờ chơi', p:'Cơ thể học được nhịp: chơi đều vào một khung giờ thì tới khung đó bạn tỉnh táo hơn, tay ấm nhanh hơn, vào trạng thái nhanh hơn. Chơi lúc mười giờ sáng tuần này rồi mười một giờ đêm tuần sau là tự tạo ra hai người chơi khác nhau trong cùng một người.'},
      {h:'Bia rượu tính vào buổi HÔM SAU', p:'Ngay cả lượng nhỏ cũng làm giấc ngủ nông đi và làm cơ thể mất nước, nên phần lớn tác động rơi vào buổi chơi ngày kế tiếp chứ không phải buổi đang uống. Người chơi hay ngạc nhiên vì thấy hôm uống vẫn đánh được, rồi hôm sau tụt mà không hiểu vì sao.'},
      {h:'Nhật ký hai dòng là đủ để thấy khuôn mẫu', p:'Trước mỗi buổi ghi đúng hai thứ: đêm qua ngủ mấy tiếng, ăn cách đây bao lâu. Sau buổi chấm phong độ một tới năm. Sau chừng hai mươi buổi, quan hệ giữa hai cột hiện ra rõ hơn mọi lời khuyên chung chung, vì nó là số liệu của riêng cơ thể bạn.'},
      {h:'Ngày lệch nhịp thì khai báo trước, đừng phát hiện giữa chừng', p:'Biết mình ngủ năm tiếng thì quyết định chế độ chơi ngay từ trước khi cầm cơ: hôm nay là buổi giữ sàn, lực nhỏ hơn một bậc, bỏ cú mạo hiểm. Vào bàn với kỳ vọng đúng thì buổi đó vẫn dùng được; vào bàn với kỳ vọng ngày thường rồi mới vỡ mộng thì hỏng cả buổi. (Xem "Nâng sàn phong độ".)'},
      {h:'Ngoại lệ nên là kế hoạch, không nên là tai nạn', p:'Không ai giữ nhịp được một trăm phần trăm, và cũng không cần. Điều nên tránh là để ngoại lệ rơi đúng vào trước giải hoặc trước buổi tập quan trọng. Chọn trước những ngày cho phép mình lệch nhịp, rồi giữ sạch những ngày còn lại.'},
      {h:'Đừng đổ hết cho sinh hoạt', p:'Chiều ngược lại cũng có bẫy: sau vài lần nhận ra thiếu ngủ làm mình đánh dở, người ta bắt đầu dùng nó làm lời giải thích cho mọi buổi kém, và thôi tìm nguyên nhân kỹ thuật. Sinh hoạt là điều kiện nền, không phải toàn bộ câu trả lời. (Xem "Đo độ ổn định của chính mình".)'},
    ]},
  {key:'psy_awaytable', tag:'Tâm lý', title:'Bàn lạ, quán lạ — giữ mức khi mọi thứ quanh bạn đổi',
    intro:'Rất nhiều người đánh hay ở quán quen rồi tới quán khác là thành người khác hẳn. Cảm giác lúc đó là bàn này có vấn đề, hoặc tệ hơn, là mình chưa bao giờ giỏi thật. Cả hai kết luận đều sai, và bài này nói về cách đi qua vài chục phút đầu ở nơi lạ mà không tự phá buổi chơi.',
    body:[
      {h:'Bàn quen che giấu bao nhiêu thứ bạn đang bù trừ', p:'Chơi lâu ở một bàn thì bạn đã tự hiệu chỉnh cho đúng bàn đó mà không hay biết: lực quen, độ nảy băng quen, kích thước lỗ quen. Tới bàn khác, phần hiệu chỉnh đó thành sai số. Trình không đổi, chỉ có bảng hiệu chỉnh trong đầu là đang lệch.'},
      {h:'Tính trước vài chục phút học phí vào kế hoạch', p:'Ở bàn lạ, khoảng mười lăm tới ba mươi phút đầu gần như chắc chắn dưới mức thường ngày. Biết trước điều đó thì nó là chi phí đã dự trù; không biết trước thì nó thành bằng chứng cho câu hôm nay mình hỏng rồi, và câu đó mới là thứ phá buổi.'},
      {h:'Đo bàn, đừng phán xét bàn', p:'Câu bàn này ăn gian, lỗ này chặt quá, băng này chết đưa bạn vào thế đối đầu với một vật vô tri suốt cả buổi. Đổi sang việc đo: bàn này nhanh hơn hay chậm hơn bàn quen bao nhiêu, băng nảy hơn hay lì hơn. Đo xong là dùng được; phán xét xong thì vẫn không biết đánh thế nào. (Xem "Nỉ, độ ẩm & tốc độ bàn".)'},
      {h:'Đổi LỰC và đổi PHƯƠNG ÁN, tuyệt đối không đổi KỸ THUẬT', p:'Bàn lạ là lúc dễ sinh ý nghĩ chỉnh lại cách cầm cơ hay cách ngắm. Đó là sửa nhầm chỗ: cái đang lệch nằm ở thang lực và ở lựa chọn đường bi, chứ không nằm ở động tác. Giữ nguyên kỹ thuật là thứ duy nhất giữ được buổi đó khỏi rơi tự do. (Xem "Ngưỡng ĐỦ TỐT".)'},
      {h:'Thu hẹp kho cú trong nửa buổi đầu', p:'Ở nơi lạ, chọn đường bi cái ngắn nhất, ít băng nhất, ít xoáy nhất có thể. Càng nhiều băng và càng nhiều xoáy thì sai số của bảng hiệu chỉnh cũ càng bị nhân lên. Chơi tối giản một lúc rồi mở dần khi đã có số liệu về bàn. (Xem "Điều bi tối giản".)'},
      {h:'Cái lạ thật ra thường không nằm ở bàn', p:'Ánh sáng đổ bóng khác, độ cao bàn lệch vài phân, sàn trơn hơn, tiếng ồn khác, chỗ đứng chật hơn — mấy thứ này tác động lên tư thế và nhịp nhiều hơn cả mặt nỉ, nhưng lại không ai để ý vì chúng không thuộc về bi-a. Nhận ra chúng cũng đã đỡ được một nửa.'},
      {h:'Mang theo thứ không đổi được theo nơi chốn', p:'Quy trình vào cú, số nhịp đưa cơ, nhịp thở, câu tự nhủ, cây cơ và cục lơ của mình — đó là phần môi trường không chạm tới được. Ở nơi càng lạ thì càng phải bám chặt vào chúng, vì chúng là những hằng số duy nhất còn lại. (Xem "Chuẩn bị tâm lý trước trận".)'},
      {h:'Sân khách còn có thêm phần bị nhìn', p:'Ở quán lạ, người quen của đối thủ ngồi quanh và bạn là người ngoài. Cảm giác bị soi làm quy trình bị rút ngắn và nhịp bị đẩy nhanh lên, đúng lúc đang cần chậm để đo bàn. Tách rõ hai việc: cái lạ của bàn và cái lạ của người xem, xử lý riêng từng cái. (Xem "Tập trung khi có người xem".)'},
      {h:'Cách chữa gốc là chủ động tập ở nhiều bàn', p:'Người chỉ tập một bàn thì xây được đỉnh cao trên đúng bàn đó. Mỗi tháng chơi vài buổi ở bàn khác, cỡ lỗ khác, nỉ khác — mức tụt sẽ nhỏ dần và thời gian thích nghi ngắn lại. Đây là một trong những cách rẻ nhất để nâng sàn phong độ.'},
    ]},
  {key:'psy_decconsist', tag:'Tâm lý', title:'Ổn định của QUYẾT ĐỊNH — cùng thế bàn thì phải ra cùng cú',
    intro:'Nói tới phong độ đều, gần như ai cũng nghĩ tới tay: hôm nay vào bi, hôm qua thì không. Nhưng có một loại dao động thứ hai âm thầm hơn và tốn hơn nhiều: cùng một thế bàn, hôm nay bạn chọn tấn công, hôm sau bạn chọn thủ, mà chẳng phải vì thế bàn khác đi.',
    body:[
      {h:'Hai loại dao động, hầu hết chỉ chữa một', p:'Dao động THỰC THI là cùng một quyết định nhưng làm ra hai kết quả. Dao động QUYẾT ĐỊNH là cùng một thế bàn nhưng ra hai lựa chọn. Người chơi bỏ gần hết thời gian chữa loại đầu, trong khi loại sau thường gây thiệt hại lớn hơn vì nó làm hỏng cả ván chứ không chỉ một cú.'},
      {h:'Phép thử tự làm được', p:'Chụp lại năm thế bàn khó xử trong buổi chơi, đừng ghi mình đã chọn gì. Một tuần sau mở ra, quyết lại từng thế rồi so với lần trước. Số thế bạn chọn khác đi chính là thước đo độ trôi trong quyết định của bạn, và con số đó thường làm người ta bất ngờ.'},
      {h:'Bốn thứ hay kéo quyết định trôi', p:'(i) Tâm trạng: đang phấn khích thì thấy cú nào cũng khả thi. (ii) Tỉ số: đang dẫn thì rụt lại, đang thua thì liều. (iii) Đối thủ: gặp người mạnh thì tự nâng mức mạo hiểm. (iv) Cú vừa xong: vừa trượt một cú thì cú sau chọn khác hẳn. Không thứ nào trong bốn thứ đó nằm trên mặt bàn.'},
      {h:'Quyết theo LUẬT đặt trước, không theo cảm giác lúc đó', p:'Ổn định trong quyết định đến từ việc chuyển vài lựa chọn hay gặp thành luật viết sẵn, quyết một lần lúc đầu óc nguội. Vào trận thì tra luật thay vì cân nhắc lại từ đầu — vừa nhanh hơn, vừa không bị tỉ số và cảm xúc kéo. (Xem "Chơi theo xác suất".)'},
      {h:'Vài luật cá nhân đáng viết ra', p:'Ví dụ: bi cuối cùng chắn đường thì luôn thủ trước; cú cần ba băng để tới vị trí thì đổi phương án; tỉ lệ vào dưới một nửa mà bỏ lỡ là mất bàn thì không đánh; còn hai bi mà bi cái nằm khó thì ưu tiên đưa bi cái về vùng an toàn. Luật của bạn phải sinh ra từ nhật ký của chính bạn, không phải chép của người khác.'},
      {h:'Tách quyết định ĐÚNG khỏi kết quả TỐT', p:'Một quyết định đúng vẫn có thể cho kết quả xấu, và ngược lại. Sửa luật vì một lần thất bại đơn lẻ là cách chắc chắn nhất để luật không bao giờ ổn định. Chỉ đánh giá luật trên nhiều lần áp dụng, không đánh giá trên lần gần nhất. (Xem "Chấp nhận may rủi & cú xui".)'},
      {h:'Đổi luật giữa trận là dấu hiệu đang bị kéo', p:'Khi bạn thấy mình phá luật của chính mình, gần như luôn là do tỉ số hoặc do đối thủ, chứ không do bàn. Ghi nhận nó như một tín hiệu tâm lý, giữ nguyên luật tới hết trận. Đây cũng là một trong những cách đánh mất quyền chủ động phổ biến nhất. (Xem "Giữ quyền chủ động".)'},
      {h:'Rà luật sau buổi, không rà giữa buổi', p:'Chỗ để sửa luật là sau khi cất cơ, khi đã có sổ và đã hết cảm xúc. Ghi lại những thế bàn mình phân vân, quyết lại lúc nguội, rồi cập nhật luật cho lần sau. Giữa buổi thì chỉ thi hành.'},
      {h:'Quyết định ổn định làm kỹ thuật ổn định theo', p:'Khi phương án đã chốt nhanh và không lăn tăn, bạn cúi xuống với một cái đầu trống, đúng trạng thái mà quy trình vào cú cần. Người phân vân tới lúc đã ở tư thế bắn thì mỗi cú lại đánh với một trạng thái khác nhau. Hai loại ổn định này nuôi nhau. (Xem "Mọi cú như nhau".)'},
    ]},
  {key:'psy_layoff', tag:'Tâm lý', title:'Trở lại sau kỳ nghỉ dài — lấy lại mức cũ mà không phá thêm',
    intro:'Nghỉ vài tuần vì bận, vì ốm, vì đi công tác rồi quay lại bàn: cảm giác gần như luôn là mình đã mất hết. Phần lớn nỗi mất mát đó không có thật, nhưng cách người ta phản ứng với nó thì gây thiệt hại thật — và thường kéo dài lâu hơn cả kỳ nghỉ.',
    body:[
      {h:'Cái gì mất và cái gì không mất', p:'Động tác đã tập kỹ thuộc loại trí nhớ vận động, nó bền và không bốc hơi sau vài tuần. Thứ rơi trước là những phần cần hiệu chỉnh liên tục: thang lực, độ nhạy khi ngắm, khả năng đọc bàn nhanh, và sức bền khi cúi lâu. Đó là tin tốt, vì cả bốn thứ đó lấy lại nhanh hơn nhiều so với việc học lại động tác.'},
      {h:'Sai lầm số một là đo trình ngay buổi đầu', p:'Buổi đầu quay lại mà đem ra chấm điểm hay đem đi đánh độ thì con số nhận được là con số của một cơ thể chưa hiệu chỉnh, không phải trình của bạn. Tệ hơn, con số đó lại được dùng làm bằng chứng để kết luận là mình đã tụt, rồi sinh ra hàng loạt thay đổi không cần thiết.'},
      {h:'Ba buổi đầu là buổi hiệu chỉnh, không phải buổi thi', p:'Đặt trước mục tiêu cho ba buổi đó: lấy lại thang lực, lấy lại cảm giác đường ngắm, làm quen lại với việc cúi lâu. Không chấm điểm, không so với mức cũ, không mời kèo. Ba buổi này quyết định phần lớn việc bạn mất hai tuần hay mất hai tháng để về mức cũ.'},
      {h:'Lấy lại theo đúng thứ tự', p:'Tư thế và đường thẳng cơ thể trước, rồi tới lực, rồi tới ngắm, cuối cùng mới tới chạy hình cả ván. Nhảy thẳng vào chơi ván đầy đủ ngay buổi đầu thì mọi lỗi chồng lên nhau và bạn không biết cái nào đang hỏng. (Xem "Tự hiệu chỉnh".)'},
      {h:'Đừng lấy kỳ nghỉ làm dịp đổi kỹ thuật', p:'Ý nghĩ dù sao cũng đang mất cảm giác, nhân tiện sửa luôn cách cầm cơ nghe rất hợp lý và gần như luôn dẫn tới một giai đoạn sa sút dài. Bạn đang cộng một biến số mới vào đúng lúc chưa hiệu chỉnh xong các biến cũ. Về đúng mức cũ trước, muốn đổi thì đổi sau đó. (Xem "Ngưỡng ĐỦ TỐT".)'},
      {h:'Nghỉ ngắn đôi khi có lợi', p:'Vài ngày tới một tuần nghỉ thường làm mất một số thói quen xấu mới nhiễm và làm giảm mệt mỏi tích tụ, nên nhiều người quay lại thấy nhẹ tay hơn. Đừng mặc định mọi quãng nghỉ đều là thiệt hại, nhất là khi bạn vừa qua một giai đoạn chơi dày.'},
      {h:'Biết trước sẽ nghỉ thì có việc để làm', p:'Không có bàn thì vẫn giữ được phần lớn nền: diễn tập trong đầu, tập cú vung trước gương hoặc trên chai nước, giữ vai và core khoẻ, đọc lại sổ lỗi lặp. Vài phút mỗi ngày làm quãng hiệu chỉnh khi quay lại ngắn đi rõ rệt. (Xem "Hình dung & diễn tập trong đầu".)'},
      {h:'Đo lại bằng đúng bài chuẩn cũ', p:'Sau ba buổi hiệu chỉnh, chạy lại đúng bài tập mà bạn vẫn dùng làm thước đo, cùng luật chấm cũ. Đó là cách duy nhất trả lời được câu mình có thật sự tụt không, thay vì trả lời bằng cảm giác — và cảm giác sau kỳ nghỉ luôn bi quan hơn thực tế. (Xem "Đo độ ổn định của chính mình".)'},
      {h:'Đừng ép bù giờ', p:'Chơi liền năm tiếng trong buổi quay lại là cách nhanh nhất để đau vai, đau lưng và nhiễm thói xấu do mỏi. Cơ thể chưa quen lại với việc cúi bàn. Tăng dần thời lượng qua vài buổi thì tổng thời gian về mức cũ lại ngắn hơn.'},
    ]},
  {key:'psy_tinker', tag:'Tâm lý', title:'Ngưỡng ĐỦ TỐT — thôi chỉnh kỹ thuật liên tục',
    intro:'Có một kiểu người chơi tập rất chăm, đọc rất nhiều, xem rất kỹ, và không tiến bộ suốt nhiều năm. Không phải vì lười, mà vì mỗi tháng lại đang chơi bằng một kỹ thuật hơi khác. Bài này bàn về cái ngưỡng mà tại đó bạn phải ngừng sửa và bắt đầu tích luỹ số lần lặp.',
    body:[
      {h:'Chỉnh liên tục thì không bao giờ có nền', p:'Một động tác chỉ trở thành tự động sau rất nhiều lần lặp giống nhau. Cứ vài tuần lại đổi một chi tiết thì bộ đếm đó về không, và bạn vĩnh viễn ở giai đoạn phải nghĩ trong lúc đánh. Đây là lý do phổ biến nhất khiến người tập nhiều mà phong độ vẫn dao động rộng.'},
      {h:'Vì sao chỉnh lại gây nghiện', p:'Bất kỳ thay đổi nào cũng làm bạn chú ý hơn vào động tác, và sự chú ý đó tự nó cải thiện kết quả trong một hai buổi. Bạn tưởng thay đổi có tác dụng, trong khi cái có tác dụng chỉ là sự tập trung. Vài buổi sau hiệu ứng tan, bạn kết luận thay đổi này chưa đủ, rồi đi tìm thay đổi tiếp theo.'},
      {h:'Phân biệt hiệu chỉnh với đại tu', p:'Hiệu chỉnh là đo lại một sai số đã biết rồi bù trừ, ví dụ đo lại độ lệch của cây cơ. Đại tu là thay một thành phần của động tác, ví dụ đổi cách cầm cơ hay đổi hệ ngắm. Cái đầu nên làm định kỳ; cái sau chỉ nên làm vài lần trong đời chơi. Trộn lẫn hai việc này là gốc của phần lớn rắc rối. (Xem "Tự hiệu chỉnh".)'},
      {h:'Định nghĩa ĐỦ TỐT bằng số', p:'Ngưỡng phải là một con số, không phải một cảm giác: cú vung thẳng đủ để bắn bi qua chai với tỉ lệ nào đó, thang lực sai không quá một bậc, tỉ lệ hỏng ở cú dễ dưới một mức. Chạm ngưỡng thì khoá kỹ thuật lại và chuyển toàn bộ thời gian sang chạy hình, chiến thuật và số lần lặp.'},
      {h:'Một thay đổi tại một thời điểm, kèm một thời hạn', p:'Nếu đã quyết đổi thật thì chỉ đổi đúng một thứ, và ấn định trước thời hạn thử, thường là bốn tới sáu tuần, cùng phép đo dùng để phán quyết. Hết hạn thì hoặc giữ hẳn hoặc bỏ hẳn. Không có thời hạn thì thay đổi nào cũng sống lửng lơ mãi mãi.'},
      {h:'Cấm đổi kỹ thuật trong giai đoạn có giải', p:'Kỹ thuật mới luôn có một quãng tệ đi trước khi tốt lên, vì cái cũ đã bị phá mà cái mới chưa tự động. Đặt quãng đó vào trước giải là tự chọn thi đấu ở mức sàn thấp nhất của mình. Chọn mùa thấp điểm để đổi, và nói rõ với bản thân là mấy tuần đó không dùng để đánh giá trình.'},
      {h:'Đổi khi có bằng chứng, không đổi khi có cảm hứng', p:'Điều kiện tối thiểu để cân nhắc một thay đổi là một phép đo lặp lại nhiều buổi chỉ đúng một lỗi cụ thể. Xem một video hay, nghe một lời khuyên bên bàn, hoặc vừa có một buổi tệ đều không phải bằng chứng. Chúng chỉ là cơn ngứa tay. (Xem "Đo độ ổn định của chính mình".)'},
      {h:'Lời khuyên bên bàn là nguồn dao động bị đánh giá thấp', p:'Người đứng xem thường chỉ ra thứ khác nhau mỗi lần, và mỗi lời đều nghe có lý. Nghe thì cứ nghe, nhưng đưa vào sổ để xem xét sau buổi, đừng áp dụng ngay giữa trận. Thay đổi kỹ thuật giữa một buổi chơi hầu như luôn làm buổi đó tệ hơn.'},
      {h:'Chiều ngược lại cũng có giá', p:'Giữ mãi một lỗi kỹ thuật thật vì sợ đổi cũng là một cách mắc kẹt, và cái trần do nó tạo ra sẽ hiện ra sau vài năm. Ngưỡng đủ tốt không phải lời cấm sửa vĩnh viễn, mà là quy tắc về tần suất: sửa ít lần, mỗi lần đủ sâu, có đo và có thời hạn.'},
    ]},
  {key:'psy_onegame', tag:'Tâm lý', title:'Chọn một thể loại mà chín — nhảy qua lại là nguồn dao động bị xem nhẹ',
    intro:'Hôm nay lỗ, mai ba băng, cuối tuần lại bàn lỗ to ở quán khác vì bạn bè rủ. Mỗi thể loại nghe vẫn là bi-a, nhưng chúng dạy tay những phản xạ khác nhau, và người nhảy qua lại liên tục thường thấy phong độ mình dao động rộng mà không tìm ra nguyên nhân trên bàn.',
    body:[
      {h:'Mỗi thể loại xây một bộ phản xạ riêng', p:'Thang lực, mức xoáy quen dùng, khoảng cách điều bi hay gặp, mức độ chấp nhận rủi ro — mỗi thứ đều được cơ thể học theo thể loại bạn chơi nhiều nhất. Chuyển thể loại là đổi gần hết các thông số đó cùng lúc, trong khi động tác thì vẫn giữ nguyên.'},
      {h:'Chỗ xung khắc cụ thể nhất là LỰC', p:'Cùng một cảm giác tay lại cho quãng đường bi cái rất khác nhau giữa bàn lỗ và bàn không lỗ, giữa bi lớn và bi nhỏ, giữa nỉ nhanh và nỉ chậm. Thang lực là thứ mất nhiều buổi nhất để dựng và cũng là thứ hỏng nhanh nhất khi bạn đổi qua lại. (Xem "Cảm giác lực & kiểm soát tốc độ".)'},
      {h:'Cỡ lỗ và cỡ bi đổi cả tiêu chuẩn ngắm', p:'Lỗ rộng tha thứ cho sai số ngắm, lỗ chặt thì không. Chơi nhiều ở bàn dễ rồi ra bàn chặt, bạn mang theo một tiêu chuẩn chính xác đã bị nới lỏng mà không hay. Chiều ngược lại thì an toàn hơn, nên nếu buộc phải chia thời gian, hãy để bàn chặt là bàn chính.'},
      {h:'Hệ quả là cả hai bộ đều dở dang', p:'Chia đều thời gian cho hai thể loại thường không cho bạn hai nửa trình độ, mà cho hai bộ phản xạ đều chưa tự động. Đúng vào lúc căng thẳng, cơ thể lấy ra bộ nào là chuyện may rủi, và đó chính là hình ảnh của một người có phong độ thất thường.'},
      {h:'Chọn một thể loại chính và nói rõ vai trò của các loại khác', p:'Không cần từ bỏ gì cả, chỉ cần khai rõ: loại này là loại tôi tập để lên trình, những loại kia là chơi vui. Cái quyết định không phải tỉ lệ thời gian mà là bạn đo tiến bộ và đặt mục tiêu trên loại nào. Đo trên nhiều loại cùng lúc thì không loại nào cho tín hiệu sạch. (Xem "Đặt mục tiêu đúng cách".)'},
      {h:'Buộc phải chơi nhiều loại thì tách theo khối thời gian', p:'Gom thành từng khối vài tuần cho mỗi loại thay vì xen kẽ từng buổi. Trong một khối, cơ thể còn kịp ổn định thang lực; xen kẽ liên tục thì nó hiệu chỉnh lại từ đầu ở mọi buổi. Đầu mỗi khối, dành nguyên một buổi chỉ để đo lại lực. (Xem "Bàn lạ, quán lạ".)'},
      {h:'Đổi bàn hay đổi cỡ bi cũng là đổi thể loại nhỏ', p:'Nhiều người tưởng mình chung thuỷ với một thể loại nhưng vẫn dao động, vì tuần này chơi bàn cỡ này, tuần sau cỡ khác, bi cũ bi mới lẫn lộn. Về mặt hiệu chỉnh, đó cũng là những thay đổi lớn. Giữ ổn định điều kiện chơi là một phần của việc giữ ổn định phong độ.'},
      {h:'Dấu hiệu bạn đang bị chia', p:'Lực thường xuyên quá tay hoặc non ở vài buổi đầu sau mỗi lần đổi loại; điểm bài chuẩn nhảy mạnh không lý do; cảm giác vừa quen tay thì lại phải làm quen lại. Ba dấu hiệu này chỉ thẳng vào lịch chơi của bạn chứ không chỉ vào kỹ thuật.'},
      {h:'Khi nào chuyển loại chính là hợp lý', p:'Chuyển hẳn vì thấy hợp hơn, vì giải đấu quanh mình chơi loại đó, hoặc vì hết hứng với loại cũ đều là lý do chính đáng. Điều cần tránh chỉ là chuyển đi chuyển lại. Chuyển thì chuyển dứt khoát, và chấp nhận vài tuần đầu tiên là quãng hiệu chỉnh, không phải quãng để chấm điểm.'},
    ]},
  {key:'psy_pro_filler', tag:'Cơ thủ', title:'Filler: tự tin dựng có chủ đích — hồ sơ từ 19 video phỏng vấn',
    intro:'Rút từ phụ đề 19 video phỏng vấn Joshua Filler (2019–2026, tổng 442.000 ký tự). Filler không phải mẫu cơ thủ bình thản — anh lo lắng cao độ nhưng đã tìm cách biến chính sự lo lắng đó thành độ tập trung, và một niềm tin vào bản thân được dựng lên có chủ đích như công cụ nghề nghiệp, không phải cảm giác tự nhiên.',
    body:[
      {h:'Hai tầng tự tin song song', p:'"Trong đầu tôi, tôi biết mình là tay cơ giỏi nhất — tôi nghĩ vậy vì nếu không thì chẳng có tự tin nào cả", nhưng ngay câu sau anh hạ giọng: mọi đối thủ hàng đầu đều có thể thắng anh, mỗi trận chỉ là 50/50. Tầng công bố để nuôi trạng thái thi đấu, tầng đánh giá riêng để giữ tỉnh táo — người ngoài chỉ nghe tầng thứ nhất rồi gọi đó là kiêu ngạo.'},
      {h:'Hồi hộp đo được bằng giấc ngủ', p:'Trước chung kết European Open 2025 (thắng 13-1), anh không ngủ được một giờ trong hai ngày cuối vì hồi hộp. Trước UK Open 2026 (cũng vô địch), chỉ ngủ 2-3 tiếng hai đêm liền. Hai chức vô địch lớn nhất 18 tháng gần đây đều đến sau những đêm gần trắng — cách bù không phải hết run, mà là tập trung cao hơn để không hỏng những cú dễ.'},
      {h:'Làm trống đầu khi vào cơ', p:'"Ngay khi vào trận, đầu óc phải im lặng tuyệt đối. Hễ nghĩ tới điều gì sai, nó sẽ xảy ra sai. Nghĩ mình sắp trượt — đoán xem, sẽ trượt thật." Kỷ luật ý nghĩ này đi cùng tốc độ ra quyết định rất nhanh, khiến trận dài (race to 30) không tốn nhiều sức vì anh không phải nghĩ nhiều.'},
      {h:'Phân loại lỗi rồi tập đúng chỗ hỏng, xoá sạch trận thua', p:'Sau mỗi trận thua, anh xem lại lỗi thuộc nhóm nào — cú phá, cú trượt, hay bài toán an toàn — rồi luyện đúng chỗ đó. Nhưng cảm xúc thì xoá ngay: sau khi thua sốc Raymond Lenarz ở Derby City 2024 rồi vẫn vô địch nội dung đó, anh mô tả "cứ như tôi chưa từng thua trận nào — tôi xoá sạch chuyện vừa xảy ra rồi đi tiếp." Phân tích lỗi vẫn có, nhưng làm sau khi cảm xúc đã được dọn sạch.'},
      {h:'Đám đông thù địch là nhiên liệu, có ngưỡng chịu đựng', p:'"Tôi thích đánh trước khán giả chống mình — khi họ hò hét ngay lúc bạn bước vào sân mà bạn vẫn làm được, cảm giác như không gì giết nổi mình." Đây là lý do anh chọn Mỹ làm nơi thi đấu ưa thích. Ngưỡng chịu đựng vẫn có: anh thấy bị thiếu tôn trọng khi khán giả hò hét đúng lúc anh đang cúi xuống vào cơ, chứ không phải khi họ cổ vũ đối thủ.'},
      {h:'Nguồn gốc khả năng chịu áp lực: tập bằng tiền túi lúc thiếu niên', p:'"Năm 15 tuổi, tôi cầm 50 đô cuối cùng trong túi và nói muốn chơi ăn 50 đô đó — hồi hộp y như đánh giải thật. Điều đó giúp tôi xử lý áp lực rất nhiều." Anh nói rõ đây không phải lời khuyên cho người trẻ, và luôn chọn đối thủ mạnh hơn mình chứ không đi ăn tiền người yếu.'},
      {h:'Hai con người: trên bàn và ngoài đời', p:'"Tôi khá nhút nhát trong mọi chuyện. Ở bàn có thể trông khác, nhưng ngoài đời tôi khá rụt rè. Khi ở với người lạ tôi rất ít nói, rồi họ nghĩ tôi kiêu — thật ra không phải, tôi không muốn nói chuyện thôi." Anh chưa từng cố tiết chế cách ăn mừng ồn ào của mình, gọi đó là "van xả áp lực" theo đúng bản năng.'},
      {h:'Ý nghĩ "mình thua rồi" vẫn tới — gỡ bằng nhịp, không bằng ý chí', p:'Ở trận tranh vé vào vòng 16 Florida Open 2026, Filler bị Sanjin Pehlivanovic dẫn 4-2 rồi lật ngược. Anh nói sau trận: "Gặp Sanjin, tôi bị dẫn 4-2 và có một lúc tôi đã nghĩ mình xong rồi, nhưng rồi tôi tìm lại được nhịp của mình, và từ đó tôi chơi gần như hoàn hảo — không trượt mấy, và tận dụng được các cơ hội để thắng." Câu này đính chính hình ảnh "đầu óc im lặng tuyệt đối" mà chính anh mô tả trước đó: ý nghĩ tiêu cực vẫn tới, kể cả với người đang giữ phong độ cao nhất, chỉ là nó không được phép ở lại. Và thứ kéo anh ra không phải nỗ lực đè ý nghĩ xuống, mà là tìm lại nhịp chơi — đi qua hành động chứ không qua ý chí.'},
    ]},
  {key:'psy_pro_gorst', tag:'Cơ thủ', title:'Gorst: quy trình bịt nỗi sợ trượt — hồ sơ từ 22 video phỏng vấn',
    intro:'Rút từ phụ đề 22 video phỏng vấn Fedor Gorst (2021–2026, tổng 959.000 ký tự). Gorst vận hành bằng quy trình, không bằng cảm hứng — nhịp thở, cách dừng ở cuối cú lùi cơ, thực đơn, giờ ngủ đều được dựng lên để đè xuống một thứ anh gọi thẳng là nỗi sợ trượt bi.',
    body:[
      {h:'Con quỷ trong đầu, gọi thẳng tên', p:'"Con quỷ lớn nhất trong đầu tôi là sợ trượt bi. Khi đã cúi xuống, có lúc não bảo: mày sắp trượt đấy, mày đang làm gì vậy." Cách chống là nói đè lên bằng mệnh lệnh khẳng định: "Tôi phải giữ tích cực — không, tôi sẽ ăn bi này. Tôi đang ăn bi này."'},
      {h:'Hai lần vấp có thật, không phải nói cho hay', p:'Tứ kết European Open 2023 gặp Filler, dẫn 9-8 race to 10: "Tôi trượt bi 9 chỉ vì tôi đã biết trước mình sắp trượt." Vòng 16 giải vô địch thế giới tại Saudi Arabia, dẫn 10-3: biết mình đang sai thế nhưng không dám đứng dậy làm lại vì đồng hồ 30 giây đang chạy — mất niềm tin vào cú đánh mà vẫn phải đánh.'},
      {h:'Chuỗi bốn bước trước khi cúi xuống', p:'Hình dung xong toàn bộ đường bi trước khi vào tư thế; thở 4 nhịp hít vào – giữ 4-5 nhịp – thở ra 7-8 nhịp; luôn có một nhịp dừng ở cuối cú lùi cơ cuối cùng; và một quy tắc nhìn tuỳ khoảng cách (nhìn bi cái ở cự ly gần, bi mục tiêu ở cự ly xa). Mục đích: khi đã ở tư thế đánh thì không còn quyết định nào phải ra nữa — bịt đúng khoảnh khắc con quỷ hay lên tiếng.'},
      {h:'Nền tảng nhàm chán, đổi lấy năng lượng cuối giải', p:'Sau khi thua cả hai chung kết lớn nhất 2025 vì "thiếu năng lượng", anh siết lại: ăn đúng thực đơn, ngủ và dậy cùng giờ, tập gym lặp lại đúng bài — "toàn những thứ nghe rất nhàm nhưng buộc phải làm". Tập tạ bị giới hạn vì sợ mất cảm giác tay khi phải cầm cơ tuần sau.'},
      {h:'Thua thì giận, rút vào một mình, rồi mới mổ xẻ', p:'"Tôi ghét thua. Mỗi lần thua đừng ai lại gần, tôi muốn ở một mình. Tôi giận. Nhưng mỗi lần thua tôi lại thấy mình mạnh lên." Khác lối xoá sạch của nhiều đối thủ, Gorst để cơn giận chạy hết rồi mới phân tích — đổi lấy chu kỳ hồi phục dài hơn để lấy động lực dài hạn.'},
      {h:'Động cơ gốc là tiền, nói thẳng không né', p:'"Động lực của tôi xưa nay thật ra là tiền. Tôi lớn lên trong một gia đình không mấy khá giả và động lực lớn nhất của tôi là chuyện tài chính." Nhưng động cơ đó cạn dần sau khi anh đã có đủ — dẫn tới một quãng hụt động lực mà anh thừa nhận công khai sau khi gom gần hết danh hiệu lớn: "khi đã đạt được giấc mơ rồi thì rất khó để tiếp tục đẩy bản thân."'},
      {h:'Nguồn gốc khả năng chịu áp lực, và một sự cẩn trọng đáng ghi', p:'Cha mất khi anh 13 tuổi, buộc anh thành trụ cột và bắt đầu đánh tiền ở phòng bi-a Moskva. Nhưng anh từ chối biến bi kịch đó thành lời giải thích duy nhất cho sự lì đòn của mình, và bác luôn cách hiểu phổ biến rằng đánh tiền là trường rèn bản lĩnh: "bản lĩnh tinh thần là thứ phải làm việc với chuyên gia tâm lý và phân tích từng trận thua, không phải chuyện cá cược."'},
    ]},
  {key:'psy_pro_fillervsgorst', tag:'Cơ thủ', title:'Filler vs Gorst: hai lối tâm lý đối lập cho cùng một bài toán',
    intro:'Cùng thế hệ, cùng chia nhau gần hết danh hiệu lớn của làng 9 bi thế giới, nhưng Filler và Gorst giải bài toán tâm lý đỉnh cao bằng hai hệ thống gần như đối xứng — so sánh trực tiếp từng nét, rút từ hồ sơ phỏng vấn riêng của mỗi người ("Filler: tự tin dựng có chủ đích" và "Gorst: quy trình bịt nỗi sợ trượt").',
    body:[
      {h:'Chống nghĩ bậy: im lặng, so với nói đè lên', p:'Cả hai độc lập nêu cùng một quy luật — nghĩ mình sắp trượt thì sẽ trượt thật. Filler chữa bằng cách làm trống đầu hoàn toàn. Gorst chữa bằng cách tự ra lệnh khẳng định trong đầu. Cùng một chẩn đoán, một người chữa bằng im lặng, một người chữa bằng tiếng nói.'},
      {h:'Xử lý thua: xoá sạch, so với mổ xẻ', p:'Filler xoá cảm xúc trước rồi mới phân tích nguội, nên một trận thua ít kéo sang trận sau. Gorst để cơn giận chạy hết, rút vào một mình, rồi mới mổ xẻ — đổi lấy chu kỳ hồi phục dài hơn nhưng lấy được động lực dài hạn hơn.'},
      {h:'Đám đông thù địch: nhiên liệu, so với thứ phải chịu', p:'Filler ăn đám đông chống mình, gọi đó là cảm giác tuyệt nhất và chọn Mỹ làm sân nhà tinh thần. Gorst thẳng thắn nhận không thể đánh nổi trong không khí Mosconi Cup — khán giả anh chuộng là khán giả biết khi nào vỗ tay, không phải khán giả cổ vũ cho ai.'},
      {h:'Động cơ gốc: ghét thua là điểm chung, tiền và tình yêu môn chơi là điểm riêng', p:'Filler: "không phải vì tiền, tôi chơi vì yêu bi-a" — động cơ thật là ghét thua và không chịu được cảnh thấy mặt người khác trên cúp. Gorst nói thẳng không né: động lực xưa nay là tiền, lớn lên trong gia đình khó khăn — và động cơ đó cạn dần sau khi anh đã có đủ, đẩy anh vào một quãng hụt động lực phải tự thừa nhận công khai.'},
      {h:'Tự tin: tuyên bố ra ngoài, so với né tuyên bố', p:'Filler dựng tự tin có chủ đích và nói to nó ra, dù bên dưới vẫn giữ một tầng đánh giá tỉnh táo. Gorst né mọi câu hỏi kiểu "giỏi nhất thế giới", chỉ đáp "có thể tôi đã là rồi, ai biết được" — thứ anh công bố thay vào đó là nỗi sợ trượt và các sai lầm cụ thể của chính mình.'},
      {h:'Điểm chung: ghét thua, tin vào cùng một quy luật', p:'Cả hai đều nói nguyên văn "tôi ghét thua", đều gọi Mosconi Cup là giải áp lực cao nhất trong nghề, và đều phân tích lại từng trận thua sau khi cảm xúc lắng — chỉ khác thứ tự và thời điểm làm việc đó.'},
      {h:'Rút ra cho người tập', p:'Không có lối đúng duy nhất giữa "làm trống đầu" và "nói đè lên", giữa "xoá sạch" và "mổ xẻ ngay". Cả hai lối đều đưa chủ nhân của nó lên đỉnh thế giới — việc cần làm là nhận ra mình hợp lối nào hơn, rồi xây quy trình nhất quán quanh đúng lối đó, thay vì trộn lẫn cả hai một cách tuỳ hứng theo tâm trạng từng ngày.'},
    ]},
  {key:'psy_pro_kopinyi', tag:'Cơ thủ', title:'Ko Pin-Yi: triết lý tạm dừng và phép thay chữ trong đầu — hồ sơ từ 8 bài phỏng vấn',
    intro:'Rút từ 8 bài phỏng vấn và bài đặc tả công khai về Ko Pin-Yi (柯秉逸, Đài Loan, hạng 3 thế giới FargoRate, vô địch thế giới 9 bi và 10 bi cùng năm 2015), trải từ 02/2016 tới 01/2026 — phần lớn là báo chí tiếng Trung Đài Loan vì anh hiếm khi trả lời phỏng vấn dài bằng tiếng Anh. Nét cốt lõi: nơi Filler dựng tự tin bằng tuyên bố và Gorst dựng bằng quy trình chống run, Ko dựng bằng việc chủ động làm chậm lại.',
    body:[
      {h:'Nút tạm dừng là nước đi, không phải dấu hiệu yếu', p:'Bán kết World Pool Masters 2023, lần thứ 6 anh dự giải và 5 lần trước đều dừng ở đúng vòng này. Đang bị dẫn, anh gọi timeout, hít một hơi sâu, rồi tự nhủ: "Đừng nghĩ \'không được thua\' nữa, phải tập trung vào đúng viên bi trước mặt." Anh gỡ lên thắng 11-9 rồi vô địch. Nguyên tắc anh nêu ngắn gọn: "Càng căng thì càng dễ hỏng" — nên timeout được dùng vừa để cắt đà đối thủ, vừa để giành lại nhịp cho mình.'},
      {h:'Đừng đè lên ý nghĩ xấu, hãy thay chữ trong đầu', p:'Đây là mô tả rõ nhất mà một cơ thủ đỉnh cao từng đưa ra về tự thoại. "Nếu cứ liên tục tự nhủ \'đừng hỏng\', \'đừng run\', thì trong đầu sẽ cứ hiện lên đúng mấy chữ tiêu cực đó — \'hỏng\', \'run\'." Cách xử lý của anh là dọn trống đầu rồi nạp vào những chữ ngắn mang hướng làm: "tập trung", "vào lỗ". Anh tự đánh giá: "Thứ năng lượng theo hướng dương ấy, tôi thấy rất có tác dụng." Filler chọn làm trống đầu, Gorst chọn ra lệnh đè lên — Ko làm cả hai bước theo thứ tự.'},
      {h:'Ranh giới: được tính trước nước xấu của bàn, không được tính trước cái hỏng của mình', p:'Cùng lúc cấm mình nghĩ tiêu cực, anh lại bắt mình nghĩ trước tình huống tệ: "Nhất định phải nghĩ trước hai tới ba nước… thậm chí tôi còn phải hình dung trước cả khả năng xấu nhất." Ý anh là nếu viên bi này đã hết hy vọng thì phải tính sẵn cách đẩy cho đối thủ một quả khó nuốt. Thứ bị cấm là phán xét về bản thân; thứ bắt buộc là phương án cho thế bi. Phân biệt được hai loại suy nghĩ này là điểm đáng học nhất ở anh.'},
      {h:'Niềm tin lõi không nằm ở bản thân, nằm ở luật chơi', p:'"Chỉ cần đối thủ chưa đưa được viên 9 cuối cùng vào lỗ, tôi vẫn thấy mình còn cơ hội." Năm 18 tuổi ở chung kết Thailand Open, chỉ còn cách thua đúng một ván trước cơ thủ số 1 thế giới, anh thắng liền 11 ván lật ngược. Loại nhiên liệu này bền hơn sự tự tin: nó không đòi anh tự đánh giá mình mạnh hơn ai, chỉ dựa vào sự thật rằng trận chưa kết thúc. Sau khi vô địch World Pool Masters 2023 anh nói câu nổi tiếng nhất của mình: "Tôi biết người duy nhất có thể đánh bại tôi là chính tôi."'},
      {h:'Tập trung là năng lực tập được — và cách tập là tăng nhiễu', p:'Cha anh, một vận động viên bi-a cấp quốc gia, huấn luyện con từ lớp 6 bằng những bài kỳ quặc: kéo cửa cuốn quán bi-a xuống rồi mở nhạc to hết cỡ bắt tập, và đưa con tới đài tưởng niệm ngồi nhìn thi gan với lính tiêu binh đứng gác. "Hồi nhỏ tôi rất sợ cha. Ngoài chuyện dữ ra, ông còn nghĩ ra đủ thứ cách kỳ quặc để nâng khả năng tập trung của tôi." Cái giá anh nói thẳng: "Giờ nghĩ lại, hình như tôi chẳng có tuổi thơ gì cả." Ngược hẳn thói quen tìm bàn vắng giờ vắng của người tập nghiệp dư.'},
      {h:'Trước giải, cố ý không làm gì đặc biệt', p:'"Tôi không có bài chuẩn bị riêng nào cho giải đấu. Tôi cố sống bình thường hết mức và không nghĩ tới chuyện sắp xảy ra. Tôi không muốn quá nhiều cảm xúc trước một giải lớn, vì trong giải tôi cần là chính mình." Anh cũng nói thẳng là không có bài tập tâm lý nào: lúc rối thì đi chạy cho đầu óc thoát ra, cần nói chuyện thì tìm thầy huấn luyện cũ thời cấp ba. Đây là chiến lược hạ áp lực bằng cách không cho giải đấu một vị thế đặc biệt trong lịch sinh hoạt.'},
      {h:'Sức chịu áp lực rèn bằng thi đấu, và cả sự nghiệp thì không việc gì phải vội', p:'Đầu 2026, sau khi vô địch hai giải trong một tuần, anh nêu quan điểm: "Nếu nửa năm hay cả năm mới gặp một giải cường độ cao một lần thì ai cũng khó mà quen được với cảm giác căng đó." Anh cũng xếp thể lực ngang hàng với kỹ năng và tâm thế: "Kỹ thuật có giỏi tới đâu mà thiếu thể lực thì cũng không thể chơi ở mức tốt nhất." Ở tầng lớn hơn, ba năm dịch bệnh kẹt ở Đài Loan mất gần sạch điểm xếp hạng lại được anh đọc thành một cái timeout của số phận: "Nếu đây là việc tôi sẽ làm cả đời, thì việc gì phải vội?"'},
    ]},
  {key:'psy_pro_kopingchung', tag:'Cơ thủ', title:'Ko Ping-Chung: đối thủ duy nhất là chính mình, và phép thu nhỏ tầm nhìn xuống một viên bi — hồ sơ từ 13 bài phỏng vấn',
    intro:'Rút từ 13 nguồn phỏng vấn công khai về Ko Ping-Chung (柯秉中, Đài Loan, hạng 4 thế giới FargoRate, vô địch thế giới 10 bi hai lần 2019 và 2025, vô địch US Open 2023), trải từ 07/2019 tới 11/2025 — phần lớn là báo Đài Loan vì anh gần như không trả lời phỏng vấn dài bằng tiếng Anh. Nét cốt lõi: mọi trận đấu đều được anh quy về một đối thủ duy nhất là chính mình, và công cụ chính là thu hẹp phạm vi chú ý.',
    body:[
      {h:'Đối thủ khó nhất là chính mình — vì bi-a là môn phải tự nói chuyện với bản thân', p:'Anh nói câu này bằng tiếng Anh với tạp chí SPM Billiards năm 2022: "Tôi nghĩ đối thủ khó xử lý nhất trong môn này là chính bản thân mình, bởi bi-a là môn đòi hỏi phải tự nói chuyện với chính mình, và các cơ thủ thường bị đánh bại bởi chính cảm xúc của họ." Hai năm sau, ở Đài Bắc, anh nói lại bằng tiếng Trung nhưng gắn thẳng vào hành động: "Thật ra ai cũng mạnh cả, nhưng kẻ địch lớn nhất chính là bản thân mình. Chỉ cần mình phát huy được đúng trình độ của mình thì chẳng phải sợ đối thủ nào." Hai câu ghép lại thành một phép đổi mục tiêu: thôi tính chuyện thắng người kia, chỉ lo kéo cho ra mức của mình.'},
      {h:'Hoảng giữa chung kết thế giới: gọi tên nó rồi thu tầm nhìn xuống một viên bi', p:'Chung kết World 10-Ball 2025 tại TP.HCM, gặp đương kim số 1 thế giới Alex Kazakis. Anh trượt một viên 10, đối thủ gỡ liền 3 ván. "Sau khi xảy ra chuyện đó tôi cũng hơi hoảng, cộng thêm việc đối thủ gỡ liền 3 ván, nhưng tôi tự nhủ với mình là nhất định phải bình tĩnh, chỉ cần tập trung đánh cho tốt từng viên bi một là được." Ba bước rõ ràng: thừa nhận trạng thái bằng đúng chữ "hoảng", ra một mệnh lệnh ngắn, rồi kéo tầm nhìn từ cả trận đấu xuống đúng viên bi trước mặt. Anh thắng trận đó và đi hết giải không thua trận nào.'},
      {h:'Cái bẫy nằm ở chuỗi thuận, không nằm ở chuỗi hỏng', p:'Cùng buổi phỏng vấn sau chức vô địch 2025, anh chỉ ra nguyên nhân gây căng theo hướng ngược trực giác: "Hôm nay lúc đầu đánh rất thuận, cho nên tới thời điểm then chốt lại đâm ra hơi quá muốn thắng rồi bắt đầu căng, may là cuối cùng vẫn chống đỡ được áp lực." Đánh thuận làm chiến thắng trở nên gần và có thật, sự gần đó sinh ra ham muốn, ham muốn sinh ra căng. Ai từng dẫn điểm rồi sụp nên đọc kỹ chỗ này: đó là cơ chế, không phải xui rủi.'},
      {h:'Sức chịu áp lực là năng lực hao mòn, và nó cần môi trường chứ không cần giờ tập', p:'Năm 2022, sau ba năm gần như không thi đấu quốc tế vì dịch, anh dự liền ba giải rồi tự chấm: "Vì quá lâu không được đánh trong hoàn cảnh cường độ cao và có áp lực, nên tới lúc then chốt thì sức chịu áp lực hơi không đủ, đây là thứ sau này khi tập có thể rèn thêm." Hai điểm đáng học: anh xếp sức chịu áp lực vào loại năng lực có thể mất đi, và anh xếp nó thành một hạng mục luyện tập ngang hàng với kỹ thuật. Hệ quả cho người tập: đánh một mình nhiều giờ không rèn được thứ này.'},
      {h:'Áp lực nặng nhất đến từ đám đông ủng hộ mình', p:'Ở giải quốc tế lần đầu tổ chức tại Đài Loan năm 2023: "Là cơ thủ chủ nhà, ai cũng mong tôi thắng, tôi cũng cảm thấy một thứ áp lực khó gọi tên, nhất định phải giữ chức vô địch lại. May là hai trận cuối tôi đều rất tập trung, không nghĩ lung tung." Chỗ này anh ngược hẳn Joshua Filler — Filler lấy đám đông thù địch làm chất kích thích, còn Ko thấy đám đông ủng hộ mới là gánh nặng. Và cách chống của anh vẫn là cắt bớt suy nghĩ, không phải phân tích thêm. (Xem "Filler: tự tin dựng có chủ đích — hồ sơ từ 19 video phỏng vấn".)'},
      {h:'Người thân ngồi cạnh bàn: mỏ neo dùng được ngay giữa trận', p:'Chung kết thế giới 2025 có cả anh trai Ko Pin-Yi và em trai Ko Ping-Han ngồi ngoài. "Có họ ở bên ngoài sân, với tôi là trợ giúp rất lớn, nhất là lúc trận đấu căng hoặc rơi vào thế giằng co, dù chỉ là một câu nói hay một ánh mắt thôi cũng làm tôi thêm rất nhiều cảm giác vững tâm." Thứ anh nêu không phải lời khuyên chiến thuật mà là một trạng thái thần kinh, và mức đầu vào cần để tạo ra nó rất nhỏ. Khác Filler ở chỗ đó: Filler dùng hệ thống hỗ trợ để chuẩn bị trước giải, Ko dùng người thân làm công cụ ngay trong lúc trận đang căng.'},
      {h:'Thua thì soi vào mình, và cái đích là giữ mức chứ không phải leo bậc', p:'Về trận thua tệ nhất, anh nói gọn: "Năm 2015 khi tôi thua Shane Van Boening ở tứ kết. Tôi đã không chơi đúng mức bình thường của mình." Trong cả 13 nguồn không có một lần nào anh đổ cho bàn, bi, trọng tài hay may rủi. Mục tiêu dài hạn cũng đặt theo trạng thái chứ không theo danh hiệu: "Kể cả khi đã đạt được những thành tích ấy rồi, tôi vẫn mong mình giữ được mức thành tích như thế mỗi năm." Châm ngôn anh tự nêu là "Chưa tới giây phút cuối cùng thì không bỏ cuộc".'},
    ]},
  {key:'psy_pro_sanchezruiz', tag:'Cơ thủ', title:'Francisco Sánchez Ruiz: bỏ ý nghĩ "mình thắng được", và quy trình bốn bước ở viên bi quyết định — hồ sơ từ 10 video/bài phỏng vấn',
    intro:'Rút từ 08 video phỏng vấn và 02 bài báo về Francisco Sánchez Ruiz (Tây Ban Nha, biệt danh The Ferrari, vô địch thế giới 9 bi 2023, US Open 2022, từng số 1 thế giới, hạng 5 FargoRate), trải từ 01/2021 tới 04/2026, gồm cả nguồn tiếng Anh và tiếng Tây Ban Nha. Nét cốt lõi: anh có một bước ngoặt tâm lý xác định được ngày tháng, và anh là một trong số ít cơ thủ đỉnh cao mô tả được cách xử lý áp lực thành các bước cụ thể chứ không dừng ở lời khuyên chung.',
    body:[
      {h:'Bước ngoặt không nằm ở cú đánh, nằm ở một danh hiệu', p:'Nhiều năm liền anh vào bán kết và chung kết mà không vô địch. Đầu 2022 anh thắng Derby City Classic, và sau đó là chuỗi US Open, World Cup of Pool, vô địch thế giới 9 bi. Ngay sau chức vô địch thế giới, anh nói với ban tổ chức: "Khi tôi vô địch Derby City Classic năm ngoái, mọi thứ trong cách nghĩ của tôi thay đổi hết. Khi anh thắng một giải lớn, sự tự tin của anh vọt xuyên trần nhà." Cơ chế anh mô tả rất gọn: "Tôi nghĩ, được rồi, nếu mình làm được một lần thì mình làm lại được."'},
      {h:'Ý nghĩ "mình thắng được" là bẫy, không phải là tự tin', p:'Đây là chỗ tinh tế nhất trong lời anh. Nói chuyện với David Alcaide năm 2026, anh chỉ đúng vào ý nghĩ mà ai cũng tưởng là tốt: "Cứ tới được vòng đó là tôi lại nghĩ \'Được rồi, mình thắng được. Mình thắng được.\' Tôi cho đó là sai lầm lớn, bởi có khi anh đánh hay mà anh vẫn thua." Bản thay thế anh dùng bây giờ đảo ngược trật tự nhân quả: "Tôi muốn thành tay cơ khá hơn, vì nếu tôi khá hơn thì tôi sẽ thắng danh hiệu. Chứ không phải theo thứ tự ngược lại như trước." Mục tiêu được dời từ chỗ không điều khiển được sang chỗ điều khiển được.'},
      {h:'Áp lực nặng nhất đời anh: cứng người tại chỗ, và anh vẫn thắng trận đó', p:'Kể về một trận hill-hill với Carlo Biado: "Tôi thấy áp lực khủng khiếp, áp lực khủng khiếp, tới mức tôi không nói được gì, vì tôi thấy như mình không cử động nổi. Cuối cùng tôi thắng, nhưng có lúc thì anh thua." Người tập hay coi cảm giác cứng người là bằng chứng mình chưa đủ trình. Lời khai này nói ngược lại: đó là trạng thái bình thường của người sắp thắng ván cuối. Và anh không đặt mục tiêu triệt tiêu nó: "Anh phải cảm thấy áp lực, vì cảm thấy áp lực là chuyện quan trọng. Nhưng chỉ có thế thôi, cứ đánh và tận dụng cơ hội của mình."'},
      {h:'Bốn bước ở những viên bi quyết định, và bẫy nhịp độ theo hai chiều', p:'Trả lời câu hỏi của khán giả về cách kiểm soát áp lực ở bi cuối trận, anh nói cụ thể tới mức dùng được ngay: "Hồi đầu, cứ hồi hộp lên là cái hồi hộp ấy làm tôi đánh nhanh hơn, và nhanh hơn thì dẫn tới hỏng. Thứ kinh nghiệm đem lại là: đúng vào khoảnh khắc áp lực đó thì dừng lại, chuốt lơ, và nghĩ lại mọi thứ lần thứ hai." Bước cuối là hơi thở: "Trên hết là thở trước khi vào cơ, một nhịp đếm ngược kiểu 3, 2, 1, rồi đánh." Nhưng anh cảnh báo cả chiều ngược: "Nếu anh dừng quá lâu thì cũng sai, vì anh tự bơm thêm áp lực cho chính mình. Vấn đề là tìm ra điểm cân bằng của riêng anh."'},
      {h:'Sau trận thua đậm, việc bị cấm là nghỉ', p:'Quy tắc anh nêu gọn và trái với phản xạ thường gặp: "Quan trọng nhất là giữ nguyên lịch sinh hoạt cũ và giữ nguyên khát khao cũ. Điều tệ nhất anh có thể làm là nói \'thôi, tôi nghỉ một tháng không đánh\'." Bằng chứng anh đưa ra là chuỗi thật của chính mình sau một trận thua 11-9 mà anh gọi là đau nhất: "Tôi trải qua mấy ngày rất tệ. Nhưng chính trận thua đó bắt tôi phải nghĩ lại một chút, và giải kế tiếp tôi về thứ ba, giải kế nữa là Euro Tour thì tôi vô địch." Cho phép mình đau vài ngày, không phải vài tuần.'},
      {h:'Trận dễ hơn mới là trận nguy hiểm', p:'Ở giải anh tự chấm là chơi hay nhất năm đó, đối thủ tứ kết bị đổi vào phút chót thành một người anh cho là dễ hơn, và anh thua. Anh tự mổ: "Cú đổi đối thủ vào phút chót ấy cho tôi thêm chút tự tin, nhưng tôi tiêu hoá nó không tốt, và tôi không đánh được, tôi hỏng rất nhiều cú." Ghép với chuyện trên thành một cặp đối xứng đáng nhớ: trận anh chịu áp lực nặng nhất thì anh thắng, còn trận anh thấy nhẹ hơn thì anh thua.'},
      {h:'Mặt anh trưng ra trên bàn là mặt anh chọn cho đối thủ đọc', p:'"Ngoài bàn thì tôi ổn, tôi không phải người hung hăng. Nhưng trên bàn tôi cố làm một người khác. Tôi nhớ ba, bốn năm trước, gặp một cú khó là tôi lộ ra kiểu \'ừ thì, cú này không chắc lắm\', vì đối thủ họ nhìn thấy hết, họ thấy anh đang chịu áp lực. Như thế là không tốt." Nguyên tắc này được kiểm chứng bằng một chuyện thật: năm phút sau một trận thua sốc, một cậu nhóc tới chọc anh rằng hôm nay anh đánh như Toyota chứ không như Ferrari, và anh chỉ đáp "bạn ơi, bạn thân thiện quá". Đáng nhớ hơn cả: chính người đó năm 11 tuổi từng bật khóc rồi bỏ giải về nhà vì bốc trúng một đối thủ mạnh. Bản lĩnh thi đấu của anh là thứ dựng lên, không phải thứ bẩm sinh.'},
      {h:'Thua vòng 64 Arizona Open 08/2026: chỉ đúng chỗ hỏng, không kiếm cớ', p:'Ngày 14/08/2026 tại Arizona Open ở Yuma, giải loại trực tiếp một lần thua với 128 cơ thủ, anh thua Nicholas Tan 8-10 ngay vòng 64. Bản tin ban tổ chức hôm sau dẫn nguyên lời anh: "Tôi biết đây sẽ là một giải đấu tàn khốc, và hôm nay tôi phải trả giá. Tôi đánh mất quyền kiểm soát trận đấu và mắc vài lỗi mà bình thường tôi không mắc." Rồi anh chỉ thẳng vào chỗ trận đấu tuột đi: "Ở tỷ số 8-8, Nicholas chơi hay hơn đúng vào lúc quan trọng và xứng đáng thắng. Thật đáng thất vọng." Không một chữ đổ cho may rủi hay mặt bàn, dù anh vừa đánh Florida Open xong tuần trước đó. Hai nguyên nhân anh nêu đều thuộc về mình, và anh nói thẳng cảm giác thất vọng thay vì nuốt vào. Đây là bản thi hành tại chỗ của quy tắc anh nêu từ 2021: cho phép mình đau, nhưng đau vào đúng chỗ gọi được tên.'},
    ]},
  {key:'psy_pro_shanevanboening', tag:'Cơ thủ', title:'Shane Van Boening: chơi lỏng tay, và hạn dùng một ván cho cơn giận — hồ sơ từ 12 video/bài phỏng vấn',
    intro:'Rút từ 09 video phỏng vấn và 03 bài báo về Shane Van Boening (Mỹ, biệt danh The South Dakota Kid, vô địch thế giới 9 bi 2022, 05 lần vô địch US Open, 18 kỳ Mosconi Cup, điếc bẩm sinh), trải từ 09/2014 tới 08/2026. Nét cốt lõi: anh không coi áp lực là cảm xúc phải thắng, mà là một triệu chứng đo được ở cánh tay, và anh xử lý nó ngay tại chỗ đo được.',
    body:[
      {h:'Áp lực đọc ở cánh tay, không đọc ở trong đầu', p:'Ngay sau trận lật ngược Mika Immonen từ 10-3 ở giải vô địch thế giới 2022, anh không nói mình lo, anh nói: "Tôi không sao vào được vùng của mình, kiểu như đang cố giải phóng cú đẩy ấy. Mọi thứ chặt quá." Cách gỡ cũng nằm ở cơ thể chứ không ở suy nghĩ: "Tôi cứ thả ra thôi. Cứ để nó bung. Tôi thôi không cố điều khiển viên số 1 nữa." Và anh nói thẳng trật tự nhân quả của mình: "Nếu tôi thấy lỏng tay thì tôi sẽ không thấy áp lực." Tức là lỏng tay trước, hết áp lực sau, chứ không chờ hết lo rồi mới dám đánh thoải mái.'},
      {h:'Cơn giận sống vài tiếng, nhưng chỉ được cầm lái đúng một ván', p:'Anh không giả vờ mình không giận: "Cơn giận sẽ nằm trong người anh chắc cỡ vài tiếng, một khi anh dính một cú xui thật nặng." Nhưng khi được hỏi giữa trận thì cú xui bám bao lâu, anh trả lời khác hẳn: "Nó chỉ bám tôi trong đúng ván đó. Chỉ ván đó thôi. Rồi hết ván ấy thì đi tiếp, chờ tới lượt mình." Hai con số không mâu thuẫn: vài tiếng là độ dài thật của cảm giác, một ván là hạn mức anh cho phép nó điều khiển tay mình. Bài học này anh học từ việc ngồi xem người khác thua: "Khi họ bị mấy cú xui làm ảnh hưởng, tức là anh nắm được họ về mặt cảm xúc rồi. Tôi không muốn ở vào vị trí đó." Khi vượt ngưỡng thì anh có một thao tác vật lý chứ không phải một lời tự nhủ: ở giải thế giới 2022, sau khi đối thủ khiếu nại trọng tài, anh gọi thời gian chờ — "Tôi có chút giận trong người. Nên tôi phải đi vào nhà vệ sinh, làm sạch đầu một chút, rồi tập trung lại."'},
      {h:'Thu hẹp thế giới lại còn mình và cái bàn', p:'Được hỏi mong gặp ai ở giải, anh đáp gọn: "Chỉ có tôi với chính tôi, hết." Người dẫn nêu Fedor Gorst làm đối chứng, rằng Gorst luôn đánh theo người, anh chỉ nói: "Có lẽ tôi khác hầu hết các cơ thủ khác. Tôi cứ vào, đánh hết các trận của mình, và làm tốt nhất trong khả năng. Thắng giải thì thắng. Không thắng thì thôi." Anh điếc bẩm sinh và coi đó là lợi thế: "Khi tôi đánh một giải bi-a, tôi chỉ việc tắt nó đi. Khi tôi vô địch US Open lần đầu, tôi tắt hết mọi thứ." Nhưng bộ lọc của anh có chọn lọc, không phải cắt sạch: "Tôi vẫn muốn nghe tiếng bi rơi vào lỗ. Tôi thích âm thanh ấy." Giữ tín hiệu từ cú đánh của mình, cắt tín hiệu từ bên ngoài.'},
      {h:'Thứ gây phân tâm số một, theo anh, là cái điện thoại', p:'Đây là chỗ anh nói gay gắt nhất: "Thứ gây phân tâm số một là cái điện thoại chết tiệt." Cách anh làm rất thô sơ: "Khi tôi tới phòng bi-a, tôi bỏ điện thoại vào trong bao cơ, rồi tôi ngồi đó đánh straight pool. Tôi không ngồi chờ điện thoại reo hay gì cả." Và đó là lời khuyên anh gọi thẳng là lời khuyên lớn nhất của mình cho cơ thủ Mỹ trẻ: "Các cậu cần dẹp cái điện thoại đi. Tới phòng bi-a thì cất nó đi và đi đánh bi-a."'},
      {h:'Chấp nhận thua là điều kiện để còn tỉnh táo', p:'Câu ngắn nhất và nổi tiếng nhất của anh, nói với 60 Minutes năm 2022: "Anh phải chấp nhận chuyện thua. Nếu anh không chấp nhận thua, anh sẽ phát điên mất thôi." Cùng bài, được hỏi có thể hoàn hảo trong môn này không, anh đáp: "Không. Tôi đã cố hết sức, suốt bao nhiêu năm nay." Nhưng ở khâu tập thì đòi hỏi vẫn nguyên: "Tôi muốn đánh cú đó cho hoàn hảo. Cách duy nhất là làm đi làm lại, làm mãi." Đòi hỏi cao ở quá trình mà buông ở kết quả thì thành bản lĩnh; làm ngược lại thì thành lo âu.'},
      {h:'Gọi thẳng trận thua là hỏng, rồi chỉ đúng chỗ hỏng của từng trận', p:'Anh mất 19 năm mới vô địch thế giới, qua hai lần thua chung kết. Anh kể lại và phân loại hai trận theo hai nguyên nhân khác nhau: "Đánh với Ko Pin Yi, tôi mắc đúng một sai lầm lúc đang dẫn", còn trận sau thì "Albin đánh hoàn hảo, tôi chẳng làm gì hơn được". Sau khi thua chung kết Florida Open 2025, anh quay lại năm 2026 và vô địch: "Tôi thấy đáng lẽ tôi đã vô địch giải này từ một năm trước. Tôi học từ mấy sai lầm đó và quay lại với đúng một mục tiêu: chuộc lại."'},
      {h:'Cày 1.000 cú một ngày, và tự lắp phanh cho chính mình', p:'"Khi tôi đứng ở bàn bi-a thì tôi cực kỳ chuyên nghiệp. Tôi sẽ đánh đúng cú đó 100 lần trong một ngày, hoặc có khi 1.000 lần. Rất nhiều lần đang tập, tôi không biết mấy giờ rồi." Nhưng chính anh là người chủ động đi câu cá để cân bằng: "Tôi cần chút cân bằng trong đời mình. Lấy thuyền ra hồ rồi tận hưởng, sau đó quay lại bàn bi-a là sẵn sàng luôn, người mới tinh lại." Anh kể chuyện bắt gặp Joshua Filler đánh bi ở sảnh khách sạn sau khi đã bị loại, và hỏi cậu ấy: "Mấy cậu có thú vui nào khác không đấy?" Rồi nói thêm: "Kiểu đó không kéo dài mãi được đâu. Tôi từng như thế." Ở tuổi 42 anh vẫn vô địch, và thước đo anh dùng để chấm mình vẫn là một thứ anh kiểm soát được: "Tôi chỉ sống một lần. Tôi phải cố hết sức và không để lại hối tiếc nào."'},
      {h:'Lúc phong độ đỉnh, anh vẫn mô tả nó bằng ngôn ngữ cơ thể chứ không phải cảm xúc', p:'Ngay sau chức vô địch Florida Open, anh đi một mạch ở Arizona Open (Yuma, 13-16/08/2026): thắng Wayne Farnum 10-0 trong 37 phút, rồi Albin Ouschan 10-6 và Felix Vogel 10-1, ba trận chỉ mất 07 ván. Nói với ban tổ chức ngày 15/08/2026: "Tôi thấy ổn. Lúc này mọi thứ trên bàn đều thấy rất tự nhiên. Tôi hoàn toàn kiểm soát được cả hai trận, và mấy tuần qua tôi đều thấy như vậy." Đặt câu này cạnh câu năm 2022 "mọi thứ chặt quá" thì lộ ra anh dùng đúng một trục để đo cả lúc tệ lẫn lúc hay: chặt là hỏng, tự nhiên là đang chạy, không vế nào nói về lo hay tự tin. Và hôm trước đó, khi được hỏi mục tiêu cả tuần, anh vẫn trả lời bằng chữ cũ của mình: "Tôi chỉ muốn chơi bi-a cho vui tuần này, rồi hy vọng giữ được đà từ tuần trước."'},
      {h:'Thắng rồi vẫn tự chấm thật: "trận đó tôi may"', p:'Tại Arizona Open (Yuma, 13-16/08/2026), sau khi vượt Carlo Biado rồi thắng David Alcaide để vào bán kết, anh nói với ban tổ chức: "Cảm giác tốt khi lại vào bán kết. Cả tuần tôi đã nói là hai tháng qua tôi cày rất nhiều, và chưa bao giờ tôi thấy tự tin đến thế." Nhưng anh không dừng ở đó mà tách hai trận ra hai loại: "Với Carlo thì tôi biết mình phải làm gì. Tôi biết lối chơi và phong cách của cậu ấy nên tôi chuẩn bị đúng cho việc đó và thắng được. Còn với David thì tôi đánh không hay. Tôi mắc mấy lỗi và thấy mệt. Cậu ấy hoàn toàn có thể thắng trận đó, chỉ là cuối trận bi lăn về phía tôi và tôi gặp may." Đây vẫn là thói quen chỉ đúng chỗ hỏng của từng trận như khi anh kể về hai lần thua chung kết thế giới, chỉ khác là lần này áp cho một trận anh THẮNG. Câu chốt của anh giữ nguyên kiểu cắt hạn quen thuộc: "Giờ tôi cần nghỉ, đặt lại từ đầu, rồi mai đánh tiếp." Hôm sau anh thua Aleksa Pecelj 10-11 ở bán kết.'},
    ]},
  {key:'psy_pro_yapp', tag:'Cơ thủ', title:'Aloysius Yapp: đánh xuyên qua cái run, và ba công cụ kéo đầu về hiện tại — hồ sơ từ 16 video/bài phỏng vấn',
    intro:'Rút từ 16 nguồn công khai về Aloysius Yapp (Singapore, số 1 thế giới 2026, vô địch thế giới 8 bi 2026, người đầu tiên đoạt ba Major liên tiếp trong một năm), trải từ 12/2021 tới 08/2026, gồm podcast tiếng Anh, phỏng vấn tạp chí Nhật và các bản tin có trích dẫn trực tiếp. Nét cốt lõi: anh không giấu run và không giấu nghi ngờ, nhưng có sẵn một bộ công cụ xử lý áp lực cụ thể tới mức người tập dùng lại được ngay.',
    body:[
      {h:'Một năm nghi ngờ, và nó bắt đầu ngay sau chức vô địch', p:'Yapp mô tả được đường lây lan của sự mất tự tin chứ không chỉ cảm giác: "Ban đầu nó chỉ xuất hiện ở cuối mỗi giải, vì tôi cứ không đạt được điều mình kỳ vọng. Rồi nó ngấm vào đời sống bi-a hằng ngày, tôi bắt đầu nghi ngờ từng phần một trong lối chơi của mình. Từ đó thì cứ trượt dốc." Đáng chú ý là chuỗi này khởi đầu sau một chức vô địch, không phải sau một trận thua. Thứ kéo anh ra cũng không phải kỹ thuật: ở Reyes Cup 2024, một đồng đội bảo anh "cứ thả lỏng và tận hưởng", và anh nhận ra "trước đó tôi chỉ nghĩ mỗi chuyện phải thắng, và tôi quên mất việc tận hưởng".'},
      {h:'Run tay là bằng chứng, không phải rào cản', p:'Ván cuối chung kết Florida Open 2025: "Áp lực khổng lồ, tay tôi run rất mạnh, cộng thêm đồng hồ đếm giờ, nó biến tôi thành một mớ thần kinh rối loạn hoàn toàn. Vậy mà tôi vẫn dọn được ván đó." Chung kết US Open còn nặng hơn: "nó không còn giống cánh tay của tôi nữa". Bài học anh rút ra đảo ngược thứ tự thường thấy: "Nếu anh đánh xuyên qua được cảm giác run, nó cho anh sự tự tin ở chỗ biết rằng mình chịu được." Tự tin là hệ quả của việc đã làm được trong lúc run, không phải điều kiện để bắt đầu.'},
      {h:'Ý nghĩ nguy hiểm nhất là "mình sắp thắng giải này"', p:'Dẫn Shane Van Boening 9-5 ở chung kết Florida Open 2025, anh biết chính xác chỗ hỏng: "Rồi cái ý nghĩ \'này, mình có khi thắng giải này thật\' quay lại trong đầu tôi, và tôi bắt đầu mắc lỗi." Van Boening gỡ hoà 9-9. Ở chiều ngược lại, giải anh vô địch năm 2024 là giải anh bước vào chung kết với tâm thế "thật ra tôi không thấy tự tin lắm… tôi không để nó chiếm chỗ trong đầu, tôi chỉ muốn chơi bài của mình". Thứ anh chủ động chặn là viễn cảnh thắng, không phải nỗi sợ thua.'},
      {h:'Ba tầng xử lý áp lực ngay giữa trận', p:'Được hỏi làm gì khi áp lực dâng lên giữa trận, anh trả lời theo ba tầng. Hơi thở: "việc tôi làm là tập trung vào hơi thở của mình". Hiện tại: "tôi vẫn có những ý nghĩ đó khi đánh, nhưng khi đang trong trận thì anh chỉ có thể tập trung vào hiện tại". Và tầng đắt nhất, dời tiêu điểm sang một tham số đo được: "Kể cả khi tôi sợ cú đó, tôi sẽ dồn thêm chú ý vào phần thực hiện. Nếu tôi biết mình sắp đánh quá mạnh, tôi dời tiêu điểm sang lực đi của cú đánh." Không đè nỗi sợ xuống, mà đổi việc cho cái đầu.'},
      {h:'Ba mươi phút một mình, và tiêu chí để gọi huấn luyện viên', p:'"Trước trận, tôi cố hết sức ở một mình ít nhất 30 phút, để tôi sắp xếp lại đống ý nghĩ trong đầu." Tiêu chí phân loại của anh rất gọn: "Nếu tôi bắt đầu nghĩ quá nhiều thì tôi sẽ nói chuyện với huấn luyện viên. Nhưng nếu những ý nghĩ đó là loại tôi biết cách xử lý, hoặc đã từng xử lý rồi, thì tôi thích ở lại với suy nghĩ của mình, im lặng và từ từ chuẩn bị." Tức phân loại theo "đã gặp loại này chưa", không theo mức khó chịu. Thói quen đứng dậy, đi vòng bàn, chuốt lơ rồi mới cúi xuống lại là thứ thầy anh dạy từ nhỏ, hồi khách người lớn hay chơi xấu cậu bé ở tiệm bi-a.'},
      {h:'Thua trận mở màn khi đang là số 1: bỏ nhãn xuống trước, sửa kỹ thuật sau', p:'Florida Open 2026, vừa lên số 1 thế giới, anh thua ngay trận đầu trước một tay cơ ngoài nhóm hàng đầu. Lời anh ngay hôm đó: "Giờ thì tiêu điểm của tôi đổi hoàn toàn. Tôi không còn nghĩ tới chuyện bảo vệ danh hiệu hay chuyện là số 1 thế giới nữa. Tôi chỉ cần thắng trận kế tiếp, sống sót trong giải và xây lại từ đó." Thứ bị bỏ xuống trước tiên là các nhãn thứ hạng, còn đơn vị mục tiêu thu về đúng một trận. Khi bị loại ba ngày sau, anh vẫn tách bạch chất lượng chơi với kết quả: "Tôi không nghĩ mình chơi tệ, nhưng đối thủ chơi hay hơn ở đúng lúc quan trọng."'},
      {h:'Chữ "may mắn" của anh đứng cạnh 220 giờ tập trong một tháng', p:'Hỏi bí quyết đánh bại Van Boening, anh trả lời đúng bảy chữ: "Đừng trượt và gặp may." Nhưng số đo kể chuyện khác: thời phong toả, tuyển thủ Singapore chấm công 50 tới 60 giờ tập mỗi tháng, còn bảng của Yapp có tháng ghi hơn 220 giờ, và thầy cũ nói tới nay anh vẫn tập tám tiếng mỗi ngày. Chính anh cũng nói bản lĩnh không có lối tắt: "Nếu anh muốn giỏi dưới áp lực thì anh phải đi qua trọn cái quá trình đó. Cứ tiếp tục đặt mình vào tình huống khó chịu ấy thì tự nhiên anh sẽ quen." Chép lại chữ "may mắn" mà bỏ mất khối lượng đứng sau nó là học đúng phần vô hại.'},
      {h:'Mặt trái của lý thuyết may mắn: lúc anh thấy nó cạn', p:'Hai tuần sau ngày lên số 1 thế giới, Yapp thua sớm ở cả Florida Open lẫn Arizona Open. Bị loại ở vòng 32 ngày 15/08/2026, anh gọi tên chính xác thứ đang thiếu: "Hôm nay là một ngày khó. Tôi không thấy mình ở trạng thái tốt nhất, và tôi vẫn đang cố làm quen với bộ đồ nghề mới. Có những ngày như vậy thì chán lắm, nhất là khi anh thấy như mình đã mất đi một phần cái may mắn trước đây từng có." Đáng ghi là hôm trước đó, lúc vừa thắng 10-7, anh cũng không tự khen: "Tôi nhẹ người vì thắng được, nhưng tôi không hài lòng với màn trình diễn của mình." Cùng một lý thuyết may mắn ở mục trên nhưng đọc theo chiều cạn, và anh vẫn khoá lại bằng đúng công thức cũ: "Cuộc chơi đôi khi là vậy. Tôi phải nhận lấy, học từ đó và đi tiếp."'},
    ]},
  {key:'psy_pro_changjunglin', tag:'Cơ thủ', title:'Chang Jung-Lin: hạ kỳ vọng xuống bằng không rồi để tay nghề tự chạy — hồ sơ từ 13 bài phỏng vấn',
    intro:'Rút từ 13 nguồn phỏng vấn công khai về Chang Jung-Lin (張榮麟, Đài Loan, 1985-2025, vô địch thế giới 8 bi 2012, từng số 1 thế giới, á quân thế giới 9 bi 2019), trải từ 02/2012 tới 07/2025 — gần như toàn bộ là tiếng Trung vì anh không có phỏng vấn dài nào bằng tiếng Anh. Nét cốt lõi: anh liên tục tìm cách hạ trọng lượng của kết quả xuống để giữ được nhịp đánh, và chính anh khai ra rằng quan hệ của mình với áp lực đã đổi hẳn theo tuổi nghề.',
    body:[
      {h:'Cái làm hỏng nhịp là hai ý nghĩ trái chiều tranh nhau, không phải tay run', p:'Cuối 2023, sau khi dẫn 4-0 rồi để thua liền ba ván trước một đối thủ vô danh, anh không đổ cho kỹ thuật: "Không buông lỏng ra được! Cái ý nghĩ vừa muốn thắng vừa sợ thua cứ trồi lên hoài, cả cái nhịp đánh nó không đúng." Chú ý thứ tự anh nêu: thứ vỡ đầu tiên là NHỊP, chưa phải kỹ thuật. Và anh không cho mình dừng ở phần đổ lỗi, câu ngay sau đó là: "Nhưng tôi thấy đó không phải là lý do, tôi sẽ tìm cách phá qua." Đánh nhanh hơn hoặc chậm hơn thường lệ là dấu hiệu hai ý nghĩ kia đang cãi nhau trong đầu — chữa ở tầng ý nghĩ, đừng đi chữa tay.'},
      {h:'Kỳ vọng không sai, kỳ vọng nặng — như vừa đi vừa ôm một hòn đá', p:'Cùng buổi phỏng vấn ấy, được hỏi mục tiêu ở giải vô địch thế giới, anh trả lời: "Chỉ mong đừng tèo sớm quá là được rồi! Ôm kỳ vọng quá lớn thì cũng như vừa đi vừa ôm một hòn đá. Cái tôi nghĩ là: bóng tới thì đánh, phải làm sao thì làm vậy." Đây không phải lời khuyên đạo đức kiểu đừng tham thắng, mà là một phép tính về sức: mang thêm khối lượng thì đi chậm lại. Trước mỗi buổi đánh, đặt một vạch đích thấp hơn vạch đích thật, rồi thi đấu bằng đúng một mệnh lệnh: bóng tới thì đánh.'},
      {h:'Anh tự chốt cột mốc sớm hơn đích — làm suốt 20 năm, ở cả ba danh hiệu', p:'Năm 2012, ngay sau khi vô địch thế giới 8 bi: "Hôm qua lần đầu vào tới bán kết là tôi đã thấy mình lập được cột mốc rồi, không ngờ còn đoạt được cả chức vô địch." Năm 2017, trước trận tranh huy chương vàng châu Á: "Dù ai thua ai thắng, hai đứa tôi vào tới trận tranh vàng là đã hoàn thành nhiệm vụ rồi." Năm 2022: "Thành tích là thứ gặp được chứ không cầu được, mục tiêu chỉ là mong đánh cho tốt từng trận một là được." Ba mốc cách nhau nhiều năm, cùng một thao tác: hạ vạch đích để bớt gánh nặng, rồi đánh.'},
      {h:'Áp lực do môi trường sinh ra thì anh đổi nó thành mệnh lệnh dẹp tạp niệm', p:'Lần đầu dự một giải lớn ở đại lục năm 2018, anh nói: "Giải đấu rất quy củ, cái đó làm tôi rất có áp lực; hễ bước vào môi trường như thế này là tôi buộc phải làm cho mình không còn tạp niệm, dốc toàn tâm toàn ý vào." Chỗ đáng học nằm ở chữ "buộc": anh không coi áp lực là thứ phải chịu đựng hay phải làm cho biến mất, mà là lực ép anh vào trạng thái tập trung. Trước đó một năm, khi so mình với đối thủ, anh cũng chọn đúng một đại lượng để tự nhận là thế mạnh: "Cậu ấy phá bi tốt, còn tôi thì sức chịu áp lực đủ."'},
      {h:'Quy trình trước cú đánh không đổi ở đúng hai chỗ dễ bỏ nhất', p:'Chung kết Derby City Classic 2019, bị Joshua Filler dẫn 4-0 rồi thắng ngược 11-9, anh nói gọn: "Tôi biết là phải kiên nhẫn. Không được vội." Nhà báo có mặt tả thêm: "Không biểu lộ cảm xúc, cú dừng có chủ ý của Chang sau mỗi lần đánh." Bốn năm sau, một cây bút Trung Quốc mô tả y hệt: "Dù đang dẫn cách biệt lớn, dù chỉ là một cú đánh dễ, động tác ngắm và đưa cơ của anh trước sau vẫn y như một." Người tập hay giữ quy trình rất tốt ở bi khó rồi tự thưởng cho mình một cú rút gọn ở bi dễ — đó đúng là chỗ Chang không bao giờ nới tay.'},
      {h:'Càng muốn thì càng không được, và cách anh đổi góc nhìn về may rủi', p:'Năm 37 tuổi, anh gọi môn bi-a là thứ mình "vừa yêu vừa hận": "Đánh tới tuổi này rồi mới thấy có những lúc càng muốn thì càng không được, có những lúc may rủi chi phối cả một trận đấu." Bài báo ghi rõ sự bất định ấy từng đẩy anh tới mức muốn bỏ cuộc. Công cụ anh dùng để sống chung với nó đã đổi: "Ngày trước thì tự nhủ trận sau sẽ tốt hơn; bây giờ thì buông nhẹ hơn, đổi góc mà nghĩ, lúc anh gặp may quá thì thành ra đối thủ lại hận anh." Từ chỗ chờ được đền bù, sang chỗ thấy may rủi vốn đối xứng và không nhắm vào ai.'},
      {h:'Thước đo thay cho thứ hạng: trạng thái. Và nó đổi được theo tuổi nghề', p:'Từng đứng số 1 thế giới, nhưng anh nói: "Điểm mấu chốt là trạng thái ấy, có giữ được trạng thái tốt của mình hay không" — và cho rằng điều đó có ý nghĩa hơn thứ hạng. Năm 2017 anh mô tả thứ giữ mình ở lại là "cứ luôn tận hưởng đúng cái cảm giác bóng không vào là chết". Bảy năm sau, sau chức vô địch châu Á 2024: "Đánh hơn hai chục năm rồi, cái tâm hơn-thua đã không còn như hồi đó nữa." Cùng một động từ tận hưởng, hai đối tượng khác hẳn — bằng chứng rằng quan hệ với áp lực là thứ thay đổi được, và đo được.'},
    ]},
  {key:'psy_pro_johannchua', tag:'Cơ thủ', title:'Johann Chua: đổi chủ ngữ từ "tôi" sang "chúng tôi" để áp lực khỏi nuốt chửng — hồ sơ từ 12 video/bài phỏng vấn',
    intro:'Rút từ 12 nguồn công khai về Johann Chua (Philippines, biệt danh "Bad Koi", hạng 10 FargoRate, vô địch Hanoi Open 2024 và World Cup of Pool 2023, hai lần vô địch Reyes Cup), trải từ 06/2024 tới 10/2025. Nét cốt lõi: anh không giấu run và không dùng ý chí để dẹp run — anh đổi chủ ngữ của trận đấu, từ "tôi đang đánh" thành "chúng tôi đang đánh".',
    body:[
      {h:'Áp lực đánh vào đầu trận, và anh nói thẳng ra', p:'Về chính trận chung kết Hanoi Open 2024 mà anh thắng Ko Pin-Yi 13-7: "Như mọi người thấy ở đầu trận, tôi run bần bật, áp lực với tôi lúc đó quá lớn và tôi hoàn toàn bị ngợp." Mười sáu tháng sau, thua bán kết US Open 2025 trước Fedor Gorst, mô tả gần như y hệt: "Mấy ván đầu tôi thấy không thoải mái, áp lực quá lớn, tôi gom lại được mình vào giữa trận nhưng hơi muộn." Cùng một cơn ngợp ở cùng một chỗ; khác nhau chỉ ở tốc độ gỡ. Chua không dựng hình ảnh người lạnh lùng, và cũng không lấy áp lực ra làm cớ.'},
      {h:'Câu chống áp lực đáng chép ra giấy', p:'Giữa lúc bị ngợp ở chung kết Hanoi Open, thứ anh làm là gọi tên những người đứng sau lưng mình: "Đó là lúc tôi nghĩ tới vợ tôi Geona và hai đứa con, Justine và Jasmine, tới những người ủng hộ tôi và đồng bào tôi." Rồi câu chốt: "Đó là lúc tôi nhận ra mình không đơn độc trong trận đấu này. Bởi nếu tôi nghĩ chuyện này chỉ là chuyện của mình tôi thì áp lực sẽ nuốt chửng tôi." Đánh xong bi tám quyết định, anh hét "attin na to" — "cái này là của chúng ta", không phải của tôi. Chia gánh nặng ra cho nhiều người là kỹ thuật, không phải lời hoa mỹ.'},
      {h:'Tự tin đứng ở cuối chuỗi, không đứng đầu', p:'Trình tự anh mô tả đi ba nhịp: nghĩ tới người khác, mượn can đảm từ họ, "và tôi bắt đầu tin vào chính mình". Nói về năm bước ngoặt 2024, anh cũng đặt kết quả trước niềm tin: "Giải vô địch thế giới là bước ngoặt, và việc về hạng ba ở đó cho tôi đúng sự tự tin mà tôi đang cần." Sau chức vô địch Reyes Cup: "nó cho tôi rất nhiều tự tin". Đây là đường ngược với Joshua Filler, người tự tuyên bố mình giỏi nhất để khởi động. Với người chưa dựng nổi niềm tin từ hư không thì đường của Chua khả thi hơn: đi kiếm một kết quả thật đủ nặng rồi tiêu dần vốn sinh ra từ nó.'},
      {h:'Hai thước đo khác nhau cho hai loại trận thua', p:'Thua bán kết giải vô địch thế giới 2024 sau khi đã dẫn 6-2, anh nói: "Không ai nhớ người về thứ ba là ai, nhưng tôi thì nhớ — vì nó chứng minh rằng tôi đang tiến gần hơn." Nhưng cú thua sớm ở một giải nhỏ hơn nhiều lại bị anh xếp vào loại khác hẳn: "Hồi chuông báo thức với tôi là giải UK Open — sau giải đó về nhà, tôi lao vào sửa toàn bộ các điểm yếu của mình." Hai tháng sau anh vào bán kết thế giới, cuối năm leo từ hạng 60 lên top 5. Dùng nhầm thước, tự an ủi lúc đáng báo động, là hỏng cả hai đằng.'},
      {h:'Chấp nhận điểm yếu, và tập luôn phần đầu óc', p:'"Tôi học được cách chấp nhận các điểm yếu của mình và đổ hết vào việc tập. Tôi tập đúng những thứ tôi còn thiếu, cả về mặt tinh thần lẫn thể chất." Trước đó anh phải làm một việc khó hơn: "Tôi trở nên thành thật với chính mình, chấp nhận sự thật rằng mình còn cả đống thứ phải chỉnh." Chua coi tâm lý là hạng mục tập được, ngang hàng cú mở hay cú kê — và mọi câu anh nói về áp lực đều ở thì đang tiếp diễn: "tôi đang học cách ôm lấy nó, tận hưởng khoảnh khắc, và chỉ tập trung vào từng trận một".'},
      {h:'Thắng rồi vẫn chưa hài lòng, nhưng không đay nghiến', p:'Thắng trận mở màn giải vô địch thế giới 2025: "Tôi không thực sự hài lòng với màn trình diễn của mình — tôi chỉ thấy mình may vì có nhiều cơ hội." Thắng đậm ngày mở màn Hanoi Open 2025: "Tôi hài lòng với kết quả nhưng chưa thực sự hài lòng với lối chơi của mình — tôi biết mình chơi được hay hơn thế." Khuôn lặp lại ở cả ba mức thành tích: khen kết quả, giữ nguyên yêu cầu với chất lượng chơi. Đó là cách anh giữ vốn tự tin khỏi biến thành tự mãn mà không phải chửi mình.'},
      {h:'Đám đông chống mình thì đi đường vòng, không đối đầu', p:'Chung kết Hanoi Open 2024, hơn 3.000 khán giả: "80 phần trăm, có khi tới 90 phần trăm trong số đó cổ vũ cho Ko Pin-Yi." Chua không biến sự thù địch đó thành nhiên liệu kiểu "tôi muốn thắng cả đám đông" — anh kéo về những người ủng hộ mình ở nơi khác rồi đứng lên bằng chỗ dựa đó. Phép thử thật nằm ở trận thua sớm ngay tại Manila trước khán giả nhà: "Tôi đau lắm, nhất là ở ngay quê nhà. Nhưng đó là cuộc chơi — có lúc nó theo ý mình, có lúc không. Dù vậy người hâm mộ thật tuyệt vời." Áp lực sân nhà là cái cớ sẵn có nhất, và anh không dùng.'},
    ]},
  {key:'psy_pro_carlobiado', tag:'Cơ thủ', title:'Carlo Biado: đổi thước đo từ thắng-thua sang "có ra được bài của mình không" — hồ sơ từ 12 video/bài phỏng vấn',
    intro:'Rút từ 12 nguồn công khai về Carlo "The Black Tiger" Biado (Philippines, vô địch thế giới 9 bi 2017 và 2025, vô địch thế giới 10 bi 2024, vô địch US Open 2021), trải từ 01/2018 tới 10/2025, phần lõi là báo Philippines trích dẫn trực tiếp lời anh bằng tiếng Tagalog. Nét cốt lõi: anh tự gọi tên bệnh của mình là "nỗi sợ đến trước", rồi chữa bằng cách đổi thước đo chấm điểm bản thân chứ không đổi kỹ thuật.',
    body:[
      {h:'Tự chẩn đoán: "nỗi sợ đến trước"', p:'Nhiều năm liền Biado vào bán kết các giải thế giới rồi thua, và anh không đổ cho tay cơ: "Đầu tiên là World 9-Ball, tôi thua ở bán kết; rồi World 10-Ball tổ chức ngay tại nước mình, lại vào bán kết, lại thua." Nguyên nhân anh chỉ ra là "Vì nỗi sợ đến trước. ‘Giờ mình phải làm gì đây? Làm sao mình lách qua được tình huống này?’" Đáng chú ý là hai câu hỏi chạy trong đầu anh đều không phải câu hỏi kỹ thuật — chúng không hỏi cú này đánh thế nào, chúng hỏi làm sao thoát khỏi đây.'},
      {h:'Khúc ngoặt là một trận THUA, và thước đo mới', p:'Anh tự xác định bước ngoặt của mình nằm ở trận chung kết anh thua Ko Pin-Yi năm 2015: "Dù thua trận chung kết đó, tôi vẫn chơi ra được bài của mình. Lối chơi của tôi bung ra được. Dù thua, tôi vẫn vui lắm vì tôi đã cho người Philippines xem một trận hay." Kể lại tám năm sau, anh nói thêm phần bài học: "Trận đó dạy tôi rất nhiều — dạy tôi cách xử lý cái run, cách sẵn sàng cho những khoảnh khắc lớn nhất." Và đích đến không phải hết run: "Tới năm 2017, ở trận chung kết tôi vẫn run, nhưng tôi tận hưởng được nó. Chính chỗ đó tạo ra toàn bộ khác biệt."'},
      {h:'Đặt trạng thái ngược với thứ tỷ số đang gợi ra', p:'Bị Aloysius Yapp dẫn 3-8 ở chung kết US Open 2021, anh thu mục tiêu về đúng một cú: "Tôi tự nhủ hễ tôi giành được quyền phá thì tôi sẽ tận dụng nó bằng hết. Nên tôi giữ mình thả lỏng và chơi bài của mình." Anh thắng liền 10 ván. Bốn năm sau, dẫn Fedor Gorst 9-2 ở chung kết thế giới, anh làm điều ngược lại: "lúc tôi dẫn 9-2, tôi vẫn không dám thả lỏng chút nào." Hai lời khai cách nhau bốn năm nên đây là một khuôn hình lặp lại, không phải câu nói tuỳ hứng.'},
      {h:'Ở trận áp lực nhất đời, thứ anh nhắm tới là mức BÌNH THƯỜNG', p:'Chính anh gọi chung kết US Open 2021 là "trận đấu dồn nén nhiều áp lực nhất mà tôi từng đánh trong cả sự nghiệp". Nhưng thứ anh tự dặn mình lại không phải một cấp độ cao hơn: "Lúc đó, tôi chỉ tự bảo mình tập trung và chơi đúng bài thường ngày của mình." Chỗ dựa anh nêu cũng là thứ đã có sẵn chứ không phải lời tự nhủ về tương lai: "tôi từng đánh ở những giải đỉnh cao trước những tay cơ giỏi nhất thế giới, nên tôi biết cách xử lý cảnh đó."'},
      {h:'Áp lực của anh đến từ quan hệ, không đến từ đối thủ mạnh', p:'Giải vô địch thế giới 2025, anh thắng tay cơ số một thế giới ở chung kết, nhưng trận anh khai là căng nhất lại là bán kết gặp một người Philippines: "Tôi bị áp lực nhiều hơn ở trận bán kết gặp Bernie. Bây giờ người Philippines giỏi nhiều lắm, nhất là đám trẻ." Hai nguồn áp lực anh nêu đều không phải trình độ đối thủ: "Tôi căng nhất ở những trận gặp chính đồng hương Philippines, và cũng bị áp lực vì tiền thưởng quá lớn." Anh cũng vào giải với kỳ vọng thấp: "Tôi không hề nghĩ mình sẽ thắng, vì tôi vừa đi Việt Nam rồi Indonesia về, người đã thấy mệt sẵn."'},
      {h:'Hạ mức đặt cược trước khi vào chung kết', p:'Trước trận chung kết thế giới 2025, anh và vợ chốt sẵn một điều kiện: "Tôi nói với vợ rằng chỉ cần tôi đặt chân được vào chung kết thì thắng hay thua gì chúng tôi cũng chia tiền thưởng cho trại trẻ mồ côi." Điều kiện đặt ở việc đã hoàn thành, không đặt ở kết quả chưa xảy ra, và mệnh đề thắng-hay-thua được nói ra trước khi trận diễn ra. Điều đó không làm anh bớt muốn thắng: "Còn trận chung kết đó thì tôi tập trung cực độ, tôi rất muốn giành bằng được chức vô địch."'},
      {h:'Xả căng đặt TRƯỚC cú quyết định, và giữ đầu nhẹ là một phần của việc', p:'Kể lại ván ăn chức vô địch thế giới đầu tiên: "Sau khi ăn xong bi số 8, tôi hét lên vì sướng — để xả hết căng thẳng trước khi đưa nốt bi số 9 vào lỗ." Tiếng hét nằm giữa hai cú đánh, tức dọn trạng thái xong rồi mới vào cú cuối. Cùng chiều đó, anh xếp việc giữ đầu nhẹ ngang hàng với khối lượng tập: "Tôi làm việc rất chăm, và tôi cố tránh căng thẳng cùng những lo nghĩ thừa." Và anh nói thẳng chiều nhân quả của sự tự tin ở mình: "Chiến thắng cho tôi sự tự tin khi chơi và châm ngòi để tôi đi tiếp" — tự tin đến sau, không đứng trước.'},
      {h:'Thắng trắng 10-0 vẫn chấm trận trước là "may"', p:'Florida Open tháng 08/2026, Biado thắng trắng 10-0 ở ngày thi đấu thứ ba. Câu đầu tiên anh nói sau đó lại không phải về trận vừa thắng, mà về trận trước: "Tôi thấy mình may mới qua được trận đầu tuần này với lối chơi hôm ấy, nên tôi biết hôm nay phải nâng mức lên, và tôi nghĩ tôi đã làm được." Thắng cả hai trận, nhưng anh chỉ chấm một trận là đạt — thước đo vẫn là chơi ra được bài của mình chứ không phải tỷ số thắng. Và ngay sau ván thắng trắng, việc anh nêu là đi tập tiếp: "Tôi vẫn muốn dành thời gian tập, nhất là cú phá, vì từ đây trận nào cũng khó hơn."'},
    ]},
  {key:'psy_pro_jaysonshaw', tag:'Cơ thủ', title:'Jayson Shaw: sức chịu áp lực là trạng thái chứ không phải tính cách — hồ sơ từ 25 video/bài phỏng vấn',
    intro:'Rút từ 23 video phỏng vấn và 02 bài báo về Jayson Shaw (Scotland, "Eagle Eye", hạng 12 thế giới, vô địch US Open 2017, hai lần MVP Mosconi Cup, kỷ lục 714 và 832 bi liên tiếp), trải từ 2008 tới cuối 2025. Đây là hồ sơ hiếm: một cơ thủ đỉnh cao kể lại trọn vẹn một lần sụp đổ tâm lý, từ lúc ý nghĩ nghi ngờ len vào giữa trận cho tới lúc dựng lại được.',
    body:[
      {h:'Anh đặt điều kiện thắng ở cái đầu, không ở tay cơ', p:'Câu gọn nhất của cả hồ sơ, nói trước European Open 2022: "Tôi thấy nếu tôi sẵn sàng về mặt tinh thần thì tôi rất khó bị đánh bại. Mấy giải vừa rồi tôi thật sự không có mặt ở đó về mặt tinh thần." Đáng chú ý là cách đặt điều kiện — không phải "nếu tôi tập đủ", vì cùng buổi đó anh khai đang tập tám tới chín tiếng mỗi ngày. Khối lượng tập không phải thứ đang thiếu. Hàm ý ngược lại của câu ấy cũng đúng, và anh đã sống qua nó.'},
      {h:'Ý nghĩ nghi ngờ len vào giữa trận, kể từng bước', p:'Về quãng 2021-2022, anh mô tả chính xác cái triệu chứng mà người tập nào cũng gặp: "Tôi vào trận rồi nghĩ những chuyện quái gở kiểu ‘chắc mình thua trận này mất, mình sẽ trượt quả này’. Sự tự tin biến mất hoàn toàn." Trước đó là dấu hiệu sớm hơn và nguy hiểm hơn — mất cảm giác với chính môn mình yêu: "Đi thi đấu mà tôi không quan tâm. Thứ đáng lẽ tôi phải yêu, mà tôi chẳng còn cảm xúc nào với nó. Nên tôi cứ đi qua các động tác cho xong." Bản tóm tắt của anh: "Có rất nhiều thứ về mặt tinh thần đủ sức đánh gãy anh. Nó suýt đánh gãy tôi thật sự."'},
      {h:'Đường ra bắt đầu ở phòng tập, không ở bàn bi-a', p:'Thứ tự hồi phục của Shaw đáng chép lại: anh không tập bi-a nhiều hơn, mà sửa cơ thể và cắt nguồn nhiễu trước. "Tôi phải bắt đầu tập thể lực. Không lên mạng xã hội, tránh xa hết mấy thứ đó. Chỉ tập trung vào những người quanh mình." Ba tuần giảm khoảng 9 cân. Nguyên tắc chống trượt của anh nhắm đúng vào một ngày cụ thể chứ không phải ý chí chung chung: "Đừng có kiểu ‘thôi hôm nay nghỉ, mai đi’ — cái đó chỉ dẫn tới mai cũng không đi, rồi một tuần sau tôi lại ăn bậy và lại rơi vào chỗ tệ hại."'},
      {h:'Thứ quyết định trận đấu là tốc độ buông một sai lầm, đo bằng số ván', p:'Từ năm 2017 anh đã chỉ đúng vào nguyên nhân thua thật sự của mình: "Có lúc tôi thua là do chính cái đầu mình — không xử lý sai lầm đủ nhanh, và để nó ảnh hưởng suốt hai ba ván." Đơn vị ở đây rất cụ thể, và cũng là khoảng mà một trận đấu bị quyết định. Thay đổi lớn nhất anh tự nhận là rút khoảng đó xuống: "Trước đây nó đeo bám tôi cả tuần, có khi hai tuần. Giờ thì tôi buông rất nhanh." Anh cũng phân loại: có kiểu thua lành, và có kiểu thua khiến ngồi xem tiếp cũng khó chịu.'},
      {h:'Ngồi xem chịu áp lực nặng hơn đứng đánh', p:'Quan sát tinh nhất của Shaw, từ lần anh ngồi khán đài xem Mosconi Cup trước khi được chọn vào đội: "Tôi thấy áp lực khi ngồi xem còn nặng hơn lúc đứng trong sàn đấu. Mỗi cú đánh là tay tôi lại toát mồ hôi. Khi anh ở trong đó, anh kiểm soát được. Còn ngồi xem thì anh chẳng kiểm soát được gì." Đứng đánh trước 2.000 người gào thét mà lại dễ chịu hơn ngồi lẫn trong đám 2.000 người đó. Cách đọc là áp lực tỉ lệ nghịch với quyền kiểm soát, chứ không tỉ lệ thuận với độ lớn của khoảnh khắc — đây là suy luận của người lập hồ sơ, dựa trên hai vế chính anh đặt cạnh nhau.'},
      {h:'Hưng phấn phải quản được, không phải càng nhiều càng tốt', p:'Shaw nổi tiếng vì la hét ăn mừng, nhưng chính anh xếp mức hưng phấn quá đà vào diện lỗi cần sửa: "Mấy kỳ Mosconi đầu tiên tôi hưng phấn hơi quá đà mà lại không quản được nó. Anh hoàn toàn có thể vừa hưng phấn vừa quản được lối chơi — còn tôi hồi đó bị cuốn theo đám đông, thay vì giữ được cân bằng." Từ anh dùng cho trạng thái đúng là "cân bằng", không phải "máu lửa". Chép lại phần biểu diễn mà bỏ mất chữ cân bằng là chép đúng cái phần vô hại.'},
      {h:'Tự tin hay ngạo mạn: tiêu chí là có làm được hay không', p:'Bị gọi là ngạo mạn suốt sự nghiệp, anh phân định bằng một tiêu chí dùng lại được: "Anh có thể là tay cơ xuất sắc, nhưng tôi không sợ anh. Tôi mười hai tuổi, anh ba mươi, với tôi chẳng khác gì. Trong đầu tôi, tôi biết mình đủ tài để thắng anh." Rồi phần tự ràng buộc: "Chắc mình đã chẳng nói nhiều đến thế nếu không làm được. Vì tôi không muốn ra đó phát ngôn rồi bước vào đánh và thua." Đứng sau lời tuyên bố là tám chín tiếng tập mỗi ngày và những buổi tập chán nhất — có giai đoạn anh chỉ đẩy bi chạm băng và đánh safety hàng giờ, gần như không nhắm lỗ cú nào.'},
    ]},
  {key:'psy_pro_ouschan', tag:'Cơ thủ', title:'Albin Ouschan: bộ công cụ đặt ở cái ghế chứ không ở cái bàn — hồ sơ từ 15 video/bài phỏng vấn',
    intro:'Rút từ 15 nguồn công khai về Albin Ouschan (Áo, vô địch thế giới 9 bi 2016 và 2021, vô địch thế giới 8 bi 2025), trải từ 2017 tới 11/2025, gồm bốn podcast dài tiếng Anh, một bản tự bình luận trận chung kết của chính anh và các bài báo có trích dẫn trực tiếp. Nét cốt lõi: người mang biệt danh Smooth Operator lại tự thuật rằng mình run tay tới mức quên cách thở, và bù lại bằng một bộ thao tác nhỏ, cụ thể, được đặt hết vào khoảng thời gian ngồi trong ghế.',
    body:[
      {h:'Chỗ làm việc của tâm lý là cái ghế, không phải lúc cúi xuống cơ', p:'Được hỏi khuyên gì cho người chơi đang vấp về tâm lý, Ouschan rào trước rồi mới đưa công cụ: "Không phải thứ gì như kỹ thuật thở cũng làm dịu được mọi người, nó không giống nhau với mỗi người. Nhưng tôi đọc rất nhiều sách của các vận động viên môn khác về các kiểu thở, và nó hợp với tôi lắm. Một cái tên là 5-5-7: hít vào 5 giây, thở ra 5 giây, rồi nín 7 giây, xong lặp lại." Liều lượng và chỗ dùng anh nói rõ: "Tôi làm ba, bốn lượt khi gặp tình huống rất hóc búa" và "tất nhiên rồi, tôi làm nó khi đang ngồi trong ghế là chính". Điều kiện đi kèm dễ bị bỏ qua nhất: "Nếu anh gặp đúng tình huống đó 10, 15, 20 lần, anh sẽ biết cơ thể mình phản ứng ra sao. Và rồi anh phải tìm đúng công cụ để đối phó với nó." Tức nhận diện phản ứng trước, chọn công cụ sau.'},
      {h:'Một câu tự nhủ cố định để cắt chuỗi hỏng, kể lại giống nhau sau bốn năm', p:'Chung kết thế giới 2021, đang dẫn thì trượt bi 6 ở tỷ số 7-7 và bị Omar Al Shaheen bứt lên. Bản kể ngay sau giải: "Tôi nhìn thẳng xuống sàn khoảng ba tới năm phút... rồi tôi tự nhủ: được, Omar, mày đang ở mốc chín, nhưng đó là ván cuối của mày. Từ thời điểm đó anh ta không ghi thêm được bi nào." Bốn năm rưỡi sau, ở một podcast khác, anh kể gần như trùng khớp: "Cú trượt đó đẩy tôi vào một chỗ rất tối... rồi tôi ngồi trong ghế tự nhủ: được rồi, đó là ván cuối của mày." Ba nét đáng chép: câu ngắn và dứt khoát về đối thủ chứ không phải lời động viên bản thân, đặt ở ghế chứ không ở bàn, và đi kèm một hành động cắt thị giác là nhìn xuống sàn.'},
      {h:'Mức run không dự báo được chất lượng chơi', p:'Đây là quan sát phá vỡ giả định phổ biến nhất: "Đôi khi nó thật điên rồ, vì có lúc tôi thấy cực kỳ căng thẳng mà lại đánh hoàn hảo, có lúc tôi cũng cực kỳ căng thẳng nhưng cú nào tay cũng giật. Anh không phải lúc nào cũng làm chủ được cơ thể mình." Về bi 8 quyết định chức vô địch thế giới 2025: "Tôi run kinh khủng. Tôi không biết thở sao cho đúng nữa và cũng không biết khi nào thì nên đánh." Nguyên nhân anh chỉ đích danh không phải độ khó của cú đó, mà là hai ván trước đã có thể kết thúc mà không kết thúc được: "Chính vì thế tôi tự chất thêm áp lực lên mình."'},
      {h:'Tự tin là kết luận rút từ số lần lặp, không phải một cảm giác chờ tới', p:'Câu chốt của anh khi được hỏi lời khuyên cho người nghiệp dư không nói gì về cảm xúc: "Cuối cùng thì anh phải có niềm tin vào chính mình. Hãy tự tin, bởi vì anh đã làm cú đó cả nghìn lần trong lúc tập. Anh đã làm nó cả nghìn lần trong các giải đấu rồi." Chiều ngược lại cũng do anh nói ra, về giải 8 bi 2025, môn anh gần như không tập: "Tôi lạc lối ngay trên bàn. Tôi lập một kế hoạch sau cú phá, đánh được hai bi thì nhận ra kế hoạch đó không ổn, thôi làm kế hoạch khác, rồi lại hai bi nữa là hỏng tiếp." Thứ kéo anh về trạng thái quen thuộc trong tuần đó cũng là số ván đã đánh, không phải ý chí.'},
      {h:'Đặt mốc thấp hơn khả năng để tháo áp lực — ba giải, cùng một cách', p:'Về chức vô địch thế giới đầu tiên năm 2016: "Tôi không hồi hộp mấy, vì tôi đã đạt mục tiêu của mình rồi. Mục tiêu của tôi vốn chỉ là: có lẽ vào bán kết hay tứ kết. Nên khi đã đạt mục tiêu rồi thì tôi không còn hồi hộp nữa — và đó là một điểm rất mạnh trong lối chơi của tôi." Trước giải thế giới 2022 anh nói "mục tiêu đầu tiên của tôi có lẽ là vào Top 16, và từ đó trở đi thì chuyện gì cũng có thể xảy ra"; ở giải 8 bi 2023 là "mục tiêu chính của tôi có lẽ là vào tới vòng 32". Anh không nhắm chức vô địch, anh nhắm một mốc vừa tầm rồi chơi phần còn lại ở trạng thái không còn gì để mất.'},
      {h:'Cái công tắc: trông như đã bỏ cuộc trên ghế, vẫn trăm phần trăm khi về bàn', p:'Bị chọc rằng anh nổi tiếng hay tụt tinh thần thấy rõ, Ouschan không chối: "Kể cả khi anh nhìn tôi ngồi trong ghế và thấy như tôi chẳng buồn quan tâm nữa, chỉ muốn về nhà thôi — tôi vẫn dốc trăm phần trăm ngay khi quay lại bàn. Nó như một cái công tắc tôi bật hoặc tắt được, ngay khi đối thủ mắc lỗi. Và tất nhiên không phải lúc nào cũng chạy." Bằng chứng: chung kết Championship League Pool 2022, bị Joshua Filler dẫn 4-0 trong loạt đua tới 7, "tôi đã nghĩ chắc chắn mình sẽ bị trắng án, một trăm phần trăm" — rồi thắng. Trong lúc ngồi chờ, anh không ngồi không: "tôi đang chuẩn bị cho cú phá kế tiếp của mình để lấy lại tập trung, vì trận đấu vẫn chưa xong".'},
      {h:'Đám đông thù địch là thứ phải sống sót, không phải nhiên liệu — và anh dám tự rút', p:'Khác hẳn Joshua Filler, Ouschan mô tả đám đông chống mình như một cú sốc thể chất. Về trận gặp Earl Strickland ở Mosconi Cup 2022 tại Las Vegas: "Đột nhiên anh bước xuống cầu thang và cảm giác như vừa bị sét đánh... Mười, mười lăm phút đầu tôi không biết phải làm gì, tôi không nhìn ra các thế bi, không nhìn ra đường dọn bàn nào cả." Điều hiếm là anh tự báo cáo mình đang bị ảnh hưởng rồi nhường suất thi đấu ngày cuối cho Filler: "Họ đã vào được trong đầu tôi một chút... Tôi nói: tôi sẵn sàng, nhưng tôi muốn thắng. Tôi không quan tâm danh hiệu cầu thủ hay nhất." Ở chỗ khác anh cũng mô tả cơ chế méo tri giác dưới áp lực: "Anh thấy mấy cái lỗ bốn inch còn nhỏ hơn nữa — ai cũng sợ và các lỗ càng co lại."'},
    ]},
  {key:'psy_pro_szewczyk', tag:'Cơ thủ', title:'Wojciech Szewczyk: hạ biên độ cảm xúc thay vì dâng nó lên — hồ sơ từ 6 video/bài phỏng vấn',
    intro:'Rút từ 6 nguồn công khai về Wojciech Szewczyk (Ba Lan, vô địch thế giới 10 bi 2022, chung kết UK Open 2026), trải từ 08/2021 tới 05/2026, gồm một podcast 66 phút, một phỏng vấn có phụ đề người làm, một bài phỏng vấn độc quyền và ba bản tin có trích dẫn trực tiếp. Nét cốt lõi: nơi người khác dâng cảm xúc lên để lấy đà, anh ghì nó xuống gần bằng không — và cắt phản ứng với thất bại như cách để cắt áp lực cho lần sau.',
    body:[
      {h:'Cú đánh lấy chức vô địch thế giới: "cố để không cảm thấy gì cả"', p:'Bi 10 cuối cùng của chung kết thế giới 2022, sau khi đã đánh trận đua tới 10 thứ tư trong ngày, anh mô tả đúng thao tác trong đầu: "Tôi đã cố để không cảm thấy gì cả, bởi một khi anh bắt đầu cảm thấy ở khoảnh khắc kiểu đó, anh rất dễ bị cảm xúc nhấn chìm. Tôi chỉ muốn giữ cánh tay đi thẳng, đánh cú đó, cho bi vào lỗ, rồi mới ăn mừng." Cảm xúc không bị cấm, nó bị hoãn, và mốc mở khoá là bi đã nằm trong lỗ. Đáng chú ý là độ dễ của cú đánh không hề làm anh nhẹ đi: "Áp lực rất lớn, bởi quả 10 đó cực dễ, nhưng cú nào cũng có thể trượt."'},
      {h:'Phản ứng đẻ ra áp lực, chứ không phải ngược lại', p:'Sau hai trận thua 8-9 làm mất huy chương The World Games 2025, anh rút ra công thức gọn nhất của mình: "Một khi anh đã thua một trận thì chuyện đó xong rồi, nhưng phản ứng của anh thì có thể nhào nặn những gì sắp tới. Nếu anh không phản ứng thái quá với việc thua, thì áp lực sẽ ít đi." Cách nghĩ thường thấy là áp lực có trước nên mới bùng nổ khi thua; anh đảo lại thứ tự. Chỗ can thiệp vì thế không phải bắt mình bớt sợ, mà bắt mình bớt làm ầm lên — vì hành vi thì điều khiển được, cảm giác thì không.'},
      {h:'Buổi khởi động không phải lời tiên tri', p:'Trận buổi sáng gặp Kevin Cheng ở US Open, anh có nguyên một bàn trống 30 phút trước giờ đánh: "Tôi khá hồi hộp, khá lo lắng. Tôi không bỏ nổi một quả bi. Thật lòng là tôi không dọn nổi cái gì cả. Tôi cứ đánh và bi thì đi xa lỗ đến thế, tôi không hiểu chuyện gì đang xảy ra." Rồi vào trận anh dọn liền tám ván. Một buổi khởi động tệ ngay trước giờ đánh không nói được gì về trận sắp tới; coi nó là điềm báo rồi bước vào với niềm tin đã hỏng sẵn mới là chỗ mất trận thật.'},
      {h:'Trạng thái đỉnh cao là tự tin CỘNG bình tĩnh', p:'Màn trình diễn hay nhất đời anh không phải chức vô địch thế giới mà là một giải nhỏ ở Ba Lan năm 2018, nơi anh làm 11 loạt mở-và-dọn-bàn liên tiếp và tỷ số sát nhất cả giải là 9-4. Cách anh gọi tên cảm giác ấy rất đáng gạch chân: "một cảm giác tự hào về chính mình, cộng với sự tự tin cực độ và sự bình tĩnh, hai thứ lại đi cùng nhau. Đây là thứ mà một vận động viên thật sự yêu." Người tập hay lấy hưng phấn làm dấu hiệu phong độ rồi bắn tung mọi cú. Dấu hiệu đúng theo anh là niềm tin cao trong lúc nhịp vẫn thấp.'},
      {h:'Không biết sợ là trạng thái đạt được, không phải tính cách bẩm sinh', p:'Được hỏi ai là cơ thủ "fearless" nhất, anh chọn David Alcaide và giải thích: "Đôi lúc anh thấy được là ông ấy đang cảm nhận áp lực, nhưng ông ấy chống lại nó đẹp lắm. Lúc ông ấy chiến đấu hết sức bằng cả trái tim, ông ấy trở nên không biết sợ — kiểu như mạnh hơn nỗi sợ của chính mình." Anh chọn người vẫn để lộ áp lực làm hình mẫu của sự không biết sợ, chứ không chọn người trông lạnh như băng. Điều kiện để đạt trạng thái đó, theo cách anh mô tả, là nỗi sợ phải có mặt trước đã.'},
      {h:'Sáu mươi giải Euro Tour, mười bốn năm, và cách sống với chuỗi suýt-được', p:'Năm 2021, đã ở nhóm đầu thế giới, anh vẫn nói: "Tôi đã đánh khoảng 60 giải Euro Tour trong đời rồi, mà vẫn chưa thắng nổi một giải nào" và "bao nhiêu lần đau lòng, bao nhiêu trận thua ở ván quyết định trong những trận lớn". Khung ý nghĩa anh dựng để sống với chuỗi đó: "Cảm giác như tôi đang đi từng bước nhỏ, có lẽ tới cuối thì nó sẽ ngon hơn." Anh thắng Euro Tour đầu tiên tháng 3/2026, ở tuổi 31. Câu nói ngay sau trận không nói về niềm vui mà về thứ vừa được gỡ ra: "Giờ áp lực đã hết rồi."'},
      {h:'Tự học không thầy, và câu nói về việc không có ai để nói dối', p:'Ba Lan không có huấn luyện viên chuyên nghiệp, nên từ 15 tuổi anh tự đi tìm hiểu: "Tôi khá phân tích về trò này, nên tôi thích soi mọi yếu tố mà mình soi được, cả mặt tâm lý lẫn mặt kỹ thuật." Anh cộng giờ trên bàn với hai ba tiếng làm việc ngoài bàn mỗi ngày thành khoảng tám tiếng, rồi chốt: "Đó là thứ lao động rất căng, bởi vì không có ai để mà nói dối cả. Anh không có sếp. Nếu anh làm việc tử tế, anh biết. Nếu anh làm dở, anh cũng biết." Nhưng anh cũng không giấu chỗ thiếu: "Có lẽ đây cũng là thứ tôi đã thiếu trong sự nghiệp, kiểu như một ê-kíp hỗ trợ mình, một huấn luyện viên."'},
    ]},
  {key:'psy_pro_wiktorzielinski', tag:'Cơ thủ', title:'Wiktor Zieliński: người tự nhận điểm yếu lớn nhất là cái đầu, rồi dựng hàng rào quanh nó — hồ sơ từ 7 video/bài phỏng vấn',
    intro:'Rút từ 03 phỏng vấn video, 02 bài báo phỏng vấn và 02 tuyên bố tự viết của Wiktor "The WiZ" Zieliński (Ba Lan, vô địch Euro Tour trẻ nhất lịch sử năm 16 tuổi, từng số 1 thế giới WPA, hạng 15 FargoRate), trải từ 02/2022 tới 09/2025. Nét cốt lõi: anh khai thẳng phần tâm lý là chỗ hỏng của mình và thừa nhận không biết cách tập nó, nên thay vì sửa, anh cắt bớt những thứ sinh ra áp lực.',
    body:[
      {h:'Tự khai điểm yếu lớn nhất là cái đầu, và không biết cách tập nó', p:'Đang là người vừa vô địch hai chặng Euro Tour liên tiếp, anh nói: "Thành thật mà nói vấn đề lớn nhất của tôi vẫn là cái đầu, vì với tôi chịu áp lực là chuyện khó. Trong quá khứ tôi đã sụp dưới áp lực rất nhiều lần." Bị hỏi mỗi lần sụp thì học được gì để lần sau khá hơn, anh đáp: "Thành thật là tôi không biết trả lời sao. Với tôi phần đó khó tập lắm, tôi khó hình dung nổi làm sao cải thiện nó. Tôi cho đó là phần khó nhất của môn này." Ba năm sau, khi đã lên số 1 thế giới, anh vẫn không đưa ra bài tập nào mà đưa ra một quy tắc tránh: "Tôi luôn mong vào được các vòng cuối, nhưng tôi không muốn tự đặt áp lực nào lên mình, vì như thế không tốt cho cái đầu."'},
      {h:'Xoá cú hỏng và xoá cả cú ăn may của đối thủ, theo cùng một tiêu chí', p:'Cơ chế phá hoại anh mô tả không phải cú hỏng, mà là cú hỏng còn nằm lại trong đầu: "Anh nghĩ về quả hỏng ở ván đầu, trong khi anh đã sang ván bảy rồi mà vẫn đang nghĩ \'sao mình lại hỏng quả 8 đó\'. Nó tác động vào đầu anh và anh không tập trung được." Với cú đối thủ ăn may, anh dùng đúng thước đo ấy: "Ván đó là của nó, không phải của mình. Tôi đã đánh một quả phòng thủ hoàn hảo mà nó vẫn thắng ván, tôi không tác động được." Ranh giới không nằm ở đáng hay không đáng, mà ở chỗ còn tác động được nữa hay không.'},
      {h:'Tay sẽ run, việc cần làm là dời khung cảnh chứ không phải ép mình bình tĩnh', p:'Về loạt bi quyết định trên bàn truyền hình: "Đến các vòng sau thì chắc chắn tay anh sẽ run, mà tay run thì đánh một quả xa vào lỗ không dễ chút nào. Nhưng thứ tôi cố làm là bước vào bàn với vẻ tự tin, đừng sợ cú này, nó là cú đơn giản thôi. Cứ tưởng tượng là anh đang ở câu lạc bộ của mình và đang tập cú đó. Cứ đánh y như lúc tập." Anh coi run tay là mặc định chứ không phải sự cố, và hai thao tác của anh đều nằm trong đầu: hạ độ khó của cú đánh, rồi dời bối cảnh về buổi tập.'},
      {h:'Áp lực được đo bằng số cơ hội còn lại, không đo bằng tiền thưởng', p:'Hỏi sân khấu lớn có phải loại áp lực khác không, anh trả lời bằng số học: "Một năm có sáu chặng Euro Tour, mà chỉ có một US Open. Nên anh có sáu cơ hội vô địch Euro Tour trong một năm, còn US Open thì chỉ một cơ hội, vì thế áp lực lớn hơn nhiều." Ba tuần sau, so chung kết ở Las Vegas với chung kết Euro Tour, anh chọn Las Vegas nặng hơn vì đó là lần đầu. Áp lực của anh tỷ lệ với độ hiếm của cơ hội và độ mới của tình huống, không dính tới đối thủ, cũng không dính tới tiền.'},
      {h:'Hai lần đầu bận chuyện ngoài bàn, hai lần vô địch', p:'Tháng 2/2022, bạn gái người Ukraine đang tìm đường rời Ukraine giữa chiến sự, anh thua trận đầu rồi thắng một mạch tới cúp: "Rốt cuộc chẳng có áp lực nào cả, vì đầu tôi để ở nơi khác, ở Ukraine." Tháng 3/2022, phòng khách sạn bị đột nhập, ví bị lấy sạch, ba ngày sau anh vô địch giải 192 cơ thủ: "Tôi chỉ cố tập trung vào trận đấu, gần như không cảm xúc gì, vì đầu tôi để ở nơi khác, chắc là tôi bị sốc. Tôi vẫn muốn thắng, nhưng không có cái áp lực lớn đó đè lên tôi." Không ai đi tìm biến cố để đánh hay hơn, nhưng hai ca này chỉ đúng chỗ đau: thứ phá anh không phải bàn bi, mà là giá trị anh gán cho trận đấu.'},
      {h:'Tập một mình trong im lặng, và đó là bước nhảy lớn nhất của anh', p:'"Nhìn chung tôi đã thay đổi hệ thống tập. Tôi bắt đầu tập một mình nhiều hơn từ khi dịch Covid nổ ra. Trước kia tôi chủ yếu chỉ đánh vài séc với bạn bè, còn giờ thì gần như lần nào tôi cũng cố tập một mình." Anh còn siết chặt hơn trên podcast: tập thì không bật nhạc, muốn yên tĩnh tuyệt đối; nhưng vào giải thì "tôi thích đánh trước khán giả, có cảm xúc, chính thứ đó thúc tôi bung ra trận hay nhất". Ghép với mục trên thì buổi tập im lặng ấy chính là nơi trú ẩn anh gọi về trong đầu ở cú đánh nặng nhất của giải.'},
      {h:'Giấc mơ cố định 15 năm, mốc thời gian thì cố ý bỏ trống', p:'Với báo: "Giấc mơ vô địch thế giới có trong tôi từ năm mười tuổi, và chắc chắn tôi sẽ không ngừng chơi bi-a cho tới khi làm được điều đó." Nhưng ở tầng ngắn hạn thì ngược lại: "Tôi không đặt mốc thời gian nào cho việc vô địch giải nào cả. Bây giờ tôi không có mục tiêu nào hết, chỉ chơi trận của mình rồi xem chuyện gì xảy ra." Cùng cách đó, anh từ chối nhận mình là cơ thủ Ba Lan hay nhất: "Việc xác định ai giỏi nhất không phải việc của tôi." Hình dạng hoàn chỉnh của quy tắc này nằm trong tuyên bố năm 2025 của anh: "Kết quả ra sao cũng được. Nhưng như mọi khi, tôi sẽ dốc 100%."'},
    ]},
  {key:'psy_pro_antonraga', tag:'Cơ thủ', title:'Anton Raga: điểm tựa đặt ngoài bàn bi-a, và một lỗi nhịp độ sống mười năm — hồ sơ từ 6 video/bài phỏng vấn', who:'Anton Raga',
    intro:'Rút từ 6 nguồn công khai về Anton "The Dragon" Raga (Philippines, á quân China Open 2019, á quân European Open 2023, hạng 16 FargoRate), trải từ 2013 tới 2025: hai video phỏng vấn của hãng vải bàn CPBA năm 2021 có bản dịch tiếng Anh dựng sẵn trong khung hình, ba bài SunStar Cebu các năm 2013, 2015 và 2025, cùng hai bài quan sát của trang 77.billiards. Nét cốt lõi: một cơ thủ gần như không có bộ công cụ tâm lý nào, đặt toàn bộ điểm tựa vào người thân ở ngoài phòng đấu, và mang một lỗi nhịp độ đã bị gọi tên từ năm 15 tuổi mà mười năm sau vẫn còn nguyên.',
    body:[
      {h:'Áp lực là đối thủ phải đánh lại, và cả bộ công cụ chỉ có hai động tác', p:'Được hỏi thẳng cách xử lý áp lực, Raga trả lời đúng một câu: "Tôi chống lại áp lực của mình bằng cách cố thả lỏng và tập trung vào mục tiêu." Động từ anh chọn là chống lại, tức xếp áp lực vào loại đối thủ, khác hẳn Joshua Filler coi hồi hộp là nhiên liệu và khác Albin Ouschan coi nó là phản ứng cơ thể cần công cụ riêng để dập. Trong cả 24 câu hỏi của buổi phỏng vấn không có một kỹ thuật thở, một câu tự nhủ hay một quy trình trước cú đánh nào được nêu ra. Bộ công cụ mỏng tới mức gần như không có gì để hỏng, và đó vừa là sức bền vừa là chỗ hở của anh.'},
      {h:'Hỏi điểm mạnh trong trận, đáp bằng tên vợ con', p:'Câu hỏi là điểm mạnh của anh bên trong trận đấu, chỗ mọi cơ thủ thường kể ra cú phá hay khả năng dọn bàn. Raga đáp: "Gia đình tôi và con tôi. Lúc nào đánh tôi cũng nghĩ tới con." Anh không đặt điểm tựa vào bất cứ thứ gì thuộc về bàn bi-a, cũng không đặt vào chính mình. Ghép với câu ở trên thì ra một cơ chế hoàn chỉnh: thả lỏng để hạ mức kích thích, rồi kéo chú ý về một hình ảnh đủ nặng để nó khỏi trôi sang tỷ số. Ở buổi hỏi nhanh cùng ngày, được hỏi anh giỏi gì ngoài bi-a, câu trả lời cũng là "chăm con cho tốt".'},
      {h:'Xử lý thua: chấp nhận, giữ mình cứng, rồi tin phần thắng chỉ đang tới muộn', p:'Được hỏi làm cơ thủ thì học được gì, phản xạ đầu tiên của Raga là hạ thấp chính mình rồi mới nói nội dung: "Học được gì à, chẳng nhiều nhặn gì. Chỉ là nếu thua thì phải chấp nhận. Cứ vững vàng thôi. Hôm nay thua thì rồi khoảnh khắc chiến thắng cũng sẽ tới." Cấu trúc là ba nhịp, gồm chấp nhận, giữ cứng, tin vào độ trễ, và không có nhịp nào là tìm nguyên nhân hay xem lại băng. Đây là kiểu chịu đựng bền bỉ chứ không phải kiểu kỹ thuật: nó giữ người ta khỏi sụp sau trận thua đau, nhưng tự nó không sinh ra bản sửa lỗi.'},
      {h:'Lỗi nhịp độ bị gọi tên năm 2013, mười năm sau vẫn còn nguyên', p:'Đây là chỗ duy nhất có người trong nghề chẩn thẳng vào tâm lý thi đấu của Raga. Năm 2013, Roberto "Superman" Gomez khen cậu bé 15 tuổi có đủ tài để thành vô địch thế giới, rồi nói ngay chỗ hỏng: "Chỉ hơi nôn nóng thôi, nó muốn kết thúc ván đấu ngay lập tức. Và đôi khi nó không nghĩ hết nước cho cú đánh của mình. Tôi đã bảo nó đừng vội ở các cú đánh." Mười năm sau, trang 77.billiards tả Raga ở chung kết European Open 2023: "Anh đi rất nhanh, với vô số động tác nhỏ và cuống, có lẽ để che đi sự hồi hộp anh đang cảm thấy, dù nét mặt vẫn điềm nhiên." Hai lời mô tả cách nhau một thập kỷ, từ hai người không liên quan, chỉ vào đúng một chỗ.'},
      {h:'Thắng thì gọi là ăn may, và lời đầu tiên sau chức vô địch là tên người khác', p:'Năm 2015, 17 tuổi, vừa đoạt chức vô địch thứ hai trong hai tuần, Raga nói về trận chung kết: "Ăn may thôi. Bungay cũng khó đấu lắm. Cú đẩy cơ của anh ấy rất tốt, phòng thủ cũng tốt. Tôi chỉ ăn may thật đấy." Bốn câu, hai câu đầu cuối đều là chữ ăn may, ở giữa là lời khen người anh vừa đánh bại. Mười năm sau, vô địch SBA Philippine Open 2025, câu anh nói là: "Tôi muốn dâng chiến thắng này cho gia đình tôi, bạn bè tôi, những người ủng hộ tôi, và Chúa." Lại một câu không có chỗ nào dành cho chính mình. Nét này chặn được đường dẫn từ thắng lợi tới tự mãn, nhưng người quy chiến thắng cho vận may thì cũng không tích lại được vốn tự tin từ chính những trận đã thắng.'},
      {h:'Phần chuẩn bị được canh chặt lại nằm hết ở thân thể', p:'Trước giải anh chuẩn bị thế nào: "Tôi luôn tập một tháng trước giải." Trước trận anh tránh gì, câu trả lời gọn bốn chữ: "Đổ bệnh và thức khuya." Ở buổi hỏi nhanh, anh khai tập 07 tiếng mỗi ngày và giờ tập tốt nhất là buổi chiều. Toàn bộ phần chuẩn bị của Raga là chuẩn bị vật lý, gồm số giờ trên bàn, giấc ngủ, sức khoẻ, và không có một mục chuẩn bị tinh thần nào, cũng không có mục nào canh nhịp độ. Cái gì anh được dạy thì anh canh chặt, cái gì không ai dạy thì để trống.'},
      {h:'Chưa từng định làm cơ thủ, và thang đo thành công là chiếc xe', p:'Được hỏi có muốn trở thành cơ thủ không, chữ đầu tiên là "Không": "cạnh nhà tôi có một chỗ chơi bi-a, vì thế mà tôi chơi. Một chuyện có thật về tôi là tôi phải đứng lên ghế mới chơi được." Anh bắt đầu năm 09 tuổi, nhỏ tới mức không với tới mặt bàn, và người dạy anh là "tất cả mọi người". Năm 15 tuổi anh nói dồn hết vào bi-a chính vì không được đi học. Đường vào nghề không có bước chọn nào, nên thang đo cũng đi theo: hỏi dựa vào đâu để nói mình đã thành công, anh đáp "từ giải China Open, tôi mua được xe, tôi có đầu tư. Dù hiện giờ tôi chưa có nhà"; hỏi sẽ chơi tới bao giờ, anh đáp "chừng nào thân thể và mắt tôi còn được". Không một danh hiệu nào được nêu làm đích trong cả buổi phỏng vấn.'},
    ]},
  {key:'psy_pro_kaci', tag:'Cơ thủ', title:'Eklent Kaçi: người tự lực tuyệt đối, không thầy và không huấn luyện viên tâm lý — hồ sơ từ 11 video/bài phỏng vấn',
    intro:'Rút từ 02 phỏng vấn video (podcast Doggin\' It 34 phút và chương trình Off The Rail của Matchroom), 07 bài báo có trích dẫn trực tiếp (WPA, Matchroom/World Nineball Tour, Sky Sports) và 02 tuyên bố Kaçi tự viết công khai, trải từ 11/2019 tới 03/2026. Nét cốt lõi: anh chưa từng có huấn luyện viên kỹ thuật lẫn huấn luyện viên tâm lý, tập một mình và đi thi đấu một mình gần mười năm — và toàn bộ cách anh xử lý áp lực mọc ra từ đúng cái nền đó.',
    body:[
      {h:'Không thầy, không huấn luyện viên tâm lý — và anh nói thẳng ra', p:'Bị hỏi thẳng về chuyện có người kèm cặp hay không, Kaçi trả lời: "Cả đời tôi chưa từng có huấn luyện viên. Cả đời tôi chưa từng có huấn luyện viên tâm lý. Chỉ có mình tôi thôi. Hồi bé mà có ai đến bảo \'này, để tao chỉ mày cú này\' thì tôi sẽ nói: thôi, để tự tôi tìm ra." Nguồn của sự chai lì ấy là hoàn cảnh chứ không phải ý chí: "Chẳng có mấy cơ thủ Albania đi đánh khắp thế giới. Suốt tám chín năm nay tôi đi khắp nơi, quen đánh ở mọi chỗ mà không có ai đứng sau lưng, không có ai theo dõi hay cổ vũ mình. Nên có người ủng hộ hay không, với tôi cũng vậy. Kể cả khi có bạn bè ngồi phía sau, tôi không thực sự nhìn thấy họ — tôi chỉ nhìn thấy cái bàn bi-a."'},
      {h:'Tự tin là điều kiện để lên đường, không phải phần thưởng cho việc thắng', p:'Năm 2021, khi mới vào bán kết World Pool Masters, anh nói câu gọn nhất về nét này: "Nếu tôi không nghĩ mình đi được tới cùng thì tôi đã chẳng đến đây." Năm năm sau, ở Premier League Pool 2026, vẫn đúng khuôn ấy: "Tôi tin vào lối đánh của mình và tôi biết mình đủ sức vô địch giải này." Và ngay sau danh hiệu đơn đầu tiên ở đấu trường Matchroom, anh không nói về cảm xúc mà nói về vị thế: "Tôi cảm thấy từ giờ tôi sẽ là một vấn đề lớn hơn ở các giải Matchroom." Ba câu cách nhau năm năm, cùng một hình dạng: sự tự tin được khai TRƯỚC trận, làm điều kiện tham dự.'},
      {h:'Đối thủ bị loại khỏi phương trình, nhưng chỉ theo một chiều', p:'Về việc hạ đối thủ lớn: "Nếu anh thấy mình đang đúng phong độ thì anh chẳng bận tâm đối thủ là ai. Anh chỉ tập trung đánh cho đúng, và nếu đánh đúng lối của mình thì chẳng có gì hỏng được." Nói về Sánchez Ruiz — người đã dẫn anh 5-1 ở chung kết thế giới: "Nó có thắng liên tục mười năm thì nếu tôi được gặp nó tôi chỉ mạnh thêm thôi. Chuyện đó chỉ đẩy tôi tập trung hơn." Nhưng cùng buổi phỏng vấn anh thừa nhận chiều ngược lại: gặp người chưa vô địch giải lớn nào và đã bị bỏ xa thì "tôi cố chơi cho vui một chút". Tức đối thủ không đẩy anh xuống được, chỉ có thể khiến anh lơi ra.'},
      {h:'Bị dẫn 1-5 ở chung kết thế giới, câu lệnh duy nhất là \'cứ đánh tiếp\'', p:'Chung kết World 10-Ball 2023, Kaçi bị dẫn 1-5 rồi thắng 09 trong 11 ván cuối. Ngay sau trận: "Tôi có làm gì sai đâu. Tôi tự nhủ: \'cứ đánh tiếp thôi\'. Tôi cố giữ tập trung vì đây là chung kết thế giới, đâu phải lúc nào cũng được đứng ở chỗ này. Tôi chỉ chờ cơ hội của mình." Ba tháng sau anh thêm vế mà ít cơ thủ chịu nói: "Mọi thứ đã có thể hỏng hết. Và tôi cũng may là có mấy cú ăn may đó, bởi không phải cú phòng thủ nào cũng là cú chắc ăn." Hai mệnh đề đứng cạnh nhau mà không triệt tiêu nhau: không làm gì sai, và có may.'},
      {h:'Đổi bên phá — cắt trạng thái lái tự động bằng một biến vật lý nhỏ', p:'Ở chung kết UK Open 2023 anh đổi bên phá dù đang phá rất tốt, và lý do hoá ra không phải hình học: "Có những trận tôi phá ba bốn lần liên tiếp, phá hoàn hảo, rồi tới lần thứ năm thứ sáu thì tôi đánh quá tay. Chỉ cần một góc mới thôi — anh đổi một chút là như thể anh tập trung lại từ đầu, lấy lại tiêu điểm, cam kết lại với cú đánh. Nó cũng là chuyện tâm lý nữa." Đây là quy trình chống trôi tập trung được nguỵ trang thành quyết định chiến thuật: không cần ý chí, chỉ cần đổi một biến nhỏ.'},
      {h:'Cái ghế là kẻ thù — và anh dùng nó ngược lại', p:'Bị kéo vào một trận dài lê thê ở UK Open 2023, anh xử lý bằng luật thay vì bằng kiên nhẫn: "Người ta đánh mỗi cú lâu quá và để tôi ngồi ghế cả tiếng đồng hồ. Tôi yêu cầu bấm giờ và mọi thứ thay đổi." Ngay tối đó anh nêu tiêu chuẩn: "Một tiếng trôi qua mà mới xong sáu bảy ván thì phải yêu cầu bấm giờ chứ." Rồi sau khi vô địch bằng trận thắng Joshua Filler 13-4, anh nói ra đúng cơ chế mình vừa dùng để hạ đối thủ: "Joshua không có nhiều cơ hội, mà ngồi ghế quá lâu thì người ta không thấy thoải mái."'},
      {h:'Tách \'đánh dở\' khỏi \'thua\' — hai sổ riêng, ghi thật lạnh', p:'Vừa thắng để vào top 16 UK Open, anh vẫn tự đánh giá: "Tôi may và tôi mừng vì thắng được trận này, bởi mười ván cuối tôi đánh rất tệ." Chiều ngược lại, kể về ba năm ở giải vô địch thế giới 10 bi, anh cho rằng năm về ba mình đánh hay hơn năm vô địch. Cùng lối đó, thất bại thì anh khai ra chứ không giấu: "Năm ngoái với tôi là thất vọng — tôi bị loại sớm và chuyện đó cứ ở lại trong tôi. Lần này tôi muốn cho thấy một phiên bản khác của mình." Người ghi lẫn hai sổ sẽ tự mãn sau trận thắng may và tự đập mình sau trận thua đánh tốt.'},
      {h:'Tháng 8/2026: thua sớm mà không đổ cho điều kiện bên ngoài', p:'Hai phát biểu cách nhau năm ngày cho thấy cả hai đầu của con lắc. Ngày 09/08/2026, vào bán kết Florida Open, Kaçi vẫn dùng đúng khuôn tự tin cũ: "Tôi thấy rất khoẻ. Năm nay tôi làm việc thật sự chăm để lấy lại phong độ tốt nhất, và tôi biết mình làm được gì. Đánh với ai cũng không quan trọng. Tôi tin vào lối đánh của mình, và nếu cú phá chạy và tôi vào được vùng của mình thì tôi biết mình đấu được với bất kỳ ai." Ngày 14/08/2026, thua Sun Yi Hsuan 7-10 ngay vòng đầu Arizona Open, anh nói: "Tôi tiếc vì ra sớm quá, nhưng đó là cuộc chơi. Ở thể thức này không ai an toàn cả, và hôm nay tôi phải trả giá. Đó là một hồi chuông cảnh tỉnh. Tôi cần học từ nó và quay lại mạnh hơn." Đáng chú ý là lần này không có một chữ nào về bi cái, ánh sáng bàn hay nhịp đánh của đối thủ — khác hẳn cách anh truy nguyên nhân ra bên ngoài sau trận thua giải thế giới 2025.'},
    ]},
  {key:'psy_pro_duongquochoang', tag:'Cơ thủ', title:'Dương Quốc Hoàng: hạ kỳ vọng xuống trước rồi mới vào bàn — hồ sơ từ 13 bài phỏng vấn', who:'Dương Quốc Hoàng',
    intro:'Rút từ 13 bài báo có trích dẫn trực tiếp lời Dương Quốc Hoàng "Hoàng Sao" (Việt Nam, hạng 18 thế giới, cơ thủ Việt Nam và châu Á đầu tiên vô địch một giải Major của Matchroom), trải từ 01/2024 tới 08/2026. Nét cốt lõi: anh không mô tả mình bằng ngôn ngữ tự tin mà bằng ngôn ngữ sức bền, và hai bước ngoặt lớn nhất sự nghiệp đều đến đúng lúc anh vào giải mà không đặt mục tiêu thành tích.',
    body:[
      {h:'Bước ngoặt đến khi kỳ vọng bị hạ xuống thấp nhất', p:'Giải vô địch thế giới 9 bi 2023 là giải anh loại đương kim vô địch Shane Van Boening 11-10 rồi vào tứ kết. Tâm thế lúc vào giải, do chính anh kể: "Tôi dự giải mà không đặt mục tiêu thứ hạng cao, vì phong độ lúc ấy của tôi không tốt, trong khi đây là giải vô địch thế giới, một sự kiện khổng lồ với rất nhiều đối thủ mạnh." Nhưng đó không phải buông xuôi — cùng câu trả lời ấy anh nói tiếp: "Có căng thẳng đôi chút, nhưng tôi vẫn cố chơi khôn." Hạ kỳ vọng về kết quả, giữ nguyên yêu cầu về cách chơi.'},
      {h:'Trạng thái tốt nhất là "vừa đủ", không phải căng hết sức', p:'Kể lại giải Premier League Pool 2026 mà anh vô địch, anh gọi thể thức đánh liên tục nhiều ngày là "cỗ máy vắt sức", rồi mô tả trạng thái thi đấu tối ưu bằng một hình ảnh rất đời: "Nó giống như một bữa ăn: ăn không quá no để sinh ra chây ì, nhưng cũng không bị đói. Một trạng thái \'vừa đủ\' để thấy rằng cả giải đấu và bản thân các cơ thủ vẫn còn dư địa để bùng nổ hơn nữa." Thước đo anh dùng không phải nhiều hay ít, mà là còn dư địa hay không, cùng hướng với việc hạ kỳ vọng ở trên, tức đưa mức kích hoạt về giữa thay vì đẩy lên tối đa.'},
      {h:'Gọi tên đủ mọi bất lợi trước, rồi mới xử lý', p:'Trước giải thế giới 10 bi 2025 trên sân nhà, anh nói: "Thi đấu trên sân nhà có chút áp lực nhất định từ bản thân và người hâm mộ. Nhưng nếu vượt qua áp lực đó, tôi sẽ có động lực rất lớn" — và sáu ngày sau lặp lại đúng khuôn ấy giữa giải, tức đây là cách nghĩ đã định hình chứ không phải câu nói xã giao. Cùng giải đó, trước trận gặp Joshua Filler, anh khai thẳng cả cái bụng đang trúng thực: "Tôi chỉ ăn được một tô cháo. Nên khi vào trận, gặp đối thủ đẳng cấp như Filler, tôi càng thêm áp lực." Rồi thua set một 1-4 và ngược dòng thắng 3-2. Trong toàn bộ tư liệu công khai không có một câu nào anh nói mình không thấy áp lực.'},
      {h:'Cột mốc anh tự đặt là một trạng thái, không phải một danh hiệu', p:'Sau mùa Premier League Pool 2025 chơi kém và bị chỉ trích nặng trên mạng, anh viết thư ngỏ trên trang cá nhân: "Tôi không viết ra những dòng này để thanh minh... Tôi chỉ muốn ghi lại một điều: Tôi biết rất rõ mình đang ở đâu", và "Tôi không hoàn hảo, tôi không thắng mãi, nhưng tôi không bỏ cuộc". Lời hứa anh tự đặt cho mình là chơi cho đến lúc lòng mình không còn sợ nữa. Một cột mốc kiểu ấy không sụp khi thua trận kế tiếp, đó chính là lý do nó chống được dư luận.'},
      {h:'Tự tin là thứ phải giữ, nhưng vẫn cho phép mình sướng', p:'Tháng 02/2026 anh thắng Sánchez Ruiz 7-4 ở chung kết Premier League Pool, sau khi dẫn 6-2 rồi trượt bi số 9 cho đối thủ rút ngắn còn 4-6. Lời anh nói ngay sau đó: "Có những lúc khó khăn, nhưng tôi cứ tiếp tục tin vào bản thân và giữ tập trung cho tới cuối cùng." Hai động từ đều là động từ duy trì, không phải động từ bùng nổ. Nhưng khi kể lại lúc cầm cúp thì anh không hạ giọng khiêm tốn: "Nói thật là cảm giác lúc ấy nó... \'sĩ\' thật sự mọi người ạ. Sướng lắm!" Người chỉ biết chịu đựng mà không biết hưởng thì khó trụ lâu ở nghề này.'},
      {h:'Nét nền: người không nghĩ xa, và một lời dặn ngoài chuyên môn', p:'Anh tự mô tả tính mình khi rời quê vào TP HCM với hai triệu đồng trong tay: "Bản tính tôi là không lo nghĩ quá xa, trong đầu chỉ xác định khi vào đó sẽ dùng hai bàn tay kiếm sống." Người thầy đầu tiên, ông Lưu Minh Phúc, không dạy anh về cú đánh mà dặn anh phải nghĩ trước khi nói bất cứ điều gì, theo VnExpress, chính lời dặn đó tạo nên phong thái không vội của anh khi rơi vào thế bi khó hay bị dẫn sâu. Chỗ hỏng cần vá được xác định là tính bốc đồng, không phải kỹ thuật.'},
      {h:'Từng định bỏ hẳn, và động cơ hiện nay nằm ngoài bản thân', p:'Cuối 2022 anh đã tính dừng: "Tôi từng muốn từ bỏ sự nghiệp thi đấu quốc tế cuối năm 2022, sau khi đánh ba giải ở Mỹ mà không thành công. Khi đó, tôi tính tới việc sẽ ngừng thi đấu, tập trung kinh doanh trong nước." Sau chức vô địch 2026, thứ anh nói tới lại là người khác: "Tôi mong chiến thắng này truyền cảm hứng cho các cơ thủ trẻ Việt Nam dám mơ lớn hơn và làm việc chăm hơn." Và mục tiêu ngoài bàn đấu của anh cũng theo chiều đó: mở câu lạc bộ riêng cho người trẻ tập, mà theo lời anh, "cũng là cách để tôi giữ lửa cho chính mình".'},
    ]},
  {key: 'psy_pro_naoyukioi',
  tag: 'Cơ thủ',
  title: 'Naoyuki Oi: bỏ kỳ vọng, giữ đúng một luật là không đạp phanh — hồ sơ từ 14 bài phỏng vấn',
  who: 'Naoyuki Oi',
  intro: 'Rút từ 14 bài phỏng vấn công khai trải từ 03/2017 tới 04/2026: 11 bài dài của báo chuyên ngành Nhật Bản Billiards Days, cùng 03 nguồn tiếng Anh (Sky Sports, Matchroom Pool). Nét cốt lõi: Oi không có, và không cần, cảm giác mình mạnh hơn đối thủ; thứ thay chỗ cho sự tự tin là một luật vận hành duy nhất mà anh gọi bằng hình ảnh chân ga và chân phanh.',
  body: [{
    h: 'Không có cảm giác mạnh hơn ai — và vẫn ra trận với nền đó',
    p: 'Suốt gần mười năm phỏng vấn, câu tự đánh giá của Oi gần như không đổi. Năm 2017: "Tôi đánh với hầu hết mọi người trong tâm thế \'người này mạnh hơn mình\'. Ít nhất là chẳng có đối thủ nào để mình đánh mà thư thả được, mà cũng chẳng ai đang đánh thư thả cả." Năm 2021, khi đã vào top 5 thế giới, vẫn y hệt: "Cảm giác \'mình hơn về thực lực\' thì hoàn toàn không có. Ai cũng mạnh, và ai cũng đang đánh nhau ở chỗ mỏng như tờ giấy." Tới 2023 anh mô tả chính xác trạng thái mang ra bàn: "Tôi chẳng nghĩ là mình thắng được, mà cũng chẳng nghĩ là mình sẽ thua." Thứ anh gỡ bỏ không phải sự tự tin, mà là kỳ vọng — và người không dự báo kết quả thì giữa trận không có gì để bị phản bội.'
  }, {
    h: 'Chân ga và chân phanh: đạp nhẹ cũng được, nhưng đừng phanh',
    p: 'Đây là mô hình cốt lõi của Oi, nói năm 2021: "Thấy sợ thì cứ đánh theo kiểu của người đang sợ, thấy chắc vào thì cứ đánh theo kiểu tin là nó vào. Tóm lại là tôi muốn giữ chân ga đạp liên tục. Có lúc đạp mạnh, có lúc để máy chạy chậm, nhưng phanh thì tôi cố hết sức không đạp." Lý do rất cụ thể: "Càng đạp phanh tôi càng thấy mình mất quyền kiểm soát chính mình. Rõ nhất là lúc thua trận: nhiều tay cơ xuống tinh thần rồi đạp phanh ở đúng chỗ đó." Khác hẳn lối suy nghĩ tích cực thông thường, anh không đòi cảm xúc phải đổi màu: "Tiêu cực thì cứ để nguyên nó là tiêu cực mà nhận lấy, rồi cố nhìn về phía sáng nhất có thể và làm tiếp thôi." Cái anh chống không phải cảm xúc xấu, mà là quãng thời gian chết sau khi thua.'
  }, {
    h: 'Bỏ hẳn việc kiểm điểm — nhưng không bỏ việc chuẩn bị',
    p: 'Năm 2023 Oi khai thẳng: "Giờ đánh hỏng tôi thật sự không bận tâm, cũng không truy lý do. Vì lý do thì biết thừa rồi còn gì. Tôi định không kiểm điểm nữa, chỉ nhìn về phía trước thôi." Ba năm sau anh nói lại kèm lý do: "Đúng y hệt tình huống ấy, đúng y hệt viên bi ấy thì sẽ không bao giờ đến nữa." Thứ thay chỗ cho việc kiểm điểm là một thước đo khác: "Trận thua hay trận thắng, tất cả những gì làm được và nghĩ ra được vào lúc ấy thì tôi đều đã làm." Đọc kèm phần anh không bỏ: mùa đông là lúc anh bận nhất vì chuẩn bị cả năm. Nói gọn — kiểm điểm trong lúc chuẩn bị, không kiểm điểm sau khi thua.'
  }, {
    h: 'Chỗ hỏng anh tự nhận: dẫn trước rồi sập',
    p: 'Oi không giấu phần tối. Sau khi dẫn 6-2 rồi thua 6-11 ở bán kết China Open 2024: "Chuyện tôi chạy trước rồi giữa chừng đâm ra kỳ quặc là một dạng khá hay gặp ở tôi. Đã gặp bao nhiêu lần rồi mà lần này vẫn thế. Tôi chỉ giãy giụa loạn lên rồi kết thúc." Câu anh rút ra đáng chép lại: "Trong ăn thua thì lúc sắp thắng là lúc nguy hiểm nhất, bởi vì lúc mình sắp hạ được đối thủ chính là lúc đối thủ mạnh lên nhất." Đầu 2026, dẫn 11-0 ở chung kết rồi bị gỡ 3 ván, anh vẫn nói: "Tôi nao núng chứ. Cùng là con người, nên cái gì mình làm được thì đối thủ cũng làm được." Cùng một niềm tin vừa là nguồn sức mạnh vừa là nguồn rò rỉ.'
  }, {
    h: 'Lượng khởi động phải là hằng số, không phải biến số theo độ lớn của trận',
    p: 'Bài học đắt nhất trong hồ sơ đến từ trận chung kết European Open 2025 thua Joshua Filler: "Tôi tập trước trận chung kết quá nhiều, vào trận thì lại gồng quá mức. Ngược lại Joshua thì y như mọi khi, khoảng 25 phút trước giờ đấu mới xuất hiện ở bàn tập, đánh loáng một cái rồi vào trận. Còn bên này thì tập những một tiếng rưỡi." Nguyên nhân sâu hơn nằm ở trận bán kết, khi anh dồn hết năng lượng cảm xúc vào việc trả thù đối thủ đã hạ mình ở vòng loại: "Tôi tập trung dồn màn trình diễn tốt nhất vào trận bán kết, kết quả là trả được nợ nhưng cũng xả sạch ở đúng chỗ đó." Tập gấp ba lượng thường lệ vì trận quan trọng gấp ba, chính việc đó đã tố cáo rằng trận ấy bị coi là khác thường trước cả khi vào bàn.'
  }, {
    h: 'Đám đông không phải áp lực; thứ cần chứng minh mới là',
    p: 'Trái với hình dung về cơ thủ Nhật kín tiếng, Oi nói: "Càng nhiều người nhìn thì tôi càng dễ tập trung." Áp lực ở anh đến từ chỗ khác — từ việc mang một điều cần chứng minh vào bàn. Về nhà tài trợ: "Tôi muốn đáp lại sự hỗ trợ của mọi người. Nhưng cứ muốn đáp lại, muốn đáp lại, rồi lòng nặng trĩu mà hỏng việc thì tôi cũng không thích, nên trong lúc thi đấu tôi chuyển kênh." Về một hướng kỹ thuật mới vừa tìm ra: "Đi thi đấu trong trạng thái đó thì khó lắm. Ham muốn chứng minh mà mạnh thì áp lực cũng mạnh theo." Món nợ ân tình, mối thù cần trả, giả thuyết cần kiểm chứng — cả ba đều làm hỏng như nhau.'
  }, {
    h: 'Câu cá dạy anh rằng cố hết sức vẫn có thể không được đền đáp',
    p: 'Khi được hỏi điều gì khác giữa lần vô địch Japan Open 2019 và hai lần á quân trước đó, Oi trả lời không nằm ở kỹ thuật: "Tôi bớt xét nét chính mình đi. Chắc là vì tôi bắt đầu đi câu." Không phải để khuây khoả: "Câu cá thì tôi cũng làm hết sức. Việc gì cũng vậy, có những chuyện mình cố hết sức mà chẳng được đền đáp gì. Câu cá là thứ hay lộ ra điều đó nhất — chính câu cá đã dạy tôi rằng có những lúc làm gì cũng không xuôi." Hệ quả trực tiếp lên tâm thế thi đấu, nói ngay trong bài đó: "Lần này tôi cũng ở trong tâm thế cỡ \'thua thì thua chứ sao\'." Đối chiếu với chức vô địch 2018, câu tự thuật giống tới mức đáng ngờ: "Ít nhất lần này tôi không nghĩ kiểu \'thua thì làm sao\'."'
  }]
}, {
  key: 'psy_pro_jonasmagpantay',
  tag: 'Cơ thủ',
  title: 'Jonas Magpantay: thua bốn lần trong năm ngày rồi vô địch thế giới — hồ sơ từ 9 video/bài phỏng vấn',
  who: 'Jonas Magpantay',
  intro: 'Rút từ 9 nguồn công khai về Jonas "The Silent Killer" Magpantay (Philippines, vô địch Qatar World Cup 10 bi 2025, vô địch Universal Open 2026), trải từ 11/2025 tới 06/2026: ba bài của trang 77.billiards, báo BusinessWorld và Philstar dẫn phỏng vấn của Liên đoàn Bi-a Qatar, ba tờ báo tiếng Tagalog Abante, Fastbreak và Police Files Tonite, cùng Rebanse.ph. Nét cốt lõi: không có bộ công cụ tâm lý trong trận, nhưng có một khung thời gian rất dài để chứa thất bại — mọi trận thua đều được xếp vào chỗ "chưa tới thời khắc đã định".',
  body: [{
    h: 'Xử lý trận thua bằng một lời hẹn với chính cái danh hiệu',
    p: 'Tháng 09/2025 anh thua Carlo Biado ở vòng 16 giải vô địch thế giới 10 bi tại Thành phố Hồ Chí Minh. Sau trận, anh đăng lên Facebook: "Tôi biết mọi chuyện chưa kết thúc ở đây. Rồi sẽ có ngày tôi lấy được ngươi. Cứ chờ tôi. Tôi sẽ không buông ngươi. Khi đến đúng thời khắc đã định cho hai ta, tôi sẽ chiếm được ngươi — ngôi vô địch thế giới 10 bi." Đối tượng anh xưng hô là cái danh hiệu, không phải người vừa thắng anh, và cả đoạn không có một chữ nào về nguyên nhân thua. Hai tháng sau anh vô địch thế giới thật.'
  }, {
    h: 'Thua cả bốn vòng loại rồi vô địch trong cùng một tuần',
    p: 'Ở Doha tháng 10-11/2025, mỗi tay cơ có bốn lần thử qua vòng loại. Magpantay đánh cả bốn và thua cả bốn, trong đó hai lần thua 6-7 khi chỉ còn cách suất chính thức đúng một ván. Anh lọt vào giải chính bằng suất điểm sau khi một người khác rút lui, rồi hạ liền Szolnoki, Biado, Szewczyk, Feijen, Neuhausen và Kural để lấy cúp. Trang 77.billiards viết anh "trông gần như không thể bị đánh bại suốt giải, chứ không giống một người đã phải đánh vòng loại bốn lần chỉ để lọt vào giải chính". Trận vừa thua gần như không mang theo trọng lượng nào sang trận kế.'
  }, {
    h: 'Vô danh được anh dùng như chỗ trú, không phải thiệt thòi',
    p: 'Trước trận chung kết ở Doha, Liên đoàn Bi-a Qatar hỏi anh cảm giác thế nào. Anh đáp: "Điều đó có ý nghĩa rất lớn với tôi, vì đây là lần đầu tôi dự giải ở Qatar và không ai biết tôi là ai, nên tôi thấy thoải mái và tôi chỉ muốn đánh đúng bài của mình." Cấu trúc câu là một chuỗi nhân quả: không ai biết tôi, nên tôi thoải mái, nên tôi đánh đúng bài. Đây là trạng thái tốt nhất mà một người chơi có được ở giải lớn đầu tiên của mình, và nó chỉ dùng được một lần.'
  }, {
    h: 'Thắng rồi thì quy công cho ngày đẹp, không quy cho mình',
    p: 'Được hỏi trận nào khó nhất, anh chọn trận thắng Biado lần đầu tiên trong đời: "Người tôi vất vả nhất đúng là Carlo Biado. Anh ấy là nhà vô địch thế giới của chúng ta mà. Nhưng cũng may là hôm đó lối đánh của tôi lên thật. Ngày hôm đó của tôi đẹp lắm, cứ như mọi thứ đều thuận cho tôi." Cả câu chỉ có một mệnh đề nói về năng lực bản thân, và nó mở đầu bằng chữ "cũng may là". Kiểu quy nhân này che chắn rất tốt khi thua, nhưng không tích thành vốn tự tin mang sang trận sau.'
  }, {
    h: 'Đang là nhà vô địch thế giới vẫn nói có người đánh hơn mình',
    p: 'Trong đúng tuần lễ vô địch, anh nói về đàn em: "AJ Manas thì đúng là đẳng cấp khác. Mỗi lần bọn tôi đánh biểu diễn với nhau là tôi thua cậu ấy. AJ đúng chuẩn tầm vô địch thế giới rồi." Cùng buổi, anh tự chèn thêm một mệnh đề không ai hỏi: "Tôi không nói tôi là người giỏi nhất đâu, chỉ mong nó thành nguồn động viên rằng hoá ra chuyện đó là có thể." Đặt cạnh Joshua Filler, người tự nhủ mình là tay cơ giỏi nhất vì nếu không nghĩ thế thì chẳng có tự tin nào, Magpantay dựng cái nền hoàn toàn ngược lại.'
  }, {
    h: 'Động cơ gốc: lời dặn của người cha đã mất',
    p: 'Chị gái anh kể lại lời cha, người dạy bi-a cho cả mấy chị em: "Con hãy đánh sạch, đừng bán trận dù người ta trả hàng tỷ. Danh dự người chơi thì tiền không mua được. Hãy đánh sòng phẳng, không chèn ép ai. Hãy khiêm nhường và được mọi người kính trọng. Đến đúng thời điểm của Chúa, phần thưởng rồi cũng sẽ tới." Câu cuối dùng đúng khung mà anh viết sau trận thua. Cách xử lý thất bại của anh không phải kỹ thuật tự nghĩ ra mà là một câu dặn được thừa kế, nên nó bền như một niềm tin chứ không mỏng như một mẹo.'
  }, {
    h: 'Ba điều lấy được cho người tập',
    p: 'Một, đặt trận thua vào trục thời gian dài hơn trận đấu để khỏi kết luận vội về năng lực mình, nhưng phải bù thêm phần Magpantay không có: một vòng chẩn đoán hỏng ở đâu rồi về tập đúng chỗ đó. Hai, khi chưa ai biết mặt thì đó là lúc đánh mạnh dạn nhất, đừng vội mong nổi tiếng. Ba, sau mỗi trận thắng hãy ép mình nêu ít nhất một điều chính mình đã làm để thắng — đó là cách biến kết quả thành vốn tự tin, thứ mà câu "hôm đó mọi thứ đều thuận cho tôi" không tạo ra được.'
  }]
}, {
  key: 'psy_pro_orcollo',
  tag: 'Cơ thủ',
  title: 'Dennis Orcollo: người không có ngôn ngữ cho áp lực, chỉ có động tác phải làm — hồ sơ từ 07 video/bài phỏng vấn',
  who: 'Dennis Orcollo',
  intro: 'Rút từ 06 video phỏng vấn có phụ đề tiếng Anh gốc (OnTheRailTV 54 phút trước trận cá độ 200.000 đô la, kênh riêng của anh, The Billartist, Thomas Heal, cùng 02 nguồn kiểm chéo) và bài phóng sự dài của ESPN The Magazine, trải từ 05/2012 tới 12/2024. Nét cốt lõi: trong suốt 12 năm tư liệu, Orcollo gần như không bao giờ mô tả cảm giác của mình — hỏi về áp lực thì anh trả lời bằng một việc phải làm ngay tại bàn.',
  body: [{
    h: 'Cả bộ công cụ tâm lý gói trong một câu, và cả bốn phần đều là hành động',
    p: 'Một người hâm mộ hỏi thẳng anh khuyên gì để rèn cái đầu. Orcollo trả lời trọn vẹn: "Hãy học cách rèn cái đầu mình để giữ tập trung trong ván đấu, và giữ bình tĩnh trong ván đấu, và cố đừng để lộ bất cứ cảm xúc nào kể cả khi ván đấu đang không thuận cho anh, và cố giữ tinh thần tích cực." Bốn mệnh lệnh, và cả bốn đều làm được ngay tại bàn, không cái nào đòi phải thay đổi con người mình trước. Từ hơn mười năm trước, phóng viên ESPN đã ghi lại đúng kết quả của nó: nhìn mặt anh thay vì nhìn bi, đối thủ không thể biết anh vừa vào cú đó hay vừa trượt.'
  }, {
    h: 'Đang chơi tệ thì đợi, đừng đẩy',
    p: 'Được hỏi xử lý thế nào khi bị xui và đang mất nhịp, anh nói: "Khi anh gặp thế bi xấu, khi anh đang chơi vật vã, anh phải kiên nhẫn. Anh phải thả lỏng, và cứ tự nói với mình kiểu thả lỏng đi và cố quay lại." Rồi phần lý lẽ đứng sau: "Khi anh vật vã, đó chỉ là một phần của trò chơi thôi. Không phải lúc nào anh cũng gặp may. Thứ tôi làm là tôi phải chờ, chờ, và lỗi cũng là một phần của trò chơi. Cứ chờ đi, rồi lát nữa anh sẽ thấy." Chữ chờ lặp bốn lần trong một đoạn ngắn. Cần nói rõ giới hạn: mô hình này sinh ra trong các trận cá độ hàng chục ván, ở trận ngắn tại giải thì không đủ thời gian cho nó chạy hết.'
  }, {
    h: 'Phạm vi chú ý dừng lại ở mặt bàn — nhưng không phải là đóng cửa với đám đông',
    p: 'Trước trận cá độ lớn nhất đời, anh nói: "Lần nào tôi đánh tôi cũng không quan tâm, tôi chỉ nghĩ tới ván của mình. Tôi thật sự không nghĩ tới chuyện mình đang đánh với ai." Ba năm sau, hỏi anh làm gì với đám đông và áp lực: "Không gì cả. Lần nào đánh tôi cũng chỉ tập trung cái đầu mình vào cái bàn. Nhưng tất nhiên là tôi tự tin hơn, với đám đông, cổ vũ cùng anh, tích cực." Nửa sau mới đáng giá: cơ chế không phải chặn đám đông ra ngoài, mà là không giao việc cho đám đông — không cần họ mới chơi được, có họ thì tốt hơn.'
  }, {
    h: 'Bài học lớn nhất đời anh: thần tượng trong đầu làm hỏng ván đấu',
    p: 'Năm 2003 anh gặp Efren Reyes lần đầu trong một trận tiền, được chấp hai ván, thua 25-9. Suốt năm sau đó anh thua Reyes nhiều tới mức nghĩ mình không xứng đứng chung bàn. Anh tự chẩn nguyên nhân bằng hai câu: "Lúc nào tôi cũng nghĩ về Efren. Tôi không nghĩ về ván đấu." Thứ gỡ được nó năm 2005 là một ý nghĩ rất gọn — mình còn trẻ, lợi thế duy nhất của ông ấy là kinh nghiệm — và tỷ số hôm đó là 25-24 nghiêng về anh. Chỗ hỏng nằm ở đối tượng chú ý, không nằm ở tay cơ.'
  }, {
    h: 'Câu tự nhủ khi bị dồn là một mệnh lệnh giao việc, không phải lời trấn an',
    p: 'Khi mang lối chơi cá độ sang các giải ở Mỹ, anh thua nhiều vì trận giải quá ngắn cho chiến lược lật ngược của mình. Câu anh dùng để tự sửa chỉ có ba chữ: "Tìm một giải pháp." Nó không nói bình tĩnh nào, không nói mình làm được. Nó giao cho cái đầu một việc phải làm ngay, và việc đó nằm trên bàn chứ không nằm trong cảm xúc — cùng họ với câu tập trung cái đầu vào cái bàn.'
  }, {
    h: 'Trận đánh tiền là một thiết bị đo, không phải nơi kiếm tiền',
    p: 'Đây là chỗ độc đáo nhất trong phương pháp của anh: "Tôi thích chơi trước giải, nên tôi đánh trận tiền để kiểu như kiểm tra ván của mình. Anh sẽ thấy anh đang yếu hay không. Rồi anh có thể sửa." Chỗ hỏng chỉ hiện ra khi có cái gì đó thật để mất, buổi tập một mình không bao giờ hiện. Lời khuyên tập luyện của anh khớp đúng mạch ấy: "Cố tập ba tới năm tiếng một ngày vào tất cả chỗ yếu của anh." Người bảo trợ kể rằng giữa các trận của một giải đang diễn ra, anh đứng luyện đúng những thứ anh cho là điểm yếu của mình.'
  }, {
    h: 'Thắng thì ghi cho hoàn cảnh, thua thì đi sửa cái tay',
    p: 'Thắng giải one-pocket đầu tiên ở Mỹ, phản ứng của anh là: "Tôi không thấy hài lòng. Tôi thấy mình chưa thật sự mạnh, chỉ là lần đó có lẽ tôi gặp một đợt chạy tốt thôi. Nên tôi vẫn học tiếp." Ở chiều ngược lại, lần duy nhất trong cả hồ sơ anh nhận mình bị áp lực đè là khi trượt một cú 9 bi trước người quen ở quê nhà — người khác đưa sẵn lối thoát "có lẽ vậy, tôi không biết", anh không lấy, chỉ nói "Ừ, áp lực. Tôi trượt cú đó. Cú dễ mà." Cả hai chiều đều đưa anh về cùng một chỗ: đổ giờ tập vào đúng điểm yếu.'
  }]
},
  {
  key: 'psy_pro_wukunlin',
  tag: 'Cơ thủ',
  title: 'Wu Kun-Lin: thu hẹp thời gian xuống một phút để gánh nổi áp lực — hồ sơ từ 14 bài phỏng vấn',
  who: 'Wu Kun-Lin',
  intro: 'Rút từ 14 bài báo Đài Loan có trích dẫn trực tiếp, trải từ 12/2017 tới 01/2026. Wu Kun-Lin (吳坤霖, "Monster", hạng 22 FargoRate) chống áp lực bằng cách kéo chú ý ra khỏi kết quả rồi ghim vào thao tác gần nhất trước mắt — một mệnh lệnh cắt suy nghĩ cộng một danh sách việc phải làm ngay.',
  body: [{
    h: 'Mệnh lệnh chống áp lực phải có vế khẳng định',
    p: 'Năm 2017, trước trận bán kết thế giới đầu đời, anh chỉ có nửa đầu: "Tôi cứ không nghĩ nhiều nữa, đằng nào cũng buông tay mà đánh." Tám năm sau, ở loạt bắn luân lưu quyết định chức vô địch thế giới, câu ấy đã thành quy trình đủ hai vế: "Một phút cuối này đừng nghĩ lung tung, làm cho đúng từng kỹ thuật, từng động tác, tập trung đưa bi vào lỗ." Bảo đầu óc đừng nghĩ về việc hỏng thì nó vẫn nghĩ; giao cho nó ba việc cụ thể thì nó bận. Vế khẳng định của bạn phải là thao tác nhìn thấy được, không phải trạng thái mong muốn.'
  }, {
    h: 'Cắt khung thời gian xuống mức nhỏ nhất còn kiểm soát được',
    p: 'Đơn vị anh chọn không phải "giải này", không phải "trận này", mà là "một phút cuối này". Đó là ở loạt bắn quyết định tấm huy chương vàng thế giới đầu tiên sau tám năm mang danh hiệu "vua về nhì" và sau năm lần vào bán kết thế giới trắng tay. Gặp cú đánh quyết định, hãy tự hỏi khung nhỏ nhất mình còn kiểm soát được là bao lớn, rồi cắt đúng bằng đó — ván sau và giải sau đều nằm ngoài.'
  }, {
    h: 'Áp lực là công thức hai vế, không phải khẩu hiệu',
    p: 'Đánh giải đồng đội trên sân nhà năm 2024, anh nói: "Đánh ở Đài Loan là phải vác trên vai ánh mắt của đồng đội, cộng thêm áp lực chủ nhà. Nhưng cái vui của thi đấu cũng nằm ở chỗ có áp lực — đó mới là chỗ đáng sợ nhất!" Anh không tuyên bố đã chinh phục được áp lực. Anh thừa nhận nó vẫn đáng sợ nguyên vẹn, chỉ là anh chọn đứng vào đó. Cùng bài, anh kể thẳng cú hỏng bi then chốt của mình và cảm giác "như thể đã làm hại cả đội".'
  }, {
    h: 'Cho ký ức thất bại hiện lên, rồi trả lời nó bằng mệnh lệnh khác',
    p: 'Ở loạt luân lưu bán kết thế giới 2025, khi đối thủ Ba Lan vừa hỏng quả thứ 9, thứ hiện lên trong đầu anh là cú đánh hỏng của chính anh ở loạt luân lưu chung kết đồng đội thế giới 2023 — trận đã dâng cúp cho tuyển Đức. Anh không mô tả nỗ lực xua đuổi hình ảnh cũ; anh mô tả nó tự đến, rồi anh đáp lại bằng câu tự nhủ ba bước. Đánh vào quả quyết định xong anh hét lên một tiếng, "áp lực lập tức được xả ra" — giữ căng tới cuối rồi xả một lần, không cố thả lỏng giữa chừng.'
  }, {
    h: 'Mổ trận thua bằng nguyên nhân kỹ thuật, cấm mượn hoàn cảnh',
    p: 'Thua bán kết thế giới 2023 sau nhiều ngày nôn mửa vì lạ nước lạ cái, trời âm 10 độ, anh nói: "Đối thủ thật sự chơi hay hơn tôi, chỉ còn cách lần sau cố gắng tiếp." Không câu nào viện tới cơ thể đang ốm. Thua tứ kết tháng 01/2026, anh gọi tên đúng hai lỗi: phá bi không lý tưởng, nhịp độ từ đầu tới cuối không nắm được. Mẫu mổ trận của anh gồm một câu nhận sai và một câu về lần sau, không có phần thứ ba dành cho hoàn cảnh.'
  }, {
    h: 'Gọi đoạn chơi tệ là vùng nhiễu động, không phải bằng chứng về mình',
    p: 'Sau khi vô địch All Japan 2024, anh viết: "May là phần thể hiện về sau đã bù lại được đoạn nhiễu loạn lúc đầu." Chữ anh dùng là 亂流 — vùng nhiễu động, mượn từ hàng không. Nhiễu động là thứ đi qua rồi hết, không phải bằng chứng về phi công. Coi một đoạn hỏng liên tiếp là bằng chứng về năng lực bản thân thì đoạn đó kéo dài; coi nó là vùng thời tiết xấu thì đoạn đó có điểm kết.'
  }, {
    h: 'Chuẩn bị bù cho hoàn cảnh, đừng than về hoàn cảnh',
    p: 'Về giải đấu ở Ba Lan giữa mùa âm 8 tới âm 10 độ: "Đi bộ từ khách sạn tới nhà thi đấu là tay cứng đờ. May mà bọn tôi đều tới sớm để khởi động, làm ấm tay, vào trận mới phát huy bình thường được." Câu chuyện kết thúc bằng biện pháp chứ không bằng lời than. Cùng lối nghĩ ấy, tháng 12/2025 anh đổ gần hết tiền thưởng nhiều năm dựng câu lạc bộ riêng ở Cao Hùng: "Có chỗ của riêng mình thì tâm trạng ổn định hơn, không phải chạy khắp nơi tìm chỗ tập nữa!"'
  }]
},
  {
  key: 'psy_pro_alexkazakis',
  tag: 'Cơ thủ',
  title: 'Alex Kazakis: người gọi thẳng tên nỗi sợ bóp cò hụt của mình — hồ sơ từ 09 video/bài phỏng vấn',
  who: 'Alex Kazakis',
  intro: 'Rút từ 06 video phỏng vấn (Predator Cues, WPA, Karl Boyes, EPBF, Qopen TV) và 03 bài báo có trích dẫn trực tiếp (Matchroom Pool, Sky Sports, AZBilliards), trải từ 03/2017 tới 08/2026. Nét cốt lõi: cơ thủ Hy Lạp này công khai gọi tên nỗi sợ của mình bằng đúng chữ mà giới bi-a dùng để chê nhau — dogging it, tức bóp cò hụt ở cú quyết định — và cú thoát của anh không tới từ ý chí, mà tới từ hai cái tát của một đồng nghiệp.',
  body: [{
    h: 'Nỗi sợ của anh không phải đối thủ, mà là phiên bản cũ của chính mình',
    p: 'Sau ba lần hụt trong năm tháng (trận cuối Mosconi Cup 2018, cú 9 hỏng ở chung kết World Pool Masters 2019, bán kết thế giới thua Filler), Kazakis mô tả cơ chế vết thương gọn tới mức khó viết gọn hơn: "Có những lúc đang chịu áp lực thì tôi nghĩ rằng chắc mình lại sắp làm lại chuyện đó nữa, và chuyện ấy nặng nề lắm." Về trận Mosconi Cup thua đó, anh nói thẳng điều ít ai chịu nói: "Tôi tưởng mình chịu được áp lực nhưng tôi đã không chịu được. Tôi có cơ hội của mình mà không tận dụng được, vì áp lực quá lớn." Câu ấy tới từ một người đang đứng hạng nhất thế giới thời điểm đó. Đối thủ hoàn toàn nằm ngoài phương trình.'
  }, {
    h: 'Chuỗi leo thang ba bước — cú trượt chỉ là bước một',
    p: 'Kể về trận bán kết World Pool Masters 2021, anh mô tả đúng trình tự sụp đổ: "Tôi bắt đầu trượt một, hai, ba bi, cứ thế liên tục. Và khi đầu óc tôi bắt đầu tệ hẳn đi, tôi bắt đầu nghĩ: trời ơi, lại nữa rồi, mày lại trượt rồi... rồi tôi không thoát ra khỏi cái đầu của mình được." Rồi bước ba: "Tất cả những con quỷ từ năm ngoái ùa vào trong đầu tôi." Cú trượt là nguyên nhân gần; thứ giữ trạng thái hỏng ở lại là ký ức thất bại cũ được giọng tự chửi gọi về.'
  }, {
    h: 'Mười giây tự trách ăn hết đồng hồ ở cú quan trọng nhất sự nghiệp',
    p: 'Tự mổ lại ván 8-8 của chung kết 2019 mà anh thua, Kazakis chỉ vào chỗ hỏng thật, và nó không phải cú đánh: "Sai lầm lớn nhất của tôi là khi tôi làm hỏng cú số 8 và trượt vị trí, tôi mất chừng mười giây kiểu \'mình vừa làm gì thế, tại sao, tại sao\'. Rồi đột nhiên tôi chỉ còn 20 giây... mười giây đó tôi vứt đi mất." Giải có đồng hồ 30 giây mỗi cú. Anh dùng một phần ba để tự trách, rồi quyết định cú lớn nhất đời bằng phần còn lại.'
  }, {
    h: 'Cú đúng là cú mà cái tay đang run của anh còn đánh được',
    p: 'Anh chọn phòng thủ thay vì bắn băng cú 9, và lý do là một phép tự đánh giá lạnh: "Bởi vì tôi biết mình, và về cú bắn băng thì tôi không giỏi lắm... tôi không có thời gian, tôi đang hồi hộp, tôi đang đánh bi cái không tốt vì tôi hồi hộp. Nên tôi có cảm giác là bắn băng thì tôi sẽ trượt." Câu tổng kết lật ngược thứ tự thông thường của việc chọn cú: "Không phải chuyện cú đúng hay cú sai. Là chuyện anh cảm thấy thế nào ở từng cú một." Cách này che được những cú anh chắc chắn hỏng, nhưng cũng chính nó đẩy anh vào phương án an toàn ở đúng lúc lẽ ra phải liều.'
  }, {
    h: 'Hai cái tát của Kelly Fisher — công cụ đến từ bên ngoài, và anh kể lại không giấu',
    p: 'Vừa thắng bán kết 2021 mà anh đi ra tự đập mình. Kelly Fisher chặn lại, anh đáp: "Tôi không quan tâm. Tôi không muốn vào chung kết. Tôi lại bóp cò hụt nữa rồi." Cô cảnh cáo rồi tát thật. "Và thật ra sau đó tôi thấy khá hơn. Tôi thề. Mọi thứ dừng lại hết. Toàn bộ tiêu cực, mọi thứ, dừng lại hết." Câu chỉnh hướng đi kèm: "Chúng ta không phải người máy... anh không phải cái máy để lúc nào cũng đánh hoàn hảo. Đừng khắt khe với bản thân đến thế." Năm phút sau anh quay lại xin một cái bên má kia cho cân — tức anh hiểu ngay thứ vừa xảy ra là công cụ, không phải tai nạn.'
  }, {
    h: 'Đàn bò gặm cỏ — chu kỳ hai pha giữa cái ghế và cái bàn',
    p: 'Bạn gái hết cách, ném cho anh một câu vô nghĩa: "Em nói gì thì anh cũng nghĩ theo hướng tiêu cực. Thôi anh cứ nghĩ về mấy con bò đi." Đêm chung kết, anh ngồi ghế run bần bật, rồi câu ấy quay lại: "Tôi bắt đầu nghĩ tới cảnh mấy con bò ngoài đồng đang gặm cỏ, rồi tôi bật cười... cái đó làm tôi thả lỏng ra được." Nó thành quy trình lặp mỗi ván: "Tôi thả lỏng khi ngồi trên ghế, trọng tài đang xếp bi, vẫn nghĩ những điều tích cực... mỗi ván lại một chuyện khác." Còn trên bàn thì ngược hẳn: "Tôi nghĩ về ván đấu. Tôi không nghĩ gì khác." Kết quả: 9-0, tỷ số chênh nhất lịch sử chung kết giải. Thứ làm mồi ấy chạy được là nó không dính gì tới bi-a, nên không có đường nối ngược về sổ nợ cũ.'
  }, {
    h: 'Thắng mà thấy nhục, và danh hiệu đầu tiên đã đổi cái gì',
    p: 'Ăn cú 9 vào chung kết mà anh không ăn mừng: "Tôi thắng mà cảm giác như tôi thua. Tôi nghĩ: nếu tôi đánh kiểu này thì tôi xứng đáng thắng ở chỗ nào." Anh giữ hai cuốn sổ tách biệt, sổ kết quả và sổ chất lượng đánh, không cho cuốn này an ủi cuốn kia. Sau danh hiệu lớn đầu tiên, cấu trúc đó mới đổi: "Kể cả khi anh trượt một cú quyết định, mà chắc chắn tương lai tôi sẽ trượt, và chắc chắn ai rồi cũng sẽ trượt, vì chẳng ai hoàn hảo... kể cả khi chuyện đó xảy ra bây giờ, tôi biết là mình vẫn có thể thắng vào một ngày khác." Kỹ thuật anh đã có từ 2018, năm anh đứng hạng nhất thế giới. Thứ danh hiệu đem lại là quyền được trượt một cú mà không mất cả bản dạng.'
  }]
},
  {
  key: 'psy_pro_nielsfeijen',
  tag: 'Cơ thủ',
  title: 'Niels Feijen: biến áp lực thành thứ tự thao tác, không thành trạng thái — hồ sơ từ 25 video/bài phỏng vấn',
  who: 'Niels Feijen',
  intro: 'Rút từ 25 nguồn công khai trải từ 02/2012 tới 05/2026: phỏng vấn dài, podcast, phỏng vấn tại giải và 13 tập YouTube Shorts "Mental Mondays" trên kênh riêng. Feijen là cơ thủ đỉnh cao hiếm hoi biến phần tâm lý thành nghề thứ hai, nên lời ông không có dạng cảm thán mà có dạng hệ thống: mỗi hiện tượng được gọi đúng tên rồi gắn với một thao tác phải làm ngay tại bàn.',
  body: [{
    h: 'Người dạy tâm lý cũng run, và đó mới là điểm chính',
    p: 'Sau khi thắng Fedor Gorst tại The International 2024, Feijen kể lại đoạn cuối trận không hề tô vẽ: "Tôi có một ván mở rất đẹp mà lại trượt bi 3 — tôi chỉ đơn giản là hồi hộp. (…) Cuối cùng tôi phá và chạy trọn một ván rất tốt. Tôi run kinh khủng, nhưng tôi vượt qua được." Thứ ông có không phải trạng thái hết run, mà là thứ tự thao tác khi đang run: "Khi tỷ số 9-8 rồi thì là: kiểm soát cơ thể, thở cho tốt, đừng coi cú nào là chắc chắn, cứ cố giữ mọi thứ đơn giản." Việc đầu tiên ông làm không phải với cái đầu mà với cái thân.'
  }, {
    h: 'Câu hỏi đúng lúc đang hỏng: cần làm gì để đánh ra một cú tốt',
    p: 'Feijen chỉ dùng một câu hỏi để kéo mình về, và nó lặp lại gần như nguyên văn qua nhiều nguồn cách nhau nhiều năm: "Anh cần làm gì để đánh ra một cú tốt? Tập trung vào hơi thở. Tập trung vào các bước anh phải đi." Hình ảnh ông dùng để chặn cái đầu đang so sánh: "Anh là người leo núi đang đứng dưới chân vách nhìn lên. Anh không thể trông đợi nhảy một phát lên đỉnh." Ông không dạy cách hết sợ; ông dạy cách trả lời câu hỏi đó trong lúc đang sợ.'
  }, {
    h: 'Áp lực phần lớn là hàng tự sản xuất, cái máy tên là kỳ vọng',
    p: '"Kỳ vọng là những luật bất thành văn, những chuẩn mực và đòi hỏi mà người chơi tự đặt lên mình: mình phải thắng trận này. Mình buộc phải vào tứ kết. Mình không được phép thua thằng này. Tất cả đều là đỗ hay trượt, sống hay chết. Thi đấu không vận hành như thế." Bằng chứng sạch nhất nằm ở loạt 416 bi 14-1 năm 2012 của chính ông: không đối thủ, không khán giả, không tiền thưởng, mà "tôi không hồi hộp cho tới quãng bi thứ 260" — đúng chỗ con số bắt đầu chạm vào một kỷ lục quốc gia.'
  }, {
    h: 'Danh sách hai rổ: gạch đi, và đem đi tập',
    p: 'Bài tập cụ thể nhất của ông là lập danh sách mọi thứ đang làm mình căng trước giải rồi tự gạch bớt: "Tôi không muốn gặp thằng này con kia — gạch đi, anh không điều khiển được. Tôi muốn thắng quá mức — không điều khiển được cái thắng, anh phải tập trung vào quy trình. Phòng ẩm quá, mặt bàn nảy quá — gạch đi. Anh chỉ có thể thích nghi thôi." Điều đáng chú ý là ông không gạch hết: cảm giác áp lực trong trận và cơn tuột tay sau khi phạm lỗi được giữ lại, vì đó là thứ tập được.'
  }, {
    h: 'Sau cú hỏng thì đọc lại mặt bàn, đừng đọc lại bản thân',
    p: 'Quãng ngồi ghế được ông chuyển từ xử lý cảm xúc sang thu thập dữ liệu: "Thực ra cú phá vừa rồi đã xảy ra chuyện gì? Anh đánh mỏng quá? Dày quá? Xoáy nhiều quá? Cầm lấy thông tin đó, chỉnh lại, rồi cải thiện." Câu chốt thẳng đến mức hơi phũ: "Đừng có ngồi trên ghế mà mếu máo về những cú sai của mình, vì làm thế là anh đang tự đào huyệt cho mình thôi." Rồi giao một việc cho lượt tới bằng đúng một câu ông từng dùng ở tỷ số 8-8 tại World Cup of Pool: "Lượt vào bàn tiếp theo của tôi sẽ là lượt hay nhất của tôi."'
  }, {
    h: 'Tự tin là kết quả cuối, không phải điều kiện đầu',
    p: 'Chỉ dẫn ngược bản năng nhất của ông dành cho lúc đang tuột: "Dưới áp lực, khi cánh tay đang không ổn, điều quan trọng là anh phải tự dọn cho mình những cú dễ. Hạ kỳ vọng xuống một chút. Anh đâu phải Siêu nhân mọi lúc. Đôi khi việc cần làm là tự đưa mình vào những thế đơn giản, hết lần này tới lần khác, rồi sự tự tin sẽ bắt đầu lớn lên." Cùng lẽ ấy, đừng đợi mình hết run trong một cú đánh: sau một bi suýt trượt giữa loạt 416, chính ông cần thêm chừng 30 bi nữa mới thư giãn lại được.'
  }, {
    h: 'Bốn chữ độc nhất, và phép sửa mất một giây',
    p: '"Đó là câu \'lại thế nữa rồi\'. Dội nó xuống bồn cầu ngay lập tức. Anh không phải nạn nhân. Hãy chịu trách nhiệm cho lượt vào bàn của mình. Một cú xui không có nghĩa là hết trận. Bi 9 có sẵn 10 tới 15% là may rủi." Cách gỡ đúng chất ông, sửa chính câu chữ thay vì đè nó xuống: "Anh chỉ cần gạch đúng một chữ \'nữa rồi\' đi, thế là còn lại \'nào, vào việc\'." Con số 10-15% may rủi ấy không phải lời chống chế: ông dùng đúng nó khi trả lời phỏng vấn ngay sau trận thua kết thúc giải The International 2024.'
  }]
},
  {key:'psy_pro_dangjinhu', tag:'Cơ thủ', title:'Dang Jinhu: mang sẵn áp lực vào phòng tập để ngày thi đấu không còn lạ — hồ sơ từ 6 bài phỏng vấn', who:'Dang Jinhu',
    intro:'Rút từ 06 bài báo Trung Quốc có trích dẫn trực tiếp, trải từ 04/2012 tới 08/2025 (Tề Lỗ Vãn Báo, Sưu Hồ, Tinh Bài, Lao Động Báo, Tencent News, Tân Hoa Xã). Dang Jinhu (党金虎, "Golden Tiger", đội trưởng tuyển bi-a Mỹ Trung Quốc, vô địch Spanish Open 2023) không tìm cách làm áp lực nhẹ đi, anh tìm cách làm mình quen với việc mang nó.',
    body:[
      {h:'Nạp áp lực từ phòng tập, đừng để trận đấu là nơi đầu tiên gặp nó', p:'Năm 2012, được hỏi khác gì giữa người ra quán chơi và người sống bằng bi-a, anh không nói về kỹ thuật: "Người ta đánh bi, quả này không vào thì đôi khi còn thành một trận cười. Bọn tôi thì hoàn toàn khác: quả này bắt buộc phải vào, vào là đương nhiên, không vào thì có thể ảnh hưởng tới tôi rất nhiều. Lúc nào cũng mang cái áp lực đó mà tập bi." Anh tự dựng ra một bất công về cảm xúc — thắng không được thưởng, hỏng thì bị phạt — rồi sống trong đó hằng ngày. Buổi tập dễ chịu hơn trận đấu thì trận đấu mãi mãi là môi trường lạ.'},
      {h:'Trạng thái thi đấu là hai vế mâu thuẫn, không phải một trạng thái sạch', p:'Kể lại trận chung kết Spanish Open 2023 (thắng Marc Bijsterbosch 13-12 sau khi bị dẫn 9-6): "Vừa căng vừa hưng phấn, vừa muốn giữ được bình tĩnh, lại vừa sợ không kìm nổi nhịp độ. Tôi cắn răng gánh cho được áp lực của từng ván một, đánh mãi tới điểm quyết định 12-12." Anh không tuyên bố mình đã bình tĩnh. Đơn vị anh chọn để gánh là "từng ván", tức đặt xuống rồi nhấc lên lại 25 lần, chứ không vác liền một mạch. Và anh chỉ xả một lần duy nhất, sau khi trận đã xong hẳn.'},
      {h:'Hạ kỳ vọng bằng dữ kiện, rồi đáp lại bất lợi bằng biện pháp', p:'Trước giải Tây Ban Nha, anh không tự nhủ gì cả, chỉ đọc đúng tình hình: hơn ba năm không dự giải quốc tế, và khoảng cách trình độ có thật, nên không kỳ vọng nhiều. Sang nơi thi đấu mới thấy miệng lỗ bàn đã nhỏ hơn trước rất nhiều: "May là ba năm nay việc tập luyện chưa từng gián đoạn, tôi cũng thường xuyên tập bi-a kiểu Trung để nâng độ chuẩn xác lên. Nhìn từ giải đấu mà nói, cách tập ấy đã cho hiệu quả thật." Câu chuyện về hoàn cảnh bất lợi kết thúc bằng một biện pháp, không bằng một lời than.'},
      {h:'Mổ trận thua: gọi tên lỗi kỹ thuật trước, may rủi chỉ được nói sau', p:'Thua tứ kết 10 bi World Games 2025 vì hụt bi số 9 đứng ngay miệng lỗ, anh nói: "Ván cuối, khi dọn tới bi số 9, thật ra tôi đã đánh mỏng. Nếu thắng ván đó, ván quyết định do tôi phá bi, tôi có hơn 55% cơ hội thắng. Nhưng cuối cùng vẫn không đưa được bi vào." Rồi mới đóng lại: "Bi thì tròn, chuyện gì cũng có thể xảy ra" và "đây là một phần của cuộc thi đấu". Đảo hai câu ấy là mất sạch giá trị — nói may rủi trước là chối trách nhiệm, còn chỉ nói lỗi mà không có câu đóng lại thì cơn dằn vặt chạy sang cả trận sau.'},
      {h:'Có một vai ngoài bảng tỉ số thì thua xong vẫn còn chỗ đứng', p:'Năm 2014, khi đội có bốn người lần đầu dự giải thế giới: "Ngay từ lúc tập, cả đội đã thường xuyên khen nhau để nâng tự tin lên", và cụ thể hơn với một đồng đội trẻ: "cứ có việc hay không có việc là khen cậu ấy vài câu, cả tổ xúm vào khen". Mười một năm sau, vài chục phút sau khi chính mình bị loại ở World Games, câu anh nói vẫn là: "Tôi vẫn sẽ mang năng lượng tích cực tới cho các đồng đội khác." Nhận một vai trong nhóm — kèm người mới, ngồi ngoài xem trận của bạn — cho bạn một chỗ đứng mà một trận thua không lấy đi được.'},
      {h:'Người trong cuộc thì mê, người ngoài cuộc thì tỉnh', p:'Về việc mình làm cho đồng đội trong trận: "Chẳng hạn những vấn đề gặp phải trong trận, lúc gọi tạm dừng thì nên điều chỉnh thế nào — dù sao bi-a có lúc là người trong cuộc thì mê, người ngoài cuộc thì tỉnh." Anh coi quyền gọi tạm dừng là công cụ có kỹ thuật riêng, không phải chỗ nghỉ: câu hỏi không phải khi nào nên nghỉ, mà dừng rồi thì chỉnh cái gì. Chính anh, người phát biểu nguyên lý ấy, vẫn tự vả vào mặt mình trên đường về ghế sau cú hụt — nên điều anh nhấn mạnh là phải có mắt người thứ hai ở ngoài, chứ không phải tự trấn tĩnh.'},
      {h:'Vấp ở giải lớn là tài sản, và cú vấp càng đau thì nhớ càng lâu', p:'Tháng 12/2022, sau khi cả anh lẫn học trò cùng bị loại, anh nói về cậu học trò: "Cậu ấy còn trẻ, đánh được, nhưng chưa tự tin. Tâm thế loạn lên một chút là cả trận không giữ nổi nhịp độ." Rồi: "Mong cậu ấy vấp một lần khôn một lần. Ở những giải lớn thế này, cú vấp càng đau thì trí nhớ lại càng tốt." Lời của người khi ấy 36 tuổi, đánh chuyên nghiệp gần hai mươi năm, chưa có danh hiệu quốc tế nào — nói sáu tháng trước khi vô địch thế giới. Chú ý cách anh chẩn đoán: thiếu tự tin không hiện ra ở cú đánh trượt, nó hiện ra ở việc mất nhịp.'}
    ]},
  {key:'psy_pro_oliverszolnoki', tag:'Cơ thủ', title:'Olivér Szolnoki: dự báo sai lầm trước khi nó tới, rồi rút ngắn thời gian sống chung với nó — hồ sơ từ 09 nguồn phỏng vấn', who:'Olivér Szolnoki',
    intro:'Rút từ 09 nguồn phỏng vấn công khai (báo Hungary có trích dẫn trực tiếp, thông cáo sau trận của Matchroom, một video phỏng vấn 7 phút bằng tiếng Anh), trải từ 06/2021 tới 06/2026. Szolnoki — huy chương đồng thế giới 2021, vô địch châu Âu 2024, vàng World Games 2025, ba danh hiệu World Nineball Tour trong hai tháng năm 2026 — không dựng hình ảnh lạnh lùng: anh gọi thẳng tên sự run, coi sai lầm là sự kiện đã được dự báo, và chấm điểm bản thân bằng chất lượng tập trung thay vì bằng tỷ số.',
    body:[
      {h:'Dự báo sai lầm trước khi vào trận, cho cả hai bên', p:'Sau khi thắng chung kết World Games 2025 để lấy tấm vàng đầu tiên của bi-a Hungary tại đại hội này, anh mô tả nguyên cách nghĩ: "Tôi cố bước qua những cú hỏng của mình càng nhanh càng tốt. Tôi biết đây là trận chung kết, với cả hai đứa tôi thì có lẽ là trận lớn nhất sự nghiệp... nên tôi biết sớm muộn gì cả hai cũng rơi vào áp lực và sẽ có sai lầm — tôi cố coi chuyện đó là tự nhiên." Điểm mấu chốt nằm ở thì của câu: việc xếp sai lầm vào loại sự kiện bình thường được làm TRƯỚC khi nó xảy ra, không phải sau. Cú hỏng khi đó không còn là bằng chứng rằng hôm nay mình tệ.'},
      {h:'Chữa cái run bằng biện pháp kỹ thuật, không bằng biện pháp tinh thần', p:'Về cú số 9 kết liễu trận thắng Shane van Boening 11-5 ở World Pool Championship 2021, sau khi bị dẫn 1-5: "Tôi thật sự mừng vì cú số 9 cuối cùng là một cú thẳng, bởi lúc đó tôi rất hồi hộp — nhưng tôi đã để lại cho mình một quả mà tôi biết chắc mình không thể trượt." Anh không tự nhủ hãy bình tĩnh. Anh xoay thế bi sao cho cú quyết định dễ tới mức sự căng thẳng không đủ sức làm hỏng nó. Khi biết mình đang căng, đừng chọn phương án cần bàn tay vững nhất; chọn phương án chịu được bàn tay đang run.'},
      {h:'Đẩy phần việc khó sang bên kia bàn', p:'Cùng một mẫu xuất hiện ở hai trận lớn nhất. Trận 2021: "Tôi tìm ra được một cú phá chạy được, nhờ đó khống chế các ván bằng cách chơi an toàn và moi cơ hội từ anh ấy. Tôi không cho anh ấy nhiều cơ hội." Chung kết World Games 2025: "May là tay người Peru có hỏng vài lần, và từ những cú đó tôi rèn ra được lợi thế, giữ tới hết trận, dù chỉ vừa đủ." Ai phải đánh nhiều cú khó hơn thì người đó chịu nhiều áp lực hơn — chơi an toàn ở đây vừa là chiến thuật bi-a vừa là cách phân bổ áp lực.'},
      {h:'Kể lại cú xui đủ chi tiết, kèm cả phần lỗi của mình', p:'Bán kết Spanish Open 12/2025, dẫn 9-5: "Tôi đánh một cú an toàn hoàn hảo lên bi 8, giấu sau bi 9, nhưng bi ấy chạm ba băng rồi rơi vào lỗ góc. Sau đó đối thủ làm hai cú phá-và-dọn, còn cú phá của tôi thì không ăn, đột nhiên thành 9-9. Nhưng may là tôi thu mình lại được và thắng." Anh không gói mọi thứ vào một chữ "xui": có chi tiết kỹ thuật đầy đủ, và có một câu tự nhận phần trách nhiệm về cú phá hỏng. Động từ anh dùng cho việc lật lại, tiếng Hungary, nghĩa đen là nhặt mình lại.'},
      {h:'Tách kết quả khỏi chất lượng chơi', p:'Ở Vienna 11/2022, khi được hỏi anh có phải ứng viên số một cho chức vô địch không: "Với bi-a thì khó nói lắm — chỉ cần một hai lần bi lăn xui là bạn có thể chơi hoàn hảo mà vẫn thua. Nên tôi sẽ không nói mình là ứng viên số một đâu, không đời nào." Ngay câu sau anh nêu công thức chú ý: "Tôi tập trung vào trận kế tiếp, từng cú một, từng trận một. Tất nhiên là tôi đang cố thắng giải." Cấu trúc rõ: cắt bỏ dự đoán về kết quả, giữ lại tham vọng về kết quả, neo hành động vào một cú đánh.'},
      {h:'Chấm điểm bằng quy trình, và bằng cả một giai đoạn', p:'Sau khi thua bán kết thế giới 2021, khuôn tổng kết của anh có đúng ba phần: "Tôi cảm thấy suốt cả giải mình đã tập trung tốt, đã chiến đấu một cách tận tâm. Tôi có hơi thất vọng vì không vào được chung kết, nhưng tôi tiếp tục chuẩn bị cho những việc phía trước." Không có phần thứ tư cho việc đổ lỗi hoàn cảnh. Bốn năm sau, khi tự đánh giá phong độ, anh cộng cả hai tuần lại và đưa vào danh sách một kết quả không phải chức vô địch: "Ở Pro Billiard Series tôi về hạng 9, nên tôi nghĩ hai tuần vừa rồi mình đã chơi khá mạnh."'},
      {h:'Tập nhiều mà kết quả không tới thì nghỉ hẳn, đừng tăng giờ tập', p:'Cuối 2022, sau nửa năm đi giải liên tục: "Từ tháng Tư tới tháng Mười tôi đi suốt, và tôi thấy hơi kiệt sức vì tập rất nhiều mà kết quả cứ không tới. Tôi thua nhiều trận ở ván quyết định. Nên tôi nghĩ, ít nhất tôi có thể nghỉ một tháng tới một tháng rưỡi để đầu óc rời khỏi chuyện đó rồi quay lại mạnh hơn." Cách vào lại của anh có hai bậc: một giải nhỏ ít sức ép để lấy lại cảm giác thi đấu, rồi mới tới giải lớn. Chẩn đoán của anh không phải "tôi tập chưa đủ" — khối lượng tập đã đủ, phần thiếu nằm chỗ khác.'}
    ]},
  {key:'psy_pro_robbiecapito', tag:'Cơ thủ', title:'Robbie Capito: buông kỳ vọng thì tay mới được thả — hồ sơ từ 14 video/bài phỏng vấn', who:'Robbie Capito',
    intro:'Rút từ 14 nguồn công khai về Robbie Capito (sinh 2001, thi đấu cho Hồng Kông, cha mẹ người Philippines, vô địch UK Open 2024), trải từ 07/2020 tới 08/2026: bài anh tự viết trên trang Học viện Thể thao Hồng Kông, hai buổi phỏng vấn dài của Natural Angle và Absolute Pool, podcast Level 2 Billiards 49 phút, cùng SCMP, Spin.ph và các trang giải đấu. Nét cốt lõi: anh coi phần tâm lý là môn học dở dang của chính mình, và mọi lần đánh hỏng đều được anh truy về chỗ tâm trí đặt sai đối tượng.',
    body:[
      {h:'Mục tiêu anh tự đặt không phải danh hiệu, mà là phần đầu óc', p:'Tháng 08/2025, được hỏi muốn gì trong hai năm tới, anh đáp: "Tất nhiên tôi muốn thêm ít nhất một danh hiệu major nữa, và giải vô địch thế giới thì lúc nào cũng nằm trong tầm mắt. Nhưng quan trọng nhất là tôi muốn khá lên về mặt tâm lý." Hai người dẫn hỏi lại tới hai lần vì tưởng nghe nhầm. Ba năm trước, khi mới sang Mỹ đánh chuyên nghiệp chưa đầy hai tháng, anh cũng lấy đúng phần ấy làm thước đo tiến bộ chứ không lấy thành tích: "Chưa đầy hai tháng mà tôi đã thấy phần tâm lý của mình khá lên."'},
      {h:'Đánh hỏng vì để tâm trí đặt nhầm chỗ, không phải vì kỹ thuật', p:'Trận đầu tiên gặp thần tượng Efren Reyes, anh bị dẫn 1-5 và tự mổ ra nguyên nhân: "Đầu óc tôi loạn hết cả. Nó tới mức tôi không muốn làm ông ấy thất vọng, cũng không muốn làm khán giả thất vọng, thành ra tôi không còn tập trung vào ván đấu. Tôi lại đi tập trung vào khán giả, vào Efren, hoàn toàn sai." Thứ đánh gục anh không phải nỗi sợ thua mà là nỗi sợ làm người khác thất vọng. Cách chữa là một hành động vật lý: anh xin nghỉ giữa trận, quay lại thắng ngược 9-6, gọi đó là "một cú gạt công tắc trong đầu".'},
      {h:'Cú vung cơ "kệ đi": thứ khoá tay anh là cái kỷ lục sắp phá', p:'Năm 17 tuổi, bị số một thế giới Eklent Kaçi dẫn 1-7 ở giải vô địch thế giới, anh coi như đã thua rồi mới ngược dòng thắng. Bảy năm sau anh giải thích: "Khi đứng ở vòng 32 thì tôi đang sắp phá kỷ lục Hồng Kông, trong đầu quá nhiều thứ. Tôi biết mình làm được đến đâu, nhưng lúc ấy không đánh được đúng bài của mình. Cú kệ đi đó chỉ là cho phép tôi được là tôi." Ở khoảnh khắc căng nhất, câu tự nhủ của anh là một mệnh lệnh kỹ thuật đúng một tầng chứ không phải một trạng thái cảm xúc: "chỉ cần một cú phá hay thôi".'},
      {h:'Bỏ lại cái lửa của tay cơ trẻ, đổi lấy công thức thu hẹp phạm vi', p:'"Tôi ăn thua cực kỳ, kể cả khi thắng mà đánh dở thì tôi cũng gặm nhấm cả ngày. Nhưng bây giờ ở đẳng cấp này thì không làm thế được, vì anh phải giữ bình tĩnh. Lúc trẻ thì thoát được, vì mặt bằng hồi đó chưa cao lắm, cái lửa trong người thật sự có thể làm anh thắng." Thay vào đó là một câu anh lặp gần như nguyên văn qua nhiều giải: "Tôi không đặt áp lực lên mình, cứ đánh từng trận một, từng ván một, từng viên bi một." Anh nói "không đặt áp lực lên mình" chứ không nói "không thấy áp lực", tức chỉ nhận phần mình tự chất thêm; và anh đòi bình tĩnh "đúng lúc cần" chứ không đòi bình tĩnh cả trận.'},
      {h:'Thua thì gọi tên nguyên nhân ngoài bàn rồi cắt đúng một ngày', p:'Bị loại sớm ở Las Vegas 2022, anh không đổ cho đối thủ hay cho bàn: "Có lẽ quá nhiều chuyện trước giải làm tôi mất tập trung. Tôi cũng không biết chính xác là chuyện gì: nhà tài trợ mới, mấy trận biểu diễn trước giải, chỉ là đầu óc tôi thấy không ổn. Nhưng chuyện đó qua rồi. Tôi sẽ nghỉ một ngày, gỡ đầu ra khỏi mọi thứ, chỉnh đốn lại, rồi quay về làm việc." Anh dám nói mình chưa rõ nguyên nhân thay vì chộp lấy một lý do nghe hợp lý, và quy trình phục hồi của anh có thời hạn cụ thể chứ không phải nghỉ tới khi thấy khá hơn.'},
      {h:'Tự học tâm lý bằng sách và podcast, và không giấu chỗ mình còn hỏng', p:'Được hỏi có huấn luyện viên tâm lý không, anh đáp: "Tôi cố học từ khắp mọi nơi, sách này, podcast này. Xem người ta xử lý tình huống khó thế nào rồi đưa vào lối chơi của mình ra sao, vì mỗi người có những từ khoá kích hoạt khác nhau để đưa mình vào trạng thái đó. Tôi vẫn đang ở giai đoạn hiểu chính mình nhiều hơn." Bộ công cụ ấy không phải áo giáp: sau vụ tranh cãi với trọng tài ở Arizona 2026, anh viết công khai "Tôi thừa nhận là lúc ấy cảm xúc đã lấn át tôi", còn về trận thua sau đó thì gọn một câu không bào chữa: "Đối thủ đơn giản là đánh hay hơn. Bi-a là thế."'},
      {h:'Ba điều lấy được cho người tập', p:'Một, khi đánh dở đi ở trận quan trọng, hãy hỏi tâm trí đang đặt ở đâu trước khi hỏi kỹ thuật hỏng chỗ nào, và cắt vật lý một chuỗi đang trôi xấu bằng cách đứng dậy khỏi bàn thay vì cố nghĩ ra cách sửa ngay tại chỗ. Hai, thứ khoá tay thường là kỳ vọng chứ không phải đối thủ, nên trước trận lớn hãy viết ra mình đang mong nhận được gì rồi cố tình gạt sang một bên, đúng tinh thần "từng trận một, từng ván một, từng viên bi một". Ba, coi phần tâm lý là một môn có giáo trình và tự đi kiếm giáo trình đó — Capito đã vô địch major ở tuổi 24 mà vẫn xếp việc khá lên về tâm lý trên cả danh hiệu thế giới.'}
    ]},
  {key:'psy_pro_danielmaciol', tag:'Cơ thủ', title:'Daniel Maciol: quản trị năng lượng thay vì đấu với thần kinh — hồ sơ từ 11 video/bài phỏng vấn',
    intro:'Rút từ 11 nguồn công khai có lời trực tiếp của Daniel Macioł (Ba Lan, hạng 28 Fargo Rate), trải từ 08/2014 tới 03/2026: bốn video bản tin của Liên đoàn bi-a châu Âu EPBF thời anh còn thiếu niên, và bảy bài báo có trích dẫn trực tiếp trên AZBilliards, EPBF và Radio Kielce. Nét cốt lõi: anh gần như không nói về sợ hãi hay run tay, mà nói về độ đều, mức năng lượng và việc sửa đúng một bộ phận kỹ thuật đang hỏng.',
    body:[
      {h:'Chấm điểm bằng độ đều, không bằng đỉnh cao', p:'Sau khi đoạt hai huy chương vàng ở giải vô địch châu Âu 2026 tại Antalya, thứ anh tự khen không phải các trận thắng: "Chắc chắn đó là một trong những màn trình diễn mạnh nhất của tôi. Đánh giải kéo dài hơn một tuần thì không dễ, mà tôi thấy mình cực kỳ đều ở từng trận một. Tôi không có lúc lên lúc xuống nào cả... Tôi cũng tự hào về cách mình quản lý năng lượng." (EPBF, 11/03/2026). Thước đo anh đặt cho bản thân là khoảng chênh giữa trận tốt nhất và trận tệ nhất, không phải trận hay nhất.'},
      {h:'Hồi phục là một hạng mục có chỗ trong lịch', p:'Buổi sáng ngày anh vô địch 10 bi châu Âu 2026, anh vừa thua một trận 8 bi rất tệ. Anh kể lại đủ bốn nhịp: "Sáng nay tôi đánh một trận 8 bi rất tệ và tôi thấy rất tệ, và sau trận đó tôi cố hồi lại tốt nhất có thể, và tôi làm được, nên các trận sau đánh dễ hơn hẳn với tôi." (AZBilliards, 06/03/2026). Chiều đó anh thắng ba trận cuối với tổng tỷ số 24-5. Điều anh mô tả không phải khả năng miễn nhiễm với trận thua, mà là một khoảng thời gian dành riêng cho việc hồi phục, đặt xen vào giữa.'},
      {h:'Chẩn đoán bằng bộ phận kỹ thuật, không bằng tâm trạng', p:'Bị Diego Pedro Simon dẫn 0-3 ở tứ kết rồi thắng 9-3, bản tường thuật của anh không có chữ nào về cảm xúc: "Cậu ấy vào trận cực chắc, dọn trọn hai ván, còn tôi hỏng một cú phá nên cậu ấy dẫn 3-0. Tôi biết cậu ấy đang phá bi rất tốt và tôi cũng cần cải thiện cú phá của mình. Điều đó đã xảy ra, tôi bắt đầu phá tốt hơn." (AZBilliards, 09/03/2026). Cùng lối ấy khi bị đuổi từ 8-5 về 8-7 ở chung kết đồng đội thế giới: "tới một lúc thì cú mở bi của tôi ngừng ăn" (Radio Kielce, 28/07/2024). Chẩn đoán dạng này giữ cho vấn đề còn sửa được ngay trong trận.'},
      {h:'Bị dẫn hay đang dẫn đều chỉ một câu: chờ cơ hội của mình', p:'Bị Felix Vogel dẫn 1-4 ở chung kết Euro Tour Tallinn 2024 rồi thắng ngược 9-7, công thức anh nêu chỉ có hai vế: "Tôi cố giữ tập trung và chờ cơ hội của mình, rồi tôi đánh được vài ván tốt liên tiếp ở cuối trận." (AZBilliards, 17/02/2024). Hai năm sau, lúc đang dẫn ở chung kết 9 bi châu Âu, anh mô tả trạng thái bằng một câu rất nhạt: "Jonas không kiếm được nhiều điểm nên tôi thấy khá ổn với thế dẫn của mình, rồi từng bước một, tôi tiến gần hơn và gần hơn." (AZBilliards, 10/03/2026).'},
      {h:'Áp lực được nêu tên rồi bỏ qua ngay trong cùng một câu', p:'Đây là lần duy nhất trong toàn bộ tư liệu anh dùng chữ áp lực về bản thân, sau trận chung kết 10 bi thắng trắng: "Có lẽ áp lực đè lên tôi nhiều hơn, nhưng tôi chỉ cố giữ tập trung và chơi thứ bi-a của mình." (AZBilliards, 06/03/2026). Anh thừa nhận vị thế kèo trên là gánh nặng thật, rồi đưa ra một cách xử lý không có gì đặc biệt: không kỹ thuật thở, không câu thần chú, không nghi thức. Với người đã quản trị trạng thái ở tầng nền, cái neo lúc căng có thể chỉ mỏng đến thế.'},
      {h:'Tự đánh giá lạnh, kể cả giữa lúc thắng đậm nhất', p:'Vừa lấy hai tấm vàng châu Âu, anh vẫn nói về giải kế tiếp bằng dữ kiện chứ không bằng lời khiêm tốn: "Ở đây không đông người lắm vì trùng lịch với European Open, nên tôi thấy dàn thí sinh không mạnh như thường lệ." Rồi anh gọi thẳng mùa cũ của mình là tệ, kèm số: "Năm ngoái ở sân chơi này tôi khá tệ, chắc chỉ đúng một lần vào tới tứ kết. Mà tôi có thể làm tốt hơn thế." Anh cũng chủ động đưa may mắn vào bản tự đánh giá lúc đang thắng: "nhiều thứ đã thuận cho mình, ở những trận như thế thì mình cũng có phần may" (EPBF, 11/03/2026).'},
      {h:'Thang thời gian dài, và mục tiêu mới đặt ngay khi vừa đạt mục tiêu cũ', p:'Câu đầu tiên sau danh hiệu Euro Tour đầu đời không nói về trận chung kết vừa xong: "Tôi nhớ hồi 15 tuổi tôi đánh giải Euro Tour đầu tiên của mình, và mục tiêu khi đó là vào tới vòng 32. Vậy mà sau tám năm, cuối cùng tôi cũng vào được một trận chung kết và thắng nó." (AZBilliards, 17/02/2024). Ngay sau tấm vàng 10 bi 2026, khi giải còn nhiều ngày, anh lập tức thay mục tiêu để phần còn lại không rơi vào trạng thái đã xong việc: "mục tiêu của tôi, sau danh hiệu này, là thành cơ thủ xuất sắc nhất giải, nên tôi sẽ dành thêm thời gian hồi phục nữa."'},
    ]},
  {key:'psy_pro_jundelmazon', tag:'Cơ thủ', title:'Jundel Mazon: bình tĩnh trước, tự tin sau — hồ sơ từ 4 bài phỏng vấn', who:'Jundel Mazon',
    intro:'Rút từ 06 trích dẫn thật trong 04 bản tin có lời trực tiếp của Jundel "Janno" Mazon (Philippines, hạng 29 Fargo Rate, rating 820), trải từ 08/2010 tới 10/2011. Mazon không có buổi phỏng vấn dài nào bằng tiếng Anh trên mạng công khai, nên tư liệu mỏng — nhưng sáu câu ấy nhất quán một cách hiếm thấy: thắng thì gọi là may, thua thì khép lại trong một câu, và sự tự tin luôn đến SAU sự bình tĩnh chứ không đến trước.',
    body:[
      {h:'Thứ tự phục hồi: bình tĩnh → vào guồng → rồi mới tin mình thắng được', p:'Chung kết Guinness World Series of Pool 10 bi tại Jakarta ngày 31/07/2010, Mazon bị chủ nhà Irsal Nasution dẫn 1-5 trước một khán đài cổ vũ đối thủ, rồi thắng liền 08 ván để kết thúc 10-5. Anh kể lại: "Chắc chắn đó là một trận leo dốc rất khó, nhưng tôi lấy lại được sự bình tĩnh của mình ở khúc giữa trận. Từ lúc đó trở đi tôi vào guồng, và chính lúc ấy tôi biết mình có cơ." Ba mốc nằm trong đúng một câu, và thứ tự của chúng là điều đáng học nhất: ở lời kể của Mazon, tự tin không phải thứ khởi động cỗ máy mà là thứ cỗ máy sản xuất ra sau khi đã chạy. Người đang bị dẫn mà đi tìm tự tin trước là chạy ngược chiều với mô tả này.'},
      {h:'Trận lật ngược được kể bằng việc mình làm, không bằng việc đối thủ sụp', p:'Vế cuối của cùng câu trên là "Thế nên tôi cứ đẩy tiếp cho tới tận cùng." Đối thủ lúc đó đang dẫn 5-1, có khán đài, và theo bản tin thì đã sụp hẳn sau khi bị gỡ — nhưng trong lời Mazon không có chữ nào về chuyện đó. Anh chỉ mô tả hành vi của chính mình. Cách đọc này là suy luận của người lập hồ sơ: một cơ thủ giữ điểm tựa ở phía trong sẽ không mất điểm tựa khi đối thủ hồi phong độ, còn người treo nó vào phong độ bên kia bàn thì mất ngay.'},
      {h:'Lần duy nhất anh tuyên bố tự tin, và cái bảo hiểm giấu trong đó', p:'Sau khi hạ Dominic Ting 9-1 để vào vòng chính Philippine Open, ngày 01/04/2011 anh nói với GMA News: "Mức tự tin của tôi đang rất cao. Tôi tin là tôi thừa sức hạ được anh ta. Nếu anh ta có thắng tôi thì tôi nghĩ đó chỉ là ăn may thôi." Vế sau mới là chỗ mạnh: anh rút trước ý nghĩa của viễn cảnh thua, biến nó thành chuyện may rủi chứ không phải bằng chứng đối thủ hơn mình. Thắng thì đúng dự kiến, thua thì không đụng tới lòng tin vào năng lực — một dạng bảo hiểm tâm lý dựng sẵn trước khi vào trận.'},
      {h:'Nhưng khi thắng thì lại tự gọi là ăn may', p:'Sáu tháng sau, thắng đồng hương Lee Vann Corteza 11-10 ở bán kết China 9-Ball tại Hợp Phì ngày 07/10/2011, anh nói: "Toàn là may thôi. Tôi mong cái may này còn theo tôi tới trận chung kết gặp Chao Fong Pao." Cùng một chữ "may" được anh dùng theo hai chiều ngược nhau: đối thủ thắng mình là may, mình thắng cũng là may. Chiều nào cũng có tác dụng che chắn — chiều thứ nhất chặn thất bại làm hỏng lòng tin, chiều thứ hai chặn chiến thắng làm phồng kỳ vọng ngay trước một trận chung kết. Đây là mâu thuẫn thật trong tư liệu, nêu cả hai chứ không chọn bừa một bên.'},
      {h:'Trận thua: chẩn đoán bằng thứ tự, rồi khép lại trong bốn chữ', p:'Thua Chao Fong Pao 8-11 ở chung kết ngày hôm sau, sau khi bị dẫn 4-1 rồi 9-4, anh nói với huấn luyện viên: "Đuổi theo cực khó, tại ông ấy vượt lên trước ngay từ đầu." Anh không nêu một cú hỏng nào, chỉ nêu cấu trúc trận — đối chiếu với trận thắng 2010 thì khác biệt lộ ra: năm 2010 anh có một khúc giữa trận để lấy lại bình tĩnh, năm 2011 thì không. Rồi anh nói thêm đúng một câu rồi thôi: "Thôi để lần sau gỡ lại." Chưa đầy vài phút sau khi mất 8.000 đô la chênh lệch tiền thưởng, thứ phát ra khỏi miệng anh đã hướng về giải sau. Cách này giữ cho tâm lý không lún, nhưng nếu chỉ có thế thì lỗi vẫn nguyên vẹn ở giải kế tiếp.'},
      {h:'Thang đo giá trị: chất lượng đối thủ, và những người không bỏ rơi mình', p:'Về danh hiệu lớn đầu tiên, anh nói với Inquirer ngày 01/08/2010: "Danh hiệu này rất đặc biệt, không chỉ vì đó là danh hiệu đầu tiên của tôi mà còn vì giải này có rất nhiều tay cơ lớn", và "Chiến thắng này dành cho đồng bào tôi, nhất là những người không bỏ rơi tôi ngay cả trong lúc tôi chẳng thắng được gì." Giá trị được đo bằng mật độ đối thủ mạnh, không bằng 40.000 đô la tiền thưởng. Vế "trong lúc tôi chẳng thắng được gì" là câu duy nhất trong toàn bộ tư liệu chạm tới quãng dài trước đó của đời anh.'},
      {h:'Ba chỗ trống phải thừa nhận, không lấp bằng suy đoán', p:'Tư liệu công khai về Mazon không trả lời được ba câu hỏi trọng yếu: anh hồi hộp tới mức nào, anh làm gì trước mỗi cú đánh, và anh nghĩ gì về khán giả chống lại mình. Trận lớn nhất đời anh diễn ra trước một khán đài Indonesia cổ vũ đối thủ, và anh không nói một chữ nào về khán đài ấy. Toàn bộ 06 trích dẫn đều rơi vào 14 tháng của 2010-2011, không có lời nào sau đó dù anh vẫn đang ở hạng 29 thế giới. Điền vào các chỗ trống này là bịa, nên chúng để trống.'},
    ]},
  {key:'psy_pro_davidalcaide', tag:'Cơ thủ', title:'David Alcaide: coi tập trung là lượng hữu hạn, và cắt mọi thứ nằm ngoài mặt bàn — hồ sơ từ 11 video/bài phỏng vấn', who:'David Alcaide',
    intro:'Rút từ 11 nguồn công khai (bốn bài viết có trích dẫn trực tiếp của World Nineball Tour, Matchroom và báo Tây Ban Nha Bola-8; bảy video và podcast tiếng Anh), trải từ 11/2011 tới 04/2026. Alcaide — vô địch World Pool Masters 2017 và 2019, European Open 2023, Philippines Open 2025, người lớn tuổi nhất từng đoạt một danh hiệu Matchroom Major — không dựng niềm tin bằng câu "tôi giỏi nhất": anh nói thẳng ngược lại, rồi đặt chỗ dựa vào một tiêu chí tự chấm không dính tới kết quả và một kỷ luật cắt bỏ mọi thứ nằm ngoài mặt bàn.',
    body:[
      {h:'Nền tự tin dựng ngược với Filler', p:'Bốn ngày sau chức vô địch European Open 2023, khi được hỏi đã quen với áp lực đồng hồ đếm giờ chưa, anh trả lời: "Nếu tôi trượt thì thôi — tôi biết tôi không phải tay cơ giỏi nhất thế giới, nhưng tôi luôn cố hết sức mình." Đây là chỗ anh khác hẳn Joshua Filler, người tự tuyên bố mình là số một để có nhiên liệu thi đấu. Tiêu chí Alcaide dùng thay vào đó được nói rõ hai năm sau: "Khi mang cúp về nhà, tôi muốn cảm thấy mình đã cho đi 100%." Thước đo ấy không phụ thuộc vào đối thủ hay bảng điện tử, nên nó vẫn dùng được ở những ngày thua.'},
      {h:'Câu tự nhắc gọi đúng tên mình, và ra lệnh cho thân thể', p:'Kể lại cú khó nhất trận chung kết European Open 2023, lúc đang bị dẫn 11-12 với bi cái nằm sát băng: "Nhưng tôi tự nhủ: David, đây là cú phải đánh, đừng đi tìm cú khác, đây mới là lựa chọn đúng. Được rồi, đừng lo, tập trung vào đúng cú này thôi. Đừng động đậy lúc đánh, đừng động đậy." Hai lớp trong một câu: anh xưng hô với chính mình bằng tên riêng ở ngôi thứ hai, và nội dung câu nhắc là một mệnh lệnh cơ học chứ không phải một lời trấn an. Khuôn ấy là khuôn chung của nhóm anh — Sánchez Ruiz cũng nhắc anh bằng đúng dạng đó: "David, thả lỏng ra."'},
      {h:'Nghĩ tới suất tuyển là mất giải, và anh nêu cả mốc thời gian', p:'Luận điểm anh lặp lại nhiều nhất, ở ba nguồn cách nhau hai năm: "Nếu đang nghĩ \'ồ, thắng vòng này thì mình có cửa vào Mosconi\' — bạn thua. Lúc nào cũng thua." Anh còn nêu một quan sát kiểm chứng được: "Sau tháng Tám là trình độ các cơ thủ tụt xuống. Mà biết vì sao không? Họ bắt đầu nghĩ tới Mosconi, bắt đầu soi đối thủ." Và anh áp cho chính mình bằng một tỷ lệ: "Không thể cho 100% nếu 85% ở mặt bàn còn phần còn lại nhìn sang bảng xếp hạng." Mức bào mòn anh coi là không chấp nhận được chỉ có 15%.'},
      {h:'Không tra đối thủ vòng sau trước khi đi ngủ', p:'Nguyên tắc trên được cụ thể hoá thành một thói quen dễ bắt chước: "Có những hôm vừa lọt vào vòng 64, chúng tôi đi ăn tối rồi về phòng đi ngủ. Tôi không muốn biết đối thủ vòng 64 của mình là ai. Đến lúc dậy tôi mới cầm điện thoại lên và biết à, mình đánh lúc 11 giờ, gặp người này." Anh cũng không bao giờ xem nhánh thua: "Không bao giờ xem nếu thua thì mình rơi xuống đâu." Ranh giới không nằm ở chỗ có biết đối thủ hay không mà ở chỗ biết vào lúc nào — buổi tối là vùng cấm, sáng ngày thi đấu thì được.'},
      {h:'Đọc thần kinh đối thủ rồi chỉnh mức rủi ro', p:'Ở chung kết Philippines Open 2025 gặp một người lần đầu vào chung kết Major, anh thừa nhận mình không đúng sức: "Tôi hỏng mất ba bốn ván. Nhưng cứ mỗi lần tôi đánh hỏng, tôi lại nhìn sang, thấy cậu ấy đang rất căng. Vì thế hễ vào thế an toàn là không để lại cho cậu ấy bất cứ cú dễ nào." Quy tắc hai vế anh rút ra: "Nếu gặp Shane, Ko Pin-Yi, Jason, Filler hay Fedor thì phải liều nhiều cú hơn. Nhưng với người lần đầu vào chung kết thì có lẽ cách nghĩ đúng là đừng để lại cho họ cú nào dễ cả." Anh thắng trận đó 13-3.'},
      {h:'Tách kết quả khỏi chất lượng chơi, coi đó là đặc tính của môn', p:'Cùng một mệnh đề xuất hiện ở ba nguồn khác nhau: "Bi-a là môn duy nhất mà bạn vừa vô địch xong thì giải sau có thể thua ngay vòng đầu — snooker không thế, carom không thế, các môn khác trên đời cũng không thế." Bản áp cho bản thân: "Thắng hay thua ở vòng nào cũng chẳng nói lên điều gì. Có hôm cảm giác rất tốt mà vẫn dừng ở vòng 32, có hôm cảm giác chẳng ra gì mà lại thắng." Mệnh đề ấy làm đúng một việc là không cho một trận thua sớm trở thành bằng chứng rằng mình đã tệ đi.'},
      {h:'Tuổi tác bị bác bỏ, và thước đo cuối cùng không phải cúp', p:'Vô địch European Open ở tuổi 44 rồi Philippines Open ở tuổi 46, anh nói: "Nhiều người mặc định rằng qua tuổi 40 là cơ hội giảm đi so với những tay trẻ. Nhưng năm ngoái tôi chứng minh điều ngược lại. Thành công của tôi đến từ làm việc miệt mài, không phải từ tuổi tác." Ở ván quyết định trận gặp thần đồng 16 tuổi Jaybee Sucal, anh bước tới tháo hộ đầu cơ nhảy bị kẹt của đối thủ trong lúc đồng hồ đang chạy, rồi giải thích: "Với tôi đó mới là chiếc cúp lớn nhất: đến khi sự nghiệp khép lại, tôi muốn nói được rằng tôi đã tôn trọng tất cả các cơ thủ." Điều này không thay cho khát khao thắng — từ năm 2011 anh đã nói: "Ở trên bàn thì tôi không có bạn."'},
    ]},
  {key:'psy_pro_xuezhenqi', tag:'Cơ thủ', title:'Xue Zhenqi: đổi thước đo thắng thua thay vì nâng niềm tin — hồ sơ từ 7 video/bài phỏng vấn', who:'Xue Zhenqi',
    intro:'Rút từ 07 nguồn công khai có lời trực tiếp của Xue Zhenqi (薛珍麒, Trung Quốc, Fargo 820), trải từ 03/2025 tới 07/2026: ba buổi phỏng vấn video có phụ đề in sẵn (hai của kênh giải Duya, một buổi 12 phút của Tân Văn Tân Vân) và bốn bài báo Trung Quốc có trích dẫn trực tiếp. Nét cốt lõi: anh giữ được bình tĩnh không phải bằng cách nâng niềm tin vào bản thân, mà bằng cách đổi hẳn thứ được đem ra đo thắng thua — và anh chỉ làm phép đổi đó sau khi đã gọi tên xong lỗi của mình.',
    body:[
      {h:'Áp lực không đến từ đối thủ, nó đến từ chính mình', p:'Tháng 3/2025 anh đi từ vòng loại vào tới chung kết giải 2 triệu tệ, gặp cơ thủ số một Trung Quốc biệt danh "Sở Bá Vương", rồi thua ở ván thứ 40. Ngay sau trận, phóng viên hỏi có thấy áp lực khi đấu người đó không. Anh đáp: "Áp lực thì không đến mức gọi là áp lực. Thật ra áp lực không đến từ anh ấy, nó đến từ chính tôi." Anh không tuyên bố mình không sợ đối thủ — anh nói cái cảm giác ấy không đủ tư cách mang tên áp lực, rồi chỉ thẳng chỗ áp lực thật sự nằm.'},
      {h:'Cơ chế hỏng gói trong một câu: có ý nghĩ là đánh không nổi', p:'Anh mô tả được thứ tự các bước hỏng chứ không chỉ mô tả cảm giác: "Kể cả nửa sau trận đấu, tôi thấy… chắc là trong đầu đã có ý nghĩ rồi, thế là thấy đánh không nổi nữa." Chữ "ý nghĩ" ở đây nghĩa là bắt đầu nghĩ tới kết quả. Điều đáng chú ý là anh không chống lại nó bằng ý chí như nhiều cơ thủ khác: "Nhưng đến trận chung kết rồi thì làm sao mà không có ý nghĩ gì được, phải không. Đó là lẽ thường của con người." Anh thừa nhận không im được trong đầu, rồi đi đường khác.'},
      {h:'Áp lực cuối trận là hoá đơn của sự cẩu thả lúc đang dẫn', p:'Được hỏi lúc bị đuổi điểm có áp lực tâm lý không, anh trả lời bằng một câu chẩn đoán chứ không phải một câu than: "Vì trong lúc anh đang dẫn cách biệt lớn, thực chất là các chi tiết nhỏ đã không được kiểm soát cho tới nơi; đến về sau anh sẽ thấy có áp lực." Theo cách anh mô tả, áp lực ở cuối trận không phải nguyên nhân mà là triệu chứng. Nghĩa là chỗ phải làm việc nằm ở lúc đang dẫn 6-1 và thấy dễ chịu nhất, chứ không phải lúc bảng điểm đã sát nút.'},
      {h:'Đóng lại trận thua theo đúng ba bước, không được đảo thứ tự', p:'Bước một, nhận trạng thái thật: "Anh bảo không hụt hẫng à? Nói vậy chắc chắn là nói dối." Bước hai, gọi tên lỗi khi bị hỏi về cú bi số 7 làm anh mất chức vô địch: "Ông trời đã cho tôi cơ hội rồi, mà tôi không nắm được." Bước ba, và chỉ sau hai bước trên, mới đổi thước đo: "Tôi đã thắng rồi. Vì tôi đã thắng được rất nhiều người ủng hộ tôi. Rồi đi được tới bước này, tôi cũng đã thắng được chính mình rồi." Câu cuối đứng một mình là lời tự an ủi rẻ tiền; đứng sau hai bước kia thì nó là một thao tác đóng sổ đúng cách.'},
      {h:'Tự hạ cấp mình đúng lúc nổi tiếng nhất', p:'Tháng 5/2025, khi vừa có thêm hơn một triệu người theo dõi và sắp khoác áo đội tuyển quốc gia, anh nói: "Tôi thấy tư cách hiện giờ của tôi nhất định không phải là một cơ thủ đủ tư cách… Bây giờ tôi chắc chỉ tính là một người làm nội dung mạng đủ tư cách thôi." Anh khai luôn lý do: bận, ít tập, không chuẩn bị đủ cho giải. Cách đọc này là suy luận của người lập hồ sơ: người đã tự tuyên bố mình chưa đủ tư cách thì bước vào bàn đấu không còn gì để mất — mọi kết quả tốt đều là thặng dư.'},
      {h:'Đám đông vừa là chỗ dựa vừa là món nợ', p:'Anh đưa hẳn khán giả vào định nghĩa thắng thua: "Tuy Chu Bỉnh Kiệt rất giỏi… nhưng tôi cảm thấy người hâm mộ ở sân có khi lại ủng hộ tôi nhiều hơn." Nhưng cùng câu trả lời ấy, chỉ vài giây sau, anh nói ra cái giá: "Lần này tôi cảm thấy vì tiếng hò của người hâm mộ quá lớn, nên từ đầu tới cuối tôi đều thấy thật ra mình đang đánh vì người hâm mộ." Đặt cạnh câu về "ý nghĩ" ở trên, rất có thể chính món nợ với đám đông là thứ đã chen vào đầu anh — đây là suy luận của người lập hồ sơ, anh không tự nối hai câu đó.'},
      {h:'Hai trận thua giống hệt nhau, cách nhau 12 năm', p:'Anh đến với bi-a năm 13 tuổi sau khi bố mẹ ly hôn, chưa từng có thầy, bố phản đối tới tận năm anh 30 tuổi, năm 2019 trong người chỉ còn 2.000 tệ. Năm 2013 anh thua chung kết snooker toàn tỉnh Quảng Đông cũng vì đúng một quả bi cuối: "Tôi cũng chỉ cần đánh vào một quả bi thôi… Mà tôi không đánh vào, rồi thua. Ngồi lì ở đó chừng một tiếng đồng hồ, đứng dậy thì cả lưng ướt sũng." Rồi anh chốt bằng chỗ đứng của mình với những trận như thế: "Vận động viên nào cũng sẽ có trải nghiệm kiểu này. Không có trải nghiệm này thì rất khó lên tới đỉnh."'},
    ]},
  {key:'psy_pro_leevanncorteza', tag:'Cơ thủ', title:'Lee Vann Corteza: gỡ áp lực ra khỏi mình rồi mới đánh — hồ sơ từ 9 nguồn phỏng vấn', who:'Lee Vann Corteza',
    intro:'Rút từ 09 nguồn có lời trực tiếp của Lee Vann "The Slayer" Corteza (Philippines, hạng 32 Fargo Rate, rating 820), trải từ 12/2009 tới 08/2025, dày nhất là bài hồ sơ dài của Billiards Digest tháng 08/2010. Corteza là mẫu ngược với Joshua Filler: thay vì lấy hồi hộp làm nhiên liệu, anh chủ động gỡ áp lực khỏi mình trước, và sự tự tin của anh phải được nạp bằng một chiến thắng cụ thể chứ không có sẵn.',
    body:[
      {h:'Chuỗi bốn mắt: gỡ áp lực → tận hưởng → thả lỏng → rồi mới tập trung', p:'Sau khi vô địch China Open 9 bi tại Thượng Hải tháng 05/2013, trận có 12 trên 17 ván là break-and-run, anh nói: "Giải này khó lắm, có quá nhiều tay cơ giỏi. Tôi đã cố để mình không bị đè dưới áp lực và tôi thật sự tận hưởng trận đấu này. Đó là một trong những chìa khoá của hôm nay. Tôi đã thả lỏng. Và chính điều đó giúp tôi giữ được tập trung suốt cả trận." Chuỗi này chạy đúng một chiều, và tập trung nằm ở CUỐI chuỗi — nó là sản phẩm của trạng thái thả lỏng, không phải thứ ép ra bằng ý chí ở đầu. Chú ý anh không nói mình không thấy áp lực, anh nói đã CỐ để không bị đè dưới nó: một việc phải làm, không phải đặc ân bẩm sinh.'},
      {h:'Tự tin không có sẵn — nó được nạp bằng một trận thắng có sức nặng', p:'Ba lần khai ở ba giải, ba nguồn, ba năm khác nhau đều cùng một cấu trúc. Sau chức vô địch quốc gia 12/2009, khi phải qua bán kết gặp cựu số 1 thế giới Dennis Orcollo: "Trận gặp Dennis khó lắm. Nhưng khi hạ được anh ấy rồi thì tôi thở phào được một chút và thấy tự tin hẳn khi bước vào chung kết." Sau US Open 10 bi 05/2010, giải anh phải thắng Shane Van Boening 9-8 ở nhánh thua để có suất: "Tôi có được sự tự tin sau khi thắng Van Boening." Và sau China Open 2013: "nó sẽ cho tôi rất nhiều tự tin trong những tháng sắp tới." Thắng trước, tự tin sau — chiều ngược hẳn Filler, người tự tuyên bố tự tin như điều kiện làm việc rồi mới bước vào giải. Suy luận của người lập hồ sơ: với kiểu vận hành này, gặp đối thủ mạnh ở vòng ngoài không phải xui, mà là chỗ nạp nhiên liệu.'},
      {h:'Cú trượt: cười xoà ra ngoài, ghi nợ bên trong, trong cùng một câu', p:'Nói với Billiards Digest tháng 08/2010: "Nếu tôi trượt, tôi cười xoà cho qua. Nhưng tận đáy lòng, tôi muốn có thêm một cơ hội nữa để chứng minh rằng tôi ăn được cú đó. Tôi nghĩ theo hướng tích cực. Tôi là một tay cơ rất lì." Hai vế làm hai việc khác nhau và ở hai thời điểm khác nhau: vế cười xoà dập cảm xúc ngay tại bàn để cú hỏng không lây sang cú sau, vế đòi cơ hội nữa giữ lại phần cần sửa cho sau trận. Ai chỉ có vế đầu thì thành dễ dãi với mình; ai chỉ có vế sau thì mang cơn tức đi hết trận.'},
      {h:'Vẻ ngoài thư thái là thật, và độ căng bên trong cũng thật', p:'Bill Stock, giám đốc giải US Open 10 bi, mô tả: "Với đa số người xem qua loa thì trông anh ta thư thái vì hay cười, nhưng khi anh ta cúi xuống trên bi cái để chuẩn bị đánh thì độ tập trung là cực cao. Nhìn vào mắt là thấy." Ralf Souquet nói thêm một hệ quả tác động lên đối thủ chứ không phải lên Corteza: "Trông anh ta lúc nào cũng như thể không thể trượt được... Cái khí thế tích cực của anh ta ở bàn làm đối thủ khó chơi hơn." Đây là lời người khác, không phải lời Corteza. Nhưng nó khớp với bản tin AZBilliards ngày anh hạ Filler 11-4 ở chung kết Derby City Classic 2020 với chỉ số TPA .978: "Corteza là tay cơ điềm tĩnh nhất dưới áp lực trong tất cả những người đang chơi."'},
      {h:'Cột mốc luôn tự dời, và thang đo là chất lượng đối thủ chứ không phải tiền', p:'Ngay sau danh hiệu quốc tế lớn nhất tính tới lúc đó, anh đã dời đích: "Sau khi thắng US Open 10 bi, tôi nhận ra là mình đã làm được. Nhưng rồi tôi lại nhận ra mình vẫn chưa thắng US Open 9 bi. Tôi vẫn còn đói lắm." Cách anh định giá chiến thắng cũng không nằm ở tiền: "Thắng một giải mà anh phải đấu với những tay cơ giỏi nhất thế giới là một thành tựu rất lớn." Với 40.000 đô la tiền thưởng China Open 2013 trong tay, thứ anh nêu ra lại là khoảng cách thời gian: "Đã ba năm rồi tôi mới thắng một giải lớn." Cơn đói ấy chưa dừng sau 16 năm: ở tuổi 46, tháng 08/2025 anh vẫn hạ liền Lauro Bongay, cựu vô địch thế giới Carlo Biado và James Aranas để vào vòng 32 một giải trong nước.'},
      {h:'Gốc rễ của sự lì: chuyến đi "một tuần" kéo dài hai năm', p:'Corteza không lớn lên trong túng thiếu — cha là kỹ sư, gia đình trung lưu ở Davao — và anh bỏ học không vì nghèo mà vì cái thú thắng độ. Về cách rời nhà năm 16 tuổi: "Tôi bảo mẹ là có giải đấu trên Manila. Mẹ hỏi: Con đi bao lâu? Tôi nói một tuần." Chuyến đi ấy kéo dài hai năm, tập 10 tiếng mỗi ngày, đánh độ liên tục, không một lần gọi về nhà. Nơi anh đánh: "Mấy tiệm bi-a hạng bét. Đó là những nơi nguy hiểm. Toàn dân uống rượu và mang dao." Suy luận của người lập hồ sơ: khả năng "cố để không bị đè dưới áp lực" nhiều khả năng được rèn ở đó, nơi mỗi ván thua là mất tiền thật trước mặt những người mang dao — so với đó, một trận chung kết có trọng tài là môi trường an toàn.'},
      {h:'Ba chỗ trống phải thừa nhận, không lấp bằng suy đoán', p:'Tư liệu công khai về Corteza không trả lời được ba câu hỏi: anh làm gì trong mấy giây trước khi cúi xuống, anh xử lý một trận thua lớn ra sao, và khán giả ảnh hưởng tới anh thế nào. Anh về nhì World 10-ball 2009 trước Mika Immonen ngay trên sân nhà Philippines mà không có một lời nào về trận đó; câu duy nhất chạm tới thất bại là câu "cười xoà", và nó nói về một cú chứ không phải một trận. Mật độ tư liệu cũng lệch nặng về quãng 2009-2013, từ 2014 tới nay chỉ có đúng một trích dẫn ngắn dù anh vẫn đang ở hạng 32 thế giới. Điền vào các chỗ trống này là bịa, nên chúng để trống.'},
    ]},
  {key:'psy_pro_moritzneuhausen', tag:'Cơ thủ', title:'Moritz Neuhausen: điều kiện hoá bản thân để trạng thái ngoài bàn không lọt vào trong bàn — hồ sơ từ 14 video/bài phỏng vấn', who:'Moritz Neuhausen',
    intro:'Rút từ 14 nguồn công khai có lời trực tiếp của Moritz Neuhausen (Đức, hạng 33 Fargo Rate, MVP Mosconi Cup 2025, vô địch European Open 2026), trải từ 09/2022 tới 07/2026: ba podcast tiếng Anh dài (The Boom & Freezer Show 111 phút, Doggin\' It 71 phút và 32 phút), phỏng vấn ngay sau lễ trao cúp của Matchroom, ba đoạn phỏng vấn ngắn của The Sharkstream, và bốn bản tin có trích dẫn trực tiếp. Nét cốt lõi: anh không tìm cách bình tĩnh, anh dựng một hệ thống hằng số quanh mình để trạng thái trong bàn tách hẳn khỏi mọi thứ xảy ra ngoài bàn.',
    body:[
      {h:'Nguồn áp lực duy nhất là chính mình', p:'Sau lần đầu dự Mosconi Cup và đoạt luôn MVP, kết luận anh rút ra không phải chuyện chịu được đám đông: "Tôi đã chờ đợi một mức áp lực cao ngất trời, không tưởng tượng nổi. Nhưng rồi tôi bắt đầu nhận ra rằng không ai đặt áp lực lên tôi nhiều bằng chính tôi. Không một ai. Có thể có 10.000 người gào vào tai tôi, tôi vẫn thấy rằng chỉ cần tôi hài lòng với cách mình đánh thì tôi chẳng bận tâm họ nói gì." (The Boom & Freezer Show, 12/2025). Danh sách người có quyền chấm điểm anh chỉ gồm chính anh, huấn luyện viên, và vài cơ thủ anh tin.'},
      {h:'Giảm số biến số trong đời xuống mức tối thiểu', p:'Anh mang đúng một cái gối đi khắp nơi, đeo đúng một cái mặt nạ ngủ, ăn gà với khoai tây suốt mấy tuần liền: "Đi đâu tôi cũng có đúng cái gối đó, vì tôi biết đó là hằng số của mình. Ở đây không có biến số nào cả. Nó an toàn." Đích đến của toàn bộ việc ấy được anh nêu bằng một ví dụ: "Giả sử có người tông vào xe của tôi, tôi ở nhà không còn xe nữa, rồi tôi đi tới phòng bi-a — tôi vẫn sẽ đánh hay, đơn giản vì tôi đã tập cho mình luôn nghĩ theo một kiểu nhất định." Và anh chỉ thẳng chỗ hỏng của người khác: "Nhiều cơ thủ hôm nay đánh tuyệt vời, hôm sau đánh tệ hại. Lý do là họ chưa tập cho mình tới mức mà dù ngoài bàn xảy ra chuyện gì, trong bàn họ vẫn làm y một việc như cũ."'},
      {h:'Cục phấn đặt lên điểm ngắm là công tắc chuyển trạng thái', p:'Thói quen dễ nhận ra nhất của anh trên truyền hình có một chức năng tâm lý cụ thể: "Mỗi lần tôi đặt cục phấn lên điểm ngắm, nó chuyển từ luồng suy nghĩ A sang luồng suy nghĩ B." Anh bắt đầu nghi thức này từ giải Premier League Pool 2025, chính giải anh đoạt danh hiệu Matchroom đầu tiên, và trước đó anh còn kiêng đặt phấn lên đúng chỗ ấy vì cho là xui. Mục đích cuối cùng là dồn sạch năng lượng suy nghĩ vào đúng một loại việc: "Thứ duy nhất tôi muốn nghĩ tới khi đứng ở bàn là các quyết định chiến thuật thật sự. Tôi không muốn phải nghĩ bây giờ tôi đưa tay tới trước thế nào, đứng ra sao."'},
      {h:'Trạng thái dòng chảy là thứ tập được, không phải may rủi', p:'Đây là chỗ anh nói ngược lại quan niệm phổ biến: "Nhiều người tin rằng vào được trạng thái dòng chảy là chuyện may, rằng chỉ vài người làm được, và chỉ vào được lúc nào đó nhất định. Tôi tin chắc rằng nếu bạn tập cho mình đúng cách, bạn luôn vào được trạng thái dòng chảy ở một mức độ nào đó. Có lúc bạn hoàn toàn biến mất khỏi thế giới, có lúc bạn chỉ ở một trạng thái dòng chảy nhẹ hơn. Nhưng bạn sẽ ở trong trạng thái tập trung tuyệt đối." (12/2025). Anh xếp các nghi thức của mình cùng họ với việc Nadal xoay nhãn chai nước, và nêu đúng nguồn gốc của chúng: "Đó là những thứ ta phát triển ra dưới áp lực nặng, để đối phó với áp lực."'},
      {h:'Chấm điểm bằng chất lượng quyết định, không bằng bi vào lỗ', p:'Đây là nét ổn định nhất của anh qua ba năm và nhiều nguồn. Nói về tuần Mosconi Cup: "Dưới áp lực nặng, lúc nào cũng có thể đánh trượt một cú hoặc chơi không hay. Nhưng miễn là đầu óc bạn vẫn ở đó và bạn luôn cố đánh theo xác suất, thì đó là tất cả những gì bạn làm được... Tôi cố đánh những cú tốt nhất về mặt thống kê, và rồi thống kê đã diễn ra đúng như thế." Hai năm trước, sau khi để tuột hai chung kết trong hai tuần: "Tôi không đặt kỳ vọng nào. Tôi chỉ muốn đánh đúng cái cách mình phải đánh, và kết quả sẽ theo sau." (Doggin\' It, 09/2023).'},
      {h:'Bị dẫn 2-7 ở chung kết: một quyết định phân bổ năng lượng', p:'Chung kết European Open 2026, anh bị Mario He dẫn 2-7 rồi thắng ngược. Điều anh kể lại không phải nỗ lực gồng lên: "Tôi ngồi trên ghế và tôi chỉ nghĩ đúng một câu: mình sẽ không phí một chút năng lượng nào vào cái gì hết, cứ nhận nó như nó đang là. Rồi khi cơ hội tới, tôi phải dùng nó." (Matchroom Pool, 16/03/2026). Anh cũng khai luôn phần đầu giải rất tệ, và coi đó mới là chỗ đáng giá: "Tôi đã đi từ điểm thấp nhất của khả năng chơi bi-a lên tới có lẽ là điểm cao nhất bây giờ. Mà thực ra điều đó mới có ý nghĩa với tôi hơn, vì tôi đã thật sự quay lại được về mặt tinh thần."'},
      {h:'Ghét thua là nhiên liệu của phòng tập, không phải của bàn đấu', p:'Anh không giấu mức độ thật: "Tới tận hôm nay, không có gì tôi ghét hơn việc thua", và anh không dám chơi cờ bàn với anh rể vì "khi tôi thua thì nó đau tới mức tôi không chịu nổi". Nhưng hồi 14-15 tuổi anh còn tự đấm mình sau mỗi trận thua, và cơ chế mới mà anh dựng lên là phân loại nguyên nhân: "Tôi thà nhận kiểu thua này còn hơn thua kiểu xui rủi. Lần này tôi đánh dở hơn thật, và thế là ổn, tôi nhận được, tôi xử lý được." (Doggin\' It, 09/2023). Hai thứ đó không mâu thuẫn: cơn ghét thua giữ vai trò động cơ để tập, còn thước đo quyết định giữ vai trò chấm điểm sau trận — cách đọc này là suy luận của người lập hồ sơ.'},
    ]},
  {key:'psy_pro_pagulayan', tag:'Cơ thủ', title:'Alex Pagulayan: đặt luật cho mình trước khi đặt mục tiêu — hồ sơ từ 12 nguồn phỏng vấn', who:'Alex Pagulayan',
    intro:'Rút từ 12 nguồn có lời trực tiếp của Alex "The Lion" Pagulayan (Canada/Philippines, hạng 34 FargoRate, vô địch thế giới 9 bi 2004, BCA Hall of Fame), trải từ bài tự thuật trên Observer Sport Monthly năm 2003 tới podcast Lucky Breaks tháng 04/2026, dày nhất là buổi 95 phút ở The Boom and Freezer Show tháng 07/2026. Nét cốt lõi: anh chốt một điều kiện tham gia cho chính mình năm 17 tuổi rồi mọi thứ khác mọc ra từ đó, và anh công khai điểm yếu tâm lý của mình thay vì giấu.',
    body:[
      {h:'Luật gốc đặt năm 17 tuổi, và cơn giận bị đóng khung bằng phút', p:'Khi Scott Frost hỏi thái độ vui vẻ giữa giải từ đâu ra, Pagulayan không trả lời bằng tính cách mà bằng một quyết định có mốc tuổi: "Năm tôi 17 tuổi, tôi tự nói với mình: nếu mình không chịu nổi việc thua thì chơi làm gì. Tôi biết thua thì đau, nhưng sau đó anh vẫn phải sống tiếp cuộc đời của anh." Từ luật ấy ra một con số đo được, nói năm 2020: "Vừa thua trận lớn thì khó thật, tôi cáu chừng 2, 3 phút, nhiều nhất là 5 phút, sau đó là ổn. Không ai làm ta vui hay buồn được ngoài chính ta." Nhưng chính anh kể mình hồi mới lên: thua xong ra ngoài đập nát ngọn cơ thành nghìn mảnh, đám người hút thuốc bên ngoài chạy hết vào trong vì tưởng anh phát điên. Con số 5 phút là đích đến của mấy chục năm rèn, không phải tính cách trời cho.'},
      {h:'Hồi hộp: ai cũng có, và anh còn muốn có một chút ở đầu trận', p:'Sau khi trượt bi 9 trước Jayson Shaw rồi thừa nhận trên sóng là mình hồi hộp, anh nói: "Ai cũng hồi hộp. Không có lấy một cơ thủ nào chưa từng hồi hộp. Ai bảo họ không bao giờ hồi hộp thì người đó nói xạo. Nhưng là dân chuyên nghiệp, chúng tôi kiểm soát được, vì đã trải qua quá nhiều lần rồi." Năm 2023 anh nói rõ hơn: "Tôi không nhớ nổi có ngày nào đánh độ hay đánh giải mà tôi không hồi hộp. Nhất là ở đoạn đầu. Nhưng càng đánh lâu tôi càng hay hơn." Anh cũng chỉ ra một chi tiết ít ai nêu: đồng hồ bấm giờ cắt mất công cụ hạ nhịp, vì "khó mà bắt đầu thở cho đều, uống ngụm nước cho dịu lại, khi anh đang hết giờ đến nơi".'},
      {h:'Kẻ thù thật sự không phải đối thủ mà là tự nghi ngờ, và nó đánh mạnh nhất khi đã đủ giỏi', p:'Hỏi cái gì đã đổi giữa chuỗi năm về nhì và mùa bắt đầu vô địch, anh không nói tới kỹ thuật: "Khi anh bắt đầu thua, anh bắt đầu nghi ngờ chính mình. Đó là giai đoạn khó nhất trong cả đời chơi bi-a: anh biết là mình làm được, mà anh lại không làm được, chỉ vì sự tự nghi ngờ chặn anh lại." Anh chỉ thêm một điều trái trực giác: "Khi còn là tay cơ đang lên, thua ở giai đoạn đầu thì không sao, vì tự anh biết mình chưa sẵn sàng. Phần bức bối nhất là lúc anh đã sẵn sàng rồi — đánh độ thì hạ được tất cả, mà đánh giải thì không vô địch nổi." Câu anh dùng để gỡ ra, dẫn từ Anthony Robbins: "Quá khứ không bằng tương lai. Anh học được từ quá khứ, nhưng nếu cứ đắm trong nó thì người duy nhất phải trả giá chính là người đang đắm trong đó."'},
      {h:'Tập phải căng như thi đấu, nếu không thì đó chỉ là gõ bi', p:'Đây là kê đơn cụ thể nhất của anh: "Khi tập, tôi luôn coi như mình đang đánh giải, vì tôi không muốn tự tạo cho mình thói xấu là gõ bi cho vui." Chẩn đoán bệnh của người nghiệp dư: "Ngày nào cũng thấy họ tập, đánh sáng cả bàn. Vào giải thì không đánh nổi. Vì lúc tập họ không nghiêm túc. Nhưng nếu anh tập trong trạng thái căng, tới lúc thi đấu anh đã có sẵn nó rồi — nó gần như thành bản năng thứ hai." Áp lực ấy anh tạo bằng cách gắn hệ quả vào từng buổi: "Tập một mình thì bài phải đủ khó. Qua được thì tôi ra trung tâm thương mại tự thưởng. Không qua được thì tôi tập tiếp — tôi phạt chính mình." Lý do anh nêu không phải kỷ luật cho oai: "Thói quen rất dễ hình thành mà rất khó bỏ."'},
      {h:'Khởi động chậm: ba mươi năm không sửa được, nên anh thiết kế lại quanh nó', p:'Rất hiếm cơ thủ hàng đầu tự khai điểm yếu bằng con số năm như vậy: "Vấn đề của tôi là tôi khởi động rất chậm. Tôi đã sửa nó 30 năm rồi, mà tới hôm nay vẫn đang sửa. Nhưng chỗ mạnh của tôi là ở đoạn cuối." Thay vì tiếp tục sửa, anh chọn sân đấu hợp với mình: "Khi đánh độ, tôi biết là đua dài và tiền lớn. Tôi chuẩn bị hẳn một tháng cho đúng trận đó. Nên mới có chuyện tôi hầu như không thua trận lớn nào." Cùng nguyên tắc ấy đã có trong bài anh viết cho Observer Sport Monthly năm 2003, hai mươi năm trước: "Trận càng dài thì may rủi càng ít xen vào."'},
      {h:'Động cơ là bị thách, không phải cúp; và tâm lý là tầng cuối cùng phải học', p:'Anh tự nhận điểm yếu thứ hai còn thẳng hơn: "Vấn đề lớn nhất của tôi là cái đầu và tính kỷ luật với môn này, chỉ vì tôi thích làm quá nhiều thứ. Đôi khi tôi ganh với Dennis Orcollo, Shane Van Boening, Joshua Filler — họ chỉ chơi bi-a thôi. Còn tôi chỉ chơi bi-a khi bị thách. Nếu có người thách đánh one pocket ăn 100.000, đang làm gì tôi cũng bỏ ba tháng để chuẩn bị." Về thứ tự học, anh xếp tâm lý ở cuối: "Việc đầu tiên là dựng trí nhớ cơ bắp cho cú đánh, rồi tiến lên bậc kế. Phần cuối cùng, khi anh đã có đủ mọi thứ, đó là lúc phần tâm lý mới vào cuộc. Và đó là phần khó nhất." Bí quyết duy nhất anh chịu công nhận: "Bí quyết đây: không có bí quyết nào cả. Bí quyết là biết chính mình."'},
      {h:'Gỡ áp lực phải làm TRƯỚC trận, không phải giữa trận', p:'Câu trả lời đầy đủ nhất cho câu hỏi làm sao giữ tinh thần sau một trận thua quan trọng, nói tháng 04/2026: "Trước khi vào trận anh phải đổi cái đầu đã. Nếu anh đổi sang tâm thế tận hưởng ván đấu và học hỏi, quên chuyện thắng đi, thì anh gỡ hết áp lực ra. Chỉ cần anh tự đặt cho mình: thua tôi cũng không sao, miễn là tôi đã cố hết sức và tôi thấy vui khi làm việc đó — thế là đủ." Chú ý mốc thời gian nằm ngay trong câu, "trước khi vào trận": đây là quyết định phải chốt xong trước khi cầm cơ, chứ không phải trạng thái tự gọi ra được lúc đang bị dẫn. Và anh không tô vẽ năng khiếu: "Người ta bảo tôi có năng khiếu bẩm sinh — ừ, anh cũng bẩm sinh thôi nếu anh đánh 10 tiếng một ngày trong năm năm."'},
    ]},
  {key:'psy_pro_maxlechner', tag:'Cơ thủ', title:'Max Lechner: coi tâm lý là hạng mục kỹ thuật phải thi công, không phải khí chất trời cho — hồ sơ từ 09 video/bài phỏng vấn', who:'Max Lechner',
    intro:'Rút từ 09 nguồn công khai có lời trực tiếp của Max Lechner (Áo, hạng 35 FargoRate, á quân US Open 2022 và International Open 2019), trải từ 11/2019 tới 06/2026: phỏng vấn dài 24 phút của kênh Sharivari (07/2024), podcast Doggin\' It 36 phút ghi ngay sau US Open 2022, hai buổi quay tại bàn của kênh pocketed! (2022), một bản tin trích dẫn của World Nineball Tour và bốn bài báo Áo. Nét cốt lõi: anh không chờ cảm giác tự tin mà thi công từng bộ phận của phần đầu óc, và khi mọi thứ sụp thì anh đi lùi về những thứ nhỏ nhất chứ không gồng lên.',
    body:[
      {h:'Vết thương gốc: chuỗi tứ kết tự đánh hỏng', p:'Lechner có một vệt thua đau ở đúng một vòng đấu, và anh kể rất cụ thể: tứ kết giải vô địch thế giới 2022, dẫn 9-4 trong trận đua tới 11 rồi thua 9-11; năm trước đó cũng tứ kết, cũng hỏng, gặp David Alcaide. Vượt được vòng tứ kết US Open 2022, câu đầu tiên anh nói không phải về chiến thắng: "Trước hết, đây là sự nhẹ nhõm lớn nhất đời tôi, sau khi đã làm hỏng bao nhiêu trận tứ kết. Lần này tôi đánh bại được lũ quỷ trong đầu mình, và tôi đã đi qua được." (World Nineball Tour, 10/2022). Bốn ngày sau anh dùng lại đúng cụm "lũ quỷ" trên podcast Doggin\' It — đó là cách anh thật sự gọi tên vấn đề của mình, không phải câu nói cho hay.'},
      {h:'Niềm tin lúc bị dẫn 2-8 không dựa vào phong độ', p:'Bán kết US Open 2022 anh bị Ko Ping Chung dẫn 2-8 rồi thắng ngược 11-10, và gọi đó là trận hay nhất về tâm lý trong 22 năm cầm cơ. Chỗ đáng học nằm ở cách anh mô tả niềm tin ấy: "Tôi thật sự tin vào bản thân dù đang bị dẫn 2-8 và có lẽ đã chơi dở suốt cả trận. Nhưng tôi vẫn tin vào độ lì tâm lý của mình, vào thể lực của mình và cả vào kỹ năng của mình trên bàn bi, rằng tôi vẫn lật ngược được trận đấu." Anh nói rõ mình đang chơi dở — niềm tin dựa trên ba thứ đã có sẵn từ trước buổi thi đấu, không dựa vào việc tay đang nóng. Và khi người dẫn hỏi nói vậy có dễ hơn làm không, anh đáp gọn một từ: "Có."'},
      {h:'Cảm giác quá tốt cũng là một cái bẫy', p:'Trước chung kết US Open 2022 anh chỉ có nửa tiếng nghỉ, và đã tập rất hay ở bàn tập: "Tôi cảm thấy rất, rất tốt ở bàn tập, ăn liền ba bốn ván. Và có lẽ chính điều đó khiến tôi mất trận đấu ở giai đoạn đầu, vì tôi đã đánh quá liều — vì tôi đang cảm thấy quá tốt." Cái quá liều đó rất cụ thể: "Tôi muốn bi cái lúc nào cũng phải vào vị trí hoàn hảo, thay vì chỉ cần ăn bi rồi có đường cho bi kế tiếp." Kỳ lạ là cùng lúc ấy cơ thể lại ngược chiều: "Cơ bắp tôi không thả lỏng được như đáng lẽ phải thế, nên tôi hơi căng cứng ở những khoảnh khắc đặc biệt." Bài học anh rút ra gọn bốn chữ: "ít lại là nhiều".'},
      {h:'Quy trình trước cú đánh vừa là nền móng vừa là phao cứu', p:'Hỏi anh làm gì khi đang chơi ở mức B hoặc C, câu trả lời không có chữ nào về ý chí: "Nếu tôi thấy mình run rẩy hoặc mọi thứ cứ không theo ý mình, tôi cố quay về các quy trình của mình, về những thứ nền tảng — chẳng hạn quy trình trước cú đánh. Nếu đầu óc tôi loạn tứ tung, tôi có mấy từ nhất định về việc phải làm gì trên bàn, và tôi cố nhớ chúng rồi xử lý chúng từng từ một, để tìm lại được sự tập trung." (Sharivari, 07/2024). Anh không nống công dụng lên: "Không phải lúc nào cũng ăn, nhưng phần lớn thời gian thì có." Bản thân quy trình ấy có một nhịp dừng, và nhịp dừng có nhiệm vụ xác định chứ không phải để thở: "Với tôi nó cần thiết vì tôi luôn kiểm tra lại lần nữa điểm ngắm trên bi mục tiêu." Hỏi nó có ảnh hưởng tới kỹ thuật không, anh đáp: "Với tôi thì không hẳn."'},
      {h:'Bài tập được thiết kế để gây bực', p:'Lechner không tập chịu áp lực bằng đánh độ như Filler; anh dựng luật cho bài tập sao cho chính mình bị kẹt lại: chỉ được sang bài kế tiếp khi làm trọn bài đang làm, hỏng thì quay về từ đầu. Mục đích không phải kỹ thuật mà là cảm xúc: "Mấy bài tập ấy gây ra rất nhiều tức giận và bực bội. Và nếu anh học được cách xử lý tức giận và bực bội ngay trong lúc tập, nó chắc chắn sẽ giúp anh ở giải đấu." (pocketed!, 07/2022). Hai năm sau anh gọi tên cả chuỗi phản ứng: "Càng hỏng nhiều thì càng tức, càng tức thì càng nản, và càng nản thì càng khó. Và anh sẽ gặp đúng mấy thứ đó trong một trận đấu khi mọi việc không theo ý mình." Anh cũng khuyên mỗi tuần chia hai loại buổi: một buổi bài tập, một buổi cứ chơi cho vui, vì "đừng lúc nào cũng làm mấy thứ kỹ thuật, đôi khi nó làm anh bực lắm".'},
      {h:'Tự tin là tài sản bốc hơi được, không phải tính cách', p:'Tháng 11/2019 sau khi vào chung kết International Open: "Và giờ tôi biết là tôi đánh bại được tất cả bọn họ." (Tiroler Tageszeitung). Tháng 05/2021, sau 15 tháng không giải: "Tôi không còn biết mình làm việc này để làm gì nữa." Tháng 10/2022 nhìn lại: "Sau 14 tháng không đánh giải nào, tôi kiểu như mất sạch sự tự tin đã xây được từ thành tích đó, và tôi phải bắt đầu lại từ số không." Lần trở lại đầu tiên anh mô tả: "Tôi thấy như cả đời mình chưa từng đánh một giải đấu. Vòng đầu tiên, tôi run như một chiếc lá. Nhưng rồi anh sẽ quen lại." Toa thuốc là thứ chỉ có ở ngoài đời: "Càng thi đấu nhiều thì càng khá lên. Anh phải tự đặt mình vào tình huống đó."'},
      {h:'Tắt điện thoại trước tứ kết, và câu châm ngôn của thầy', p:'Albin Ouschan khuyên anh cắt sạch mạng xã hội trước trận tứ kết US Open 2022, và Lechner gọi đó là "một phần lớn trong thành công của tôi". Thứ gây hại lại chính là lời chúc mừng: "Họ chúc mừng anh và họ chỉ muốn điều tốt nhất cho anh thôi, nhưng nó vẫn chui vào đầu anh quá nhiều và làm mọi thứ khó thêm... Anh đọc về Mosconi Cup, anh đọc về tiền thưởng." Điểm tựa cuối của anh là câu của huấn luyện viên đã đi cùng 22 năm: "Kể cả khi tôi đang bị dẫn, kể cả khi có kẻ đánh bại tôi — hắn sẽ không bao giờ lấy được cái ý chí muốn thắng ấy của tôi." Câu này tách bạch trận đấu (mất được) khỏi ý chí (không ai lấy được), đúng cùng logic với nguyên tắc anh mang vào bàn: "Anh không tác động được vào kết quả, anh chỉ tác động được vào lối chơi của mình."'},
    ]},
  {key:'psy_pro_fujianbo', tag:'Cơ thủ', title:'Fu Jianbo: hạ kỳ vọng thì vô địch, ôm kỳ vọng thì gãy — hồ sơ từ 4 bài phỏng vấn', who:'Fu Jianbo',
    intro:'Rút từ 04 nguồn công khai có trích dẫn trực tiếp lời Fu Jianbo (付剑波 / 傅俭波, Trung Quốc, Fargo 818, hạng 36 thế giới), trải từ 2007 tới 2016: bài chân dung của Tiền Giang Vãn Báo, bài của Ngã Đích Đài Cầu Võng, bản tin phỏng vấn của Sohu Sports và của Hiệp hội Bi-a Trung Quốc. Nét cốt lõi: anh là người sớm chỉ ra rằng khoảng cách còn lại với thế giới nằm ở tâm lý chứ không ở cơ — rồi chính anh trở thành ca bệnh điển hình của cái khoảng cách đó.',
    body:[
      {h:'Khoảng cách với thế giới nằm ở tâm lý, không nằm ở cơ', p:'Năm 2007, ngay sau khi cùng Lý Hách Văn mang về chức vô địch thế giới đầu tiên trong lịch sử bi-a Mỹ nam Trung Quốc đại lục, anh nói: "Bây giờ cơ của chúng tôi so với trình độ thế giới đã không còn cách xa mấy, khoảng cách chủ yếu thể hiện ở tâm lý." Anh mô tả rõ cái khoảng cách đó là gì: "Nhiều cơ thủ nước ngoài đã hoàn toàn tận hưởng trận đấu rồi, thắng thua đều cười xoà cho qua; cơ thủ của chúng tôi thiếu đúng cái ung dung đó." Đáng chú ý là anh không nói đối thủ giỏi hơn. Anh nói đối thủ nhẹ hơn.'},
      {h:'Chức vô địch thế giới đến từ một mục tiêu đặt thấp', p:'Bài báo ghi rõ: trước World Cup of Pool 2007, mục tiêu hai người tự đặt ra chỉ là vào tới top 8. Chính trong trạng thái buông nhẹ đó, họ đi một mạch tới ngôi vô địch, thắng đội Phần Lan 11-10 ở loạt cơ thứ 21. Ý nghĩ đầu tiên của anh lúc thắng không phải là vinh quang mà là một món nợ được trả: "Lúc ấy ý nghĩ đầu tiên trong đầu tôi là hai mươi năm đời cơ thủ rốt cuộc cũng có một lời giải trình."'},
      {h:'Muốn quá mức thì gãy: tấm huy chương bạc đẩy anh ra khỏi truyền thông', p:'Tháng 5/2011 anh giành á quân giải vô địch 10 bi thế giới ở Philippines, thành tích cá nhân tốt nhất của bi-a Mỹ nam Trung Quốc lúc đó. Đầu tháng 6, gặp phóng viên, anh chỉ nói một câu: "Xin lỗi, tôi không nhận bất cứ cuộc phỏng vấn nào của truyền thông!" Huấn luyện viên đội tuyển Tăng Trọng Hào nói ra phần anh không nói: "Sau khi lấy á quân ở Philippines, lão Phó chịu áp lực rất lớn, tâm trạng cũng rất tệ; anh ấy muốn ngôi vô địch quá mức." Cùng một người, cùng một trình độ cơ: đặt mục tiêu top 8 thì vô địch thế giới, muốn vô địch quá mức thì dừng ở bạc rồi tan nát nhiều tháng.'},
      {h:'Sự ung dung của anh là biến số, và anh tự biết điều đó', p:'Năm 2016, đánh đôi nam nữ cùng Bạch Cáp và thắng nhẹ trận đầu, anh nói đùa với phóng viên: "Tôi thấy hai đứa tôi có thể gọi là cặp đôi hip-hop." Rồi ngay câu kế tiếp anh tự gỡ: "Nhưng trong bảng vẫn còn đối thủ mạnh; tôi đoán gặp phải tay ghê gớm thì hai đứa tôi hết hip-hop nổi." Câu này cho thấy anh biết trạng thái nhẹ nhõm của mình là hàm số của độ mạnh đối thủ chứ không phải hằng số do anh làm chủ. Chín năm sau lời chẩn đoán 2007, anh vẫn chưa lấy được thứ mình nói là còn thiếu, và anh nói ra bằng giọng đùa, không giấu.'},
      {h:'Gốc rễ: không chịu thua, rồi tám năm cây cơ đóng bụi', p:'Anh kể lần đầu cầm cơ: "Tôi là người không chịu thua. Hồi đó tôi chừng 13 tuổi... sau vì một câu đùa, phải so tài với người ta cho vui, thế là cứ ù ù cạc cạc mà cầm lấy cây cơ." 16 tuổi anh đã không còn đối thủ ở quê, nhưng gia đình cấm theo nghề, và tám năm tiếp theo là tám năm bỏ hoang: "Quãng đó tôi đổi hơn 20 nơi làm việc, nhưng thường làm chẳng được bao lâu là bỏ, vì không tìm được cái nhiệt tình ấy." Lối thoát gói trong một câu: "Sau nhà hỏi tôi rốt cuộc muốn làm gì, tôi nói tôi muốn đánh bi-a." Người mất tám năm vì không được phép làm nghề mình muốn thì chức vô địch không phải phần thưởng, mà là bằng chứng.'},
      {h:'Thua ở vùng lạ thì mô tả đúng cái mù của mình rồi rút', p:'Tháng 11/2012, thua 3-9 ở giải 8 bi, anh không đổ cho bàn hay may rủi. Anh kể lại rất cụ thể: 8 bi có lúc người ta nhìn thấy rất đơn giản mà anh lại thấy rất phức tạp, có khi một bàn bi bày ra đó anh không biết phải đánh thế nào. Về khoảng cách giữa hai nội dung, anh chỉ nói bốn chữ: "Khác nhau nhiều quá!" Rồi anh hạ kỳ vọng xuống đúng mức, không đặt mục tiêu gây dựng đẳng cấp ở mảng 8 bi. Đây là cách anh quản lý sự nghiệp: chọn chỗ để không đánh, thay vì ép mình giỏi mọi thứ.'},
      {h:'Kéo dài đời cơ thủ bằng cách đổi sân, không phải bằng cách chống lại tuổi', p:'Năm 2004 anh bỏ hẳn snooker vì tính được rằng nghề đó hết ở tuổi 35, chọn 9 bi để đi xa hơn: "Nghề nào phải chuyên nghề nấy. Tôi thấy giữ được phong độ thêm 5 năm nữa chắc không thành vấn đề." Anh nói câu đó năm 2007 và đã ước lượng thấp hơn thực tế gần hai mươi năm. Ngoài năm mươi tuổi, anh lại chuyển phần lớn lịch thi đấu sang hệ trung thức cửu cầu trong nước, và tháng 6/2026 vẫn vào tới vòng 16 giải có tiền vô địch 10 triệu nhân dân tệ. Cách đọc này là suy luận của người lập hồ sơ: ba lần đều là cùng một nước đi, rời khỏi chỗ mình sẽ già nhanh sang chỗ mình còn dùng được.'},
    ]},
  {key:'psy_pro_jefreyroda', tag:'Cơ thủ', title:'Jefrey Roda: nói thật về áp lực, đo giấc mơ bằng số trận còn lại — hồ sơ từ 04 bài báo phỏng vấn', who:'Jefrey Roda',
    intro:'Rút từ 07 trích dẫn thật trong 04 bài báo và thông cáo có trích dẫn trực tiếp, từ 12/2024 tới 08/2026. Cơ thủ Philippines sinh năm 2000, biệt danh "Deathstroke", vô địch Chinese Taipei Open 2024. Tư liệu mỏng vì không tồn tại phỏng vấn dài nào, nhưng nét tâm lý hiện lên rất rõ: bên trong khai là áp lực ghê gớm, bên ngoài đối thủ đọc được sự điềm tĩnh.',
    body:[
      {h:'Thắng lớn xong, cảm giác đầu tiên là nhẹ nhõm chứ không phải sung sướng', p:'Ngày 15/08/2026 tại Arizona Open, Roda hạ Joshua Filler 10-4 rồi hạ tiếp Jeffrey De Luna 10-7 để vào bán kết. Câu đầu tiên anh nói không phải về trình độ: "Hôm nay tôi thấy áp lực ghê gớm, nên tôi thực sự nhẹ nhõm vì đã đi qua được." Từ anh chọn là nhẹ nhõm, không phải hạnh phúc — cảm giác của người vừa thoát khỏi một thứ nặng, không phải người vừa nhận được một thứ quý. Khác Filler, anh không mô tả cách dùng áp lực; anh chỉ khai là có và mình đã qua.'},
      {h:'Trận khó nhất là trận với người mình quý, không phải với người mạnh nhất', p:'Trong đúng ngày ấy, về Filler anh không nói một chữ nào. Thứ anh gọi là khó lại là trận với bạn: "Jeffrey là đồng hương của tôi và anh ấy như anh em ruột với tôi, nên đánh với một người như thế mà lại có một suất bán kết đặt trên bàn thì chẳng bao giờ dễ." Suy luận của người lập hồ sơ: với Roda, độ khó của trận không tỷ lệ với trình độ đối thủ mà tỷ lệ với số ràng buộc phải tạm cắt để đánh hết sức. Anh thuộc câu lạc bộ Marboys, nơi đồng đội cũng là bạn tập hằng ngày, nên cảnh này lặp lại liên tục.'},
      {h:'Gọi chuỗi thắng là "may", rồi kéo cái may sang trận sau', p:'Cùng lần phát biểu đó: "Tuần này tôi thấy mình rất may, nhất là hôm nay, nên hy vọng cái may đó còn tiếp tục vào ngày mai." Tỷ số 10-4 trước nhà vô địch UK Open không phải tỷ số của may mắn. Đây là đúng phản xạ đã đo được ở Jundel Mazon 14 năm trước. Có thể là phép lịch sự văn hoá, cũng có thể là cách chặn kỳ vọng khỏi phồng lên ngay trước một trận bán kết — nhưng điểm chung là vế sau: trong lúc miệng hạ thấp công của mình, đầu anh đã đứng ở trận kế tiếp.'},
      {h:'Nghi ngờ bản thân được đặt ngang hàng với thử thách, không bị giấu', p:'Sau chức vô địch World Nineball Tour đầu tiên tại Chinese Taipei Open 12/2024, khi lật ngược từ 8-11 trước cựu vô địch thế giới Ko Pin Yi để thắng 13-11: "Con đường chưa bao giờ dễ — nó đầy thử thách, đầy vấp ngã, đầy những lúc hoài nghi — nhưng tôi luôn tin rằng với sự bền bỉ, niềm tin và làm việc chăm chỉ thì ngày này sẽ tới." Thứ tự nhân quả anh nêu ngược với thường thấy: không phải thắng nên tin, mà luôn tin nên ngày ấy tới.'},
      {h:'Đo giấc mơ bằng số trận còn lại, không bằng danh hiệu', p:'Câu chốt của lần phát biểu 08/2026 là nét kỹ thuật tâm lý rõ nhất trong cả hồ sơ: "Vô địch một giải Major của World Nineball Tour là giấc mơ của tôi, và bây giờ tôi còn cách hai trận." Anh nêu giấc mơ rồi lập tức quy nó ra đơn vị đếm được. Cách này giữ nguyên độ lớn của mục tiêu, thu nhỏ nó về kích cỡ cầm nắm được, và không hứa hẹn điều gì để phải trả giá nếu thua. Hôm sau anh thua Denis Grabe 8-11 ở bán kết, và không có phát biểu nào sau trận đó.'},
      {h:'Bên trong khai là áp lực, bên kia bàn đọc ra sự điềm tĩnh', p:'Sau khi thua Roda ở vòng 16 World Pool Championship 2025 trong một trận hoà điểm ván cuối, Dương Quốc Hoàng viết: "Roda đánh như một chiến binh — điềm tĩnh, chính xác, và bản lĩnh ở thời khắc quyết định." Ba chữ đó Roda không bao giờ dùng cho mình. Chúng được dữ kiện ủng hộ: lật ngược 8-11 để vô địch Đài Bắc, hạ Filler 10-4, và ở chung kết World Teams Championship 02/2026 anh là người ghi cú quyết định sau khi Carlo Biado — nhà vô địch thế giới ba lần — đã trượt. Đối thủ nào tin rằng Roda đang thoải mái là đang đọc sai.'},
      {h:'Chỗ hồ sơ này còn trống: không có một dòng nào về cách anh xử lý thua', p:'Toàn bộ lời Roda công khai đều nói sau hai chiến thắng. Anh đã thua nhiều trận lớn — tứ kết US Open 2024, bán kết Hanoi Open 2024, tứ kết World Pool Championship 2025, bán kết Arizona Open 2026 — mà không có phát biểu nào. Mô tả duy nhất theo chiều ngược là câu của ban tổ chức về bán kết Hanoi 2024: "thần kinh đã thắng cơ thủ người Philippines, dẫn tới một cú trượt chí mạng ở bi số 4" — nhưng đó là suy diễn của người viết bản tin từ một cú trượt, không phải lời người trong cuộc. Đọc hồ sơ này là đang cầm nửa chân dung: nửa của người vừa thắng.'},
    ]},
  {key:'psy_pro_jeffreyignacio', tag:'Cơ thủ', title:'Jeffrey Ignacio: người đo nghề bằng giờ đứng bàn, không bằng lời tuyên bố — hồ sơ từ 2 bài phỏng vấn và bản tin', who:'Jeffrey Ignacio',
    intro:'Rút từ 08 trích dẫn thật của Jeffrey "The Cobra" Ignacio (Philippines, hạng 38 Fargo Rate) trong 02 nguồn: bài phỏng vấn trực tiếp của Rappler ngày 24/07/2016 tại Star Billiards Center, Quezon City, và phát biểu sau chức vô địch TAOM Arena Open đăng trên Daily Tribune ngày 20/05/2026. Ignacio không có buổi phỏng vấn dài nào trên mạng công khai, nên tư liệu mỏng — nhưng hai mốc cách nhau 10 năm cho ra cùng một khuôn: nói về nghề bằng số giờ và điều kiện sống, rút phần công của mình ra khỏi mọi câu về thành tích.',
    body:[
      {h:'Hai năm sống theo ca 3 giờ chiều tới 3 giờ sáng', p:'Khi phóng viên Rappler gặp anh năm 2016 ngay tại phòng bi-a nơi anh lớn lên trong nghề, câu đầu tiên anh nói không phải về danh hiệu mà về giờ giấc: "Hồi 2013 tới 2014 tôi ở đây từ 3 giờ tới 3 giờ. Từ 3 giờ chiều tới 3 giờ sáng." Mười hai tiếng một ngày, kéo hai năm. Điều đáng ghi là vị trí của con số ấy trong câu chuyện anh kể về mình: được hỏi về sự nghiệp, thứ anh đưa ra trước tiên là khối lượng giờ đứng bàn. Hai năm đó kết thúc bằng trận chung kết China Open 2014, giải xếp hạng thế giới đầu tiên anh vào tới trận cuối. Nhưng anh không nói anh tập gì trong khối giờ ấy — đây là bằng chứng cho khối lượng, không phải cho cách tập.'},
      {h:'Đánh ăn tiền và đánh giải là hai nghề khác nhau', p:'Đây là nét có giá trị thực dụng nhất trong hồ sơ, và Ignacio nói nó qua người khác — Skyler Woodward, tay cơ Mỹ mà anh từng hạ ở chung kết US Bar Table 2015: "Nếu anh ấy đánh độ ở Philippines thì nhiều người hạ được anh ấy, nhưng ở Mỹ, hễ có giải nặng ký là anh ấy hay vô địch." Câu này tách trình độ ra khỏi kết quả: cùng một tay cơ, hai môi trường cho hai hạng thành tích. Cách đọc sau là suy luận của người lập hồ sơ, không phải lời anh: trong trận cá độ, thua ván này còn gỡ ván sau và trận kéo tới khi một bên hết tiền; trong giải đấu, mỗi trận là một cửa đóng lại vĩnh viễn. Người quen cửa thứ nhất học được bản lĩnh chịu tiền thật, nhưng chưa tự động học được cách chịu tính một lần của giải đấu.'},
      {h:'Động cơ đặt ở ngoài trận đấu: thắng giải để đổi điều kiện sống', p:'Được hỏi thích đánh độ hay đánh giải, anh trả lời bằng một chuỗi nhân quả rất gọn: "Nếu được chọn, tôi thích đánh giải hơn. Thắng một giải lớn thì nhà tài trợ sẽ nhiều lên. Người ta biết tới mình, và cả cuộc đời mình có thể đổi khác." Thắng giải kéo theo tài trợ, tài trợ kéo theo đổi đời — tiền thắng cược không nằm trong chuỗi đó, dù chính nó nuôi anh suốt thời trẻ. Khác hẳn Joshua Filler, người nói động cơ của mình là ghét thua và muốn thấy mặt mình trên cúp; động cơ của Ignacio nằm ở điều kiện làm nghề, không nằm trong lòng bàn đấu.'},
      {h:'Khen người trẻ: không sợ đối thủ trước, tay nghề sau', p:'Chỉ sang một cậu bé đang tập cách đó vài bàn, Ignacio khen bằng đúng ba nét theo thứ tự: "Thằng đó không sợ đối thủ nào cả. Ra cơ nhanh và ăn bi rất giỏi." Phẩm chất tâm lý đứng trước, hai phẩm chất kỹ thuật đứng sau. Khi một cơ thủ chuyên nghiệp được tự do chọn cách khen một người trẻ, thứ bật ra trước tiên thường là thứ anh ta coi trọng nhất. Đây cũng là chỗ duy nhất trong toàn bộ tư liệu mà Ignacio nói tới nỗi sợ — và anh nói về nó ở người khác, chưa từng ai hỏi anh về nỗi sợ của chính mình.'},
      {h:'Niềm tin đến sau khi thoát hiểm, không đến trước', p:'Tháng 05/2026, Ignacio vô địch TAOM Arena Open ở Kuala Lumpur, thắng đồng hương Sean Mark Malayan 13-1 ở chung kết. Anh đặt mốc của cả giải không vào trận cuối mà vào một trận không ai để ý: "Tôi đã cảm thấy có điều gì đó đặc biệt ngay sau khi sống sót qua trận hill-hill gặp người đồng hương." Đối chiếu tỷ số các vòng trong đều không sát nút, tức trận đó nằm ở vòng sớm hơn vòng 32. Thứ tự anh mô tả — thoát hiểm trước, cảm giác đặc biệt sau, rồi cả giải trôi tới mức chung kết chỉ mất một ván — trùng gần như từng chữ với cách Jundel Mazon kể trận vô địch của anh ta. Người ngồi đợi cảm giác tự tin xuất hiện rồi mới dám vào giải đang chờ nhầm thứ tự.'},
      {h:'Bốn lời cảm ơn, không lời nào dành cho mình', p:'Câu tổng kết chức vô địch lớn nhất đời anh: "Chúng tôi lại may mắn giành được thêm một chức vô địch. Gửi tới đối thủ của tôi ở trận chung kết, Sean Mark Malayan: cậu đã chơi rất hay suốt cả giải. Chúc mừng cậu, anh em." Chủ ngữ là "chúng tôi" cho một giải đấu đơn; thành quả được gọi là may mắn; câu dành cho người thua 13-1 dài hơn câu dành cho chính mình. Cộng với lời tạ ơn ơn trên và lời cảm ơn nhà tài trợ ở đoạn trước, có bốn chủ thể được nhắc và không chủ thể nào là bản thân anh.'},
      {h:'Cùng một cấu trúc câu qua 10 năm — và chỗ phải cẩn thận khi bắt chước', p:'Năm 2016, được hỏi có mơ chức vô địch thế giới không, anh trả lời bằng thể bị động: "Tôi vẫn mơ tới điều đó, nhưng tôi không dám nói là nó có được cho hay không." Năm 2026, sau chức vô địch: "Tạ ơn Chúa đã dẫn dắt tôi suốt giải này." Cùng một cấu trúc — thành quả đến từ bên ngoài — dù năng lực đã đổi hẳn. Cách nói ấy cắt được áp lực kỳ vọng vì không tự hứa thì không tự nợ, nhưng cũng không tạo ra cái đà tuyên bố mà Filler mô tả là điều kiện làm việc của mình. Và phải ghi rõ khả năng đơn giản nhất: ở Philippines, hạ thấp công của mình sau chiến thắng là phép lịch sự thông thường, nên chưa thể tách bạch đâu là cơ chế tâm lý, đâu là quy ước văn hoá.'},
    ]},
  {key:'psy_pro_mariohe', tag:'Cơ thủ', title:'Mario He: giấu cảm xúc trên bàn, xả hết cảm xúc ngoài bàn — hồ sơ từ 05 video/bài phỏng vấn', who:'Mario He',
    intro:'Rút từ 05 nguồn công khai có lời trực tiếp của Mario "Panda" He (Áo, hạng 39 Fargo Rate, hai lần vô địch World Cup of Pool, á quân European Open 2026), trải từ 03/2020 tới 03/2026: podcast The Golden Break của Matchroom dài 32 phút, hai bài phỏng vấn viết trên AZBilliards và SpadePoker, một video hỏi-đáp ngắn 01 phút 40 giây, và bản tin có trích dẫn của World Nineball Tour. Nét cốt lõi là một người rất giàu cảm xúc tự đặt ra luật cho mình về nơi được phép để cảm xúc lộ ra.',
    body:[
      {h:'Mặt phẳng lì là chiến thuật, không phải tính cách', p:'He mang thói quen từ nhiều năm thi đấu cờ vua sang bàn bi-a, và anh giải thích nó như một tính toán: "Trong cờ vua anh phải có bộ mặt lì như đánh bài, bởi khi anh đang gặp khó mà anh biểu lộ ra, đối thủ sẽ thấy, rồi anh ta bắt đầu chơi hay hơn, đi những nước hay hơn, nghĩ dễ hơn — và nó làm anh ta bình tâm lại." Anh chuyển thẳng nguyên tắc ấy sang bi-a: "khi đối thủ phản ứng dữ dội lúc trượt một cú mà anh nhìn thấy, nó đẩy đối thủ chơi tốt lên và kéo anh chơi tệ đi", và chốt lại "khi anh dễ bị đọc, thắng những người giỏi hơn sẽ khó hơn" (podcast The Golden Break, Matchroom Pool, 11/2022).'},
      {h:'Phía sau vẻ lạnh là một người giàu cảm xúc', p:'Người dẫn podcast kể lại đã thấy He ngồi khóc ở phía bên kia sân đấu sau một trận thua ở European Open, và He không chối: "Tôi nghĩ là có. Nhưng tôi cố giữ nó cho riêng mình — không muốn để người khác thấy. Nhưng đúng, tôi nghĩ tôi là người giàu cảm xúc." Về chính trận đó: "Có lúc tôi đang áp đảo trận đấu, rồi tôi để tuột nó đi bằng cách nào đó... Tôi lái xe về nhà và chỉ biết nghĩ, chết tiệt thật." (11/2022). Thứ anh kiểm soát không phải cường độ cảm xúc, mà là chỗ cảm xúc được phép hiện ra.'},
      {h:'Xả cảm xúc là việc bắt buộc, và mất ba tới bốn ngày', p:'He không giả vờ quên sau một đêm. "Anh cần tống những cảm xúc xấu ra ngoài. Khi anh thấy không thoải mái, khi có chuyện tệ xảy ra, anh phải xả nó ra — bằng nói chuyện, bằng vào phòng tập và quần cho nát phòng tập, bằng gì cũng được. Tôi làm hỗn hợp cả hai: nói thật nhiều, và vào phòng tập." Người nghe anh nói là bạn thân, chị gái và bố mẹ. Mốc phục hồi anh tự nêu: "không phải một ngày sau đâu, mà phải ba bốn ngày sau" (11/2022).'},
      {h:'Chấm trận thua bằng quy trình, không bằng kết quả', p:'Công cụ cụ thể nhất của He mượn từ poker rồi dùng chung cho cả hai môn: "Anh phải tự hỏi mình: lần sau tôi có đánh như thế này nữa không? Nếu câu trả lời là có, thì anh chẳng có gì phải lo hay phải tự vấn cả. Còn nếu anh đã mắc lỗi thì anh phải học từ nó." Anh cũng chỉ ra cái bẫy trí nhớ đi kèm: "Người ta chủ yếu nhớ lúc mình thua, nhưng lẽ ra không nên nghĩ về nó theo kiểu đó." (phỏng vấn SpadePoker, 05/2024).'},
      {h:'Buổi tập là chỗ trả lời câu hỏi đó', p:'Việc rà lỗi không dừng ở suy nghĩ. Về nội dung tập thời chuyên nghiệp, He nói: "Tôi có dùng vài bài tập, nhưng chủ yếu là dựng lại những tình huống khó từ các trận đã đánh, cùng với những cú đánh chuẩn" — 4-5 buổi mỗi tuần, mỗi buổi 2-4 tiếng vào tuần được nghỉ (AZBilliards, 03/2020). Việc nối hai điều này thành một vòng khép kín là suy luận của người lập hồ sơ, He nói chúng ở hai bài khác nhau.'},
      {h:'Mục tiêu đặt theo trạng thái: có mặt ở ngày cuối', p:'"Tôi cứ làm như với mọi giải khác: mục tiêu của tôi luôn là có mặt ở ngày cuối. Đó là mục tiêu của tôi cho tất cả các giải." Cũng chính lúc đó, khi nói về suất Mosconi Cup đang treo phía trên, anh thừa nhận thẳng rằng kỹ thuật đè ý nghĩ không chạy: "Tôi không muốn nghĩ tới nó — nhưng nó không chịu rời khỏi đầu anh, nhất là lúc đã gần tới giai đoạn đó." (11/2022). Một cơ thủ hạng thế giới cũng không ép được ý nghĩ về danh hiệu ra khỏi đầu; thứ làm được là hạ mục tiêu công bố xuống mức đạt được.'},
      {h:'Dồn 110% vào một việc, và nhận lỗi thay vì đổ lỗi', p:'He bỏ bóng đá, rồi bỏ cờ vua, rồi bỏ cả poker: "Khi anh dồn 110% vào một việc, tôi nghĩ nó tốt hơn là cố làm hai việc cùng lúc, vì tôi không tin anh có thể làm cả hai việc ở mức 110%." Cùng nét ấy ở chuyện nặng nhất đời anh — mất suất Mosconi Cup 2018 vì thuốc huyết áp dính danh mục cấm: "Nếu chuyện đó không xảy ra lúc ấy thì kiểu gì sau này nó cũng xảy ra, bởi đó là lỗi của tôi." (11/2022).'},
    ]},
  {key:'fitness', tag:'Thể lực', title:'Bài tập thể lực cho cơ thủ',
    intro:'Bi-a không cần cơ bắp lớn, và đó là lý do phần thể lực hay bị bỏ hẳn. Nhưng nó cần bốn thứ rất cụ thể: một thân người giữ yên được trong lúc tay chuyển động, một lưng chịu được vài trăm lần cúi xuống đứng lên, một cổ tay không rung ở cú cuối, và đủ sức bền để trận thứ năm không tệ hơn trận đầu.',
    body:[
      {h:'Mục tiêu là giữ yên, không phải mạnh', p:'Toàn bộ chương trình dưới đây hướng tới một việc: mọi phần cơ thể trừ cánh tay sau đều đứng yên trong lúc cú đánh xảy ra. Mạnh thêm mà không giữ yên được thì không đóng góp gì cho bi-a, và đây là chỗ nhiều người tập sai hướng ngay từ đầu. (Xem "Tư thế & đường thẳng cơ thể".)'},
      {h:'Cơ lõi và lưng dưới đứng đầu danh sách', p:'Đây là nhóm quyết định việc thân người có yên hay không, và cũng là nhóm chống lại cơn đau lưng của người chơi lâu năm. Ba bài đủ dùng gồm plank, bird-dog và dead bug, mỗi bài hai tới ba lượt, hai tới ba buổi mỗi tuần. Chất lượng tư thế quan trọng hơn thời gian giữ. (Xem "Đau lưng, cổ và vai gáy".)'},
      {h:'Vai và lưng trên cho tư thế cúi bàn', p:'Giữ tư thế cúi hàng giờ đòi cơ lưng trên và cơ xoay vai đủ bền, nếu không thì vai sụp dần và đường cơ lệch theo mà bạn không thấy. Chèo bằng dây thun, superman và các bài kéo nhẹ là đủ, hai tới ba buổi mỗi tuần.'},
      {h:'Cổ tay và cẳng tay cho cú cuối không rung', p:'Cuộn cổ tay với tạ nhẹ, gập duỗi cổ tay và bóp bóng đều nhắm vào độ bền của nhóm giữ cây cơ ổn định ở cuối buổi dài. Tập nhẹ và nhiều lần thay vì nặng, vì mục tiêu là bền chứ không phải khoẻ. (Xem "Run tay — nguyên nhân sinh lý và cách xử lý".)'},
      {h:'Chân và thăng bằng', p:'Thế đứng vững bắt đầu từ chân, nên squat nhẹ và bài đứng một chân ba mươi giây mỗi bên có giá trị trực tiếp với đường cơ. Thăng bằng tốt còn giúp bạn giữ được tư thế ở những cú phải với xa hoặc đứng lệch.'},
      {h:'Sức bền cho ngày giải', p:'Đi bộ nhanh hoặc đạp xe hai mươi tới ba mươi phút, hai tới ba lần mỗi tuần, là đủ để trận cuối ngày không tụt hẳn so với trận đầu. Đây là phần trả về nhiều nhất cho những ai hay đánh giải một ngày nhiều trận. (Xem "Giữ sức khi đánh giải cả ngày".)'},
      {h:'Độ dẻo tập sau buổi chơi', p:'Giãn cổ tay, vai, ngực, hông và lưng nên làm sau khi chơi hoặc vào ngày nghỉ, không làm ngay trước khi vào bàn vì giãn sâu làm giảm cảm giác kiểm soát lực. (Xem "Giãn cơ và phòng chấn thương do lặp động tác".)'},
      {h:'Đừng tập nặng sát ngày thi đấu', p:'Mỏi cơ làm lệch cảm giác lực và làm tay kém ổn định, nên buổi tập nặng nên cách ngày thi đấu ít nhất hai ngày. Trước giải thì chỉ giữ phần giãn và phần khởi động, bỏ hẳn phần tăng tải.'},
      {h:'Đều đặn thắng cường độ', p:'Hai buổi ngắn mỗi tuần duy trì được trong sáu tháng cho kết quả tốt hơn nhiều so với một tháng tập hăng rồi bỏ. Nếu cần một khung có sẵn để theo thì dùng bản tám tuần. (Xem "Chương trình thể lực tám tuần cho cơ thủ".)'},
    ]},
  {key:'phy_program', tag:'Thể lực', title:'Chương trình thể lực tám tuần cho cơ thủ',
    intro:'Biết cần tập gì và thật sự tập được là hai chuyện khác nhau, và khoảng cách giữa chúng thường chỉ là thiếu một khung cụ thể để theo. Bản dưới đây gọn tới mức không cần phòng tập, không cần dụng cụ ngoài một dây thun, và mỗi buổi không quá hai mươi phút.',
    body:[
      {h:'Ba buổi mỗi tuần, mỗi buổi hai mươi phút', p:'Hai buổi tập sức và một buổi bền, xếp cách nhau ít nhất một ngày. Chọn cố định ba ngày trong tuần rồi giữ nguyên suốt tám tuần, vì thứ quyết định kết quả là số buổi làm được chứ không phải nội dung buổi tập.'},
      {h:'Tuần một tới tuần hai — dựng nền tư thế', p:'Mỗi buổi sức gồm plank giữ hai mươi giây ba lượt, bird-dog tám lần mỗi bên hai lượt, dead bug tám lần mỗi bên hai lượt, chèo dây thun mười hai lần hai lượt. Giai đoạn này chỉ nhắm vào việc làm đúng động tác, chưa tăng gì cả.'},
      {h:'Tuần ba tới tuần bốn — thêm cổ tay và chân', p:'Giữ nguyên phần trên và thêm cuộn cổ tay mười lăm lần hai lượt mỗi chiều, squat nhẹ mười hai lần hai lượt, đứng một chân ba mươi giây mỗi bên. Plank tăng lên ba mươi giây. Buổi bền nâng lên hai mươi lăm phút.'},
      {h:'Tuần năm tới tuần sáu — tăng tải', p:'Plank bốn mươi lăm giây, các bài còn lại tăng lên ba lượt, chèo dây thun đổi sang loại nặng hơn nếu mười hai lần đã thành dễ. Đây là giai đoạn tăng thật, nên nếu buổi nào thấy tư thế xấu đi thì lùi lại mức tuần trước chứ không cố hoàn thành số lượng.'},
      {h:'Tuần bảy tới tuần tám — giữ và nghiệm thu', p:'Không tăng thêm, giữ nguyên mức tuần sáu để cơ thể kịp thích nghi. Cuối tuần tám, đo lại bằng ba phép đơn giản: giữ plank được bao lâu, giữ tư thế cúi bàn bao nhiêu phút mà chưa mỏi lưng, và điểm bài tập chuẩn của bạn ở trận cuối một ngày dài. (Xem "Đo độ ổn định của chính mình".)'},
      {h:'Buổi bền là buổi rẻ nhất', p:'Đi bộ nhanh hoặc đạp xe hai mươi tới ba mươi phút, chỉ cần đủ để thở nhanh hơn bình thường mà vẫn nói được câu trọn vẹn. Không cần chạy, không cần cường độ cao, vì mục tiêu là nền sức bền cho một ngày giải chứ không phải thành tích thể thao.'},
      {h:'Tuần có giải thì bỏ phần tăng tải', p:'Trong tuần thi đấu, giữ lại đúng phần giãn và một buổi bền nhẹ, bỏ hẳn phần tăng tải. Tập nặng trong tuần giải là cách chắc chắn để vào trận với cảm giác lực lệch. (Xem "Bài tập thể lực cho cơ thủ".)'},
      {h:'Bỏ buổi thì tiếp tục, đừng bắt đầu lại', p:'Bỏ một hai buổi là chuyện bình thường trong tám tuần và không xoá đi phần đã tập được. Cách xử đúng là tiếp tục ở mức tuần hiện tại, còn cách xử sai và rất phổ biến là coi như thất bại rồi bỏ hẳn chương trình. (Xem "Động lực & kỷ luật tập luyện".)'},
      {h:'Sau tám tuần thì chuyển sang chế độ duy trì', p:'Hai buổi mỗi tuần ở mức tuần sáu là đủ giữ nguyên thành quả, và mức đó duy trì được lâu dài mà không chiếm nhiều thời gian tập bi-a. Muốn tăng tiếp thì chạy lại vòng tám tuần với tải khởi điểm cao hơn.'},
    ]},
  {key:'phy_stretch', tag:'Thể lực', title:'Giãn cơ và phòng chấn thương do lặp động tác',
    intro:'Chấn thương của cơ thủ gần như không bao giờ đến từ một cú đánh mạnh, nó đến từ việc lặp lại cùng một động tác vài nghìn lần trong nhiều tháng ở một tư thế lệch. Loại chấn thương này báo trước rất rõ, chỉ có điều dấu hiệu của nó là cảm giác mỏi bình thường nên gần như luôn bị bỏ qua.',
    body:[
      {h:'Giãn trước hay giãn sau, và vì sao', p:'Trước khi chơi thì làm ấm chứ không giãn sâu, vì giãn sâu tạm thời giảm khả năng cảm nhận lực và độ nhạy của cú vung. Giãn sâu để dành cho sau buổi chơi hoặc ngày nghỉ, khi mục tiêu là chống lại trạng thái co ngắn do giữ tư thế lâu. (Xem "Khởi động cơ thể trước khi vào bàn".)'},
      {h:'Sáu chỗ cần giãn, đúng những chỗ bi-a dùng', p:'Cổ và vai gáy, ngực và vai trước, cẳng tay và cổ tay, lưng dưới, cơ gập hông, và mặt sau chân. Mỗi động tác giữ hai mươi tới ba mươi giây, thở đều, không nín thở và không bật nảy. Toàn bộ mất chừng tám phút.'},
      {h:'Ngực và vai trước là chỗ bị bỏ sót nhiều nhất', p:'Tư thế cúi bàn giữ vai ở trạng thái đưa về trước trong nhiều giờ, kéo theo ngực co ngắn và vai càng sụp thêm. Giãn ngực bằng cách tựa cẳng tay vào khung cửa rồi bước một chân lên là bài rẻ nhất chống lại việc đó. (Xem "Đau lưng, cổ và vai gáy".)'},
      {h:'Cẳng tay cần giãn cả hai chiều', p:'Nhóm cơ gập và nhóm cơ duỗi cẳng tay đều làm việc trong cú vung, nhưng người ta thường chỉ giãn một chiều. Duỗi thẳng tay rồi kéo bàn tay về hai hướng ngược nhau, mỗi hướng hai mươi giây, phòng được phần lớn cơn đau quanh khuỷu tay và cổ tay.'},
      {h:'Dấu hiệu của chấn thương lặp động tác', p:'Đau xuất hiện sớm hơn trong mỗi buổi qua từng tuần, đau còn dai dẳng vào sáng hôm sau, hoặc đau khu trú tại một điểm nhỏ ở gân thay vì trải rộng ở cơ. Ba dấu hiệu này khác hẳn mỏi cơ thường và có nghĩa là phải giảm tải ngay, không phải tập thêm cho quen.'},
      {h:'Giảm tải không đồng nghĩa với nghỉ hẳn', p:'Thường chỉ cần giảm số giờ, bỏ những cú cần lực lớn và bỏ phần tập kỹ thuật nặng trong một hai tuần là đủ để hết. Cố chơi nguyên khối lượng cũ với hy vọng nó tự khỏi là cách biến hai tuần giảm tải thành hai tháng nghỉ. (Xem "Hồi phục sau buổi chơi dài và sau giải".)'},
      {h:'Sửa nguyên nhân, không chỉ chữa triệu chứng', p:'Đau lặp lại đúng một chỗ thường là hệ quả của một tư thế lệch hoặc một cách nắm cơ quá chặt, nên giãn cơ chỉ mua thêm thời gian nếu không sửa gốc. Soi lại tư thế và tay cầm cơ trước khi kết luận rằng cơ thể mình yếu. (Xem "Tay cầm cơ".)'},
      {h:'Đau nhói, tê hoặc yếu thì đi khám', p:'Mỏi và căng là chuyện tập luyện, còn đau nhói tại khớp, tê lan xuống ngón tay hoặc yếu rõ khi cầm nắm thì cần bác sĩ. Đi sớm gần như luôn rẻ hơn, cả về thời gian nghỉ lẫn về khả năng quay lại mức cũ.'},
      {h:'Biến tám phút này thành nghi thức đóng buổi', p:'Gắn phần giãn vào ngay sau khi cất cơ, cùng chỗ và cùng thứ tự mỗi lần, thì nó thành việc tự động thay vì việc phải quyết định làm hay không. Đây cũng là khoảng thời gian tốt để ghi ba dòng vào sổ trước khi trí nhớ về buổi chơi phai đi. (Xem "Đo độ ổn định của chính mình".)'},
    ]},
];
const IconArchive=()=>(<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="4" rx="1.6"/><path d="M5 8v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8"/><path d="M10 12h4"/></svg>);
const IconUnarchive=()=>(<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 14l-4-4l4-4"/><path d="M5 10h11a4 4 0 1 1 0 8h-1"/></svg>);
const IconStar=({on})=>(<svg viewBox="0 0 24 24" fill={on?'currentColor':'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3.6l2.55 5.17 5.7.83-4.13 4.02.98 5.68L12 16.6l-5.1 2.7.98-5.68L3.75 9.6l5.7-.83z"/></svg>);
const IconPin=({on})=>(<svg viewBox="0 0 24 24" fill={on?'currentColor':'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8.5 4h7l-1 6 2.5 2.5v1.5h-11v-1.5l2.5-2.5z"/><path d="M12 14v6"/></svg>);
// Bảng tra tiêu đề bài → key, để nhận diện cụm (Xem "tên bài".) trong nội dung là link thật.
const KNOW_TITLE_TO_KEY=Object.fromEntries(KNOWLEDGE.map(a=>[a.title,a.key]));
// Dò các cụm "..." trong văn bản: khớp đúng tiêu đề một bài đã có thì biến thành link bấm mở bài đó;
// không khớp (vd tên gạch đầu dòng, hay "...ở tab Rèn luyện") thì giữ nguyên chữ thường.
function renderKnowText(text){
  return text.split(/("[^"]+")/g).map((part,i)=>{
    if(part.charAt(0)==='"' && part.charAt(part.length-1)==='"'){
      const key=KNOW_TITLE_TO_KEY[part.slice(1,-1)];
      if(key) return <span key={i} className="klink" onClick={(e)=>{e.stopPropagation();navToKnowArticle(key);}}>{part}</span>;
    }
    return part;
  });
}
/* ---------- Bôi đen một đoạn trong bài Kiến thức → lưu thành câu Nhắc nhở ---------- */
// Tên cơ thủ của một bài hồ sơ, để quote lưu ra mang đúng tên người nói.
// Ưu tiên trường `who` nếu bài có khai; không có thì lấy phần trước dấu hai chấm
// của tiêu đề (khuôn hiện dùng: 'Gorst: quy trình bịt nỗi sợ trượt — hồ sơ từ …').
function tenCoThu(a){
  if(!a || a.tag!=='Cơ thủ') return null;
  if(a.who) return a.who;
  const i=(a.title||'').indexOf(':');
  if(i<1) return null;
  const t=a.title.slice(0,i).trim();
  return (t && t.length<=40) ? t : null;
}
// Bỏ cặp nháy kép bao ngoài — chỉ bỏ khi CẢ HAI đầu đều là nháy, vì đoạn bôi đen
// giữa chừng một câu trích thường chỉ dính một bên và bỏ lệch sẽ hỏng nghĩa.
function bocNhayKep(s){
  const mo='"“', dong='"”';
  if(s.length>2 && mo.indexOf(s[0])>=0 && dong.indexOf(s[s.length-1])>=0) return s.slice(1,-1).trim();
  return s;
}
const QUOTE_NGAN=12, QUOTE_DAI=500;
// Đọc vùng đang bôi đen; trả null nếu không nằm trong một bài Kiến thức, quá ngắn hoặc quá dài.
function docVungChon(){
  const sel=window.getSelection&&window.getSelection();
  if(!sel || sel.isCollapsed || !sel.rangeCount) return null;
  const txt=bocNhayKep(sel.toString().replace(/\s+/g,' ').trim());
  if(txt.length<QUOTE_NGAN || txt.length>QUOTE_DAI) return null;
  let n=sel.getRangeAt(0).commonAncestorContainer;
  if(n && n.nodeType===3) n=n.parentElement;
  const hop=n && n.closest ? n.closest('[data-know-key]') : null;
  if(!hop) return null;
  return {t:txt, key:hop.getAttribute('data-know-key')};
}
function LuuQuoteBar(){
  const [chon,setChon]=useState(null);   // {t,key} đoạn đang bôi đen
  const [bao,setBao]=useState('');       // câu báo sau khi lưu
  useEffect(()=>{
    let hen=null;
    const doc=()=>{ const c=docVungChon(); if(c){ setChon(c); setBao(''); } };
    const hoan=()=>{ clearTimeout(hen); hen=setTimeout(doc,180); };   // gộp các nhịp kéo tay
    document.addEventListener('selectionchange',hoan);
    return ()=>{ document.removeEventListener('selectionchange',hoan); clearTimeout(hen); };
  },[]);
  // Thanh KHÔNG tự ẩn khi mất vùng bôi đen. Trên điện thoại, hệ điều hành dựng menu riêng
  // (Chép · Chia sẻ · Tìm kiếm trên web) đè lên app, và cú chạm ra chỗ trống để dẹp menu ấy
  // cũng xoá luôn vùng chọn — ẩn theo vùng chọn là nút Lưu biến mất đúng lúc sắp bấm được.
  // Chỉ ẩn khi bấm Lưu/Bỏ chọn, hoặc sau 30 giây không đụng tới.
  useEffect(()=>{ if(!chon) return; const t=setTimeout(()=>setChon(null),30000); return ()=>clearTimeout(t); },[chon]);
  useEffect(()=>{ if(!bao) return; const t=setTimeout(()=>setBao(''),3200); return ()=>clearTimeout(t); },[bao]);
  const bai=chon?KNOWLEDGE.find(x=>x.key===chon.key):null;
  const ten=tenCoThu(bai);
  const boChon=()=>{ try{ window.getSelection().removeAllRanges(); }catch(e){} setChon(null); };
  const luu=()=>{
    if(!chon) return;
    const list=store.get('nc.customcues',[]);
    if(list.some(c=>c.t===chon.t) || CUES.some(c=>c.t===chon.t) || WAR_CUES.some(c=>c.t===chon.t)){
      setBao('Câu này đã có trong Nhắc nhở rồi.');
    }else{
      store.set('nc.customcues',[{tag:ten||'Kiến thức', t:chon.t, src:bai?bai.title:''},...list]);
      setBao(ten?('Đã lưu vào Nhắc nhở — ghi tên '+ten+'.'):'Đã lưu vào Nhắc nhở.');
    }
    boChon();
  };
  if(bao) return <div className="quotebar"><div className="qbao">✅ {bao}</div></div>;
  if(!chon) return null;
  return (
    // Giữ vùng bôi đen khi bấm bằng chuột; chạm tay thì không chặn, đã có nhịp chờ 600ms ở trên.
    <div className="quotebar" onPointerDown={e=>{ if(e.pointerType==='mouse') e.preventDefault(); }}>
      <div className="qnguon">{ten?('🎙️ Lời của '+ten):('📚 '+(bai?bai.title:'Kiến thức'))}</div>
      <div className="qtxt">“{chon.t}”</div>
      <div className="qacts">
        <button className="btn ghost sm" onClick={boChon}>Bỏ chọn</button>
        <button className="btn acc sm" style={{flex:1}} onClick={luu}>💾 Lưu vào Nhắc nhở</button>
      </div>
    </div>
  );
}
function KnowCard({a,defaultOpen,onArchive,archived,onFav,fav,onPin,pinned,navKey}){
  const [open,setOpen]=useState(!!defaultOpen);
  const elRef=useRef(null);
  useEffect(()=>{
    if(navKey && navKey===a.key){ setOpen(true); if(elRef.current) elRef.current.scrollIntoView({behavior:'smooth',block:'start'}); }
  },[navKey]);
  return (
    <div className="card drillC" ref={elRef}>
      <div className="drillH" onClick={()=>setOpen(o=>!o)}>
        <div className="dn" style={{flex:1,minWidth:0}}><b>{a.title}</b><small>{open?'thu gọn':'đọc'}</small></div>
        <div className="kacts">
          {onFav && <button className={"archbtn"+(fav?" on":"")} title={fav?'Bỏ yêu thích':'Yêu thích'} aria-label={fav?'Bỏ yêu thích':'Yêu thích'} onClick={(e)=>{e.stopPropagation();onFav();}}><IconStar on={fav}/></button>}
          {onPin && <button className={"archbtn"+(pinned?" on":"")} title={pinned?'Bỏ ghim':'Ghim lên đầu'} aria-label={pinned?'Bỏ ghim':'Ghim lên đầu'} onClick={(e)=>{e.stopPropagation();onPin();}}><IconPin on={pinned}/></button>}
          {onArchive && <button className="archbtn" title={archived?'Bỏ lưu trữ':'Lưu trữ bài này'} aria-label={archived?'Bỏ lưu trữ':'Lưu trữ bài này'} onClick={(e)=>{e.stopPropagation();onArchive();}}>{archived?<IconUnarchive/>:<IconArchive/>}</button>}
        </div>
        <span className="muted" style={{fontSize:'1rem',flex:'none'}}>{open?'▾':'▸'}</span>
      </div>
      {open &&
        // data-know-key: mốc để LuuQuoteBar biết đoạn bôi đen thuộc bài nào.
        <div className="drillB" data-know-key={a.key}>
          {a.intro && <div className="kv" style={{color:'var(--soft)',fontStyle:'italic'}}>{a.intro}</div>}
          {a.body.map((s,i)=>(
            <div key={i} className="kv">
              <b>{s.h}</b>
              <div className="preline" style={{marginTop:2}}>{renderKnowText(s.p)}</div>
            </div>))}
        </div>}
    </div>
  );
}
// Kiến thức phân theo mục (nhóm theo tag)
const KNOW_CATS=[
  {tag:'Chiến thuật', label:'🎯 Tư duy & chiến thuật'},
  {tag:'Kỹ thuật', label:'🎯 Kỹ thuật & điều bi'},
  {tag:'Thể trạng', label:'🔋 Thể trạng & sức bền'},
  {tag:'Dinh dưỡng', label:'🥗 Dinh dưỡng'},
  {tag:'Thể lực', label:'💪 Thể lực'},
  {tag:'Tâm lý', label:'🧠 Tâm lý'},
  {tag:'Cơ thủ', label:'🎙️ Cơ thủ'},
];
// Kiến thức Chiến thuật chia nhỏ theo dòng chảy một ván (bài lạ rơi vào "Khác").
const TAC_SUBCATS=[
  {label:'💡 Triết lý nền', keys:['tac_makeeasy','percent','energy']},
  {label:'🚀 Phá bi & mở ván', keys:['tac_break']},
  {label:'🗺️ Đọc bàn & chạy hình', keys:['tac_readtable','tac_readfast','tac_position_simple','tac_tangent','tac_natural','tac_speed','tac_planb']},
  {label:'⚖️ Chọn cú & phòng thủ', keys:['tac_riskreward','tac_safety','tac_hardballs','tac_kickbank']},
  {label:'🎛️ Quyền chủ động & nhịp trận', keys:['tac_initiative','tac_keepinit','tac_regain','tac_tempo']},
  {label:'🔍 Đối thủ & quản trận', keys:['tac_coldenemy','tac_racemgmt','tac_scouting']},
];
const TAC_INSUB=new Set(TAC_SUBCATS.flatMap(s=>s.keys));
// Kiến thức Kỹ thuật chia nhỏ theo chuỗi nhân quả của một cú đánh (bài lạ rơi vào "Khác").
const TECH_SUBCATS=[
  {label:'🗺️ Bản đồ & nền tảng cơ thể', keys:['tec_intro','tec_stroke','tec_stance','tec_bridge','tec_grip','tec_followthrough','tec_timing']},
  {label:'🎯 Điểm chạm & xoáy', keys:['tec_tipcontact','tec_miscue','tec_slideroll']},
  {label:'⚠️ Ba thủ phạm ăn mất đường ngắm', keys:['tec_squirt','tec_swerve','tec_squerve','tec_throw','tec_cling','tec_aimcomp']},
  {label:'🎱 Bàn, băng & dụng cụ', keys:['tec_cloth','tec_rail','tec_equipment']},
  {label:'🔬 Ngắm, quy trình & tự hiệu chỉnh', keys:['tec_aiming','tec_preshot','tec_calibrate','tec_diagnose','tec_practice']},
];
const TECH_INSUB=new Set(TECH_SUBCATS.flatMap(s=>s.keys));
// Kiến thức Tâm lý chia nhỏ thành các nhóm con (mọi bài tag 'Tâm lý' đều phải nằm trong 1 nhóm; bài lạ rơi vào "Khác").
const PSY_SUBCATS=[
  {label:'🧭 Nền tảng & quy trình', keys:['psy_intro','psy_focus','psy_trust','psy_breath','psy_selftalk','psy_visual','psy_confidence','psy_flow','serious']},
  {label:'🎯 Trước trận & khởi động', keys:['psy_prematch','psy_slowstart']},
  {label:'🔥 Áp lực & khoảnh khắc quyết định', keys:['psy_pressure','psy_coldchance','psy_closeout','psy_stakes','psy_yips','psy_crowd']},
  {label:'💢 Cảm xúc, lỗi & phục hồi', keys:['psy_after','psy_variance','behind','psy_resilience']},
  {label:'♟️ Đối thủ & thế trận', keys:['psy_momentum','psy_shark','psy_pokerface','psy_handicap','psy_chair']},
  {label:'🎚️ Độ ổn định & phong độ đều', keys:['psy_consistency','psy_floor','psy_sameness','psy_decconsist','psy_varmeasure','psy_offtable','psy_awaytable','psy_tinker','psy_onegame','psy_layoff']},
  {label:'📈 Đường dài & rèn luyện', keys:['psy_stamina','psy_discipline','psy_goals','psy_burnout','psy_slump']},
];
const PSY_INSUB=new Set(PSY_SUBCATS.flatMap(s=>s.keys));
// Kiến thức Thể chất chia nhỏ theo dòng chảy một ngày chơi (bài lạ rơi vào "Khác").
// Nhóm theo CHỦ ĐỀ, không theo tag — tag ('Thể trạng'/'Dinh dưỡng'/'Thể lực') chỉ còn để lọc mục.
const PHYS_SUBCATS=[
  {label:'🔋 Sức bền & quản lý năng lượng', keys:['phy_intro','tired','allday','phy_sleep','phy_warmup','phy_recovery']},
  {label:'👁️ Mắt, tay & bệnh nghề nghiệp', keys:['phy_eyes','phy_tremor','phy_backpain','phy_substances']},
  {label:'🥗 Ăn uống & nước', keys:['nutrition','phy_caffeine','phy_hydration','phy_awayfood']},
  {label:'💪 Thể lực & phòng chấn thương', keys:['fitness','phy_program','phy_stretch']},
];
const PHYS_INSUB=new Set(PHYS_SUBCATS.flatMap(s=>s.keys));
function KnowledgeView(){
  const [archived,setArchived]=usePersist('nc.knowarchive',[]);
  const [pinned,setPinned]=usePersist('nc.knowpin',[]);
  const [fav,setFav]=usePersist('nc.knowfav',[]);
  const [showArch,setShowArch]=useState(false);
  const [favMode,setFavMode]=useState(false);
  const [sec,setSec]=useState('psy');   // 'psy' | 'coThu' | 'tactic' | 'tech' | 'phys' — mỗi mảng là một phần riêng
  const [navTarget,setNavTarget]=useState(null); // key bài đang được link trỏ chéo dẫn tới — tự mở + cuộn tới
  const isArch=(k)=>archived.includes(k);
  const isPin=(k)=>pinned.includes(k);
  const isFav=(k)=>fav.includes(k);
  const toggleArch=(k)=>setArchived(prev=>prev.includes(k)?prev.filter(x=>x!==k):[...prev,k]);
  const togglePin=(k)=>setPinned(prev=>prev.includes(k)?prev.filter(x=>x!==k):[...prev,k]);
  const toggleFav=(k)=>setFav(prev=>prev.includes(k)?prev.filter(x=>x!==k):[...prev,k]);
  const cardProps=(a)=>({onArchive:()=>toggleArch(a.key),onPin:()=>togglePin(a.key),pinned:isPin(a.key),onFav:()=>toggleFav(a.key),fav:isFav(a.key),navKey:navTarget});
  const secOf=(a)=> a.tag==='Tâm lý' ? 'psy' : (a.tag==='Cơ thủ' ? 'coThu' : (a.tag==='Chiến thuật' ? 'tactic' : (a.tag==='Kỹ thuật' ? 'tech' : 'phys')));
  const inSec=(a)=> secOf(a)===sec;
  useEffect(()=>{
    const apply=(key)=>{
      const art=KNOWLEDGE.find(x=>x.key===key);
      if(!art) return;
      setSec(secOf(art));
      setFavMode(false);
      if(archived.includes(key)) setShowArch(true);
      setNavTarget(key);
    };
    const pending=takePendingKnowArt();
    if(pending) apply(pending);
    return subscribeKnowNav(apply);
  },[]);
  const archList=KNOWLEDGE.filter(a=>isArch(a.key));
  const pinList=KNOWLEDGE.filter(a=>isPin(a.key) && !isArch(a.key) && inSec(a));
  const favList=KNOWLEDGE.filter(a=>isFav(a.key) && !isArch(a.key));
  const secArch=archList.filter(inSec);
  const techOther=KNOWLEDGE.filter(a=>a.tag==='Kỹ thuật' && !TECH_INSUB.has(a.key) && !isArch(a.key) && !isPin(a.key));
  const psyOther=KNOWLEDGE.filter(a=>a.tag==='Tâm lý' && !PSY_INSUB.has(a.key) && !isArch(a.key) && !isPin(a.key));
  const tacOther=KNOWLEDGE.filter(a=>a.tag==='Chiến thuật' && !TAC_INSUB.has(a.key) && !isArch(a.key) && !isPin(a.key));
  const physOther=KNOWLEDGE.filter(a=>secOf(a)==='phys' && !PHYS_INSUB.has(a.key) && !isArch(a.key) && !isPin(a.key));
  const coThuList=KNOWLEDGE.filter(a=>a.tag==='Cơ thủ' && !isArch(a.key) && !isPin(a.key));
  return (
    <div style={{display:'flex',flexDirection:'column',flex:1}}>
      <div className="h">Kiến thức bi-a</div>
      <div className="tsub">Chạm để mở/đóng. ⭐ yêu thích · 📌 ghim lên đầu · 🗄 lưu trữ cho gọn.</div>
      <div className="tsub">Bôi đen một đoạn trong bài để lưu thành câu Nhắc nhở — đoạn lấy từ bài cơ thủ được ghi kèm tên người nói.</div>
      {favList.length>0 &&
        <div className="presets" style={{justifyContent:'flex-start',margin:'2px 0 6px'}}>
          <button className={'chip'+(!favMode?' on':'')} onClick={()=>setFavMode(false)}>Duyệt theo mục</button>
          <button className={'chip'+(favMode?' on':'')} onClick={()=>setFavMode(true)}>⭐ Yêu thích ({favList.length})</button>
        </div>}
      {favMode
        ? <div className="list">
            {favList.map(a=><KnowCard key={a.key} a={a} {...cardProps(a)}/>)}
          </div>
        : <>
            <div className="catbar wrap" style={{marginTop:2,marginBottom:4}}>
              <button className={'chip'+(sec==='psy'?' on':'')} onClick={()=>setSec('psy')}>🧠 Tâm lý</button>
              <button className={'chip'+(sec==='coThu'?' on':'')} onClick={()=>setSec('coThu')}>🎙️ Cơ thủ</button>
              <button className={'chip'+(sec==='tactic'?' on':'')} onClick={()=>setSec('tactic')}>🎯 Tư duy & chiến thuật</button>
              <button className={'chip'+(sec==='tech'?' on':'')} onClick={()=>setSec('tech')}>🎯 Kỹ thuật & điều bi</button>
              <button className={'chip'+(sec==='phys'?' on':'')} onClick={()=>setSec('phys')}>💪 Thể chất & dinh dưỡng</button>
            </div>
            {pinList.length>0 &&
              <div>
                <div className="h2">📌 Đã ghim</div>
                <div className="list">
                  {pinList.map(a=><KnowCard key={a.key} a={a} {...cardProps(a)}/>)}
                </div>
              </div>}
            {sec==='tech'
              ? <>
                  {TECH_SUBCATS.map(sc=>{
                    const arts=KNOWLEDGE.filter(a=>a.tag==='Kỹ thuật' && sc.keys.includes(a.key) && !isArch(a.key) && !isPin(a.key));
                    if(!arts.length) return null;
                    return (
                      <div key={sc.label}>
                        <div className="h2">{sc.label}</div>
                        <div className="list">
                          {arts.map(a=><KnowCard key={a.key} a={a} defaultOpen={a.key==='tec_intro'} {...cardProps(a)}/>)}
                        </div>
                      </div>);
                  })}
                  {techOther.length>0 &&
                    <div>
                      <div className="h2">🗂️ Khác</div>
                      <div className="list">
                        {techOther.map(a=><KnowCard key={a.key} a={a} {...cardProps(a)}/>)}
                      </div>
                    </div>}
                </>
              : sec==='tactic'
              ? <>
                  {TAC_SUBCATS.map(sc=>{
                    const arts=KNOWLEDGE.filter(a=>a.tag==='Chiến thuật' && sc.keys.includes(a.key) && !isArch(a.key) && !isPin(a.key));
                    if(!arts.length) return null;
                    return (
                      <div key={sc.label}>
                        <div className="h2">{sc.label}</div>
                        <div className="list">
                          {arts.map(a=><KnowCard key={a.key} a={a} defaultOpen={a.key==='tac_makeeasy'} {...cardProps(a)}/>)}
                        </div>
                      </div>);
                  })}
                  {tacOther.length>0 &&
                    <div>
                      <div className="h2">🗂️ Khác</div>
                      <div className="list">
                        {tacOther.map(a=><KnowCard key={a.key} a={a} {...cardProps(a)}/>)}
                      </div>
                    </div>}
                </>
              : sec==='coThu'
              ? <div>
                  <div className="h2">🎙️ Học từ cơ thủ đỉnh cao</div>
                  {coThuList.length
                    ? <div className="list">{coThuList.map(a=><KnowCard key={a.key} a={a} {...cardProps(a)}/>)}</div>
                    : <div className="tsub" style={{marginTop:2}}>Chưa có bài nào — routine hằng ngày sẽ tự thêm dần.</div>}
                </div>
              : sec==='phys'
              ? <>
                  {PHYS_SUBCATS.map(sc=>{
                    const arts=KNOWLEDGE.filter(a=>secOf(a)==='phys' && sc.keys.includes(a.key) && !isArch(a.key) && !isPin(a.key));
                    if(!arts.length) return null;
                    return (
                      <div key={sc.label}>
                        <div className="h2">{sc.label}</div>
                        <div className="list">
                          {arts.map(a=><KnowCard key={a.key} a={a} defaultOpen={a.key==='phy_intro'} {...cardProps(a)}/>)}
                        </div>
                      </div>);
                  })}
                  {physOther.length>0 &&
                    <div>
                      <div className="h2">🗂️ Khác</div>
                      <div className="list">
                        {physOther.map(a=><KnowCard key={a.key} a={a} {...cardProps(a)}/>)}
                      </div>
                    </div>}
                </>
              : <>
                  {PSY_SUBCATS.map(sc=>{
                    const arts=KNOWLEDGE.filter(a=>a.tag==='Tâm lý' && sc.keys.includes(a.key) && !isArch(a.key) && !isPin(a.key));
                    if(!arts.length) return null;
                    return (
                      <div key={sc.label}>
                        <div className="h2">{sc.label}</div>
                        <div className="list">
                          {arts.map(a=><KnowCard key={a.key} a={a} defaultOpen={a.key==='psy_intro'} {...cardProps(a)}/>)}
                        </div>
                      </div>);
                  })}
                  {psyOther.length>0 &&
                    <div>
                      <div className="h2">🗂️ Khác</div>
                      <div className="list">
                        {psyOther.map(a=><KnowCard key={a.key} a={a} {...cardProps(a)}/>)}
                      </div>
                    </div>}
                </>}
            {secArch.length>0 &&
              <div style={{marginTop:16}}>
                <div className="h2" style={{cursor:'pointer',display:'flex',alignItems:'center',gap:8}} onClick={()=>setShowArch(s=>!s)}>
                  <span style={{flex:1}}>🗄️ Lưu trữ ({secArch.length})</span>
                  <span className="muted" style={{fontSize:'0.9375rem'}}>{showArch?'▾':'▸'}</span>
                </div>
                {showArch
                  ? <>
                      <div className="list">
                        {secArch.map(a=><KnowCard key={a.key} a={a} onArchive={()=>toggleArch(a.key)} archived={true} navKey={navTarget}/>)}
                      </div>
                      <button className="btn ghost wide" style={{marginTop:8}} onClick={()=>setArchived(prev=>prev.filter(k=>!secArch.some(a=>a.key===k)))}>↺ Bỏ lưu trữ tất cả ({secArch.length})</button>
                    </>
                  : <div className="tsub" style={{marginTop:2}}>Chạm để xem {secArch.length} bài đã lưu trữ.</div>}
              </div>}
          </>}
    </div>
  );
}
// Thẻ ôn luyện: mỗi mục (h) trong mọi bài Kiến thức = 1 thẻ (mặt trước = tên mục, mặt sau = nội dung).
const KNOW_CARDS=KNOWLEDGE.flatMap(a=>a.body.map((s,i)=>({id:a.key+'#'+i, akey:a.key, cat:a.tag, article:a.title, front:s.h, back:s.p})));
function KnowReview(){
  const [rev,setRev]=usePersist('nc.knowrev',{});
  const [cat,setCat]=useState('all');
  const [queue,setQueue]=useState([]);
  const [pos,setPos]=useState(0);
  const [flip,setFlip]=useState(false);
  const boxOf=(id)=>rev[id]||1;   // hộp Leitner 1–5: 1 = chưa thuộc, ≥4 = đã thuộc
  const build=(c)=> KNOW_CARDS.filter(k=>c==='all'||k.cat===c)
    .map((k,i)=>({k,i})).sort((a,b)=>(boxOf(a.k.id)-boxOf(b.k.id))||(a.i-b.i)).map(x=>x.k);
  useEffect(()=>{ setQueue(build(cat)); setPos(0); setFlip(false); },[cat]);
  const restart=()=>{ setQueue(build(cat)); setPos(0); setFlip(false); };
  const answer=(known)=>{ const c=queue[pos]; if(c){ const nb=known?Math.min(5,boxOf(c.id)+1):1; setRev(prev=>({...prev,[c.id]:nb})); } setFlip(false); setPos(p=>p+1); };
  const card=queue[pos];
  const catCards=KNOW_CARDS.filter(k=>cat==='all'||k.cat===cat);
  const learned=catCards.filter(k=>boxOf(k.id)>=4).length;
  const cats=[['all','Tất cả'],...KNOW_CATS.map(c=>[c.tag,c.tag])];
  return (
    <div style={{display:'flex',flexDirection:'column',flex:1}}>
      <div className="h">🎴 Ôn luyện kiến thức</div>
      <div className="tsub">Nhớ lại trong đầu rồi lật thẻ kiểm tra. "Chưa nhớ" sẽ được ưu tiên ôn lại nhiều hơn.</div>
      <div className="catbar" style={{marginTop:8}}>
        {cats.map(([k,l])=><button key={k} className={'chip'+(cat===k?' on':'')} onClick={()=>setCat(k)}>{l}</button>)}
      </div>
      <div className="statstrip">
        <div className="stat"><b style={{color:'var(--gold)'}}>{learned}/{catCards.length}</b><small>đã thuộc</small></div>
        <div className="stat"><b>{queue.length?(card?pos+1:queue.length):0}/{queue.length}</b><small>thẻ</small></div>
      </div>
      {!card
        ? <div className="card" style={{padding:'28px 18px',textAlign:'center',marginTop:10}}>
            <div style={{fontSize:'2.5rem',marginBottom:8}}>🎉</div>
            <div style={{fontWeight:800,color:'var(--soft)',marginBottom:6}}>Xong lượt ôn!</div>
            <div className="muted small" style={{marginBottom:14}}>Ôn lại nhiều lần giúp nhớ sâu và lâu hơn.</div>
            <button className="btn acc" onClick={restart}>🔁 Ôn lại</button>
          </div>
        : <>
          <div className="card" data-know-key={card.akey} onClick={()=>setFlip(f=>!f)} style={{padding:18,marginTop:10,minHeight:190,display:'flex',flexDirection:'column',cursor:'pointer'}}>
            <div className="muted small" style={{fontWeight:800}}>{card.cat} · {card.article}</div>
            <div style={{fontWeight:800,fontSize:'1.125rem',color:'var(--soft)',margin:'10px 0 6px',lineHeight:1.35}}>{card.front}</div>
            {!flip
              ? <div className="muted" style={{marginTop:'auto',fontSize:'0.8125rem',fontStyle:'italic'}}>Nhớ lại trong đầu… rồi chạm để xem đáp án 👇</div>
              : <div className="preline" style={{fontSize:'0.84375rem',lineHeight:1.6,marginTop:4}}>{renderKnowText(card.back)}</div>}
          </div>
          {flip
            ? <div className="rowbtns" style={{marginTop:12}}>
                <button className="btn ghost" style={{flex:1,color:'var(--danger)'}} onClick={()=>answer(false)}>❌ Chưa nhớ</button>
                <button className="btn acc" style={{flex:1}} onClick={()=>answer(true)}>✅ Nhớ rồi</button>
              </div>
            : <button className="btn wide" style={{marginTop:12}} onClick={()=>setFlip(true)}>👁 Xem đáp án</button>}
        </>}
    </div>
  );
}
function KnowTab(){
  const opts=orderedOpts('know');
  const [seg,setSeg]=useState(()=>takePendingSeg('know', opts[0][0]));
  useEffect(()=>{ _setKnowSeg=setSeg; return ()=>{ if(_setKnowSeg===setSeg) _setKnowSeg=null; }; },[]);
  return (
    <div style={{display:'flex',flexDirection:'column',flex:1}}>
      <Seg val={seg} set={setSeg} opts={opts}/>
      {seg==='read' && <KnowledgeView/>}
      {seg==='review' && <KnowReview/>}
      <LuuQuoteBar/>
    </div>
  );
}

/* ================= Trước trận ================= */
function PreMatch(){
  const [g,setG]=useState(false);
  return (
    <div style={{display:'flex',flexDirection:'column',gap:18,flex:1}}>
      <MindsetQuotes/>

      <div>
        <div className="h">🤸 Khởi động &amp; giãn cơ</div>
        <div className="tsub" style={{marginTop:2}}>Làm nóng cổ tay – vai – cổ ~2 phút để tay mượt và tránh chấn thương.</div>
        {!g ? <>
          <div style={{marginTop:8,display:'flex',flexWrap:'wrap',gap:6}}>
            {STRETCHES.map((s,i)=>(
              <span key={i} style={{fontSize:'0.78125rem',fontWeight:700,padding:'6px 10px',background:'var(--card2)',border:'1px solid var(--line)',borderRadius:9,whiteSpace:'nowrap'}}>
                {s.n} <span className="muted" style={{fontWeight:600}}>{s.s}s</span>
              </span>))}
          </div>
          <button className="btn acc wide" style={{marginTop:12}} onClick={()=>setG(true)}>▶ Khởi động theo nhịp</button>
        </> : <GuidedStretch onDone={()=>setG(false)}/>}
      </div>

      <div>
        <div className="h">🎧 Nhạc</div>
        <div className="tsub" style={{marginTop:2}}>Dán link playlist Spotify hoặc YouTube để mở nhanh trước hoặc giữa trận.</div>
        <MusicLinks/>
      </div>
      <div style={{height:6}}/>
    </div>
  );
}
function GuidedStretch({onDone}){
  const cum=[]; let acc=0; STRETCHES.forEach(s=>{ acc+=s.s; cum.push(acc); });
  const total=acc;
  const [t,setT]=useState(0);
  const ref=useRef(null), lastIdx=useRef(0);
  useEffect(()=>{ ref.current=setInterval(()=>setT(x=>x+1),1000); return ()=>clearInterval(ref.current); },[]);
  const done=t>=total;
  let idx=cum.findIndex(c=>t<c); if(idx<0) idx=STRETCHES.length-1;
  const left=Math.max(0,cum[idx]-t);
  useEffect(()=>{
    if(done){ clearInterval(ref.current); if(lastIdx.current>=0){ lastIdx.current=-1; buzz([200,80,300]); beep(440,0.18,0.5);} return; }
    if(idx!==lastIdx.current){ if(lastIdx.current>=0&&t>0){ buzz(140); beep(620,0.1,0.4); } lastIdx.current=idx; }
  });
  if(done) return (
    <div className="card" style={{padding:18,textAlign:'center',marginTop:8}}>
      <div style={{fontSize:'2.375rem'}}>✅</div>
      <div style={{fontWeight:800,fontSize:'1rem',margin:'6px 0'}}>Xong khởi động — sẵn sàng vào bàn!</div>
      <button className="btn ghost wide" onClick={onDone}>Đóng</button>
    </div>
  );
  const cur=STRETCHES[idx];
  return (
    <div className="card" style={{padding:18,textAlign:'center',marginTop:8}}>
      <div className="muted small">Động tác {idx+1}/{STRETCHES.length}</div>
      <div style={{fontWeight:900,fontSize:'1.3125rem',margin:'4px 0'}}>{cur.n}</div>
      <div className="muted" style={{fontSize:'0.8125rem',minHeight:34,lineHeight:1.4}}>{cur.h}</div>
      <div style={{fontSize:'3.25rem',fontWeight:900,color:'var(--gold)',fontVariantNumeric:'tabular-nums',lineHeight:1}}>{left}</div>
      <button className="btn ghost wide" style={{marginTop:8}} onClick={onDone}>Dừng</button>
    </div>
  );
}
function MindsetQuotes(){
  const [list,save]=usePersist('nc.mindsetquotes',[]);
  const [newT,setNewT]=useState('');
  const [addOpen,setAddOpen]=useState(false);
  const [idx,setIdx]=useState(0);
  useEffect(()=>{ if(list.length>1) setIdx(Math.floor(Math.random()*list.length)); },[]);
  const cur=list[idx]||null;
  const next=()=>{ if(list.length<2) return; let n=idx; while(n===idx) n=Math.floor(Math.random()*list.length); setIdx(n); };
  const add=()=>{ const t=newT.trim(); if(t && !list.some(x=>x.t===t)){ save([{id:uid('mq'),t},...list]); setIdx(0); } setNewT(''); setAddOpen(false); };
  const del=(id)=>{ const l=list.filter(x=>x.id!==id); save(l); setIdx(v=>Math.max(0,Math.min(v,l.length-1))); };
  return (
    <div>
      {cur ? (
        <div className="card mqhero" onClick={next}>
          <div className="mqlabel">⚔️ Mindset chiến đấu</div>
          <div className="mqtext">{cur.t}</div>
          <div className="mqhint">{list.length>1?'chạm để đổi câu · '+list.length+' câu':'khẩu quyết của bạn'}</div>
        </div>
      ) : (
        <div className="card mqhero mqempty" onClick={()=>setAddOpen(true)}>
          <div className="mqlabel">⚔️ Mindset chiến đấu</div>
          <div className="mqtext" style={{fontSize:'clamp(0.9375rem,3.9vw,1.125rem)',fontWeight:700,color:'var(--soft)',lineHeight:1.4}}>Thêm khẩu quyết chiến đấu của bạn — để nó đập vào mắt mỗi lần mở app.</div>
        </div>
      )}
      {addOpen ? (
        <div className="editrow" style={{marginTop:10}}>
          <input value={newT} autoFocus onChange={e=>setNewT(e.target.value)} onKeyDown={e=>{ if(e.key==='Enter') add(); }} placeholder="Nhập khẩu quyết của bạn…"/>
          <button className="btn acc" style={{flex:'0 0 auto'}} onClick={add}>Thêm</button>
        </div>
      ) : (
        <div style={{display:'flex',gap:8,marginTop:10}}>
          <button className="btn acc" style={{flex:1}} onClick={()=>setAddOpen(true)}>＋ Thêm quote</button>
          {cur && <button className="btn ghost" style={{flex:'0 0 auto',color:'var(--danger)'}} onClick={()=>del(cur.id)}>🗑</button>}
        </div>
      )}
    </div>
  );
}
function platformIco(u){ if(/spotify/i.test(u)) return '🟢'; if(/youtu/i.test(u)) return '▶️'; return '🔗'; }
function platformName(u){ if(/spotify/i.test(u)) return 'Spotify'; if(/youtu/i.test(u)) return 'YouTube'; return 'Link nhạc'; }
function MusicLinks({kkey}){
  const KK=kkey||'nc.music';
  const [list,save]=usePersist(KK,[]);
  const [url,setUrl]=useState(''); const [label,setLabel]=useState('');
  const add=()=>{ let u=url.trim(); if(!u) return; if(!/^https?:\/\//i.test(u)) u='https://'+u;
    save([{id:uid('mu'),url:u,label:label.trim()||platformName(u)},...list]); setUrl(''); setLabel(''); };
  const del=(id)=>save(list.filter(x=>x.id!==id));
  return (
    <div style={{marginTop:8}}>
      <div className="editrow"><input value={label} onChange={e=>setLabel(e.target.value)} placeholder="Tên (vd: Máu chiến)" style={{flex:'0 0 36%'}}/>
        <input value={url} onChange={e=>setUrl(e.target.value)} placeholder="Dán link Spotify / YouTube"/></div>
      <button className="btn ghost wide" onClick={add} style={{marginBottom:10}}>＋ Thêm link</button>
      {list.length===0
        ? <div className="muted small">Chưa có link. Dán link playlist của bạn ở trên để mở nhanh.</div>
        : <div className="list">
            {list.map(m=>(
              <div key={m.id} className="musicRow">
                <span style={{fontSize:'1.25rem'}}>{platformIco(m.url)}</span>
                <a href={m.url} target="_blank" rel="noopener noreferrer" className="musicLink">{m.label||m.url}</a>
                <button onClick={()=>del(m.id)} className="xbtn">✕</button>
              </div>))}
          </div>}
    </div>
  );
}
function MyTips(){
  const [list,save]=usePersist('nc.tips',[]);
  const [txt,setTxt]=useState('');
  const [editId,setEditId]=useState(null);
  const submit=()=>{ const t=txt.trim(); if(!t) return;
    if(editId){ save(list.map(x=>x.id===editId?{...x,t}:x)); setEditId(null); }
    else save([{id:uid('tip'),t},...list]);
    setTxt(''); };
  const startEdit=(it)=>{ setEditId(it.id); setTxt(it.t); };
  const del=(id)=>{ save(list.filter(x=>x.id!==id)); if(editId===id){setEditId(null);setTxt('');} };
  return (
    <div>
      <div className="editrow"><input value={txt} onChange={e=>setTxt(e.target.value)}
        placeholder="VD: Giữ cơ sau khi bắn · mắt ở bi mục tiêu" onKeyDown={e=>{ if(e.key==='Enter') submit(); }}/></div>
      <div style={{display:'flex',gap:8,marginBottom:10}}>
        <button className="btn ghost" style={{flex:1}} onClick={submit}>{editId?'💾 Lưu sửa':'＋ Thêm ghi nhớ'}</button>
        {editId && <button className="chip" onClick={()=>{setEditId(null);setTxt('');}}>Huỷ</button>}
      </div>
      {list.length===0
        ? <div className="muted small">Ghi lại những điều muốn tự nhắc về cách chơi đúng — hiện ngay đây mỗi buổi tập.</div>
        : <div className="list">
            {list.map(t=>(
              <div key={t.id} className="card" style={{padding:'11px 13px',display:'flex',gap:10,alignItems:'flex-start'}}>
                <span style={{color:'var(--gold)',fontSize:'1rem',flex:'none'}}>📌</span>
                <div className="preline" style={{flex:1,fontSize:'0.875rem',lineHeight:1.5}}>{t.t}</div>
                <button onClick={()=>startEdit(t)} className="chip" style={{flex:'none'}}>✎</button>
                <button onClick={()=>del(t.id)} className="xbtn">✕</button>
              </div>))}
          </div>}
    </div>
  );
}
function GhostSection({ghost,setGhost}){
  const [types,setTypes]=useState(()=>{ const t=store.get('nc.ghostTypes',[]); return t.length?t:[{id:'def',name:'Ghost 9-bi'}]; });
  const [editId,setEditId]=useState(null);      // mở lịch sử để sửa
  const [renameId,setRenameId]=useState(null);
  const [nmeta,setNmeta]=useState('');          // tên đang nhập (thêm/đổi tên)
  const [adding,setAdding]=useState(false);
  const saveTypes=(l)=>{ setTypes(l); store.set('nc.ghostTypes',l); };
  const saveG=(l)=>{ setGhost(l); store.set('nc.ghost',l); };
  const add=(won,type)=>saveG([{id:uid('g'),date:todayStr(),won,type},...ghost]);
  const toggleRes=(id)=>saveG(ghost.map(g=>g.id===id?{...g,won:!g.won}:g));
  const delRes=(id)=>saveG(ghost.filter(g=>g.id!==id));
  const recsOf=(id)=>ghost.filter(g=>(g.type||'def')===id);
  const addType=()=>{ const n=nmeta.trim(); if(!n) return; saveTypes([...types,{id:uid('gt'),name:n}]); setNmeta(''); setAdding(false); };
  const rename=(id)=>{ const n=nmeta.trim(); if(!n) return; saveTypes(types.map(t=>t.id===id?{...t,name:n}:t)); setRenameId(null); setNmeta(''); };
  const delType=(id)=>{ if(!window.confirm('Xoá bài Ghost này và toàn bộ kết quả của nó?')) return; saveTypes(types.filter(t=>t.id!==id)); saveG(ghost.filter(g=>(g.type||'def')!==id)); };
  return (
    <div>
      <div className="tsub" style={{marginTop:0}}>"Ghost" = đối thủ ảo: phá rồi dọn sạch một lượt, trượt là thua. Tự tạo các bài Ghost (9-bi, 10-bi…) và ghi kết quả.</div>
      {types.map(t=>{ const rs=recsOf(t.id), r20=rs.slice(0,20), w=r20.filter(x=>x.won).length, rate=r20.length?Math.round(w/r20.length*100):null;
        return (
        <div key={t.id} className="card" style={{padding:'12px 14px',marginTop:8}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:8}}>
            <div style={{minWidth:0}}><b>{t.name}</b> <span className="muted small">{rate!=null? rate+'% ('+w+'/'+r20.length+')':'chưa có'}</span></div>
            <div style={{display:'flex',gap:8,flex:'none'}}>
              <button className="chip" onClick={()=>{ setRenameId(renameId===t.id?null:t.id); setNmeta(t.name); }}>✎</button>
              <button className="xbtn" onClick={()=>delType(t.id)}>✕</button>
            </div>
          </div>
          {renameId===t.id &&
            <div className="editrow" style={{marginTop:8}}>
              <input value={nmeta} onChange={e=>setNmeta(e.target.value)} placeholder="Tên bài Ghost"/>
              <button className="chip" onClick={()=>rename(t.id)}>Lưu</button>
            </div>}
          {r20.length>0 && <div style={{marginTop:8}}>{r20.slice(0,16).map((x,i)=><span key={i} className={'dot '+(x.won?'W':'L')}/>)}</div>}
          <div className="ghostform">
            <button className="btn acc sm" onClick={()=>add(true,t.id)}>👍 Thắng</button>
            <button className="btn ghost sm" onClick={()=>add(false,t.id)}>👎 Thua</button>
            {rs.length>0 && <button className="chip" style={{marginLeft:'auto'}} onClick={()=>setEditId(editId===t.id?null:t.id)}>{editId===t.id?'Xong':'✎ Sửa kết quả'}</button>}
          </div>
          {editId===t.id &&
            <div className="list" style={{marginTop:8}}>
              {rs.slice(0,30).map(g=>(
                <div key={g.id} style={{display:'flex',alignItems:'center',gap:10,padding:'7px 10px',border:'1px solid var(--line)',borderRadius:10}}>
                  <span className="muted small" style={{flex:1}}>{fmtDate(g.date)}</span>
                  <button className={'chip'+(g.won?' on':'')} onClick={()=>toggleRes(g.id)}>{g.won?'Thắng':'Thua'}</button>
                  <button className="xbtn" onClick={()=>delRes(g.id)}>✕</button>
                </div>))}
            </div>}
        </div>); })}
      {adding
        ? <div className="editrow" style={{marginTop:10}}>
            <input value={nmeta} onChange={e=>setNmeta(e.target.value)} placeholder="VD: Ghost 10-bi · Ghost phá-dọn"/>
            <button className="chip" onClick={addType}>Thêm</button>
            <button className="chip" onClick={()=>{setAdding(false);setNmeta('');}}>✕</button>
          </div>
        : <button className="btn ghost wide" style={{marginTop:10}} onClick={()=>{setAdding(true);setNmeta('');}}>＋ Thêm bài Ghost</button>}
    </div>
  );
}
/* ================= Reset (trấn an tức thì) ================= */
function ResetOverlay({close}){
  const line=useRef(RESET_LINES[Math.floor((Date.now()/1000)%RESET_LINES.length)]).current;
  const cyc=RESET_PHASES.reduce((s,p)=>s+p[1],0);
  const cycles=2, total=cyc*cycles;
  const [t,setT]=useState(0);
  const ref=useRef(null), lastPi=useRef(-1);
  useEffect(()=>{ try{ const el=document.documentElement; if(el.requestFullscreen) el.requestFullscreen().catch(()=>{}); }catch(e){}
    return ()=>{ try{ if(document.fullscreenElement&&document.exitFullscreen) document.exitFullscreen().catch(()=>{}); }catch(e){} }; },[]);
  useEffect(()=>{ ref.current=setInterval(()=>setT(x=>Math.round((x+0.1)*10)/10),100); return ()=>clearInterval(ref.current); },[]);
  const done=t>=total;
  const inCyc=t%cyc; let a=0, ph=RESET_PHASES[0], pi=0;
  for(let i=0;i<RESET_PHASES.length;i++){ if(inCyc<a+RESET_PHASES[i][1]){ ph=RESET_PHASES[i]; pi=i; break; } a+=RESET_PHASES[i][1]; }
  useEffect(()=>{ if(done){ clearInterval(ref.current); return; } if(pi!==lastPi.current){ lastPi.current=pi; buzz(50); } });
  const breathsLeft=Math.max(1,cycles-Math.floor(t/cyc));
  return (
    <div className="scOverlay" style={{background:'var(--bg)',gap:22}} onClick={(e)=>{ if(done) close(); }}>
      <button className="scClose" onClick={(e)=>{e.stopPropagation();close();}} aria-label="Đóng">✕</button>
      <div className="resetLine">{line}</div>
      <div className="orb" style={{width:'min(58vw,220px)',transform:`scale(${done?1.05:ph[2]})`,transitionDuration:done?'.6s':ph[1]+'s'}}>
        <div><div className="ph">{done?'Sẵn sàng':ph[0]}</div></div>
      </div>
      {done
        ? <button className="btn acc" style={{maxWidth:260}} onClick={close}>Tôi ổn rồi — vào bàn</button>
        : <div className="scHint">Theo nhịp thở · còn {breathsLeft} hơi</div>}
    </div>
  );
}

/* ===== Neo mắt — thu nhỏ tiêu điểm (reset chú ý nhanh nhất) ===== */
const ANCHOR_LINES={
  xa:'Thở hắt ra một hơi thật dài — buông vai xuống.',
  neo:'Cả thế giới thu lại còn MỘT điểm. Giữ mắt trên nó, đừng để trôi.',
  done:'Điểm chạm. Vào bàn.'
};
// [nhãn, số giây, scale đích, thời gian chuyển]
const ANCHOR_PH=[['xa',4,0.5,3.6],['neo',5,0.13,0.7]];
function FocusAnchor(){
  const [run,setRun]=useState(false);
  if(run) return <AnchorRun close={()=>setRun(false)}/>;
  return (
    <div style={{display:'flex',flexDirection:'column',flex:1}}>
      <div className="h">Neo mắt — thu nhỏ tiêu điểm</div>
      <div className="tsub">Khi thấy mình tuột tập trung, hoặc bị đám đông và ánh mắt làm phân tâm: một hơi thở ra thật dài rồi <b>neo mắt vào MỘT điểm</b> cho tới khi xung quanh mờ đi. ~10 giây để kéo chú ý trở lại.</div>
      <div className="card" style={{alignItems:'center',textAlign:'center',gap:12,padding:'22px 16px'}}>
        <div style={{fontSize:'2.625rem',lineHeight:1}}>🎯</div>
        <div className="preline" style={{color:'var(--soft)',fontSize:'0.875rem',maxWidth:300,lineHeight:1.55}}>Xả một hơi → thế giới thu về một điểm → mang sự tập trung đó vào cú đánh. Vào bàn, chọn ngay một điểm thật (chấm trên bi / điểm chạm) và giữ mắt trên nó.</div>
        <button className="btn acc wide" style={{maxWidth:260}} onClick={()=>setRun(true)}>▶ Bắt đầu · 10 giây</button>
      </div>
    </div>
  );
}
function AnchorRun({close}){
  const total=ANCHOR_PH.reduce((s,p)=>s+p[1],0);
  const [t,setT]=useState(0);
  const [armed,setArmed]=useState(false);
  const ref=useRef(null), lastPi=useRef(-1);
  useEffect(()=>{ try{ const el=document.documentElement; if(el.requestFullscreen) el.requestFullscreen().catch(()=>{}); }catch(e){}
    return ()=>{ try{ if(document.fullscreenElement&&document.exitFullscreen) document.exitFullscreen().catch(()=>{}); }catch(e){} }; },[]);
  useEffect(()=>{ const id=setTimeout(()=>setArmed(true),60); return ()=>clearTimeout(id); },[]);
  useEffect(()=>{ ref.current=setInterval(()=>setT(x=>Math.round((x+0.1)*10)/10),100); return ()=>clearInterval(ref.current); },[]);
  const done=t>=total;
  let acc=0, ph=ANCHOR_PH[0], pi=0;
  for(let i=0;i<ANCHOR_PH.length;i++){ if(t<acc+ANCHOR_PH[i][1]){ ph=ANCHOR_PH[i]; pi=i; break; } acc+=ANCHOR_PH[i][1]; }
  useEffect(()=>{ if(done){ clearInterval(ref.current); return; } if(pi!==lastPi.current){ lastPi.current=pi; buzz(50); } });
  const key=done?'done':ph[0];
  const scale=!armed?1.3:(done?0.13:ph[2]);
  const dur=!armed?0.3:(done?0.7:ph[3]);
  return (
    <div className="scOverlay" style={{background:'var(--bg)',gap:26}} onClick={()=>{ if(done) close(); }}>
      <button className="scClose" onClick={(e)=>{e.stopPropagation();close();}} aria-label="Đóng">✕</button>
      <div className="resetLine">{ANCHOR_LINES[key]}</div>
      <div className="orb" style={{width:'min(64vw,240px)',transform:`scale(${scale})`,transitionDuration:dur+'s',transitionTimingFunction:'ease-out'}}>
        <div><div className="ph"></div></div>
      </div>
      {done
        ? <button className="btn acc" style={{maxWidth:260}} onClick={close}>Tôi tập trung rồi — vào bàn</button>
        : <div className="scHint">{key==='xa'?'Xả căng…':'Neo mắt · giữ yên'}</div>}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App/>);
