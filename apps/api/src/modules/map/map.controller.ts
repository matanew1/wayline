import { Controller, Get, Header, Inject, Module, Query, Res } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import type { Response } from 'express';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { AppConfig } from '../../config/config';
import { CONFIG } from '../../common/tokens';
import { PALETTES } from './map.palette';

/** Labels: Hebrew or English name with fallbacks (OpenMapTiles fields). */
export function nameExpression(lang: 'he' | 'en'): unknown {
  return lang === 'he'
    ? ['coalesce', ['get', 'name:he'], ['get', 'name']]
    : ['coalesce', ['get', 'name:en'], ['get', 'name_en'], ['get', 'name:latin'], ['get', 'name']];
}

/** Fills the template structurally (not by string replacement, which would also hit the metadata note). */
export function renderStyle(template: string, tilesUrl: string, glyphsUrl: string, lang: 'he' | 'en', theme: 'light' | 'dark' = 'light'): object {
  const style = JSON.parse(template);
  style.sources.openmaptiles.url = tilesUrl;
  style.glyphs = glyphsUrl;
  delete style.metadata['wayline:note'];
  style.metadata['wayline:theme'] = theme;
  const palette = PALETTES[theme];
  for (const layer of style.layers) {
    if (layer.layout?.['text-field'] === '__NAME__') layer.layout['text-field'] = nameExpression(lang);
    if (palette[layer.id]) layer.paint = { ...layer.paint, ...palette[layer.id] };
  }
  return style;
}

let template: string | null = null;
function loadTemplate(dir: string) {
  template ??= readFileSync(join(dir, 'style.template.json'), 'utf8');
  return template;
}

/**
 * The app loads its map style from here (light or dark), so the basemap can move from the public
 * OpenFreeMap tiles to our own (Martin serving the Planetiler PMTiles) without an app release.
 */
@ApiExcludeController()
@SkipThrottle()
@Controller('map')
export class MapController {
  constructor(@Inject(CONFIG) private readonly config: AppConfig) {}

  @Get('style.json')
  @Header('Cache-Control', 'public, max-age=900')
  style(@Query('lang') lang: string | undefined, @Query('theme') theme: string | undefined, @Res() res: Response) {
    const l = lang === 'he' ? 'he' : 'en';
    const t = theme === 'dark' ? 'dark' : 'light';
    const m = this.config.map;
    // our own style either way, so light/dark and labels match the app; tiles fall back to OpenFreeMap
    res.type('application/json').send(renderStyle(loadTemplate(m.styleDir), m.tilesUrl ?? m.fallbackTilesUrl, m.glyphsUrl, l, t));
  }
}

@Module({ controllers: [MapController] })
export class MapModule {}
