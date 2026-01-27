electiontrack-np/src/types/topojson.d.ts
declare module 'topojson-server' {
  // You can expand these types as needed for your usage
  export function topology(objects: Record<string, any>, quantization?: number): any;
}

declare module 'topojson-simplify' {
  export function presimplify(topology: any): any;
  export function simplify(topology: any, weight?: number): any;
  export function filter(topology: any, filterFn: (arc: any) => boolean): any;
  export function filterAttached(topology: any): any;
  export function filterWeight(topology: any, minWeight: number): any;
}
