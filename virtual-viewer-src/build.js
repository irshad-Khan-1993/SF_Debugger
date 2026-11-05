const esbuild = require('esbuild');
const path = require('path');

esbuild.build({
    entryPoints: [path.join(__dirname, 'src', 'index.jsx')],
    bundle: true,
    minify: true,
    sourcemap: false,
    format: 'iife',
    platform: 'browser',
    target: ['es2020', 'chrome90'],
    outfile: path.join(__dirname, '..', 'Salesforce Quick-Access', 'react-log-viewer.bundle.js'),
    define: {
        'process.env.NODE_ENV': '"production"'
    }
}).then(() => {
    console.log('Build completed successfully: react-log-viewer.bundle.js');
}).catch((err) => {
    console.error('Build failed:', err);
    process.exit(1);
});

