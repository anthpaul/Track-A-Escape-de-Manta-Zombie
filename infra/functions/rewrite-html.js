// CloudFront viewer-request function (cloudfront-js-2.0) for the static Next.js export.
// Loaded by infra/cloudfront.tf with file(); tested by rewrite-html.test.mjs.
function handler(event) {
  var request = event.request;
  var uri = request.uri;

  // Next 16 requests route payloads as /mapa/__next.mapa.__PAGE__.txt, but the static export stores
  // them as /mapa/__next.mapa/__PAGE__.txt: keep the first dot after "__next" and turn the rest into "/".
  var payload = uri.match(/^(.*\/__next\.)([^\/]+)\.txt$/);
  if (payload) {
    var partes = payload[2].split('.');
    if (partes.length > 1) {
      request.uri = payload[1] + partes.join('/') + '.txt';
    }
    return request;
  }

  // Clean URLs to exported files: / -> /index.html, /mapa and /mapa/ -> /mapa.html
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
