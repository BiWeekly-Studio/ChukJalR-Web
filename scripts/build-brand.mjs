import {readFileSync,writeFileSync,mkdirSync,copyFileSync,existsSync,unlinkSync} from 'node:fs';
import {createRequire,Module} from 'node:module';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {buildSync} from 'esbuild';
const root=fileURLToPath(new URL('../',import.meta.url));
const require=createRequire(import.meta.url);
const React=require('react');
const {renderToStaticMarkup}=require('react-dom/server');
const colors=JSON.parse(readFileSync(path.join(root,'design/system/tokens.json'),'utf8')).colors;
const write=(p,value)=>{mkdirSync(path.dirname(path.join(root,p)),{recursive:true});writeFileSync(path.join(root,p),value);};
// Export the real component: glyphs, tilt, outlines and integrated ball stay intact.
const built=buildSync({entryPoints:[path.join(root,'src/components/Logo.tsx')],bundle:true,platform:'node',format:'cjs',write:false,jsx:'automatic',external:['react']});
const mod=new Module(path.join(root,'brand-render.cjs'));mod.paths=require.resolve.paths('react')??[];
mod._compile(built.outputFiles[0].text,path.join(root,'brand-render.cjs'));
const {Wordmark,LogoIcon}=mod.exports;
const svg=(Component,props)=>renderToStaticMarkup(React.createElement(Component,props)).replace('<svg ','<svg xmlns="http://www.w3.org/2000/svg" ');
const light=svg(Wordmark,{width:392,tone:'onLight'}),dark=svg(Wordmark,{width:392,tone:'onDark'}),icon=svg(LogoIcon,{size:1024,radius:0});
write('public/brand/wordmark-light.svg',light);write('public/brand/wordmark-dark.svg',dark);write('public/brand/icon.svg',icon);
write('public/favicon.svg',svg(LogoIcon,{size:100}));
let sharp;try {sharp=require(process.env.BRAND_SHARP_PATH||'sharp');}catch {throw new Error('SVGs exported. Set BRAND_SHARP_PATH to the sharp module for PNGs.');}
for(const size of [1024,600,180,64,32])write(`public/brand/icon-${size}.png`,await sharp(Buffer.from(icon)).resize(size,size).removeAlpha().png().toBuffer());
for(const [tone,value] of [['light',light],['dark',dark]])write(`public/brand/wordmark-${tone}.png`,await sharp(Buffer.from(value)).resize({width:1568}).png().toBuffer());
const preview=`<svg xmlns="http://www.w3.org/2000/svg" width="960" height="480" viewBox="0 0 960 480"><rect width="960" height="480" fill="${colors.paper}"/><g transform="translate(88 48) scale(2)">${light}</g></svg>`;
write('design/assets/matchday/brand-preview.png',await sharp(Buffer.from(preview)).png().toBuffer());
for(const dest of ['public/app-icon.png','ios/Resources/Assets.xcassets/AppIcon.appiconset/icon-1024.png'])copyFileSync(path.join(root,'public/brand/icon-1024.png'),path.join(root,dest));
for(const name of ['icon-1024.png','icon-600.png','wordmark-light.svg','wordmark-dark.svg','wordmark-light.png','wordmark-dark.png'])copyFileSync(path.join(root,'public/brand',name),path.join(root,'design/assets/matchday',name));
// Native app and Live Activity use the same exported artwork as the web.
write('ios/Resources/Brand.xcassets/Contents.json', JSON.stringify({info:{author:'xcode',version:1}},null,2));
for (const [tone,name] of [['light','WordmarkLight'],['dark','WordmarkDark']]) {
  const dir=`ios/Resources/Brand.xcassets/${name}.imageset`;
  write(`${dir}/Contents.json`,JSON.stringify({images:[{filename:'wordmark.png',idiom:'universal'}],info:{author:'xcode',version:1}},null,2));
  copyFileSync(path.join(root,`public/brand/wordmark-${tone}.png`),path.join(root,dir,'wordmark.png'));
}
for(const name of ['public/brand/symbol.svg','public/brand/wordmark-mono.svg','design/assets/matchday/symbol.svg'])if(existsSync(path.join(root,name)))unlinkSync(path.join(root,name));
console.log('Original wordmark preserved; navy/lime variants and matching 축 icons exported.');
