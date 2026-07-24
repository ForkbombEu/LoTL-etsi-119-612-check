export function renderDocsHtml(): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>WE BUILD Trusted List Audit API</title>
    <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
    <link rel="stylesheet" href="https://unpkg.com/@stoplight/elements@9.0.0/styles.min.css" />
    <style>
      html, body { height: 100%; margin: 0; }
      body { font-family: Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
      elements-api { display: block; height: 100vh; }
    </style>
  </head>
  <body>
    <elements-api
      apiDescriptionUrl="/openapi.yaml"
      router="hash"
      layout="sidebar"
      tryItCredentialsPolicy="same-origin"
    ></elements-api>
    <script src="https://unpkg.com/@stoplight/elements@9.0.0/web-components.min.js"></script>
  </body>
</html>`;
}
