// Venue data for the landing-page 3D globe experience.
// Add more venues here later — the globe component takes any Venue.

export interface Venue {
  name: string;
  /** Decimal latitude */
  lat: number;
  /** Decimal longitude */
  lng: number;
  /** Google Maps deep link for the "Get directions" button */
  mapsUrl: string;
  /** Image URLs shown in the popup (served from /public). Drop real venue
   *  photos in /public/venue/ and list them here; empty falls back to a banner. */
  images: string[];
  description: { en: string; hu: string };
}

export const BASS_PIKNIK_VENUE: Venue = {
  name: "Tó-Part Panzió",
  lat: 47.3975366,
  lng: 16.535894,
  mapsUrl:
    "https://www.google.com/maps/place/T%C3%B3-Part+Panzi%C3%B3/@47.3975366,16.535894,17z",
  images: [],
  description: {
    en: "Our lakeside home for Bass Piknik. Set on the calm shore of a lake just outside Kőszeg in Western Hungary, wrapped in forest and open sky. Camp by the water, dance under the stars.",
    hu: "A Bass Piknik tóparti otthona. Egy nyugodt tó partján Kőszeg mellett, Nyugat-Magyarországon, erdővel és nyílt éggel körülölelve. Sátorozz a víz mellett, táncolj a csillagok alatt.",
  },
};

/**
 * Convert decimal lat/lng to a point on a sphere of the given radius.
 * Standard equirectangular → spherical mapping (Y up).
 */
export function latLngToVec3(
  lat: number,
  lng: number,
  radius: number,
): [number, number, number] {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lng + 180) * (Math.PI / 180);
  const x = -radius * Math.sin(phi) * Math.cos(theta);
  const z = radius * Math.sin(phi) * Math.sin(theta);
  const y = radius * Math.cos(phi);
  return [x, y, z];
}
