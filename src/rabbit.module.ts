import { DynamicModule, Module } from "@nestjs/common";
import { ConfigOptions, RabbitConfigKey } from "./rabbit.config";
import { RabbitTransport } from "./rabbit.transport";

@Module({
  imports: [],
  controllers: [],
  providers: []
})
export class RabbitModule {
  static forRoot(config: ConfigOptions): DynamicModule {
    if (!config.prefetch) {
      config.prefetch = 1;
    }
    return {
      module: RabbitModule,
      imports: [],
      providers: [
        RabbitTransport,
        {
          provide: RabbitConfigKey,
          useValue: config
        }
      ],
      exports: [RabbitTransport]
    };
  }
}
