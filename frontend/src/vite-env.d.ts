/// <reference types="vite/client" />

declare module "react-simple-maps" {
  import type { ReactNode } from "react";
  export function ComposableMap(props: {
    projection?: string;
    projectionConfig?: { scale?: number; center?: [number, number] };
    width?: number;
    height?: number;
    style?: React.CSSProperties;
    children?: ReactNode;
  }): JSX.Element;
  export function Geographies(props: {
    geography: string | object;
    children: (args: { geographies: Array<{ rsmKey: string; [key: string]: unknown }> }) => ReactNode;
  }): JSX.Element;
  export function Geography(props: {
    geography: { rsmKey: string; [key: string]: unknown };
    fill?: string;
    stroke?: string;
    strokeWidth?: number;
    style?: object;
  }): JSX.Element;
  export function Marker(props: {
    coordinates: [number, number];
    children?: ReactNode;
  }): JSX.Element;
}
