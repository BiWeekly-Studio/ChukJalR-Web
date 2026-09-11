import {defineConfig} from 'vite';
import {fileURLToPath} from 'node:url';
export default defineConfig({resolve:{alias:{'@apps-in-toss/web-framework':fileURLToPath(new URL('./iap-mock.ts',import.meta.url))}},define:{'import.meta.env.VITE_SUPABASE_URL':'""','import.meta.env.VITE_SUPABASE_ANON_KEY':'""'},server:{host:'127.0.0.1',port:4187,strictPort:true}});
