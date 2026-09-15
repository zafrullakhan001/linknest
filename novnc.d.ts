declare module '@novnc/novnc' {
  export default class RFB {
    constructor(
      target: HTMLElement,
      url: string | null,
      options?: {
        credentials?: { password?: string; username?: string; target?: string };
        shared?: boolean;
        wsProtocols?: string[];
      }
    );
    disconnect(): void;
    focus(): void;
    blur(): void;
    sendCtrlAltDel(): void;
    scaleViewport: boolean;
    resizeSession: boolean;
    viewOnly: boolean;
    clipViewport: boolean;
    qualityLevel: number;
    compressionLevel: number;
    addEventListener(type: string, listener: (e: CustomEvent) => void): void;
    removeEventListener(type: string, listener: (e: CustomEvent) => void): void;
  }
}
