import { defineConfig } from '@apps-in-toss/web-framework/config';
import tokens from './design/system/tokens.json';
export default defineConfig({
  appName: 'chukjalr',
  brand: { primaryColor: tokens.colors.accent },
  permissions: [],
  navigationBar: { withBackButton: false, withHomeButton: false, withTitle: true, theme: 'light' },
  webBundleDir: 'dist',
});
