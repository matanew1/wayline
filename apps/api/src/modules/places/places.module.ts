import { Module } from '@nestjs/common';
import type { Pool } from 'pg';
import type { AppConfig } from '../../config/config';
import { CONFIG, GEOCODER, PG, SAVED_PLACES_REPO } from '../../common/tokens';
import { MemoryGeocoder, PeliasGeocoder, PhotonGeocoder } from './geocoder';
import { PlacesController } from './places.controller';
import { MemorySavedPlacesRepository, PgSavedPlacesRepository } from './saved-places.repository';

@Module({
  controllers: [PlacesController],
  providers: [
    {
      provide: GEOCODER,
      inject: [CONFIG],
      useFactory: (c: AppConfig) =>
        c.geocoderDriver === 'photon' ? new PhotonGeocoder(c.geocoderUrl)
          : c.geocoderDriver === 'pelias' ? new PeliasGeocoder(c.geocoderUrl)
            : new MemoryGeocoder(),
    },
    {
      provide: SAVED_PLACES_REPO,
      inject: [PG],
      useFactory: (pg: Pool | null) => (pg ? new PgSavedPlacesRepository(pg) : new MemorySavedPlacesRepository()),
    },
  ],
  exports: [SAVED_PLACES_REPO],
})
export class PlacesModule {}
