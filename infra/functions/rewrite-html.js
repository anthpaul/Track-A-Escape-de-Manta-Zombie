// Función viewer-request de CloudFront (cloudfront-js-2.0) para el export estático de Next.js.
// La carga infra/cloudfront.tf con file(); la prueba rewrite-html.test.mjs.
function handler(event) {
  var request = event.request;
  var uri = request.uri;

  // Next 16 pide los payloads de ruta como /mapa/__next.mapa.__PAGE__.txt, pero el export estático los
  // guarda como /mapa/__next.mapa/__PAGE__.txt: se conserva el primer punto después de "__next" y el
  // resto se convierte en "/".
  var payload = uri.match(/^(.*\/__next\.)([^\/]+)\.txt$/);
  if (payload) {
    var partes = payload[2].split('.');
    if (partes.length > 1) {
      request.uri = payload[1] + partes.join('/') + '.txt';
    }
    return request;
  }

  // URL limpias a archivos exportados: / -> /index.html, /mapa y /mapa/ -> /mapa.html
  if (uri === '/') {
    request.uri = '/index.html';
    return request;
  }
  if (uri.endsWith('/')) {
    uri = uri.slice(0, -1);
  }
  if (uri.lastIndexOf('.') < uri.lastIndexOf('/') + 1) {
    request.uri = uri + '.html';
  }
  return request;
}
