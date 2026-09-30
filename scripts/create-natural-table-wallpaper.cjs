// Restyle the editable map artwork without changing its measured placement.
const fs=require('fs');
const path=require('path');
const sharp=require(process.env.STUDIO_SHARP_PATH || 'sharp');
const out=path.resolve(__dirname,'../media/wallpapers');
let svg=fs.readFileSync(path.join(out,'table-aligned-v2.svg'),'utf8');
const palette={
 '#0e2024':'#c4ceb6', // quiet sage ground
 '#365054':'#8b9784', // actual street network
 '#609488':'#4f7051', // actual tree locations
 '#193237':'#e5e0d2', // warm stone buildings
 '#82b9b4':'#87917c', // soft building edges
 '#58837e':'#798a71',
 '#d1e7de':'#f5f3e9',
 '#c1d8cf':'#f5f3e9'
};
for(const [from,to] of Object.entries(palette))svg=svg.replaceAll(from,to);
// Simple flat labels; pure black remains outside the table footprint.
svg=svg.replace('rx="27" fill="#000000"','rx="3" fill="#3e5142"')
 .replace('rx="24" fill="#000000"','rx="3" fill="#3e5142"')
 .replace('letter-spacing="5"','letter-spacing="3"');
(async()=>{
 const base=path.join(out,'table-natural-1920x1200');
 fs.writeFileSync(base+'.svg',svg);
 await sharp(Buffer.from(svg)).png().toFile(base+'.png');
 console.log(base+'.png');
})();
