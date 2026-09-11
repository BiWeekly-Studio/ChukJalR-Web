import {execFileSync} from 'node:child_process';
import {copyFileSync,mkdirSync} from 'node:fs';
import {loadEnv} from 'vite';
const env={...loadEnv('production',process.cwd(),'VITE_'),...process.env};
const adId=env.VITE_TOSS_BANNER_AD_GROUP_ID?.trim();
const liveAds=Boolean(adId && !adId.startsWith('ait-ad-test-'));
execFileSync('npm',['run','build:toss'],{stdio:'inherit',env:{...env,
 VITE_TOSS_ADS_MODE:liveAds?'live':'off',
 VITE_TOSS_BANNER_AD_GROUP_ID:liveAds?adId:'',
 VITE_TOSS_ANALYTICS_ENABLED:'true',
}});
mkdirSync('artifacts',{recursive:true});
copyFileSync('chukjalr.ait','artifacts/chukjalr-fresh-start.ait');
console.log(`IAP release bundle ready. Ads: ${liveAds?'live':'disabled (no operational ID)'}`);
