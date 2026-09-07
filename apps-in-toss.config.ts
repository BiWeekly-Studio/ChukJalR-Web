import { defineConfig } from '@apps-in-toss/web-framework/config';
export default defineConfig({
  appName: 'chukjalr',
  brand: { primaryColor: '#2f57f2' },
  permissions: [],
  navigationBar: { withBackButton: false, withHomeButton: false, withTitle: true, theme: 'light' },
  webBundleDir: 'dist',
});
