/**
 * Minimal TypeScript declarations for `topojson-client` without depending on
 * `topojson-specification`. This keeps the surface area small and avoids pulling
 * in an extra dependency while still providing useful types for `feature`.
 *
 * These types are deliberately conservative (use `any` in a few internal places)
 * so they remain compatible with the typical shape produced by topojson tools.
 */

declare module 'topojson-client' {
  import type { FeatureCollection, Geometry, GeoJsonProperties } from 'geojson';

  /**
   * Minimal TopoJSON Topology type.
   * This intentionally omits some specifics and uses `any` for arcs to avoid
   * being overly prescriptive while still providing a `Topology` shape.
   */
  export type Topology = {
    type: 'Topology';
    arcs: any[]; // usually number[][][] but left generic for compatibility
    objects: Record<string, TopoObject>;
    bbox?: [number, number, number, number];
    transform?: {
      scale: [number, number];
      translate: [number, number];
    };
  };

  /**
   * A very small representation of TopoJSON objects. TopoJSON object shapes
   * are flexible (named geometry, geometrycollection, etc.), so this union
   * aims to cover the common variants without being exhaustive.
   */
  export type TopoObject =
    | TopoGeometryObject
    | TopoGeometryCollectionObject
    | TopoNamedGeometryObject
    | any;

  export type TopoGeometryObject = {
    type: string; // e.g. "Polygon", "MultiPolygon", "LineString", etc.
    arcs?: any;
    properties?: Record<string, any> | null;
  };

  export type TopoGeometryCollectionObject = {
    type: 'GeometryCollection';
    geometries: TopoObject[];
    properties?: Record<string, any> | null;
  };

  export type TopoNamedGeometryObject = {
    // Named objects in topojson "objects" map sometimes contain `geometries` too
    type?: string;
    geometries?: TopoObject[];
    properties?: Record<string, any> | null;
  };

  /**
   * Convert a TopoJSON object (or named object within a Topology) to a GeoJSON FeatureCollection.
   *
   * G: GeoJSON geometry type for produced features (e.g. GeoJSON.MultiPolygon)
   * P: Properties type for produced features
   *
   * The `object` parameter may be:
   *  - omitted (the entire topology converted to a FeatureCollection, some implementations return a FeatureCollection of geometry collections)
   *  - a TopoObject reference (e.g. topology.objects.foo)
   *  - the string key name of the object inside `topology.objects`
   */
  export function feature<
    G extends Geometry | null = Geometry,
    P = GeoJsonProperties,
  >(topology: Topology, object?: TopoObject | string): FeatureCollection<G, P>;
}
