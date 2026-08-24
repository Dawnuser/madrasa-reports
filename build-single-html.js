const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const css = fs.readFileSync(path.join(ROOT, 'css', 'style.css'), 'utf8');
const i18n = fs.readFileSync(path.join(ROOT, 'js', 'i18n.js'), 'utf8');
const data = fs.readFileSync(path.join(ROOT, 'js', 'data.js'), 'utf8');
let app = fs.readFileSync(path.join(ROOT, 'js', 'app.js'), 'utf8');
const logoB64 = fs.readFileSync(path.join(ROOT, 'assets', 'logo.png')).toString('base64');

// Rewrite img src refs to use the embedded logo (splices inside single-quoted JS strings)
app = app.replace(/assets\/logo\.png/g, "' + __LOGO__ + '");

const indexHtml = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const title = (indexHtml.match(/<title>([^<]+)<\/title>/) || [])[1] || 'Madrasa Reports';

const html = `<!DOCTYPE html>
<html lang="en" data-theme="light" dir="ltr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<meta name="theme-color" content="#07301F">
<title>${title}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@400;500;600;700&family=Inter:wght@400;500;600;700&family=Noto+Nastaliq+Urdu:wght@400;500;600;700&family=Noto+Naskh+Arabic:wght@400;500;600;700&display=swap" rel="stylesheet">
<script>
(function () {
  try {
    var t = localStorage.getItem('mdm_theme') || 'light';
    var l = localStorage.getItem('mdm_lang') || 'en';
    document.documentElement.setAttribute('data-theme', t);
    document.documentElement.setAttribute('lang', l);
    document.documentElement.setAttribute('dir', (l === 'ur' || l === 'ar') ? 'rtl' : 'ltr');
  } catch (e) {}
})();
</script>
<style>
${css}
</style>
</head>
<body>
<div id="app" aria-live="polite"></div>
<div id="toast" class="toast" role="status"></div>
<script>
const __LOGO__ = "data:image/png;base64,${logoB64}";
${i18n}
${data}
${app}
</script>
</body>
</html>
`;

const out = path.join(ROOT, 'index.html');
fs.writeFileSync(out, html, 'utf8');
console.log('Wrote ' + out + ' (' + (fs.statSync(out).size / 1024).toFixed(1) + ' KB)');
