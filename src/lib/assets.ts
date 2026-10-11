import regeneratedAssets from './regenerated-assets.json';

const assets: Record<string, string> = regeneratedAssets;
export function assetUrl(name: string, extension = 'webp') {
  return assets[name] ?? `/assets/${name}.${extension}`;
}
export function hasRegeneratedAsset(name: string) {
  return Boolean(assets[name]);
}
