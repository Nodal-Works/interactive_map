/* Deterministic artwork from the live project's geographic layers. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const root = path.resolve(__dirname, '..');
const out = path.join(root, 'media/wallpapers');
const sharp = require(process.env.STUDIO_SHARP_PATH || 'sharp');
const context = {window:{}};
vm.runInNewContext(fs.readFileSync(path.join(root,'app-config.js'),'utf8'),context);
const config = context.window.APP_CONFIG;
const cal = JSON.parse(fs.readFileSync(path.join(root,'map-calibration.json'),'utf8'));
const load = name => JSON.parse(fs.readFileSync(path.join(root,'media',name+'.geojson'),'utf8')).features;
const world = ([lng,lat]) => [(lng+180)/360, (1-Math.log(Math.tan(Math.PI/4+lat*Math.PI/360))/Math.PI)/2];
const center = world([cal.center.lng,cal.center.lat]);
const scale = 512*2**cal.zoom;
const angle = -cal.bearing*Math.PI/180;
const W=Number(process.env.STUDIO_TABLE_WIDTH || 1920), H=Number(process.env.STUDIO_TABLE_HEIGHT || 1200);
function baseProject(ll) {
  const p=world(ll), x=(p[0]-center[0])*scale, y=(p[1]-center[1])*scale;
  return [W/2+x*Math.cos(angle)-y*Math.sin(angle),H/2+x*Math.sin(angle)+y*Math.cos(angle)];
}
// Measured from the fullscreen installation's visible calibration grid.
// Three corners anchor an affine transform in projected (Mercator) coordinates.
const measured = JSON.parse(fs.readFileSync(path.join(out,'table-footprint.json'),'utf8'));
const origin=baseProject(config.area.corners[3]), px=baseProject(config.area.corners[2]), py=baseProject(config.area.corners[0]);
const ax=px[0]-origin[0], ay=px[1]-origin[1], bx=py[0]-origin[0], by=py[1]-origin[1], det=ax*by-ay*bx;
function project(ll) {
  const p=baseProject(ll), dx=p[0]-origin[0],dy=p[1]-origin[1];
  const u=(dx*by-dy*bx)/det,v=(ax*dy-ay*dx)/det;
  const [o,x,y]=measured.anchors;
  return [o[0]+u*(x[0]-o[0])+v*(y[0]-o[0]),o[1]+u*(x[1]-o[1])+v*(y[1]-o[1])];
}
const coord = ll => project(ll).map(n=>n.toFixed(2)).join(',');
const line = points => 'M'+points.map(coord).join('L');
function geometry(g) {
  if(g.type==='LineString')return line(g.coordinates);
  if(g.type==='MultiLineString')return g.coordinates.map(line).join('');
  if(g.type==='Polygon')return g.coordinates.map(r=>line(r)+'Z').join('');
  if(g.type==='MultiPolygon')return g.coordinates.flatMap(p=>p.map(r=>line(r)+'Z')).join('');
  return '';
}
const boundary=config.area.corners.map(coord).join(' ');
const roads=load('street-network').map(f=>`<path d="${geometry(f.geometry)}"/>`).join('');
const buildings=load('building-footprints').map(f=>`<path d="${geometry(f.geometry)}"/>`).join('');
const trees=load('trees').filter(f=>f.geometry.type==='Point').map(f=>{
  const [x,y]=project(f.geometry.coordinates);return `<circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="1.65"/>`;
}).join('');
const defs=`<defs><clipPath id="table"><polygon points="${boundary}"/></clipPath><clipPath id="viewport"><rect x="60" y="0" width="${W-120}" height="${H}"/></clipPath></defs>`;
const map=`<g clip-path="url(#viewport)"><g clip-path="url(#table)"><polygon points="${boundary}" fill="#0e2024"/><g fill="none" stroke="#365054" stroke-width="1.15">${roads}</g><g fill="#609488" opacity=".65">${trees}</g><g fill="#193237" fill-rule="evenodd" stroke="#82b9b4" stroke-width="1.05" stroke-linejoin="round">${buildings}</g></g><polygon points="${boundary}" fill="none" stroke="#58837e" stroke-width="1"/></g>`;
const text=(x,y,size,copy,color='#eff4ed',extra='')=>`<text x="${x}" y="${y}" font-size="${size}" fill="${color}" ${extra}>${copy}</text>`;
const svg=body=>`<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080"><style>text{font-family:Segoe UI,Arial,sans-serif}</style>${defs}${body}</svg>`;
const table=svg(`<rect width="1920" height="1080" fill="#080f12"/>${map}<rect x="650" y="12" width="620" height="54" rx="27" fill="#080f12"/>${text(960,48,24,'ACE MR STUDIO','#d1e7de','text-anchor="middle" letter-spacing="5"')}<rect x="540" y="1017" width="840" height="48" rx="24" fill="#080f12"/>${text(960,1048,21,'Start on the laptop · Follow the instructions on the TV','#c1d8cf','text-anchor="middle"')}`);
const row=(y,n,title,detail)=>`<line x1="100" y1="${y-55}" x2="1170" y2="${y-55}" stroke="#30413f"/>${text(100,y+5,32,n,'#9ad9c2')}${text(180,y+5,41,title,'#f3f3eb','font-weight="600"')}${text(180,y+56,28,detail,'#b8c8c4')}`;
const poster=svg(`<rect width="1920" height="1080" fill="#101c20"/><g opacity=".09">${map}</g><rect x="72" y="70" width="5" height="186" fill="#a4dec7"/>${text(104,111,23,'CHALMERS  /  MIXED REALITY','#a4dec7','letter-spacing="4"')}${text(100,212,84,'ACE MR Studio','#f3f3eb','font-weight="600"')}${text(104,278,31,'Explore the campus. Start here.','#bdcec8')}${row(425,'01','Log in to the laptop','Use the laptop to get the studio ready.')}${row(615,'02','Open the browser','Click “Launch Both Windows”.')}${row(805,'03','Make both windows fullscreen','Click once inside each window on the TV and table.')}<rect x="1250" y="355" width="570" height="279" rx="20" fill="#263331"/>${text(1292,409,21,'BEFORE YOU LEAVE','#edc58f','letter-spacing="3"')}${text(1292,472,35,'Close both windows','#f3f3eb','font-weight="600"')}${text(1292,524,27,'On the laptop, click “Close All”.','#d0d8d0')}${text(1292,573,25,'Thank you for leaving the studio ready.','#b5c8bf')}<rect x="1250" y="662" width="570" height="254" rx="20" fill="#203a35"/>${text(1292,716,21,'HELP US IMPROVE','#a4dec7','letter-spacing="3"')}${text(1292,777,35,'Share your feedback','#f3f3eb','font-weight="600"')}${text(1292,825,27,'Please fill in the survey on the','#d0e0d7')}${text(1292,866,27,'About page. We really appreciate it.','#d0e0d7')}<line x1="100" y1="976" x2="1820" y2="976" stroke="#3c514b"/>${text(100,1020,22,'URBAN PLANNING · ENVIRONMENT · EXPLORATION','#91afa2','letter-spacing="2"')}${text(1820,1020,22,'Welcome to the studio.','#b8c8c4','text-anchor="end"')}`);
(async()=>{
  fs.mkdirSync(out,{recursive:true});
  for(const [name,source] of [['table-aligned',table],['tv-launch-poster',poster]]) {
    if(name!=='table-aligned')continue; // Keep the approved TV poster unchanged.
    let finalSource=source;
    if(name==='table-aligned') {
      finalSource=source.replace('width="1920" height="1080" viewBox="0 0 1920 1080"',`width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"`)
        .replace('<rect width="1920" height="1080" fill="#080f12"/>',`<rect width="${W}" height="${H}" fill="#080f12"/>`)
        .replace('<rect x="650"',`<g transform="translate(${W/2-960},0)"><rect x="650"`)
        .replace('<rect x="540"',`</g><g transform="translate(${W/2-960},${H-1080})"><rect x="540"`)
        .replace('</svg>','</g></svg>');
      finalSource=finalSource.replaceAll('#080f12','#000000')
        .replace('<g transform="translate(0,0)">','<g transform="translate(0,45)">')
        .replace(`<g transform="translate(0,${H-1080})">`,'<g transform="translate(0,-49)">');
    } else finalSource=source.replace('<g opacity=".09">',`<g opacity=".09" transform="scale(${1920/W},${1080/H})">`);
    fs.writeFileSync(path.join(out,name+'-v2.svg'),finalSource);
    await sharp(Buffer.from(finalSource)).png().toFile(path.join(out,name+`-${name==='table-aligned'?W+'x'+H:'1920x1080'}-v2.png`));
    if(name==='tv-launch-poster')await sharp(Buffer.from(finalSource),{density:144}).png().toFile(path.join(out,name+'-3840x2160.png'));
  }
  console.log(JSON.stringify({calibration:cal,tableCorners:config.area.corners.map(project),outputs:fs.readdirSync(out)},null,2));
})();
