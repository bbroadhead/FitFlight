import { ScrollViewStyleReset } from 'expo-router/html';

// This file is web-only and used to configure the root HTML for every
// web page during static rendering.
// The contents of this function only run in Node.js environments and
// do not have access to the DOM or browser APIs.
export default function Root({ children }: { children: React.ReactNode }) {
  const basePath = '';
  const measurementId = process.env.EXPO_PUBLIC_GA_MEASUREMENT_ID?.trim() || 'G-9BC4BSPGG2';
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no, viewport-fit=cover" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Silkscreen:wght@400;700&family=VT323&display=swap" rel="stylesheet" />
        <link rel="manifest" href={`${basePath}/manifest.json`} />
        <link rel="shortcut icon" href={`${basePath}/favicon.png`} />
        <link
          rel="apple-touch-icon"
          sizes="180x180"
          type="image/png"
          href={`${basePath}/apple-touch-icon.png`}
        />
        <link rel="apple-touch-icon" href={`${basePath}/apple-touch-icon.png`} />
        <link rel="icon" type="image/png" sizes="192x192" href={`${basePath}/logo192.png`} />
        <link rel="icon" type="image/png" sizes="512x512" href={`${basePath}/logo512.png`} />
        {/* iOS PWA support */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-title" content="FitFlight" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="theme-color" content="#001F5C" />
        {measurementId ? (
          <>
            <script async src={`https://www.googletagmanager.com/gtag/js?id=${measurementId}`} />
            <script
              dangerouslySetInnerHTML={{
                __html: `
                  window.dataLayer = window.dataLayer || [];
                  function gtag(){window.dataLayer.push(arguments);}
                  window.gtag = gtag;
                  gtag('js', new Date());
                  gtag('config', '${measurementId}', {
                    send_page_view: true,
                    page_path: window.location.pathname + window.location.search
                  });
                `,
              }}
            />
          </>
        ) : null}
        {/* 
          Disable body scrolling on web. This makes ScrollView components work closer to how they do on native. 
          However, body scrolling is often nice to have for mobile web. If you want to enable it, remove this line.
        */}
        <ScrollViewStyleReset />

        {/* Using raw CSS styles as an escape-hatch to ensure the background color never flickers in dark-mode. */}
        <style dangerouslySetInnerHTML={{ __html: responsiveBackground }} />
        {/* Add any additional <head> elements that you want globally available on web... */}
      </head>
      <body>{children}</body>
    </html>
  );
}

const responsiveBackground = `
html {
  background-color: #0A1628;
  height: 100%;
  min-height: 100%;
  height: 100dvh;
  min-height: 100dvh;
  width: 100%;
}

body {
  background-color: #0A1628;
  margin: 0;
  width: 100%;
  height: 100dvh;
  min-height: 100dvh;
  min-height: 100vh;
  padding: 0;
  overflow: hidden;
  overscroll-behavior-y: none;
}

input,
textarea,
select {
  font-size: 16px !important;
}

body > div:first-child,
#root,
[data-expo-root] {
  width: 100%;
  height: 100dvh;
  min-height: 100dvh;
  min-height: 100vh;
  background-color: #0A1628;
  overflow: hidden;
}

@supports (height: 100lvh) {
  html,
  body,
  body > div:first-child,
  #root,
  [data-expo-root] {
    height: 100lvh;
    min-height: 100lvh;
  }
}

@media (prefers-color-scheme: dark) {
  html,
  body,
  body > div:first-child,
  #root,
  [data-expo-root] {
    background-color: #0A1628;
  }
}`;
