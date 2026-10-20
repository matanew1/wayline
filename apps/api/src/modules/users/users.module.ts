import { Global, Module } from '@nestjs/common';
import type { Pool } from 'pg';
import { PG, USERS_REPO } from '../../common/tokens';
import { MemoryUsersRepository, PgUsersRepository } from './users.repository';

@Global()
@Module({
  providers: [
    {
      provide: USERS_REPO,
      inject: [PG],
      useFactory: (pg: Pool | null) => (pg ? new PgUsersRepository(pg) : new MemoryUsersRepository()),
    },
  ],
  exports: [USERS_REPO],
})
export class UsersModule {}
