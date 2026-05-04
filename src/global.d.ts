declare global {
  interface Window {
    __FILLER_WS_URL__?: string;
    __FILLER_API_URL__?: string;
  }

  var __FILLER_WS_URL__: string | undefined;
  var __FILLER_API_URL__: string | undefined;
}

export {};
