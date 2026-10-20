import {
  Body, Controller, Delete, Get, HttpCode, Inject, NotFoundException, Param, ParseUUIDPipe, Put, Query, UnprocessableEntityException, UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiNoContentResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser, JwtAuthGuard } from '../../common/auth';
import { GEOCODER, SAVED_PLACES_REPO } from '../../common/tokens';
import type { Geocoder } from './geocoder';
import { PlaceDto, SavedPlaceDto, SavePlaceDto, SearchPlacesQuery } from './places.dto';
import { MAX_FAVOURITES, type SavedPlacesRepository } from './saved-places.repository';

@ApiTags('places')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class PlacesController {
  constructor(
    @Inject(GEOCODER) private readonly geocoder: Geocoder,
    @Inject(SAVED_PLACES_REPO) private readonly saved: SavedPlacesRepository,
  ) {}

  @Get('places/search')
  @ApiOkResponse({ type: [PlaceDto] })
  search(@Query() q: SearchPlacesQuery): Promise<PlaceDto[]> {
    const focus = q.lat !== undefined && q.lng !== undefined ? { lat: q.lat, lng: q.lng } : undefined;
    return this.geocoder.search({ q: q.q, focus, lang: q.lang ?? 'en', limit: 10 });
  }

  @Get('me/places')
  @ApiOkResponse({ type: [SavedPlaceDto] })
  list(@CurrentUser() user: AuthUser) {
    return this.saved.list(user.id);
  }

  @Put('me/places')
  @ApiOkResponse({ type: SavedPlaceDto })
  async save(@CurrentUser() user: AuthUser, @Body() body: SavePlaceDto) {
    if (body.kind === 'fav' && (await this.saved.countFavourites(user.id)) >= MAX_FAVOURITES) {
      throw new UnprocessableEntityException(`You can save up to ${MAX_FAVOURITES} favourites`);
    }
    return this.saved.save(user.id, body);
  }

  @Delete('me/places/:id')
  @HttpCode(204)
  @ApiNoContentResponse()
  async remove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    if (!(await this.saved.remove(user.id, id))) throw new NotFoundException('Saved place not found');
  }
}
