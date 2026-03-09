import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { EtlManagerModule } from '@tutorials/etl-manager';
import { QueueManagerModule } from '@tutorials/queue-manager';
import configuration from '../config/configuration';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
    }),
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        uri: configService.get<string>('mongoDbUri'),
      }),
    }),
    EtlManagerModule,
    QueueManagerModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}