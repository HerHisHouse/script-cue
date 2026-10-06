import React, { useMemo } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';

// Visor de PDF para Android. El WebView de Android no muestra PDF (lo trata
// como una descarga), a diferencia del de iOS, así que aquí se carga una página
// mínima con PDF.js (el visor de PDF de Firefox) que descarga el PDF
// directamente de Supabase y dibuja cada página en un <canvas>.
//
// - PDF.js 3.11.174 desde cdnjs (versión fija). El worker va en otro origen;
//   PDF.js lo carga igualmente con un blob que hace importScripts.
// - Las páginas se dibujan solo cuando están cerca de la pantalla y se vacían
//   al alejarse, para que un guion largo no se coma la memoria.
// - Zoom con dos dedos: el del propio WebView (user-scalable).

const PDFJS_VERSION = '3.11.174';
const PDFJS_BASE = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}`;
const BACKGROUND = '#1a1625';

function buildHtml(pdfUrl: string): string {
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=5, user-scalable=yes">
<style>
  html, body { margin: 0; padding: 0; background: ${BACKGROUND}; }
  #pages { padding: 8px 0; }
  canvas.page { display: block; width: 100%; margin: 0 auto 8px; background: #fff; }
</style>
<script src="${PDFJS_BASE}/pdf.min.js"></script>
</head>
<body>
<div id="pages"></div>
<script>
(function () {
  function post(msg) {
    if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify(msg));
  }
  if (!window.pdfjsLib) { post({ type: 'error', message: 'No se pudo cargar PDF.js' }); return; }
  pdfjsLib.GlobalWorkerOptions.workerSrc = '${PDFJS_BASE}/pdf.worker.min.js';

  var container = document.getElementById('pages');
  // Resolución del dibujo: densidad de la pantalla x1.5 para que el zoom no se
  // vea borroso enseguida (con un tope para no gastar demasiada memoria).
  var quality = Math.min((window.devicePixelRatio || 1) * 1.5, 4);

  pdfjsLib.getDocument({ url: ${JSON.stringify(pdfUrl)} }).promise.then(function (pdf) {
    var width = document.documentElement.clientWidth;
    var pages = [];

    function render(entry) {
      if (entry.rendered || entry.rendering) return;
      entry.rendering = true;
      var viewport = entry.page.getViewport({ scale: (width / entry.baseWidth) * quality });
      var canvas = entry.canvas;
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      entry.page.render({ canvasContext: canvas.getContext('2d'), viewport: viewport }).promise
        .then(function () { entry.rendered = true; })
        .catch(function () {})
        .then(function () { entry.rendering = false; });
    }
    function clear(entry) {
      if (!entry.rendered || entry.rendering) return;
      entry.canvas.width = 0;
      entry.canvas.height = 0;
      entry.rendered = false;
    }

    var observer = new IntersectionObserver(function (items) {
      items.forEach(function (item) {
        var entry = pages[Number(item.target.dataset.index)];
        if (item.isIntersecting) render(entry); else clear(entry);
      });
    }, { rootMargin: '1500px 0px' });

    // Primero se crean todos los huecos con su alto real (para que el scroll
    // tenga la longitud correcta) y después se dibujan los que se ven.
    var chain = Promise.resolve();
    for (var i = 1; i <= pdf.numPages; i++) {
      (function (n) {
        chain = chain.then(function () { return pdf.getPage(n); }).then(function (page) {
          var base = page.getViewport({ scale: 1 });
          var canvas = document.createElement('canvas');
          canvas.className = 'page';
          canvas.style.height = (width * base.height / base.width) + 'px';
          canvas.dataset.index = String(pages.length);
          container.appendChild(canvas);
          pages.push({ page: page, canvas: canvas, baseWidth: base.width, rendered: false, rendering: false });
          if (n === 1) post({ type: 'loaded', pages: pdf.numPages });
          observer.observe(canvas);
        });
      })(i);
    }
    return chain;
  }).catch(function (e) {
    post({ type: 'error', message: String(e && e.message || e) });
  });
})();
</script>
</body>
</html>`;
}

interface AndroidPdfViewerProps {
  url: string;
  onError: () => void;
}

export function AndroidPdfViewer({ url, onError }: AndroidPdfViewerProps) {
  const html = useMemo(() => buildHtml(url), [url]);
  const [loading, setLoading] = React.useState(true);

  function handleMessage(event: WebViewMessageEvent) {
    try {
      const msg = JSON.parse(event.nativeEvent.data);
      if (msg.type === 'loaded') setLoading(false);
      if (msg.type === 'error') {
        console.warn('[AndroidPdfViewer] Error mostrando el PDF:', msg.message);
        onError();
      }
    } catch {
      // Mensaje ajeno al visor: se ignora.
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: BACKGROUND }}>
      <WebView
        source={{ html, baseUrl: 'https://scriptcue.local/' }}
        originWhitelist={['*']}
        style={{ flex: 1, backgroundColor: BACKGROUND }}
        onMessage={handleMessage}
        onError={onError}
        setBuiltInZoomControls
        setDisplayZoomControls={false}
      />
      {loading && (
        <View style={[StyleSheet.absoluteFill, styles.loading]} pointerEvents="none">
          <ActivityIndicator size="large" color="#FFFFFF" />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  loading: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: BACKGROUND,
  },
});
