import type { DetailedHTMLProps, HTMLAttributes } from "react";

declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      "model-viewer": DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement> & {
        src?: string;
        "ios-src"?: string;
        alt?: string;
        ar?: boolean;
        autoplay?: boolean;
        "animation-name"?: string;
        "animation-crossfade-duration"?: string;
        "ar-modes"?: string;
        "ar-placement"?: "floor" | "wall";
        "ar-scale"?: "auto" | "fixed";
        scale?: string;
        "camera-controls"?: boolean;
        "touch-action"?: string;
        "camera-orbit"?: string;
        "min-camera-orbit"?: string;
        "max-camera-orbit"?: string;
        "shadow-intensity"?: string;
        "shadow-softness"?: string;
        exposure?: string;
        "tone-mapping"?: string;
        "xr-environment"?: boolean;
      };
    }
  }
}
