// Inject engine "Điều bi" (DieuBi/engine_inline.js) vào <script id="dieubi-engine"> trong index.html.
// Chạy lại mỗi khi sửa engine:  node inject-dieubi.js
// Lần đầu thay placeholder __DIEUBI_ENGINE__; các lần sau thay phần giữa 2 marker.
const fs=require('fs'), path=require('path');
const engPath=path.join(__dirname,'..','DieuBi','engine_inline.js');
const htmlPath=path.join(__dirname,'index.html');
const START='/*DIEUBI-ENGINE-START*/', END='/*DIEUBI-ENGINE-END*/';
const esc=(s)=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
let eng=fs.readFileSync(engPath,'utf8').replace(/\nif\s*\(typeof require[\s\S]*$/,'\n').trim(); // bỏ khối CLI test
const block=START+'\n'+eng+'\n'+END;
let html=fs.readFileSync(htmlPath,'utf8');
if(html.includes(START)&&html.includes(END)){
  html=html.replace(new RegExp(esc(START)+'[\\s\\S]*?'+esc(END)), ()=>block);
} else if(html.includes('__DIEUBI_ENGINE__')){
  html=html.split('__DIEUBI_ENGINE__').join(block);
} else { console.error('Không thấy placeholder __DIEUBI_ENGINE__ hay marker — bỏ qua.'); process.exit(1); }
fs.writeFileSync(htmlPath,html);
console.log('Đã inject engine: '+eng.length+' ký tự.');
