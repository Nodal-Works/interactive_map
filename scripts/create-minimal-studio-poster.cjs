const fs = require('fs');
const path = require('path');
const sharp = require(process.env.STUDIO_SHARP_PATH || 'sharp');
const root=path.resolve(__dirname,'..');
const out=path.join(root,'media/wallpapers');
const embed=name=>'data:image/png;base64,'+fs.readFileSync(path.join(root,'media',name)).toString('base64');
const text=(x,y,size,copy,fill='#182b39',extra='')=>`<text x="${x}" y="${y}" font-size="${size}" fill="${fill}" ${extra}>${copy}</text>`;
const row=(y,n,title,detail)=>`${text(100,y,29,n,'#54777c')}${text(178,y,39,title,'#182b39','font-weight="600"')}${text(178,y+52,29,detail,'#4a5961')}<line x1="178" y1="${y+92}" x2="1120" y2="${y+92}" stroke="#d5dcde"/>`;
const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080">
<style>text{font-family:Segoe UI,Arial,sans-serif}</style>
<rect width="1920" height="1080" fill="#fafaf7"/>
<rect width="1920" height="166" fill="#163044"/>
<image href="${embed('chalmers_logo.png')}" x="100" y="47" width="360" height="73" preserveAspectRatio="xMinYMid meet"/>
<image href="${embed('dtcc_logo.png')}" x="1440" y="26" width="380" height="114" preserveAspectRatio="xMaxYMid meet"/>
${text(100,291,62,'Welcome to the ACE MR Studio','#182b39','font-weight="600"')}
${text(102,351,30,'Explore the campus through mixed reality.','#4a5961')}
${row(482,'01','Log in to the laptop','Start here to get the studio ready.')}
${row(658,'02','Open the browser','Click “Launch Both Windows”.')}
${row(834,'03','Go fullscreen','Click once inside each window on the TV and table.')}
<line x1="1205" y1="435" x2="1205" y2="920" stroke="#d5dcde"/>
${text(1270,472,22,'BEFORE YOU LEAVE','#54777c','letter-spacing="2"')}
${text(1270,530,35,'Close both windows','#182b39','font-weight="600"')}
${text(1270,581,27,'On the laptop, click “Close All”.','#4a5961')}
${text(1270,722,22,'YOUR FEEDBACK MATTERS','#54777c','letter-spacing="2"')}
${text(1270,780,35,'Tell us what you think','#182b39','font-weight="600"')}
${text(1270,831,27,'Please fill in the survey on the','#4a5961')}
${text(1270,871,27,'About page. We really appreciate it.','#4a5961')}
<line x1="100" y1="984" x2="1820" y2="984" stroke="#d5dcde"/>
${text(100,1030,23,'Architecture and Civil Engineering · Digital Twin Cities Centre','#59676e')}
${text(1820,1030,23,'Thank you for visiting.','#59676e','text-anchor="end"')}
</svg>`;
(async()=>{
 const base=path.join(out,'tv-launch-poster-minimal-1920x1080');
 fs.writeFileSync(base+'.svg',svg);
 await sharp(Buffer.from(svg)).png().toFile(base+'.png');
 console.log(base+'.png');
})();
